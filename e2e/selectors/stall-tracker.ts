/**
 * Consecutive-stall tracker for load-readiness decisions.
 *
 * A transient content stall (loading spinner never resolves) is skipped, but
 * a stall that persists run after run is indistinguishable from a real
 * regression being masked. This tracker persists per-target consecutive
 * stall counts across runs (local state file, e2e/results/ is gitignored)
 * so decideLoadOutcome can escalate to validate → FAIL at a threshold.
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_STATE_PATH = path.join(import.meta.dirname, '..', 'results', 'stall-state.json');

type StallState = Record<string, number>;

function readState(statePath: string): StallState {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    return raw as StallState;
  } catch {
    // Missing or corrupt state: start fresh — worst case one extra skip cycle
    return {};
  }
}

function writeState(statePath: string, state: StallState): void {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/** Consecutive stalls recorded for this key (0 if none). */
export function getConsecutiveStalls(key: string, statePath = DEFAULT_STATE_PATH): number {
  return readState(statePath)[key] ?? 0;
}

/** Record one more consecutive stall; returns the new count. */
export function recordStall(key: string, statePath = DEFAULT_STATE_PATH): number {
  const state = readState(statePath);
  const next = (state[key] ?? 0) + 1;
  writeState(statePath, { ...state, [key]: next });
  return next;
}

/** Clear the streak for a key (content loaded normally). */
export function resetStalls(key: string, statePath = DEFAULT_STATE_PATH): void {
  const state = { ...readState(statePath) };
  if (!(key in state)) return;
  delete state[key];
  writeState(statePath, state);
}
