/**
 * Baseline management for live selector validation.
 *
 * On first run, saves match counts as a baseline.
 * On subsequent runs, compares current results against the baseline
 * to detect degradation (match count dropped to 0) or new selectors.
 */

import fs from 'fs';
import path from 'path';

const BASELINE_DIR = path.join(import.meta.dirname, '..', 'baselines');

export interface BaselineEntry {
  platform: string;
  group: string;
  name: string;
  selector: string;
  index: number;
  matchCount: number;
}

export interface BaselineComparison {
  name: string;
  baselineCount: number;
  currentCount: number;
  status: 'match' | 'degraded' | 'lost' | 'new_selector';
}

function baselinePath(platform: string): string {
  return path.join(BASELINE_DIR, `${platform}.json`);
}

export function hasBaseline(platform: string): boolean {
  return fs.existsSync(baselinePath(platform));
}

export function saveBaseline(platform: string, entries: readonly BaselineEntry[]): void {
  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
  }
  fs.writeFileSync(baselinePath(platform), JSON.stringify(entries, null, 2));
}

export function loadBaseline(platform: string): BaselineEntry[] {
  const filePath = baselinePath(platform);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BaselineEntry[];
}

/**
 * Compare current results against a saved baseline.
 *
 * - match:        current matchCount > 0 and baseline > 0
 * - lost:         baseline had matches, current has 0
 * - degraded:     current matchCount dropped but still > 0
 * - new_selector: selector exists in current but not in baseline
 */
export function compareWithBaseline(
  current: readonly BaselineEntry[],
  baseline: readonly BaselineEntry[],
): BaselineComparison[] {
  const comparisons: BaselineComparison[] = [];

  for (const base of baseline) {
    const curr = current.find(
      (c) => c.group === base.group && c.name === base.name && c.index === base.index,
    );

    if (!curr) continue;

    let status: 'match' | 'degraded' | 'lost';
    if (curr.matchCount > 0 && base.matchCount > 0) {
      status = 'match';
    } else if (curr.matchCount === 0 && base.matchCount > 0) {
      status = 'lost';
    } else {
      status = curr.matchCount >= base.matchCount ? 'match' : 'degraded';
    }

    comparisons.push({
      name: `${base.group}:${base.name}[${base.index}]`,
      baselineCount: base.matchCount,
      currentCount: curr.matchCount,
      status,
    });
  }

  // Detect new selectors not in baseline
  const newSelectors = current.filter(
    (c) => !baseline.some(
      (b) => b.group === c.group && b.name === c.name && b.index === c.index,
    ),
  );
  for (const ns of newSelectors) {
    comparisons.push({
      name: `${ns.group}:${ns.name}[${ns.index}]`,
      baselineCount: -1,
      currentCount: ns.matchCount,
      status: 'new_selector',
    });
  }

  if (newSelectors.length > 0) {
    const platform = current[0]?.platform ?? 'unknown';
    console.warn(
      `${platform}: ${newSelectors.length} new selector(s) not in baseline. ` +
      `Consider regenerating: rm e2e/baselines/${platform}.json && npm run e2e:selectors`,
    );
  }

  return comparisons;
}
