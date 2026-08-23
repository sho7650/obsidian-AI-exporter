/**
 * Sync status model tests (issue #458)
 *
 * The badge and the toast must agree, so these tests pin the three-way split
 * to the same conditions `displaySaveResults()` uses.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFailedSyncStatus,
  buildSyncStatus,
  describeAge,
  isStale,
  type SyncStatus,
} from '../../src/content/sync-status';
import type { MultiOutputResponse, OutputResult } from '../../src/lib/types';

const AT = new Date('2026-08-23T14:32:00Z');

function response(results: OutputResult[], messagesAppended?: number): MultiOutputResponse {
  return {
    results,
    allSuccessful: results.every(r => r.success),
    anySuccessful: results.some(r => r.success),
    ...(messagesAppended === undefined ? {} : { messagesAppended }),
  };
}

describe('buildSyncStatus', () => {
  it('reports success when every destination succeeded', () => {
    const status = buildSyncStatus({
      saveResult: response([
        { destination: 'obsidian', success: true },
        { destination: 'clipboard', success: true },
      ]),
      fileName: 'note.md',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.kind).toBe('success');
    expect(status.at).toBe(AT);
    expect(status.conversationKey).toBe('conv-1');
    expect(status.fileName).toBe('note.md');
    expect(status.results).toHaveLength(2);
  });

  it('reports partial when only some destinations succeeded', () => {
    const status = buildSyncStatus({
      saveResult: response([
        { destination: 'obsidian', success: true },
        { destination: 'file', success: false, error: 'disk full' },
      ]),
      fileName: 'note.md',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.kind).toBe('partial');
  });

  it('reports error when no destination succeeded', () => {
    const status = buildSyncStatus({
      saveResult: response([{ destination: 'obsidian', success: false, error: 'offline' }]),
      fileName: 'note.md',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.kind).toBe('error');
  });

  it('prefers the name a destination actually saved under (issue #327)', () => {
    const status = buildSyncStatus({
      saveResult: response([
        { destination: 'obsidian', success: true, savedAs: 'note-a1b2c3d4.md' },
      ]),
      fileName: 'note.md',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.fileName).toBe('note-a1b2c3d4.md');
  });

  it('carries the append count through', () => {
    const status = buildSyncStatus({
      saveResult: response([{ destination: 'obsidian', success: true }], 3),
      fileName: 'note.md',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.messagesAppended).toBe(3);
  });

  it('keeps an append count of zero rather than dropping it', () => {
    // 0 appended is a meaningful outcome ("nothing new"), not a missing value.
    const status = buildSyncStatus({
      saveResult: response([{ destination: 'obsidian', success: true }], 0),
      fileName: 'note.md',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.messagesAppended).toBe(0);
  });

  it('merges destination warnings with extraction warnings (issue #376)', () => {
    const status = buildSyncStatus({
      saveResult: response([
        { destination: 'obsidian', success: true, warning: '1 image could not be saved' },
      ]),
      fileName: 'note.md',
      warnings: ['Auto-scroll hit the idle deadline'],
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.warnings).toEqual([
      '1 image could not be saved',
      'Auto-scroll hit the idle deadline',
    ]);
  });

  it('accepts a null conversation key', () => {
    const status = buildSyncStatus({
      saveResult: response([{ destination: 'clipboard', success: true }]),
      fileName: 'note.md',
      conversationKey: null,
      at: AT,
    });

    expect(status.conversationKey).toBeNull();
  });

  it('reports error for an empty result set', () => {
    // No destination ran at all: nothing succeeded, so nothing may claim success.
    const status = buildSyncStatus({
      saveResult: { results: [], allSuccessful: false, anySuccessful: false },
      fileName: 'note.md',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.kind).toBe('error');
  });
});

describe('isStale', () => {
  const status: SyncStatus = {
    kind: 'success',
    at: AT,
    conversationKey: 'conv-1',
    results: [],
    warnings: [],
  };

  it('is not stale while the conversation key is unchanged', () => {
    expect(isStale(status, 'conv-1')).toBe(false);
  });

  it('is stale once the conversation key changes', () => {
    expect(isStale(status, 'conv-2')).toBe(true);
  });

  it('is stale when the key becomes null (new chat started)', () => {
    // Every platform goes id -> null on "new chat" (Phase 0 measurement).
    expect(isStale(status, null)).toBe(true);
  });

  it('is stale when a keyless sync is followed by a real conversation', () => {
    const keyless: SyncStatus = { ...status, conversationKey: null };
    expect(isStale(keyless, 'conv-1')).toBe(true);
  });

  it('is not stale when both keys are null', () => {
    const keyless: SyncStatus = { ...status, conversationKey: null };
    expect(isStale(keyless, null)).toBe(false);
  });
});

describe('describeAge', () => {
  const base = new Date('2026-08-23T14:32:00Z');
  const after = (ms: number) => new Date(base.getTime() + ms);

  it('reports just-now below a minute', () => {
    expect(describeAge(base, after(59_000))).toEqual({ key: 'age_justNow', value: 0 });
  });

  it('reports whole minutes', () => {
    expect(describeAge(base, after(5 * 60_000 + 30_000))).toEqual({ key: 'age_minutes', value: 5 });
  });

  it('switches to hours at 60 minutes', () => {
    expect(describeAge(base, after(60 * 60_000))).toEqual({ key: 'age_hours', value: 1 });
  });

  it('switches to days at 24 hours', () => {
    expect(describeAge(base, after(25 * 60 * 60_000))).toEqual({ key: 'age_days', value: 1 });
  });

  it('treats a future timestamp as just-now rather than reporting negative age', () => {
    // Clock skew must not produce "-3 minutes ago".
    expect(describeAge(base, after(-180_000))).toEqual({ key: 'age_justNow', value: 0 });
  });
});

describe('buildFailedSyncStatus', () => {
  it('reports an error that never reached a destination', () => {
    // "Cannot connect to Obsidian" happens before any output runs, and is
    // exactly the failure a user who looked away needs to still see.
    const status = buildFailedSyncStatus({
      error: 'Cannot connect to Obsidian',
      conversationKey: 'conv-1',
      at: AT,
    });

    expect(status.kind).toBe('error');
    expect(status.error).toBe('Cannot connect to Obsidian');
    expect(status.results).toEqual([]);
    expect(status.warnings).toEqual([]);
    expect(status.conversationKey).toBe('conv-1');
    expect(status.at).toBe(AT);
  });
});
