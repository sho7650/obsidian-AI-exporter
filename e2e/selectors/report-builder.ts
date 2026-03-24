/**
 * Pure functions for building ValidationReport from Playwright test results.
 *
 * Extracted from the Reporter class for unit-testability.
 * All functions are side-effect-free and operate on immutable inputs.
 */

import type { AuthStatus } from './auth-check';
import type { ClassificationResult } from './classifier';
import type { PlatformReport, ValidationReport } from './notifier';
import { formatDateWithTimezone } from '../../src/lib/date-utils';

/** Minimal input extracted from Playwright's onTestEnd callback. */
export interface TestEndInput {
  platform: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  annotations: ReadonlyArray<{ type: string; description?: string }>;
}

/**
 * Extract platform name from a describe-block title.
 * Returns lowercase platform name or 'unknown' for empty input.
 */
export function extractPlatform(parentTitle: string): string {
  const trimmed = parentTitle.trim().toLowerCase();
  return trimmed || 'unknown';
}

/**
 * Parse annotation counts from a test result's annotations array.
 * Returns {pass, warn, fail, baselineIssues} as integers (defaults to 0).
 */
export function parseAnnotationCounts(
  annotations: ReadonlyArray<{ type: string; description?: string }>
): { pass: number; warn: number; fail: number; baselineIssues: number } {
  const getCount = (type: string): number => {
    const ann = annotations.find(a => a.type === type);
    if (!ann?.description) return 0;
    const parsed = parseInt(ann.description, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return {
    pass: getCount('pass'),
    warn: getCount('warn'),
    fail: getCount('fail'),
    baselineIssues: getCount('baseline_issues'),
  };
}

/**
 * Detect skip reason from annotations.
 * Returns 'auth_expired' | 'unreachable' | null.
 */
export function detectSkipReason(
  annotations: ReadonlyArray<{ type: string; description?: string }>
): 'auth_expired' | 'unreachable' | null {
  const skipAnn = annotations.find(a => a.type === 'skip');
  if (!skipAnn?.description) return null;

  if (skipAnn.description.includes('AUTH_EXPIRED')) return 'auth_expired';
  if (skipAnn.description.includes('unreachable')) return 'unreachable';
  return null;
}

/**
 * Process a single test result and merge into the platform map.
 * Returns a NEW Map (immutable pattern).
 */
export function processTestResult(
  platformMap: ReadonlyMap<string, PlatformReport>,
  input: TestEndInput
): Map<string, PlatformReport> {
  const newMap = new Map(platformMap);
  const { platform, status, annotations } = input;

  // Handle skipped tests
  if (status === 'skipped') {
    const skipReason = detectSkipReason(annotations);
    const authStatus: AuthStatus = skipReason ?? 'authenticated';
    newMap.set(platform, {
      platform,
      authStatus,
      classification: undefined,
    });
    return newMap;
  }

  // Parse annotation counts
  const counts = parseAnnotationCounts(annotations);

  // Get or create platform entry
  const existing = newMap.get(platform);
  const existingClassification = existing?.classification;

  // Merge counts using placeholder arrays (notifier reads .length only)
  const classification: ClassificationResult = {
    pass: [...(existingClassification?.pass ?? []), ...new Array<null>(counts.pass).fill(null)],
    warn: [...(existingClassification?.warn ?? []), ...new Array<null>(counts.warn).fill(null)],
    fail: [...(existingClassification?.fail ?? []), ...new Array<null>(counts.fail).fill(null)],
    baselineIssues: [
      ...(existingClassification?.baselineIssues ?? []),
      ...new Array<null>(counts.baselineIssues).fill(null),
    ],
  } as ClassificationResult;

  newMap.set(platform, {
    platform,
    authStatus: existing?.authStatus ?? ('authenticated' as AuthStatus),
    classification,
  });

  return newMap;
}

/**
 * Build the final ValidationReport from accumulated platform data.
 * overallStatus priority: fail > auth_expired > warn > pass.
 */
export function buildValidationReport(
  platformMap: ReadonlyMap<string, PlatformReport>,
  timezone?: string
): ValidationReport {
  const platforms = [...platformMap.values()];
  const timestamp = formatDateWithTimezone(new Date(), timezone ?? 'UTC');

  const hasFail = platforms.some(p => p.classification && p.classification.fail.length > 0);
  const hasAuthExpired = platforms.some(p => p.authStatus === 'auth_expired');
  const hasWarn = platforms.some(p => p.classification && p.classification.warn.length > 0);

  let overallStatus: ValidationReport['overallStatus'];
  if (hasFail) overallStatus = 'fail';
  else if (hasAuthExpired) overallStatus = 'auth_expired';
  else if (hasWarn) overallStatus = 'warn';
  else overallStatus = 'pass';

  return { timestamp, platforms, overallStatus };
}
