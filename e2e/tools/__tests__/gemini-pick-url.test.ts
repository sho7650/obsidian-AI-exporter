import { describe, it, expect } from 'vitest';
import { extractConversationId } from '../gemini-pick-url';

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
