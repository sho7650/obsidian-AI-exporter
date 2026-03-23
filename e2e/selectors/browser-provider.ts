/**
 * Browser session provider for E2E selector validation.
 *
 * Automatically selects between two modes:
 * - CDP: Connects to a running Chrome daemon (preferred, avoids bot detection)
 * - Standalone: Launches a new Playwright browser with storageState (fallback)
 *
 * @see docs/adr/007-cdp-daemon-persistent-sessions.md
 */

import { chromium } from '@playwright/test';
import type { BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';

const DEFAULT_CDP_PORT = (() => {
  const port = parseInt(process.env.CDP_PORT ?? '9222', 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 9222;
})();
const STATE_PATH = path.join(import.meta.dirname, '..', 'auth', 'state.json');

export interface BrowserSession {
  readonly context: BrowserContext;
  readonly mode: 'cdp' | 'standalone';
  cleanup(): Promise<void>;
}

/** Check if a CDP endpoint is reachable. */
export async function isCdpAvailable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Acquire a browser session, preferring CDP daemon over standalone.
 *
 * In CDP mode:
 * - Connects to existing Chrome (no automation flags)
 * - Uses the default browser context (real session cookies)
 * - cleanup() disconnects without killing Chrome
 *
 * In standalone mode:
 * - Launches a new Chrome via Playwright (existing behavior)
 * - Injects storageState from state.json
 * - cleanup() closes browser
 */
export async function acquireBrowserSession(
  cdpPort: number = DEFAULT_CDP_PORT
): Promise<BrowserSession> {
  // Try CDP first
  if (await isCdpAvailable(cdpPort)) {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const contexts = browser.contexts();

    if (contexts.length === 0) {
      await browser.close();
      throw new Error('CDP connected but no browser contexts found. Is Chrome fully loaded?');
    }

    return {
      context: contexts[0],
      mode: 'cdp',
      async cleanup() {
        // Disconnect only — Chrome keeps running
        await browser.close();
      },
    };
  }

  // Fallback to standalone mode
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      `Neither CDP daemon nor storageState available.\n` +
        `Start the daemon: npm run e2e:daemon start\n` +
        `Or create storageState: npm run e2e:auth`
    );
  }

  console.log('[G2O E2E] CDP daemon not available, falling back to standalone mode.');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });
  const context = await browser.newContext({
    storageState: STATE_PATH,
  });

  return {
    context,
    mode: 'standalone',
    async cleanup() {
      await context.close();
      await browser.close();
    },
  };
}
