/**
 * Pure functions for building ValidationReport from Playwright test results.
 *
 * Detail transport: each test attaches its full result (classification with
 * real objects, auth status, skip reason) as a JSON attachment via
 * test.info().attach() — the official Playwright channel for structured
 * data. This replaces the v1 annotation counts, which collapsed everything
 * to four integers and made saved reports arrays of nulls.
 */

import type { AuthStatus } from './auth-check';
import type { ClassificationResult } from './classifier';
import type { PlatformReport, ValidationReport } from './notifier';
import { formatDateWithTimezone } from '../../src/lib/date-utils';

/** Attachment name carrying the per-target detail JSON. */
export const ATTACHMENT_NAME = 'g2o-detail';

/** Per-target detail attached by the spec at every exit point. */
export interface TargetDetail {
  platform: string;
  /** Ready-key of the validated target (e.g. gemini_conv, gemini_dr). */
  target: string;
  mode: 'validate' | 'update';
  authStatus: AuthStatus;
  /** Present when the target was skipped (auth, unreachable, stall). */
  skipReason?: string;
  /** Baseline usability at validation time (validate mode only). */
  baselineState?: 'ok' | 'legacy' | 'missing_groups';
  /** Present when validation ran. */
  classification?: ClassificationResult;
  /**
   * How the page settled before the counts were sampled. `settled: false` means
   * the wait timed out with the counts still moving, so the numbers below were
   * read off a page that had not finished rendering — treat any diff from that
   * run with suspicion rather than as DOM drift.
   */
  settle?: { settled: boolean; elapsedMs: number; observations: number };
}

export interface AttachmentLike {
  name: string;
  contentType: string;
  body?: Buffer;
  path?: string;
}

/** Minimal input extracted from Playwright's onTestEnd callback. */
export interface TestEndInput {
  platform: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  attachments: ReadonlyArray<AttachmentLike>;
}

/**
 * Extract platform name from a describe-block title.
 * Returns lowercase platform name or 'unknown' for empty input.
 */
export function extractPlatform(parentTitle: string): string {
  const trimmed = parentTitle.trim().toLowerCase();
  return trimmed || 'unknown';
}

/** Parse the g2o detail attachment; undefined when absent or malformed. */
export function parseDetailAttachment(
  attachments: ReadonlyArray<AttachmentLike>
): TargetDetail | undefined {
  const attachment = attachments.find(a => a.name === ATTACHMENT_NAME);
  if (!attachment?.body) return undefined;
  try {
    return JSON.parse(attachment.body.toString('utf-8')) as TargetDetail;
  } catch {
    return undefined;
  }
}

const AUTH_SEVERITY: Readonly<Record<AuthStatus, number>> = {
  authenticated: 0,
  unreachable: 1,
  auth_expired: 2,
  test_data_missing: 3,
};

function worseAuthStatus(a: AuthStatus, b: AuthStatus): AuthStatus {
  return AUTH_SEVERITY[b] > AUTH_SEVERITY[a] ? b : a;
}

function mergeClassification(
  existing: ClassificationResult | undefined,
  incoming: ClassificationResult
): ClassificationResult {
  if (!existing) return incoming;
  return {
    pass: [...existing.pass, ...incoming.pass],
    warn: [...existing.warn, ...incoming.warn],
    fail: [...existing.fail, ...incoming.fail],
    baselineBlocking: [...existing.baselineBlocking, ...incoming.baselineBlocking],
    baselineAdvisory: [...existing.baselineAdvisory, ...incoming.baselineAdvisory],
  };
}

const FAILED_STATUSES: ReadonlySet<TestEndInput['status']> = new Set([
  'failed',
  'timedOut',
  'interrupted',
]);

/**
 * Process a single test result and merge into the platform map.
 * Returns a NEW Map (immutable pattern).
 */
export function processTestResult(
  platformMap: ReadonlyMap<string, PlatformReport>,
  input: TestEndInput
): Map<string, PlatformReport> {
  const newMap = new Map(platformMap);
  const detail = parseDetailAttachment(input.attachments);

  const existing = newMap.get(input.platform);
  const report: PlatformReport = {
    platform: input.platform,
    authStatus: existing?.authStatus ?? 'authenticated',
    classification: existing?.classification,
    failedTargets: [...(existing?.failedTargets ?? [])],
    stallSkips: [...(existing?.stallSkips ?? [])],
    unsettledTargets: [...(existing?.unsettledTargets ?? [])],
  };

  const targetName = detail?.target ?? input.platform;

  if (FAILED_STATUSES.has(input.status)) {
    report.failedTargets.push(targetName);
  }
  if (detail) {
    report.authStatus = worseAuthStatus(report.authStatus, detail.authStatus);
    if (
      input.status === 'skipped' &&
      detail.skipReason !== undefined &&
      detail.authStatus === 'authenticated'
    ) {
      // Authenticated skip = content stall (auth/unreachable skips carry
      // their own authStatus and are tracked via that field instead)
      report.stallSkips.push(targetName);
    }
    if (detail.settle && !detail.settle.settled) {
      report.unsettledTargets.push(targetName);
    }
    if (detail.classification) {
      report.classification = mergeClassification(existing?.classification, detail.classification);
    }
  }

  newMap.set(input.platform, report);
  return newMap;
}

/**
 * Build the final ValidationReport from accumulated platform data.
 *
 * overallStatus priority: fail > auth_expired > warn > pass.
 * fail includes: any failed Playwright test (even without detail),
 * test_data_missing, zero-match failures, dead primaries (warn entries),
 * and baseline contract violations. warn covers advisory degradation and
 * transient stall skips.
 */
export function buildValidationReport(
  platformMap: ReadonlyMap<string, PlatformReport>,
  timezone?: string
): ValidationReport {
  const platforms = [...platformMap.values()];
  const timestamp = formatDateWithTimezone(new Date(), timezone ?? 'UTC');

  const hasFail = platforms.some(
    p =>
      p.failedTargets.length > 0 ||
      p.authStatus === 'test_data_missing' ||
      (p.classification !== undefined &&
        (p.classification.fail.length > 0 ||
          p.classification.warn.length > 0 ||
          p.classification.baselineBlocking.length > 0))
  );
  const hasAuthExpired = platforms.some(p => p.authStatus === 'auth_expired');
  const hasWarn = platforms.some(
    p => p.stallSkips.length > 0 || (p.classification?.baselineAdvisory.length ?? 0) > 0
  );

  let overallStatus: ValidationReport['overallStatus'];
  if (hasFail) overallStatus = 'fail';
  else if (hasAuthExpired) overallStatus = 'auth_expired';
  else if (hasWarn) overallStatus = 'warn';
  else overallStatus = 'pass';

  return { timestamp, platforms, overallStatus };
}
