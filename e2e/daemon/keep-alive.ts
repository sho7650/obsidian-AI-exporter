/**
 * Keep-alive: periodically reload platform tabs to maintain sessions.
 *
 * Connects to Chrome via Playwright's CDP connection, reloads matching
 * platform tabs, then disconnects. The browser stays running.
 */

import { chromium } from 'playwright';
import type { DaemonConfig } from './config';
import type { KeepAliveResult } from './types';

/**
 * Reload all platform tabs via CDP.
 *
 * Creates a temporary CDP connection, reloads pages whose URLs
 * match any platform URL prefix, then disconnects.
 */
export async function runKeepAlive(config: DaemonConfig): Promise<KeepAliveResult> {
  let reloaded = 0;
  let errors = 0;

  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);
    const contexts = browser.contexts();

    if (contexts.length === 0) {
      console.warn('[G2O Keep-Alive] No browser contexts found.');
      return { timestamp: new Date().toISOString(), reloaded: 0, errors: 1 };
    }

    const pages = contexts[0].pages();

    for (const page of pages) {
      const url = page.url();
      const matchesPlatform = config.platformUrls.some(prefix => url.startsWith(prefix));

      if (!matchesPlatform) continue;

      try {
        await page.reload({ timeout: 30_000, waitUntil: 'domcontentloaded' });
        reloaded++;
      } catch (err) {
        errors++;
        console.warn(
          `[G2O Keep-Alive] Failed to reload ${url}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  } catch (err) {
    console.error(
      `[G2O Keep-Alive] CDP connection failed: ${err instanceof Error ? err.message : err}`
    );
    return { timestamp: new Date().toISOString(), reloaded: 0, errors: 1 };
  } finally {
    if (browser) {
      try {
        // Disconnect only — does NOT close Chrome
        await browser.close();
      } catch (err) {
        console.warn(
          `[G2O Keep-Alive] Disconnect error (non-fatal): ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  const result: KeepAliveResult = {
    timestamp: new Date().toISOString(),
    reloaded,
    errors,
  };

  console.log(`[G2O Keep-Alive] ${result.timestamp} — reloaded: ${reloaded}, errors: ${errors}`);
  return result;
}
