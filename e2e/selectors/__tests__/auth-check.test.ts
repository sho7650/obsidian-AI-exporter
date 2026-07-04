import { describe, it, expect } from 'vitest';
import { resolveAuthStatus, isLoginUrl } from '../auth-check';

const GEMINI_PATTERN = /^https:\/\/gemini\.google\.com\/(app|deepresearch)\//;

describe('isLoginUrl', () => {
  it('recognizes Google account login URLs', () => {
    expect(isLoginUrl('https://accounts.google.com/v3/signin/identifier?x=1')).toBe(true);
  });

  it('recognizes platform login paths', () => {
    expect(isLoginUrl('https://claude.ai/login?returnTo=%2F')).toBe(true);
    expect(isLoginUrl('https://auth.openai.com/authorize?client=x')).toBe(true);
  });

  it('does not flag ordinary platform pages', () => {
    expect(isLoginUrl('https://gemini.google.com/app')).toBe(false);
    expect(isLoginUrl('https://claude.ai/chat/abc')).toBe(false);
  });
});

describe('resolveAuthStatus', () => {
  it('returns authenticated when the URL matches the conversation pattern', () => {
    const status = resolveAuthStatus({
      finalUrl: 'https://gemini.google.com/app/8c6eb888f77e1571',
      conversationPattern: GEMINI_PATTERN,
      loggedOutMarkerPresent: false,
    });
    expect(status).toBe('authenticated');
  });

  it('returns auth_expired when redirected to a login URL', () => {
    const status = resolveAuthStatus({
      finalUrl: 'https://accounts.google.com/v3/signin/identifier',
      conversationPattern: GEMINI_PATTERN,
      loggedOutMarkerPresent: false,
    });
    expect(status).toBe('auth_expired');
  });

  it('returns auth_expired when a logged-out marker is present on an off-pattern page', () => {
    // Gemini bounces to /app (in-origin logged-out shell) instead of accounts.google.com
    const status = resolveAuthStatus({
      finalUrl: 'https://gemini.google.com/app',
      conversationPattern: GEMINI_PATTERN,
      loggedOutMarkerPresent: true,
    });
    expect(status).toBe('auth_expired');
  });

  it('returns test_data_missing when authenticated but bounced off the conversation URL', () => {
    // The stale-conversation case: logged in, no logged-out marker, but the
    // pinned conversation no longer opens — lands on the app root.
    const status = resolveAuthStatus({
      finalUrl: 'https://gemini.google.com/app',
      conversationPattern: GEMINI_PATTERN,
      loggedOutMarkerPresent: false,
    });
    expect(status).toBe('test_data_missing');
  });

  it('returns authenticated when no pattern is configured (unknown platform)', () => {
    const status = resolveAuthStatus({
      finalUrl: 'https://example.com/anything',
      conversationPattern: undefined,
      loggedOutMarkerPresent: false,
    });
    expect(status).toBe('authenticated');
  });
});
