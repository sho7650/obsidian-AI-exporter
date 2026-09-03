/**
 * The one place every `set*Location` fixture helper builds its `window.location`
 * from. Before this helper existed each of the eleven helpers hand-wrote href,
 * origin and host separately — a slip in one of them surfaced as a confusing
 * extractor failure rather than as a fixture bug. These pin the derivation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { defineLocation, resetLocation, setClaudeLocation } from './dom-helpers';

describe('defineLocation', () => {
  afterEach(() => resetLocation());

  it('derives href, origin and host from hostname and pathname', () => {
    defineLocation('claude.ai', '/chat/abc');

    expect(window.location).toMatchObject({
      hostname: 'claude.ai',
      host: 'claude.ai',
      pathname: '/chat/abc',
      href: 'https://claude.ai/chat/abc',
      origin: 'https://claude.ai',
      protocol: 'https:',
      search: '',
      hash: '',
    });
  });

  it('defaults the path to the root', () => {
    defineLocation('evil-claude.ai.attacker.com');

    expect(window.location.pathname).toBe('/');
    expect(window.location.href).toBe('https://evil-claude.ai.attacker.com/');
  });

  it('is what the platform helpers are built on', () => {
    setClaudeLocation('abc');

    expect(window.location.href).toBe('https://claude.ai/chat/abc');
    expect(window.location.origin).toBe('https://claude.ai');
  });

  it('resets to the jsdom default over http', () => {
    defineLocation('claude.ai', '/chat/abc');
    resetLocation();

    expect(window.location.href).toBe('http://localhost/');
    expect(window.location.protocol).toBe('http:');
  });
});
