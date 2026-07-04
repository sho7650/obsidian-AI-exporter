/**
 * Selector validation result classifier.
 *
 * Classifies raw selector match results into PASS/WARN/FAIL categories.
 * WARN includes both the failed primary and working fallback for debugging.
 */

import type { BaselineComparison } from './baseline';

export interface SelectorResult {
  platform: string;
  group: string;
  name: string;
  selector: string;
  /** 0 = primary, 1+ = fallback */
  index: number;
  matchCount: number;
}

export interface WarnDetail {
  /** The primary selector that failed (matchCount === 0) */
  failedPrimary: SelectorResult;
  /** The first fallback selector that matched */
  workingFallback: SelectorResult;
}

export interface ClassificationResult {
  pass: SelectorResult[];
  warn: WarnDetail[];
  /** All selectors failed — includes the primary's metadata */
  fail: SelectorResult[];
  /**
   * All non-match baseline comparisons (blocking + advisory).
   * Kept for the legacy report pipeline; removed once the reporter
   * consumes the split buckets directly.
   */
  baselineIssues: BaselineComparison[];
  /** lost / new_selector / removed — must fail the run (baseline contract) */
  baselineBlocking: BaselineComparison[];
  /** degraded — reported for observability, not enforced */
  baselineAdvisory: BaselineComparison[];
}

/**
 * Classify selector results into PASS / WARN / FAIL.
 *
 * - PASS: primary (index=0) has matches
 * - WARN: primary failed but a fallback matched
 * - FAIL: all selectors in the group have zero matches
 */
export function classifyResults(
  results: readonly SelectorResult[],
  baselineComparisons: readonly BaselineComparison[] = []
): ClassificationResult {
  const byName = new Map<string, SelectorResult[]>();
  for (const r of results) {
    const key = `${r.platform}:${r.group}:${r.name}`;
    const list = byName.get(key) ?? [];
    list.push(r);
    byName.set(key, list);
  }

  const pass: SelectorResult[] = [];
  const warn: WarnDetail[] = [];
  const fail: SelectorResult[] = [];

  for (const [, items] of byName) {
    const primary = items[0];
    const anyMatch = items.some(i => i.matchCount > 0);

    if (primary.matchCount > 0) {
      pass.push(primary);
    } else if (anyMatch) {
      const fallback = items.find(i => i.matchCount > 0)!;
      warn.push({
        failedPrimary: primary,
        workingFallback: fallback,
      });
    } else {
      fail.push(primary);
    }
  }

  const baselineIssues = baselineComparisons.filter(c => c.status !== 'match');
  const baselineBlocking = baselineIssues.filter(c => c.status !== 'degraded');
  const baselineAdvisory = baselineIssues.filter(c => c.status === 'degraded');

  return { pass, warn, fail, baselineIssues, baselineBlocking, baselineAdvisory };
}
