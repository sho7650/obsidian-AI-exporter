import { describe, it, expect, vi, afterEach } from 'vitest';
import { isCdpAvailable, type BrowserSession } from '../browser-provider';

describe('browser-provider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('isCdpAvailable', () => {
    it('returns true when CDP endpoint responds OK', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      expect(await isCdpAvailable(9222)).toBe(true);
    });

    it('returns false when CDP endpoint is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await isCdpAvailable(9222)).toBe(false);
    });

    it('returns false when CDP endpoint returns non-OK', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      expect(await isCdpAvailable(9222)).toBe(false);
    });
  });

  describe('BrowserSession type', () => {
    it('has required interface shape', () => {
      // Type-level test: verify the interface compiles
      const session: BrowserSession = {
        context: {} as BrowserSession['context'],
        mode: 'cdp',
        cleanup: async () => {},
      };
      expect(session.mode).toBe('cdp');

      const standaloneSession: BrowserSession = {
        context: {} as BrowserSession['context'],
        mode: 'standalone',
        cleanup: async () => {},
      };
      expect(standaloneSession.mode).toBe('standalone');
    });
  });
});
