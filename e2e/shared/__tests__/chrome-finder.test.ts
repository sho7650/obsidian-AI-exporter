import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findChromeExecutable, type ChromeFinderDeps } from '../chrome-finder';

describe('findChromeExecutable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CHROME_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const noDeps: ChromeFinderDeps = {
    existsSync: () => false,
    execWhich: () => {
      throw new Error('not found');
    },
  };

  it('returns CHROME_PATH env var when set', () => {
    process.env.CHROME_PATH = '/custom/path/chrome';
    const result = findChromeExecutable(noDeps);
    expect(result).toBe('/custom/path/chrome');
  });

  it('returns first existing macOS candidate path', () => {
    const deps: ChromeFinderDeps = {
      ...noDeps,
      existsSync: p => p === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    };
    const result = findChromeExecutable(deps);
    expect(result).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  });

  it('returns Canary path when standard Chrome is not found', () => {
    const deps: ChromeFinderDeps = {
      ...noDeps,
      existsSync: p =>
        p === '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    };
    const result = findChromeExecutable(deps);
    expect(result).toBe(
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
    );
  });

  it('falls back to which command when no candidate exists', () => {
    const deps: ChromeFinderDeps = {
      existsSync: () => false,
      execWhich: () => '/usr/bin/google-chrome',
    };
    const result = findChromeExecutable(deps);
    expect(result).toBe('/usr/bin/google-chrome');
  });

  it('throws when Chrome is not found anywhere', () => {
    expect(() => findChromeExecutable(noDeps)).toThrow('Google Chrome not found');
  });

  it.skipIf(!!process.env.CI)('uses default deps when none provided', () => {
    // Integration test: requires Chrome installed on the machine
    const result = findChromeExecutable();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
