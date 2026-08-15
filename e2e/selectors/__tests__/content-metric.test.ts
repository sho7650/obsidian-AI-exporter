/**
 * The content axis of the baseline contract (ADR-031, issue #445).
 *
 * The count axis answers "is the element still there". Perplexity moved its
 * answers out of `div[id^="markdown-content-"]` and left the placeholders in
 * place, so the count axis stayed perfectly green while every assistant
 * message was lost (issue #444). These tests pin the second axis: how many of
 * the matched elements actually carry content.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  compareWithBaseline,
  loadBaselineGroups,
  updateBaselineGroups,
  BaselineUpdateError,
  CONTENT_REQUIRED,
  type BaselineEntry,
} from '../baseline';
import { classifyResults } from '../classifier';

const BASELINE_DIR = path.join(import.meta.dirname, '..', '..', 'baselines');
const platform = '__test_content_metric__';
const filePath = path.join(BASELINE_DIR, `${platform}.json`);

function entry(overrides: Partial<BaselineEntry> = {}): BaselineEntry {
  return {
    platform,
    group: 'SELECTORS',
    name: 'testSelector',
    selector: '.test',
    matchCount: 3,
    nonEmptyCount: 3,
    ...overrides,
  };
}

function cleanup(): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

describe('compareWithBaseline — content axis', () => {
  it('reports content_lost when every match went empty (issue #444)', () => {
    // The bug in miniature: 3 matches before, 3 matches after, nothing inside.
    const result = compareWithBaseline(
      [entry({ matchCount: 3, nonEmptyCount: 0 })],
      [entry({ matchCount: 3, nonEmptyCount: 3 })]
    );

    expect(result[0].status).toBe('match');
    expect(result[0].contentStatus).toBe('content_lost');
    expect(result[0].baselineNonEmpty).toBe(3);
    expect(result[0].currentNonEmpty).toBe(0);
  });

  it('reports content_degraded when some matches went empty', () => {
    const result = compareWithBaseline(
      [entry({ nonEmptyCount: 1 })],
      [entry({ nonEmptyCount: 3 })]
    );

    expect(result[0].contentStatus).toBe('content_degraded');
  });

  it('reports content_ok when content held or grew', () => {
    expect(
      compareWithBaseline([entry({ nonEmptyCount: 3 })], [entry({ nonEmptyCount: 3 })])[0]
        .contentStatus
    ).toBe('content_ok');
    expect(
      compareWithBaseline([entry({ nonEmptyCount: 5 })], [entry({ nonEmptyCount: 3 })])[0]
        .contentStatus
    ).toBe('content_ok');
  });

  it('reports content_ok for selectors that were always empty', () => {
    // Perplexity's citationSpacer is documented as an intentionally empty span
    // and Gemini's generatedImage is an <img>: both record 0 and can never drop.
    const result = compareWithBaseline(
      [entry({ name: 'citationSpacer', matchCount: 4, nonEmptyCount: 0 })],
      [entry({ name: 'citationSpacer', matchCount: 4, nonEmptyCount: 0 })]
    );

    expect(result[0].contentStatus).toBe('content_ok');
  });

  it('leaves removed and new_selector entries without a content verdict', () => {
    const removed = compareWithBaseline([], [entry()]);
    expect(removed[0].status).toBe('removed');
    expect(removed[0].contentStatus).toBeUndefined();

    const added = compareWithBaseline([entry()], []);
    expect(added[0].status).toBe('new_selector');
    expect(added[0].contentStatus).toBeUndefined();
  });
});

describe('classifyResults — content axis', () => {
  const comparison = (contentStatus: 'content_lost' | 'content_degraded' | 'content_ok') => ({
    group: 'SELECTORS',
    name: 'markdownContent',
    selector: 'div[id^="markdown-content-"]',
    baselineCount: 3,
    currentCount: 3,
    baselineNonEmpty: 3,
    currentNonEmpty: contentStatus === 'content_lost' ? 0 : 1,
    status: 'match' as const,
    contentStatus,
  });

  const passing = [
    {
      platform,
      group: 'SELECTORS',
      name: 'markdownContent',
      selector: 'div[id^="markdown-content-"]',
      index: 0,
      matchCount: 3,
      nonEmptyCount: 0,
    },
  ];

  it('blocks the run on content_lost', () => {
    const result = classifyResults(passing, [comparison('content_lost')]);

    expect(result.baselineBlocking).toHaveLength(1);
    expect(result.baselineAdvisory).toHaveLength(0);
  });

  it('keeps content_degraded advisory', () => {
    const result = classifyResults(passing, [comparison('content_degraded')]);

    expect(result.baselineBlocking).toHaveLength(0);
    expect(result.baselineAdvisory).toHaveLength(1);
  });

  it('ignores content_ok', () => {
    const result = classifyResults(passing, [comparison('content_ok')]);

    expect(result.baselineBlocking).toHaveLength(0);
    expect(result.baselineAdvisory).toHaveLength(0);
  });
});

describe('updateBaselineGroups — content axis', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('round-trips nonEmptyCount', () => {
    updateBaselineGroups(platform, { SELECTORS: [entry({ matchCount: 3, nonEmptyCount: 2 })] });

    const loaded = loadBaselineGroups(platform, ['SELECTORS']);
    expect(loaded.legacy).toBe(false);
    expect(loaded.entries[0].nonEmptyCount).toBe(2);
  });

  it('accepts a matched-but-empty selector that is not content-required', () => {
    // The citationSpacer shape. Refusing this would make the Perplexity and
    // Gemini baselines unwritable forever.
    expect(() =>
      updateBaselineGroups(platform, {
        SELECTORS: [entry({ name: 'citationSpacer', matchCount: 4, nonEmptyCount: 0 })],
      })
    ).not.toThrow();

    expect(loadBaselineGroups(platform, ['SELECTORS']).entries[0].nonEmptyCount).toBe(0);
  });

  it('refuses to record a content-required selector that matched but is empty', () => {
    // Without this, a baseline captured on a machine that already received the
    // new layout would enshrine 0 and the detector would be blind for good —
    // the same failure ADR-016 removed for zero-match entries.
    const [required] = CONTENT_REQUIRED;
    expect(required, 'CONTENT_REQUIRED must be seeded').toBeDefined();

    expect(() =>
      updateBaselineGroups(platform, {
        SELECTORS: [
          entry({ group: required.group, name: required.name, matchCount: 3, nonEmptyCount: 0 }),
        ],
      })
    ).toThrow(BaselineUpdateError);

    expect(fs.existsSync(filePath), 'nothing may be written when the update is refused').toBe(false);
  });

  it('names the offending selector when it refuses', () => {
    const [required] = CONTENT_REQUIRED;
    try {
      updateBaselineGroups(platform, {
        SELECTORS: [
          entry({ group: required.group, name: required.name, matchCount: 3, nonEmptyCount: 0 }),
        ],
      });
      expect.unreachable('expected a BaselineUpdateError');
    } catch (error) {
      expect(String(error)).toContain(required.name);
    }
  });

  it('still refuses zero-match entries first', () => {
    expect(() =>
      updateBaselineGroups(platform, { SELECTORS: [entry({ matchCount: 0, nonEmptyCount: 0 })] })
    ).toThrow(BaselineUpdateError);
  });
});

describe('baseline version', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('treats a v2 file as legacy so the run fails with the update hint', () => {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        updatedAt: '2026-08-08T00:00:00.000Z',
        groups: { SELECTORS: [{ name: 'testSelector', selector: '.test', matchCount: 3 }] },
      })
    );

    const loaded = loadBaselineGroups(platform, ['SELECTORS']);
    expect(loaded.legacy).toBe(true);
    expect(loaded.entries).toHaveLength(0);
  });
});
