import { describe, it, expect } from 'vitest';
import { resolveAuthStatus, isLoginUrl, AUTH_URL_PATTERNS } from '../auth-check';

const GEMINI_PATTERN = AUTH_URL_PATTERNS.gemini;
const CHATGPT_PATTERN = AUTH_URL_PATTERNS.chatgpt;

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

  // The extension exports Gem conversations (/gem/{gemId}/{conversationId},
  // gemini.ts getConversationId) and custom-GPT conversations
  // (/g/{slug}/c/{uuid}, chatgpt.ts). A pinned test URL of either shape must
  // not be misread as dead test data — that is what the 2026-09 audit found
  // (docs/investigation/e2e-coverage-gaps-2026-09.md §A).
  describe('conversation URL shapes the extension supports', () => {
    it('accepts a Gemini Gem conversation URL', () => {
      const status = resolveAuthStatus({
        finalUrl: 'https://gemini.google.com/gem/1a2b3c4d5e6f7a8b/8c6eb888f77e1571',
        conversationPattern: GEMINI_PATTERN,
        loggedOutMarkerPresent: false,
      });
      expect(status).toBe('authenticated');
    });

    it('treats a Gem root (no conversation segment) as test_data_missing', () => {
      // A dead Gem conversation bounces to the Gem's fresh-chat page.
      const status = resolveAuthStatus({
        finalUrl: 'https://gemini.google.com/gem/1a2b3c4d5e6f7a8b',
        conversationPattern: GEMINI_PATTERN,
        loggedOutMarkerPresent: false,
      });
      expect(status).toBe('test_data_missing');
    });

    it('accepts a ChatGPT custom-GPT conversation URL', () => {
      const status = resolveAuthStatus({
        finalUrl: 'https://chatgpt.com/g/g-abc123-my-gpt/c/6ab21727-d084-83e8-bf8f-762e3c7f5cc6',
        conversationPattern: CHATGPT_PATTERN,
        loggedOutMarkerPresent: false,
      });
      expect(status).toBe('authenticated');
    });

    it('treats a custom-GPT landing page (no /c/ segment) as test_data_missing', () => {
      const status = resolveAuthStatus({
        finalUrl: 'https://chatgpt.com/g/g-abc123-my-gpt',
        conversationPattern: CHATGPT_PATTERN,
        loggedOutMarkerPresent: false,
      });
      expect(status).toBe('test_data_missing');
    });

    it('still accepts a plain ChatGPT conversation URL', () => {
      const status = resolveAuthStatus({
        finalUrl: 'https://chatgpt.com/c/6ab21727-d084-83e8-bf8f-762e3c7f5cc6',
        conversationPattern: CHATGPT_PATTERN,
        loggedOutMarkerPresent: false,
      });
      expect(status).toBe('authenticated');
    });
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
