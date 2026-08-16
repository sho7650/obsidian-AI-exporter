import { describe, it, expect } from 'vitest';
import {
  normalizeSyncSettings,
  DEFAULT_SYNC_SETTINGS,
  DEFAULT_TEMPLATE_OPTIONS,
  DEFAULT_OUTPUT_OPTIONS,
} from '../../src/lib/settings-schema';

describe('normalizeSyncSettings', () => {
  it('returns full defaults for an empty object', () => {
    expect(normalizeSyncSettings({})).toEqual(DEFAULT_SYNC_SETTINGS);
  });

  it('returns full defaults for a non-object input', () => {
    expect(normalizeSyncSettings(null)).toEqual(DEFAULT_SYNC_SETTINGS);
    expect(normalizeSyncSettings('corrupt')).toEqual(DEFAULT_SYNC_SETTINGS);
    expect(normalizeSyncSettings(undefined)).toEqual(DEFAULT_SYNC_SETTINGS);
  });

  it('preserves valid custom values', () => {
    const raw = {
      obsidianUrl: 'https://192.168.1.5:27123',
      vaultPath: 'Custom/Path',
      enableAppendMode: true,
      maxCalloutLines: 50,
    };
    const result = normalizeSyncSettings(raw);
    expect(result.obsidianUrl).toBe('https://192.168.1.5:27123');
    expect(result.vaultPath).toBe('Custom/Path');
    expect(result.enableAppendMode).toBe(true);
    expect(result.maxCalloutLines).toBe(50);
  });

  it('resets only the corrupted boolean field to its default', () => {
    const result = normalizeSyncSettings({
      enableAppendMode: 'yes',
      enableImageExport: false,
    });
    expect(result.enableAppendMode).toBe(DEFAULT_SYNC_SETTINGS.enableAppendMode); // false
    expect(result.enableImageExport).toBe(false); // valid → preserved
  });

  it('resets an out-of-range or non-integer maxCalloutLines to default', () => {
    expect(normalizeSyncSettings({ maxCalloutLines: 'abc' }).maxCalloutLines).toBe(200);
    expect(normalizeSyncSettings({ maxCalloutLines: -5 }).maxCalloutLines).toBe(200);
    expect(normalizeSyncSettings({ maxCalloutLines: 0 }).maxCalloutLines).toBe(200);
    expect(normalizeSyncSettings({ maxCalloutLines: 1.5 }).maxCalloutLines).toBe(200);
  });

  it('resets an invalid messageFormat enum but keeps sibling template fields', () => {
    const result = normalizeSyncSettings({
      templateOptions: { messageFormat: 'weird', userCalloutType: 'TIP' },
    });
    expect(result.templateOptions.messageFormat).toBe('callout');
    expect(result.templateOptions.userCalloutType).toBe('TIP');
  });

  it('resets an invalid filenameScheme enum to default', () => {
    const result = normalizeSyncSettings({ templateOptions: { filenameScheme: 'bogus' } });
    expect(result.templateOptions.filenameScheme).toBe('title-id');
  });

  it('falls back to default templateOptions when the value is not an object', () => {
    const result = normalizeSyncSettings({ templateOptions: 'corrupt' });
    expect(result.templateOptions).toEqual(DEFAULT_TEMPLATE_OPTIONS);
  });

  it('coerces corrupted outputOptions booleans to defaults', () => {
    const result = normalizeSyncSettings({ outputOptions: { obsidian: 'true', file: 1 } });
    expect(result.outputOptions).toEqual(DEFAULT_OUTPUT_OPTIONS);
  });

  it('migrates legacy obsidianPort into obsidianUrl', () => {
    const result = normalizeSyncSettings({ obsidianPort: 27124 });
    expect(result.obsidianUrl).toBe('http://127.0.0.1:27124');
  });

  it('preserves a valid optional timezone but drops a non-string one', () => {
    expect(
      normalizeSyncSettings({ templateOptions: { timezone: 'Asia/Tokyo' } }).templateOptions.timezone
    ).toBe('Asia/Tokyo');
    expect(
      normalizeSyncSettings({ templateOptions: { timezone: 123 } }).templateOptions.timezone
    ).toBeUndefined();
  });
});

/**
 * User-settable auto-scroll deadlines (issue #449, ADR-032).
 *
 * A 446-message conversation stopped at 27 turns. Rather than guess at the
 * cause, the two deadlines become settings the user can raise. Sync storage is
 * cross-device and therefore untrusted at load time, so the schema clamps —
 * and clamps rather than rejects, because this is the migration boundary.
 */
describe('normalizeSyncSettings — auto-scroll deadlines', () => {
  it('defaults to the shipped 15s / 300s', () => {
    expect(DEFAULT_SYNC_SETTINGS.scrollIdleTimeoutSec).toBe(15);
    expect(DEFAULT_SYNC_SETTINGS.scrollMaxTimeoutSec).toBe(300);
  });

  it('preserves values inside the allowed range', () => {
    const result = normalizeSyncSettings({ scrollIdleTimeoutSec: 60, scrollMaxTimeoutSec: 1800 });
    expect(result.scrollIdleTimeoutSec).toBe(60);
    expect(result.scrollMaxTimeoutSec).toBe(1800);
  });

  it('falls back to the default for junk', () => {
    for (const bad of ['abc', null, undefined, 1.5, -1, 0, {}, []]) {
      const result = normalizeSyncSettings({ scrollIdleTimeoutSec: bad, scrollMaxTimeoutSec: bad });
      expect(result.scrollIdleTimeoutSec).toBe(15);
      expect(result.scrollMaxTimeoutSec).toBe(300);
    }
  });

  it('clamps out-of-range values instead of discarding them', () => {
    const low = normalizeSyncSettings({ scrollIdleTimeoutSec: 1, scrollMaxTimeoutSec: 5 });
    expect(low.scrollIdleTimeoutSec).toBe(5);
    expect(low.scrollMaxTimeoutSec).toBe(30);

    const high = normalizeSyncSettings({
      scrollIdleTimeoutSec: 100_000,
      scrollMaxTimeoutSec: 100_000,
    });
    expect(high.scrollIdleTimeoutSec).toBe(600);
    expect(high.scrollMaxTimeoutSec).toBe(3600);
  });

  it('migrates settings written before the fields existed, preserving the rest', () => {
    // The shape a v2.8.1 install has in sync storage: no deadline keys at all.
    const v281 = {
      obsidianUrl: 'http://127.0.0.1:27123',
      vaultPath: 'AI/{platform}',
      enableAutoScroll: true,
      enableAppendMode: true,
      maxCalloutLines: 50,
    };
    const result = normalizeSyncSettings(v281);

    expect(result.obsidianUrl).toBe('http://127.0.0.1:27123');
    expect(result.vaultPath).toBe('AI/{platform}');
    expect(result.enableAutoScroll).toBe(true);
    expect(result.enableAppendMode).toBe(true);
    expect(result.maxCalloutLines).toBe(50);
    expect(result.scrollIdleTimeoutSec).toBe(15);
    expect(result.scrollMaxTimeoutSec).toBe(300);
  });
});
