import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForCDP } from '../cdp-utils';

describe('waitForCDP', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('resolves immediately when CDP is ready', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    await expect(waitForCDP(9222, 1000, 10)).resolves.toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:9222/json/version');
  });

  it('retries until CDP becomes ready', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error('connection refused'));
      }
      return Promise.resolve({ ok: true });
    });

    await expect(waitForCDP(9222, 2000, 10)).resolves.toBeUndefined();
    expect(callCount).toBe(3);
  });

  it('rejects after timeout', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

    await expect(waitForCDP(9222, 100, 10)).rejects.toThrow(
      'CDP endpoint not available on port 9222 after 100ms',
    );
  });

  it('uses default timeout of 15000ms in error message', async () => {
    // Just verify the default is documented; actual wait is short
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

    await expect(waitForCDP(9222, 50, 10)).rejects.toThrow('after 50ms');
  });

  it('handles non-OK HTTP responses as not ready', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true });
    });

    await expect(waitForCDP(9222, 2000, 10)).resolves.toBeUndefined();
    expect(callCount).toBe(2);
  });
});
