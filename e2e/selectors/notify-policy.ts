/**
 * Diff-based notification policy.
 *
 * v1 notified on every non-pass run, which produced an identical Obsidian
 * note daily for 100+ consecutive days — standing noise that made a NEW
 * problem indistinguishable from the old ones. The policy is now: notify
 * only when the observable state CHANGED since the last run (including
 * recovery to pass). No note = nothing new.
 *
 * The fingerprint captures issue IDENTITIES (which selector, which target,
 * which status), never counts, so a swapped failure (one fixed, another
 * broken) still triggers.
 */

import fs from 'fs';
import path from 'path';
import type { ValidationReport } from './notifier';

const DEFAULT_STATE_PATH = path.join(import.meta.dirname, '..', 'results', 'notify-state.json');

/** Normalized, order-insensitive, timestamp-free state of a run. */
export interface NotifyStateFingerprint {
  overallStatus: ValidationReport['overallStatus'];
  platforms: Array<{
    platform: string;
    authStatus: string;
    failedTargets: string[];
    stallSkips: string[];
    deadPrimaries: string[];
    failures: string[];
    baselineBlocking: string[];
    baselineAdvisory: string[];
  }>;
}

export interface NotifyDecision {
  notify: boolean;
  /** True when the state changed to a clean pass (recovery note). */
  recovered: boolean;
  reason: string;
}

export function buildStateFingerprint(report: ValidationReport): NotifyStateFingerprint {
  const platforms = [...report.platforms]
    .sort((a, b) => a.platform.localeCompare(b.platform))
    .map(p => {
      const c = p.classification;
      return {
        platform: p.platform,
        authStatus: p.authStatus,
        failedTargets: [...p.failedTargets].sort(),
        stallSkips: [...p.stallSkips].sort(),
        deadPrimaries: (c?.warn ?? [])
          .map(w => `${w.failedPrimary.group}:${w.failedPrimary.name}:${w.failedPrimary.selector}`)
          .sort(),
        failures: (c?.fail ?? []).map(f => `${f.group}:${f.name}:${f.selector}`).sort(),
        baselineBlocking: (c?.baselineBlocking ?? [])
          .map(b => `${b.group}:${b.name}:${b.selector}:${b.status}:${b.contentStatus ?? '-'}`)
          .sort(),
        // The status belongs in the advisory fingerprint too: with more than one
        // advisory verdict, a swap between them would otherwise go unnotified.
        baselineAdvisory: (c?.baselineAdvisory ?? [])
          .map(b => `${b.group}:${b.name}:${b.selector}:${b.status}:${b.contentStatus ?? '-'}`)
          .sort(),
      };
    });

  return { overallStatus: report.overallStatus, platforms };
}

function fingerprintsEqual(a: NotifyStateFingerprint, b: NotifyStateFingerprint): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Decide whether this run warrants a notification.
 *
 * - unchanged state (including standing failures) -> silent
 * - changed state -> notify; a change TO pass is flagged as recovery
 * - first run (no previous state) -> notify only when not pass
 */
export function shouldNotify(
  current: NotifyStateFingerprint,
  previous: NotifyStateFingerprint | undefined
): NotifyDecision {
  if (previous === undefined) {
    if (current.overallStatus === 'pass') {
      return { notify: false, recovered: false, reason: 'first run, all pass' };
    }
    return { notify: true, recovered: false, reason: 'first run with issues' };
  }

  if (fingerprintsEqual(current, previous)) {
    return {
      notify: false,
      recovered: false,
      reason: `state unchanged (${current.overallStatus})`,
    };
  }

  const recovered = current.overallStatus === 'pass';
  return {
    notify: true,
    recovered,
    reason: recovered
      ? `recovered: ${previous.overallStatus} -> pass`
      : `state changed: ${previous.overallStatus} -> ${current.overallStatus}`,
  };
}

export function loadNotifyState(
  statePath = DEFAULT_STATE_PATH
): NotifyStateFingerprint | undefined {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    return raw as NotifyStateFingerprint;
  } catch {
    // Missing or corrupt: treated as first run — worst case one extra note
    return undefined;
  }
}

export function saveNotifyState(
  fingerprint: NotifyStateFingerprint,
  statePath = DEFAULT_STATE_PATH
): void {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(statePath, JSON.stringify(fingerprint, null, 2));
}
