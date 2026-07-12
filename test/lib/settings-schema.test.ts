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
