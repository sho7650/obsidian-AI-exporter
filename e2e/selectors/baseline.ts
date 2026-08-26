/**
 * Baseline management for live selector validation (v3 contract).
 *
 * A baseline is an enforced contract, not an advisory snapshot:
 * - One file per platform, holding ALL selector groups (conversation and
 *   deep-research tests each own their groups — no first-writer-wins race).
 * - Written ONLY by the explicit update command (`npm run e2e:baseline:update`,
 *   which sets UPDATE_BASELINE=1). There is no implicit first-run save.
 * - Zero-match entries are rejected at update time: a baseline may never
 *   record a selector that cannot be found (such entries made `lost`
 *   undetectable in v1).
 * - Every selector records BOTH how many elements matched and how many of them
 *   carry content: a container that keeps matching after its content moved
 *   elsewhere satisfies a count-only contract while the export loses the answer
 *   (issue #444, ADR-031).
 * - Comparison is keyed by group + name + selector STRING, so reordering
 *   fallback variants does not produce spurious diffs, and a changed selector
 *   surfaces as new_selector + removed instead of silently comparing counts
 *   of different selectors.
 */

import fs from 'fs';
import path from 'path';

const BASELINE_DIR = path.join(import.meta.dirname, '..', 'baselines');
const BASELINE_VERSION = 3 as const;

export interface BaselineEntry {
  platform: string;
  group: string;
  name: string;
  selector: string;
  matchCount: number;
  /**
   * How many of those matches carry content (`textContent.trim()` non-empty).
   *
   * The count axis answers "is the element still there"; this one answers "does
   * it still hold anything". Perplexity moved its answers out of
   * `div[id^="markdown-content-"]` and left the placeholders behind, so the
   * count axis stayed green while every assistant message was lost (#444).
   */
  nonEmptyCount: number;
}

export type BaselineStatus = 'match' | 'degraded' | 'lost' | 'new_selector' | 'removed';

/**
 * Content verdict, tracked separately from {@link BaselineStatus} because the
 * two axes are independent: a selector can match exactly as before and hold
 * nothing. Collapsing them into one field would force a precedence rule that
 * throws away half the diagnosis.
 */
export type ContentStatus = 'content_ok' | 'content_degraded' | 'content_lost';

export interface BaselineComparison {
  group: string;
  name: string;
  selector: string;
  baselineCount: number;
  currentCount: number;
  status: BaselineStatus;
  /** Absent when the entry is `removed` / `new_selector` — there is nothing to compare. */
  contentStatus?: ContentStatus;
  baselineNonEmpty?: number;
  currentNonEmpty?: number;
}

/** Statuses that must fail the validation run. */
export const BLOCKING_STATUSES: readonly BaselineStatus[] = ['lost', 'new_selector', 'removed'];

/** Content verdicts that must fail the validation run. */
export const BLOCKING_CONTENT_STATUSES: readonly ContentStatus[] = ['content_lost'];

/**
 * Selectors whose matches MUST carry content, refused at update time when they
 * do not.
 *
 * The baseline otherwise self-calibrates — a selector that has always matched
 * empty elements records 0 and can never "drop" — which is what keeps
 * intentionally empty matches like Perplexity's `citationSpacer` or Gemini's
 * `generatedImage` from failing. That self-calibration has one hole: a baseline
 * first captured on a machine that already received a broken layout would
 * record 0 for the response container and be blind for good. This list closes
 * it for the containers the assistant message is read out of, mirroring the
 * zero-match refusal and its rationale (ADR-016 §1, ADR-031).
 */
export const CONTENT_REQUIRED: readonly { group: string; name: string }[] = [
  { group: 'SELECTORS', name: 'markdownContent' },
  { group: 'SELECTORS', name: 'proseContent' },
  // Perplexity's answer container since 2026-08. `markdownContent` used to
  // cover it, but that placeholder was removed from the platform's selectors
  // when Perplexity dropped the id; `answerProse` inherits the duty of
  // proving the assistant message still has content behind it.
  { group: 'SELECTORS', name: 'answerProse' },
  { group: 'SELECTORS', name: 'modelResponse' },
  { group: 'SELECTORS', name: 'assistantMessage' },
  { group: 'SELECTORS', name: 'responseContent' },
];

export class BaselineUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaselineUpdateError';
  }
}

interface StoredEntry {
  name: string;
  selector: string;
  matchCount: number;
  nonEmptyCount: number;
}

interface BaselineFileV3 {
  version: typeof BASELINE_VERSION;
  updatedAt: string;
  groups: Record<string, StoredEntry[]>;
}

export interface BaselineLoadResult {
  entries: BaselineEntry[];
  /** File exists but predates the current contract (v1 flat array, or v2). */
  legacy: boolean;
  /** Requested groups with no baseline data (never captured). */
  missingGroups: string[];
}

function baselinePath(platform: string): string {
  return path.join(BASELINE_DIR, `${platform}.json`);
}

function readBaselineFile(platform: string): BaselineFileV3 | 'legacy' | null {
  const filePath = baselinePath(platform);
  if (!fs.existsSync(filePath)) return null;

  const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (
    typeof raw !== 'object' ||
    raw === null ||
    Array.isArray(raw) ||
    (raw as { version?: unknown }).version !== BASELINE_VERSION ||
    typeof (raw as { groups?: unknown }).groups !== 'object'
  ) {
    return 'legacy';
  }
  return raw as BaselineFileV3;
}

/**
 * Load baseline entries for the requested groups only.
 * Never throws: legacy/missing states are reported so the caller can fail
 * with actionable guidance (run the update command).
 */
export function loadBaselineGroups(
  platform: string,
  groups: readonly string[]
): BaselineLoadResult {
  const file = readBaselineFile(platform);
  if (file === null) {
    return { entries: [], legacy: false, missingGroups: [...groups] };
  }
  if (file === 'legacy') {
    return { entries: [], legacy: true, missingGroups: [...groups] };
  }

  const entries: BaselineEntry[] = [];
  const missingGroups: string[] = [];
  for (const group of groups) {
    const stored = file.groups[group];
    if (!stored) {
      missingGroups.push(group);
      continue;
    }
    for (const entry of stored) {
      entries.push({ platform, group, ...entry });
    }
  }
  return { entries, legacy: false, missingGroups };
}

/**
 * Record the given groups into the platform baseline, replacing those groups
 * wholesale and leaving other groups untouched (two-test platforms update
 * independently). A legacy v1 file is replaced entirely.
 *
 * @throws BaselineUpdateError when any entry has matchCount 0, or when a
 *   CONTENT_REQUIRED entry matched but is empty — nothing is written; a
 *   baseline must never record an unfindable, or a silently hollow, selector.
 */
export function updateBaselineGroups(
  platform: string,
  groups: Readonly<Record<string, readonly BaselineEntry[]>>
): void {
  const zeroEntries = Object.values(groups)
    .flat()
    .filter(entry => entry.matchCount === 0);
  if (zeroEntries.length > 0) {
    const list = zeroEntries.map(z => `${z.group}:${z.name} (${z.selector})`).join(', ');
    throw new BaselineUpdateError(
      `refusing to record zero-match selectors in the ${platform} baseline: ${list} — ` +
        `fix the selector or the test conversation before updating`
    );
  }

  // Only CONTENT_REQUIRED selectors are refused for emptiness. Widening this to
  // every entry would make the Perplexity and Gemini baselines unwritable: their
  // citationSpacer / generatedImage matches are legitimately empty.
  const emptyRequired = Object.values(groups)
    .flat()
    .filter(
      entry =>
        entry.nonEmptyCount === 0 &&
        CONTENT_REQUIRED.some(r => r.group === entry.group && r.name === entry.name)
    );
  if (emptyRequired.length > 0) {
    const list = emptyRequired.map(e => `${e.group}:${e.name} (${e.selector})`).join(', ');
    throw new BaselineUpdateError(
      `refusing to record matched-but-empty selectors in the ${platform} baseline: ${list} — ` +
        `these carry the assistant message, so recording zero would make content loss ` +
        `undetectable. Fix the selector or the test conversation before updating`
    );
  }

  const existing = readBaselineFile(platform);
  const file: BaselineFileV3 =
    existing !== null && existing !== 'legacy'
      ? existing
      : { version: BASELINE_VERSION, updatedAt: '', groups: {} };

  for (const [group, entries] of Object.entries(groups)) {
    file.groups[group] = entries.map(({ name, selector, matchCount, nonEmptyCount }) => ({
      name,
      selector,
      matchCount,
      nonEmptyCount,
    }));
  }
  file.updatedAt = new Date().toISOString();

  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
  }
  fs.writeFileSync(baselinePath(platform), JSON.stringify(file, null, 2) + '\n');
}

/**
 * Compare current results against baseline entries.
 *
 * - match:        current count >= baseline count (both findable)
 * - degraded:     current dropped but still > 0
 * - lost:         baseline had matches, current has 0
 * - new_selector: in current, not in baseline (baseline update required)
 * - removed:      in baseline, not in current (baseline update required)
 */
export function compareWithBaseline(
  current: readonly BaselineEntry[],
  baseline: readonly BaselineEntry[]
): BaselineComparison[] {
  const keyOf = (e: BaselineEntry): string => `${e.group}\u0000${e.name}\u0000${e.selector}`;
  const currentByKey = new Map(current.map(c => [keyOf(c), c]));
  const baselineKeys = new Set(baseline.map(keyOf));

  const comparisons: BaselineComparison[] = [];

  for (const base of baseline) {
    const curr = currentByKey.get(keyOf(base));
    if (!curr) {
      comparisons.push({
        group: base.group,
        name: base.name,
        selector: base.selector,
        baselineCount: base.matchCount,
        currentCount: -1,
        status: 'removed',
      });
      continue;
    }

    let status: BaselineStatus;
    if (curr.matchCount === 0) {
      status = 'lost';
    } else if (curr.matchCount < base.matchCount) {
      status = 'degraded';
    } else {
      status = 'match';
    }

    // A selector that has always matched empty elements records 0 on both
    // sides and can never drop, so it needs no exception list (#445).
    let contentStatus: ContentStatus;
    if (base.nonEmptyCount > 0 && curr.nonEmptyCount === 0) {
      contentStatus = 'content_lost';
    } else if (curr.nonEmptyCount < base.nonEmptyCount) {
      contentStatus = 'content_degraded';
    } else {
      contentStatus = 'content_ok';
    }

    comparisons.push({
      group: base.group,
      name: base.name,
      selector: base.selector,
      baselineCount: base.matchCount,
      currentCount: curr.matchCount,
      status,
      contentStatus,
      baselineNonEmpty: base.nonEmptyCount,
      currentNonEmpty: curr.nonEmptyCount,
    });
  }

  for (const curr of current) {
    if (!baselineKeys.has(keyOf(curr))) {
      comparisons.push({
        group: curr.group,
        name: curr.name,
        selector: curr.selector,
        baselineCount: -1,
        currentCount: curr.matchCount,
        status: 'new_selector',
      });
    }
  }

  return comparisons;
}
