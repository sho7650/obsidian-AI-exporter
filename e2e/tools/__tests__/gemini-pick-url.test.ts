import { describe, it, expect } from 'vitest';
import { extractConversationId, isGeminiUrl } from '../gemini-pick-url';

describe('isGeminiUrl', () => {
  it('accepts the exact Gemini hostname', () => {
    expect(isGeminiUrl('https://gemini.google.com/app')).toBe(true);
    expect(isGeminiUrl('https://gemini.google.com/app/8c6eb888f77e1571')).toBe(true);
  });

  it('rejects lookalike hostnames (CodeQL js/incomplete-url-substring-sanitization)', () => {
    expect(isGeminiUrl('https://gemini.google.com.attacker.com/app')).toBe(false);
    expect(isGeminiUrl('https://evil.com/https://gemini.google.com')).toBe(false);
  });

  it('rejects unparseable URLs', () => {
    expect(isGeminiUrl('about:blank')).toBe(false);
    expect(isGeminiUrl('not a url')).toBe(false);
  });
});

describe('extractConversationId', () => {
  it('extracts the id from a conversation URL', () => {
    expect(extractConversationId('https://gemini.google.com/app/8c6eb888f77e1571')).toBe(
      '8c6eb888f77e1571'
    );
  });

  it('handles URLs with query strings and fragments', () => {
    expect(extractConversationId('https://gemini.google.com/app/abc123def?hl=ja#x')).toBe(
      'abc123def'
    );
  });

  it('returns null for the app root (no conversation opened)', () => {
    expect(extractConversationId('https://gemini.google.com/app')).toBeNull();
  });

  it('returns null for non-Gemini URLs', () => {
    expect(extractConversationId('https://evil.com/app/abc123')).toBeNull();
  });
});
