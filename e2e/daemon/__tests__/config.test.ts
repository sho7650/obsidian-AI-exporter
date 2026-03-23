import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig } from '../config';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default values', () => {
    delete process.env.CDP_PORT;
    delete process.env.KEEP_ALIVE_INTERVAL_MIN;

    const config = loadConfig();
    expect(config.cdpPort).toBe(9222);
    expect(config.keepAliveIntervalMs).toBe(15 * 60 * 1000);
    expect(config.platformUrls).toHaveLength(4);
    expect(config.profileDir).toMatch(/e2e\/auth\/profiles$/);
    expect(config.pidFile).toMatch(/e2e\/daemon\/chrome\.pid$/);
  });

  it('respects CDP_PORT env var', () => {
    process.env.CDP_PORT = '9333';
    const config = loadConfig();
    expect(config.cdpPort).toBe(9333);
  });

  it('respects KEEP_ALIVE_INTERVAL_MIN env var', () => {
    process.env.KEEP_ALIVE_INTERVAL_MIN = '5';
    const config = loadConfig();
    expect(config.keepAliveIntervalMs).toBe(5 * 60 * 1000);
  });

  it('includes required Chrome flags', () => {
    const config = loadConfig();
    expect(config.chromeFlags).toContain('--no-first-run');
    expect(config.chromeFlags).toContain('--disable-background-timer-throttling');
  });

  it('throws on invalid CDP_PORT', () => {
    process.env.CDP_PORT = 'abc';
    expect(() => loadConfig()).toThrow('Invalid CDP_PORT');
  });

  it('throws on out-of-range CDP_PORT', () => {
    process.env.CDP_PORT = '99999';
    expect(() => loadConfig()).toThrow('Invalid CDP_PORT');
  });

  it('includes all 4 platform URLs', () => {
    const config = loadConfig();
    expect(config.platformUrls).toContain('https://gemini.google.com');
    expect(config.platformUrls).toContain('https://claude.ai');
    expect(config.platformUrls).toContain('https://chatgpt.com');
    expect(config.platformUrls).toContain('https://www.perplexity.ai');
  });

  it('loads .env.local via dotenv on startup', async () => {
    const dotenv = await import('dotenv');
    loadConfig();
    expect(dotenv.default.config).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(/e2e\/\.env\.local$/),
      })
    );
  });
});
