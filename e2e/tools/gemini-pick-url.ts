/**
 * Helper: pick a live Gemini conversation URL for e2e/.env.local.
 *
 * Gemini's 2026 sidebar no longer exposes conversations as <a href> links —
 * items are empty custom elements (gem-nav-list-item) navigated by SPA click
 * handlers, and the off-canvas mobile layout hides them below ~960px. The
 * only reliable way to obtain a conversation URL is therefore: desktop
 * viewport, real pointer click on a sidebar item, then read the SPA-updated
 * location. This script automates that against the CDP daemon.
 *
 * Usage:
 *   npm run e2e:gemini:pick-url            # first conversation
 *   npm run e2e:gemini:pick-url -- 3       # 4th conversation (0-based index)
 *
 * Prints the conversation URL to update GEMINI_CONV_URL in e2e/.env.local.
 * Read-only apart from the sidebar click; restores the tab to /app.
 */

import { chromium } from 'playwright';
import { loadConfig } from '../daemon/config';

/** Extract the /app/<id> conversation id from a URL, or null. */
export function extractConversationId(url: string): string | null {
  const match = url.match(/^https:\/\/gemini\.google\.com\/app\/([0-9a-f]+)/);
  return match ? match[1] : null;
}

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const SPA_SETTLE_MS = 4000;

async function main(): Promise<void> {
  const index = parseInt(process.argv[2] ?? '0', 10);
  const config = loadConfig();

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);
  try {
    const context = browser.contexts()[0];
    const tab = context?.pages().find(p => p.url().startsWith('https://gemini.google.com'));
    if (!tab) {
      console.error(
        '[pick-url] No Gemini tab in the daemon. Start it with: npm run e2e:daemon:start'
      );
      process.exitCode = 1;
      return;
    }

    // Desktop viewport so the sidenav renders inline (mobile layout hides it)
    await tab.setViewportSize(DESKTOP_VIEWPORT);
    await tab.goto('https://gemini.google.com/app', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // After a fresh navigation the sidenav starts collapsed (icon rail) and
    // conversation items render without text. Expand it via its stable
    // data-test-id (aria-labels are locale-dependent), then wait for the
    // first text-bearing item.
    const items = tab.locator('[data-test-id="conversation"]').filter({ hasText: /\S/ });
    const expandButton = tab.locator('button[data-test-id="side-nav-sparkle-button"]').first();
    try {
      await items.first().waitFor({ timeout: 5_000 });
    } catch {
      if (await expandButton.count()) {
        await expandButton.click();
      }
      try {
        await items.first().waitFor({ timeout: 15_000 });
      } catch {
        // fall through to the count check below for a uniform error message
      }
    }
    const count = await items.count();
    if (count === 0) {
      console.error(
        '[pick-url] No conversations in the sidebar. Is the daemon session logged in? (npm run e2e:auth)'
      );
      process.exitCode = 1;
      return;
    }
    if (index >= count) {
      console.error(`[pick-url] Index ${index} out of range (${count} conversations visible).`);
      process.exitCode = 1;
      return;
    }

    const target = items.nth(index);
    const title = (await target.textContent())?.trim().slice(0, 60) ?? '';
    await target.scrollIntoViewIfNeeded();
    await target.click({ timeout: 10_000 });
    await tab.waitForTimeout(SPA_SETTLE_MS);

    const url = tab.url();
    const id = extractConversationId(url);
    if (!id) {
      console.error(`[pick-url] Click did not yield a conversation URL (landed on: ${url})`);
      process.exitCode = 1;
      return;
    }

    console.log('');
    console.log(`Conversation: ${title}`);
    console.log(`URL:          ${url}`);
    console.log('');
    console.log('Update e2e/.env.local:');
    console.log(`  GEMINI_CONV_URL=${url}`);
    console.log('');
    console.log('Then regenerate the baseline: npm run e2e:baseline:update');

    // Leave the daemon tab where the keep-alive expects it
    await tab.goto('https://gemini.google.com/app', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  } finally {
    await browser.close();
  }
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1]?.endsWith('gemini-pick-url.ts')) {
  main().catch(error => {
    console.error(`[pick-url] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
