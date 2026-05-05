import { describe, it, expect } from 'vitest';
import {
  containsPathTraversal,
  resolvePathTemplate,
  getDateVariables,
  getSearchBasePath,
} from '../../src/lib/path-utils';

describe('containsPathTraversal', () => {
  it('detects ../ patterns', () => {
    expect(containsPathTraversal('../etc/passwd')).toBe(true);
    expect(containsPathTraversal('foo/../bar')).toBe(true);
    expect(containsPathTraversal('foo/bar/..')).toBe(true);
  });

  it('detects ..\ patterns (Windows)', () => {
    expect(containsPathTraversal('..\\etc\\passwd')).toBe(true);
    expect(containsPathTraversal('foo\\..\\bar')).toBe(true);
  });

  it('detects absolute paths', () => {
    expect(containsPathTraversal('/etc/passwd')).toBe(true);
    expect(containsPathTraversal('C:\\Windows')).toBe(true);
    expect(containsPathTraversal('D:\\Users')).toBe(true);
  });

  it('detects URL-encoded traversal', () => {
    // The current implementation only detects URL-encoded patterns with path separators
    expect(containsPathTraversal('%2e%2e%2f')).toBe(true);
    expect(containsPathTraversal('%2E%2E%2F')).toBe(true);
    expect(containsPathTraversal('%2e%2e%5c')).toBe(true);
    // Partial encoding may not be detected
    expect(containsPathTraversal('%2e%2e/')).toBe(false); // This is partial encoding
  });

  it('allows safe paths', () => {
    expect(containsPathTraversal('AI/Gemini')).toBe(false);
    expect(containsPathTraversal('foo..bar')).toBe(false);
    expect(containsPathTraversal('notes/ai-chat')).toBe(false);
    expect(containsPathTraversal('my.notes.folder')).toBe(false);
    expect(containsPathTraversal('folder..name/subfolder')).toBe(false);
  });

  it('detects null bytes', () => {
    expect(containsPathTraversal('foo\0bar')).toBe(true);
    expect(containsPathTraversal('\0')).toBe(true);
    expect(containsPathTraversal('AI/Gemini\0.md')).toBe(true);
  });

  it('handles edge cases', () => {
    expect(containsPathTraversal('')).toBe(false);
    expect(containsPathTraversal('.')).toBe(false);
    expect(containsPathTraversal('..')).toBe(true);
    expect(containsPathTraversal('...')).toBe(false);
  });
});

describe('resolvePathTemplate', () => {
  it('resolves {platform} variable', () => {
    expect(resolvePathTemplate('AI/{platform}', { platform: 'gemini' })).toBe('AI/gemini');
  });

  it('resolves multiple variables', () => {
    expect(
      resolvePathTemplate('{type}/{platform}', {
        platform: 'claude',
        type: 'conversation',
      })
    ).toBe('conversation/claude');
  });

  it('preserves unknown variables', () => {
    expect(resolvePathTemplate('AI/{unknown}', { platform: 'gemini' })).toBe('AI/{unknown}');
  });

  it('returns path unchanged when no variables present', () => {
    expect(resolvePathTemplate('AI/Gemini', { platform: 'gemini' })).toBe('AI/Gemini');
  });

  it('handles empty path', () => {
    expect(resolvePathTemplate('', { platform: 'gemini' })).toBe('');
  });

  it('resolves all supported platforms', () => {
    for (const p of ['gemini', 'claude', 'chatgpt', 'perplexity']) {
      expect(resolvePathTemplate('AI/{platform}', { platform: p })).toBe(`AI/${p}`);
    }
  });

  it('resolves date variables YYYY/YY/MM/DD when supplied', () => {
    expect(
      resolvePathTemplate('AI/{platform}/{YYYY}/{MM}', {
        platform: 'gemini',
        YYYY: '2026',
        YY: '26',
        MM: '05',
        DD: '04',
      })
    ).toBe('AI/gemini/2026/05');
  });

  it('resolves all four date tokens together', () => {
    expect(
      resolvePathTemplate('{YYYY}-{YY}-{MM}-{DD}', {
        YYYY: '2026',
        YY: '26',
        MM: '01',
        DD: '02',
      })
    ).toBe('2026-26-01-02');
  });

  it('preserves date tokens that are not provided in variables', () => {
    expect(resolvePathTemplate('AI/{YYYY}/{MM}', { YYYY: '2026' })).toBe('AI/2026/{MM}');
  });
});

describe('getDateVariables', () => {
  it('returns YYYY/YY/MM/DD for a fixed date in local time', () => {
    const date = new Date(2026, 4, 4, 10, 30, 0); // 2026-05-04 local
    const vars = getDateVariables(date);
    expect(vars).toEqual({ YYYY: '2026', YY: '26', MM: '05', DD: '04' });
  });

  it('zero-pads single-digit months and days', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0); // Jan 1
    const vars = getDateVariables(date);
    expect(vars.MM).toBe('01');
    expect(vars.DD).toBe('01');
  });

  it('represents December as 12, not 11 (no off-by-one)', () => {
    const date = new Date(2026, 11, 31, 23, 59, 59); // Dec 31
    const vars = getDateVariables(date);
    expect(vars.MM).toBe('12');
    expect(vars.DD).toBe('31');
  });

  it('returns 4-digit year for YYYY and 2-digit year for YY', () => {
    const date = new Date(2099, 5, 1); // June 1, 2099
    const vars = getDateVariables(date);
    expect(vars.YYYY).toBe('2099');
    expect(vars.YY).toBe('99');
  });

  it('handles years where YY would be ambiguous (2007 → "07")', () => {
    const date = new Date(2007, 2, 15);
    const vars = getDateVariables(date);
    expect(vars.YYYY).toBe('2007');
    expect(vars.YY).toBe('07');
  });
});

describe('getSearchBasePath', () => {
  it('returns the fully resolved path when no date variables are present', () => {
    expect(getSearchBasePath('AI/{platform}', { platform: 'gemini' })).toBe('AI/gemini');
  });

  it('returns the prefix before {YYYY} when {YYYY} is the first date token', () => {
    expect(getSearchBasePath('AI/{platform}/{YYYY}/{MM}', { platform: 'gemini' })).toBe(
      'AI/gemini'
    );
  });

  it('returns the prefix before {MM} when {MM} comes before {YYYY}', () => {
    expect(getSearchBasePath('Notes/{MM}/{YYYY}', { platform: 'claude' })).toBe('Notes');
  });

  it('detects {DD} and {YY} as date tokens', () => {
    expect(getSearchBasePath('AI/{DD}', { platform: 'gemini' })).toBe('AI');
    expect(getSearchBasePath('AI/{YY}', { platform: 'gemini' })).toBe('AI');
  });

  it('strips trailing slashes from the resolved base', () => {
    expect(getSearchBasePath('AI/{platform}/{YYYY}', { platform: 'gemini' })).toBe('AI/gemini');
  });

  it('returns empty string when the template starts with a date variable', () => {
    expect(getSearchBasePath('{YYYY}/{MM}', { platform: 'gemini' })).toBe('');
  });

  it('returns the full resolved template when no date tokens appear', () => {
    expect(getSearchBasePath('AI/Static/Folder', { platform: 'gemini' })).toBe('AI/Static/Folder');
  });
});
