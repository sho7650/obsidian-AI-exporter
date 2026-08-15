import { describe, it, expect } from 'vitest';
import { classifyResults, type SelectorResult } from '../classifier';
import type { BaselineComparison } from '../baseline';

function makeResult(overrides: Partial<SelectorResult> = {}): SelectorResult {
  return {
    platform: 'test',
    group: 'SELECTORS',
    name: 'testSelector',
    selector: '.test',
    index: 0,
    matchCount: 1,
    nonEmptyCount: 1,
    ...overrides,
  };
}

describe('classifyResults', () => {
  it('classifies all-primary-match as PASS', () => {
    const results = [
      makeResult({ name: 'a', index: 0, matchCount: 5 }),
      makeResult({ name: 'a', index: 1, matchCount: 3 }),
      makeResult({ name: 'b', index: 0, matchCount: 2 }),
    ];

    const { pass, warn, fail } = classifyResults(results);

    expect(pass).toHaveLength(2);
    expect(warn).toHaveLength(0);
    expect(fail).toHaveLength(0);
  });

  it('classifies primary-failed + fallback-matched as WARN with both details', () => {
    const results = [
      makeResult({ name: 'title', index: 0, selector: '.primary', matchCount: 0 }),
      makeResult({ name: 'title', index: 1, selector: '.fallback', matchCount: 3 }),
    ];

    const { pass, warn, fail } = classifyResults(results);

    expect(pass).toHaveLength(0);
    expect(warn).toHaveLength(1);
    expect(fail).toHaveLength(0);

    expect(warn[0].failedPrimary.selector).toBe('.primary');
    expect(warn[0].failedPrimary.matchCount).toBe(0);
    expect(warn[0].workingFallback.selector).toBe('.fallback');
    expect(warn[0].workingFallback.matchCount).toBe(3);
  });

  it('classifies all-zero-matches as FAIL with primary metadata', () => {
    const results = [
      makeResult({ name: 'turn', index: 0, selector: '.a', matchCount: 0 }),
      makeResult({ name: 'turn', index: 1, selector: '.b', matchCount: 0 }),
      makeResult({ name: 'turn', index: 2, selector: '.c', matchCount: 0 }),
    ];

    const { pass, warn, fail } = classifyResults(results);

    expect(pass).toHaveLength(0);
    expect(warn).toHaveLength(0);
    expect(fail).toHaveLength(1);
    expect(fail[0].selector).toBe('.a');
    expect(fail[0].name).toBe('turn');
  });

  it('returns empty arrays for empty input', () => {
    const { pass, warn, fail, baselineBlocking, baselineAdvisory } = classifyResults([]);

    expect(pass).toHaveLength(0);
    expect(warn).toHaveLength(0);
    expect(fail).toHaveLength(0);
    expect(baselineBlocking).toHaveLength(0);
    expect(baselineAdvisory).toHaveLength(0);
  });

  it('handles single-selector group (no fallback) — pass', () => {
    const results = [makeResult({ name: 'solo', index: 0, matchCount: 1 })];

    const { pass, warn, fail } = classifyResults(results);

    expect(pass).toHaveLength(1);
    expect(warn).toHaveLength(0);
    expect(fail).toHaveLength(0);
  });

  it('handles single-selector group (no fallback) — fail', () => {
    const results = [makeResult({ name: 'solo', index: 0, matchCount: 0 })];

    const { pass, warn, fail } = classifyResults(results);

    expect(pass).toHaveLength(0);
    expect(warn).toHaveLength(0);
    expect(fail).toHaveLength(1);
  });

  it('buckets lost / new_selector / removed as BLOCKING baseline issues', () => {
    const results = [makeResult({ name: 'ok', index: 0, matchCount: 1 })];
    const baselineComparisons: BaselineComparison[] = [
      {
        group: 'SELECTORS',
        name: 'turn',
        selector: '.t',
        baselineCount: 5,
        currentCount: 0,
        status: 'lost',
      },
      {
        group: 'SELECTORS',
        name: 'fresh',
        selector: '.f',
        baselineCount: -1,
        currentCount: 2,
        status: 'new_selector',
      },
      {
        group: 'SELECTORS',
        name: 'gone',
        selector: '.g',
        baselineCount: 4,
        currentCount: -1,
        status: 'removed',
      },
      {
        group: 'SELECTORS',
        name: 'ok',
        selector: '.o',
        baselineCount: 3,
        currentCount: 3,
        status: 'match',
      },
    ];

    const { baselineBlocking, baselineAdvisory } = classifyResults(results, baselineComparisons);

    expect(baselineBlocking.map(b => b.status).sort()).toEqual(['lost', 'new_selector', 'removed']);
    expect(baselineAdvisory).toHaveLength(0);
  });

  it('buckets degraded as ADVISORY (reported, not enforced)', () => {
    const baselineComparisons: BaselineComparison[] = [
      {
        group: 'SELECTORS',
        name: 'turn',
        selector: '.t',
        baselineCount: 5,
        currentCount: 2,
        status: 'degraded',
      },
    ];

    const { baselineBlocking, baselineAdvisory } = classifyResults([], baselineComparisons);

    expect(baselineBlocking).toHaveLength(0);
    expect(baselineAdvisory).toHaveLength(1);
    expect(baselineAdvisory[0].status).toBe('degraded');
  });

  it('handles multiple selector groups independently', () => {
    const results = [
      makeResult({ group: 'SELECTORS', name: 'user', index: 0, matchCount: 2 }),
      makeResult({ group: 'SELECTORS', name: 'assistant', index: 0, matchCount: 0 }),
      makeResult({ group: 'SELECTORS', name: 'assistant', index: 1, matchCount: 1 }),
      makeResult({ group: 'DR_SELECTORS', name: 'title', index: 0, matchCount: 0 }),
    ];

    const { pass, warn, fail } = classifyResults(results);

    expect(pass).toHaveLength(1); // user
    expect(warn).toHaveLength(1); // assistant (primary failed, fallback ok)
    expect(fail).toHaveLength(1); // DR title (all failed)
  });
});
