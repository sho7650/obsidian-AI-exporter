import { describe, it, expect, vi, afterEach } from 'vitest';
import { getMessage } from '../../src/lib/i18n';

describe('i18n/getMessage', () => {
  afterEach(() => {
    vi.mocked(chrome.i18n.getMessage).mockReset();
    // Restore default behavior (return key as-is) so other tests are unaffected
    vi.mocked(chrome.i18n.getMessage).mockImplementation((key: string) => key);
  });

  it('returns translated message when chrome.i18n returns a non-empty string', () => {
    vi.mocked(chrome.i18n.getMessage).mockReturnValueOnce('Hello World');

    expect(getMessage('greeting')).toBe('Hello World');
  });

  it('falls back to key when chrome.i18n returns an empty string', () => {
    // Missing translation: chrome.i18n.getMessage returns '' — covers `message || key`
    vi.mocked(chrome.i18n.getMessage).mockReturnValueOnce('');

    expect(getMessage('missingKey')).toBe('missingKey');
  });

  it('falls back to key when chrome.i18n throws', () => {
    vi.mocked(chrome.i18n.getMessage).mockImplementationOnce(() => {
      throw new Error('i18n unavailable');
    });

    expect(getMessage('errorKey')).toBe('errorKey');
  });

  it('passes substitutions through to chrome.i18n.getMessage', () => {
    const spy = vi.mocked(chrome.i18n.getMessage).mockReturnValueOnce('Hello, Alice');

    const result = getMessage('greet', ['Alice']);

    expect(spy).toHaveBeenCalledWith('greet', ['Alice']);
    expect(result).toBe('Hello, Alice');
  });
});
