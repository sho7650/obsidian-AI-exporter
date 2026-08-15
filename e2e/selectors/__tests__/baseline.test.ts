import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  compareWithBaseline,
  loadBaselineGroups,
  updateBaselineGroups,
  BaselineUpdateError,
  type BaselineEntry,
} from '../baseline';

const BASELINE_DIR = path.join(import.meta.dirname, '..', '..', 'baselines');
const platform = '__test_platform__';
const filePath = path.join(BASELINE_DIR, `${platform}.json`);

function makeEntry(overrides: Partial<BaselineEntry> = {}): BaselineEntry {
  return {
    platform,
    group: 'SELECTORS',
    name: 'testSelector',
    selector: '.test',
    matchCount: 5,
    nonEmptyCount: 5,
    ...overrides,
  };
}

function cleanup(): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

describe('compareWithBaseline (v2: keyed by group+name+selector)', () => {
  it('returns match when both baseline and current have matches', () => {
    const result = compareWithBaseline([makeEntry({ matchCount: 7 })], [makeEntry({ matchCount: 5 })]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('match');
    expect(result[0].baselineCount).toBe(5);
    expect(result[0].currentCount).toBe(7);
  });

  it('returns degraded when the count dropped but is still > 0', () => {
    const result = compareWithBaseline([makeEntry({ matchCount: 2 })], [makeEntry({ matchCount: 5 })]);

    expect(result[0].status).toBe('degraded');
  });

  it('returns lost when baseline had matches but current has 0', () => {
    const result = compareWithBaseline([makeEntry({ matchCount: 0 })], [makeEntry({ matchCount: 8 })]);

    expect(result[0].status).toBe('lost');
  });

  it('keys on the selector STRING: a changed selector at the same name is new + removed', () => {
    const baseline = [makeEntry({ selector: '.old-selector', matchCount: 4 })];
    const current = [makeEntry({ selector: '.new-selector', matchCount: 4 })];

    const result = compareWithBaseline(current, baseline);

    const statuses = result.map(r => r.status).sort();
    expect(statuses).toEqual(['new_selector', 'removed']);
  });

  it('flags baseline entries with no current counterpart as removed', () => {
    const baseline = [
      makeEntry({ name: 'kept', matchCount: 3 }),
      makeEntry({ name: 'gone', selector: '.gone', matchCount: 3 }),
    ];
    const current = [makeEntry({ name: 'kept', matchCount: 3 })];

    const result = compareWithBaseline(current, baseline);

    const removed = result.find(r => r.status === 'removed');
    expect(removed).toBeDefined();
    expect(removed!.name).toContain('gone');
    expect(removed!.currentCount).toBe(-1);
  });

  it('flags current entries with no baseline counterpart as new_selector', () => {
    const result = compareWithBaseline(
      [makeEntry({ name: 'brand-new', selector: '.brand-new', matchCount: 2 })],
      []
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('new_selector');
    expect(result[0].baselineCount).toBe(-1);
  });

  it('reordering selector variants does not produce spurious statuses', () => {
    const a = makeEntry({ name: 'x', selector: '.primary', matchCount: 3 });
    const b = makeEntry({ name: 'x', selector: '.fallback', matchCount: 3 });

    const result = compareWithBaseline([b, a], [a, b]);

    expect(result.every(r => r.status === 'match')).toBe(true);
  });
});

describe('updateBaselineGroups', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('writes a v3 file containing the given group', () => {
    updateBaselineGroups(platform, {
      SELECTORS: [makeEntry({ matchCount: 3 })],
    });

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw.version).toBe(3);
    expect(typeof raw.updatedAt).toBe('string');
    expect(raw.groups.SELECTORS).toHaveLength(1);
    expect(raw.groups.SELECTORS[0].matchCount).toBe(3);
  });

  it('merges new groups without touching existing ones (two-test platforms)', () => {
    updateBaselineGroups(platform, { SELECTORS: [makeEntry({ matchCount: 3 })] });
    updateBaselineGroups(platform, {
      DEEP_RESEARCH_SELECTORS: [
        makeEntry({ group: 'DEEP_RESEARCH_SELECTORS', selector: '.dr', matchCount: 2 }),
      ],
    });

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw.groups.SELECTORS).toHaveLength(1);
    expect(raw.groups.DEEP_RESEARCH_SELECTORS).toHaveLength(1);
  });

  it('replaces a group wholesale on re-update (no stale entries)', () => {
    updateBaselineGroups(platform, {
      SELECTORS: [makeEntry({ selector: '.a', matchCount: 1 }), makeEntry({ selector: '.b', matchCount: 2 })],
    });
    updateBaselineGroups(platform, {
      SELECTORS: [makeEntry({ selector: '.b', matchCount: 2 })],
    });

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw.groups.SELECTORS).toHaveLength(1);
    expect(raw.groups.SELECTORS[0].selector).toBe('.b');
  });

  it('rejects zero-count entries with a BaselineUpdateError naming the selector', () => {
    expect(() =>
      updateBaselineGroups(platform, {
        SELECTORS: [makeEntry({ matchCount: 3 }), makeEntry({ name: 'dead', selector: '.dead', matchCount: 0 })],
      })
    ).toThrow(BaselineUpdateError);

    try {
      updateBaselineGroups(platform, {
        SELECTORS: [makeEntry({ name: 'dead', selector: '.dead', matchCount: 0 })],
      });
    } catch (e) {
      expect((e as Error).message).toContain('dead');
    }
    // Nothing written on rejection
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

describe('loadBaselineGroups', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('reports all groups missing when no file exists', () => {
    const res = loadBaselineGroups(platform, ['SELECTORS']);

    expect(res.legacy).toBe(false);
    expect(res.missingGroups).toEqual(['SELECTORS']);
    expect(res.entries).toEqual([]);
  });

  it('returns entries for requested groups only', () => {
    updateBaselineGroups(platform, {
      SELECTORS: [makeEntry({ matchCount: 3 })],
      DEEP_RESEARCH_SELECTORS: [
        makeEntry({ group: 'DEEP_RESEARCH_SELECTORS', selector: '.dr', matchCount: 2 }),
      ],
    });

    const res = loadBaselineGroups(platform, ['SELECTORS']);

    expect(res.legacy).toBe(false);
    expect(res.missingGroups).toEqual([]);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].group).toBe('SELECTORS');
  });

  it('reports groups absent from the file as missing', () => {
    updateBaselineGroups(platform, { SELECTORS: [makeEntry({ matchCount: 3 })] });

    const res = loadBaselineGroups(platform, ['SELECTORS', 'DEEP_RESEARCH_SELECTORS']);

    expect(res.missingGroups).toEqual(['DEEP_RESEARCH_SELECTORS']);
  });

  it('detects the legacy v1 array format', () => {
    fs.writeFileSync(filePath, JSON.stringify([makeEntry({ matchCount: 3 })]));

    const res = loadBaselineGroups(platform, ['SELECTORS']);

    expect(res.legacy).toBe(true);
    expect(res.entries).toEqual([]);
  });
});
