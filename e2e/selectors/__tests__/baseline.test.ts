import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  compareWithBaseline,
  saveBaseline,
  loadBaseline,
  hasBaseline,
  type BaselineEntry,
} from '../baseline';

// Use a temp directory for baseline files in tests
const TEST_BASELINE_DIR = path.join(import.meta.dirname, '..', '..', 'baselines');

function makeEntry(overrides: Partial<BaselineEntry> = {}): BaselineEntry {
  return {
    platform: 'test',
    group: 'SELECTORS',
    name: 'testSelector',
    selector: '.test',
    index: 0,
    matchCount: 5,
    ...overrides,
  };
}

describe('compareWithBaseline', () => {
  it('returns match when both baseline and current have matches', () => {
    const baseline = [makeEntry({ matchCount: 5 })];
    const current = [makeEntry({ matchCount: 3 })];

    const result = compareWithBaseline(current, baseline);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('match');
    expect(result[0].baselineCount).toBe(5);
    expect(result[0].currentCount).toBe(3);
  });

  it('returns lost when baseline had matches but current has 0', () => {
    const baseline = [makeEntry({ matchCount: 8 })];
    const current = [makeEntry({ matchCount: 0 })];

    const result = compareWithBaseline(current, baseline);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('lost');
  });

  it('returns match when both are 0', () => {
    const baseline = [makeEntry({ matchCount: 0 })];
    const current = [makeEntry({ matchCount: 0 })];

    const result = compareWithBaseline(current, baseline);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('match');
  });

  it('detects new selectors not in baseline', () => {
    const baseline = [makeEntry({ name: 'old', index: 0 })];
    const current = [
      makeEntry({ name: 'old', index: 0, matchCount: 3 }),
      makeEntry({ name: 'new', index: 0, matchCount: 2 }),
    ];

    const result = compareWithBaseline(current, baseline);

    const newEntry = result.find((r) => r.status === 'new_selector');
    expect(newEntry).toBeDefined();
    expect(newEntry!.baselineCount).toBe(-1);
    expect(newEntry!.currentCount).toBe(2);
  });

  it('handles empty baseline (all new)', () => {
    const current = [makeEntry({ matchCount: 3 })];

    const result = compareWithBaseline(current, []);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('new_selector');
  });

  it('handles empty current', () => {
    const baseline = [makeEntry({ matchCount: 5 })];

    const result = compareWithBaseline([], baseline);

    expect(result).toHaveLength(0);
  });

  it('matches by group + name + index', () => {
    const baseline = [
      makeEntry({ group: 'A', name: 'x', index: 0, matchCount: 3 }),
      makeEntry({ group: 'A', name: 'x', index: 1, matchCount: 2 }),
    ];
    const current = [
      makeEntry({ group: 'A', name: 'x', index: 0, matchCount: 0 }),
      makeEntry({ group: 'A', name: 'x', index: 1, matchCount: 5 }),
    ];

    const result = compareWithBaseline(current, baseline);

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('lost');     // index 0: 3 → 0
    expect(result[1].status).toBe('match');    // index 1: 2 → 5
  });
});

describe('baseline file operations', () => {
  const platform = '__test_platform__';

  beforeEach(() => {
    // Clean up any leftover test baseline
    const filePath = path.join(TEST_BASELINE_DIR, `${platform}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  afterEach(() => {
    const filePath = path.join(TEST_BASELINE_DIR, `${platform}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  it('hasBaseline returns false when no file exists', () => {
    expect(hasBaseline(platform)).toBe(false);
  });

  it('save + load roundtrip preserves data', () => {
    const entries = [
      makeEntry({ platform, name: 'a', matchCount: 5 }),
      makeEntry({ platform, name: 'b', matchCount: 0 }),
    ];

    saveBaseline(platform, entries);
    expect(hasBaseline(platform)).toBe(true);

    const loaded = loadBaseline(platform);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].name).toBe('a');
    expect(loaded[0].matchCount).toBe(5);
    expect(loaded[1].name).toBe('b');
    expect(loaded[1].matchCount).toBe(0);
  });

  it('loadBaseline returns empty array when no file exists', () => {
    expect(loadBaseline(platform)).toEqual([]);
  });
});
