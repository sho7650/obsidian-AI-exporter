/**
 * Live Selector Validation Smoke Test
 *
 * Uses storageState (cookies + localStorage) exported by e2e:auth
 * and Playwright's bundled Chromium — no Chrome profile directory sharing,
 * no SingletonLock, no keychain encryption issues.
 *
 * @see docs/design/DES-015-live-selector-validation.md
 */

import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  GEMINI_SELECTORS,
  GEMINI_DR_SELECTORS,
  GEMINI_DR_LINK_SELECTORS,
  CLAUDE_SELECTORS,
  CLAUDE_DR_SELECTORS,
  CHATGPT_SELECTORS,
  PERPLEXITY_SELECTORS,
} from '../../src/content/extractors/selectors';
import type { SelectorGroup } from '../../src/content/extractors/selectors/types';
import { checkAuthStatus, type AuthStatus } from './auth-check';
import { hasBaseline, saveBaseline, loadBaseline, compareWithBaseline } from './baseline';
import { classifyResults, type SelectorResult } from './classifier';

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env.local') });

const STATE_PATH = path.join(import.meta.dirname, '..', 'auth', 'state.json');

/**
 * Page-ready selectors: wait for these after navigation to confirm
 * the SPA has rendered its content.
 */
const READY_SELECTORS: Readonly<Record<string, string>> = {
  gemini_conv: '.conversation-container',
  gemini_dr: 'deep-research-immersive-panel',
  claude_conv: '.font-claude-response',
  claude_dr: '#markdown-artifact',
  chatgpt_conv: 'section[data-turn-id]',
  perplexity_conv: 'div[id^="markdown-content-"]',
};

// --- Helper Functions ---

async function validateSelectors(
  page: Page,
  platform: string,
  groupName: string,
  selectors: SelectorGroup
): Promise<SelectorResult[]> {
  const results: SelectorResult[] = [];

  for (const [name, selectorList] of Object.entries(selectors)) {
    for (let i = 0; i < selectorList.length; i++) {
      const selector = selectorList[i];
      const matchCount = await page.evaluate(
        (sel: string) => document.querySelectorAll(sel).length,
        selector
      );
      results.push({ platform, group: groupName, name, selector, index: i, matchCount });
    }
  }

  return results;
}

async function runPlatformValidation(
  context: BrowserContext,
  platform: string,
  url: string | undefined,
  readyKey: string,
  selectorGroups: Record<string, SelectorGroup>
): Promise<void> {
  expect(url, `${platform}: URL not configured in .env.local`).toBeTruthy();

  const page = await context.newPage();
  try {
    // Auth pre-flight
    const authStatus: AuthStatus = await checkAuthStatus(page, platform, url!);

    if (authStatus === 'unreachable') {
      test.skip(true, `${platform}: site unreachable`);
      return;
    }
    if (authStatus === 'auth_expired') {
      test.skip(true, `${platform}: AUTH_EXPIRED — run 'npm run e2e:auth' to re-login`);
      return;
    }

    // Wait for page ready
    const readySelector = READY_SELECTORS[readyKey];
    if (readySelector) {
      try {
        await page.waitForSelector(readySelector, { timeout: 15_000 });
      } catch {
        console.warn(`${platform}: ready selector '${readySelector}' not found, proceeding`);
      }
    }

    // Validate all selectors
    const allResults: SelectorResult[] = [];
    for (const [groupName, selectors] of Object.entries(selectorGroups)) {
      const results = await validateSelectors(page, platform, groupName, selectors);
      allResults.push(...results);
    }

    // Baseline comparison
    let baselineComparisons;
    if (hasBaseline(platform)) {
      const baseline = loadBaseline(platform);
      baselineComparisons = compareWithBaseline(allResults, baseline);
    } else {
      saveBaseline(platform, allResults);
      console.log(`${platform}: baseline saved (first run)`);
    }

    // Classify
    const classified = classifyResults(allResults, baselineComparisons);

    // Record in annotations for globalTeardown to read
    test
      .info()
      .annotations.push(
        { type: 'pass', description: String(classified.pass.length) },
        { type: 'warn', description: String(classified.warn.length) },
        { type: 'fail', description: String(classified.fail.length) },
        { type: 'baseline_issues', description: String(classified.baselineIssues.length) }
      );

    // Assert
    expect(
      classified.fail,
      `${platform}: selectors with zero matches: ${classified.fail.map(f => `${f.group}:${f.name}`).join(', ')}`
    ).toHaveLength(0);
  } finally {
    await page.close();
  }
}

// --- Shared context using storageState ---

let sharedContext: BrowserContext;

test.beforeAll(async () => {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      `storageState not found at ${STATE_PATH}\n` + `Run 'npm run e2e:auth' first to create it.`
    );
  }

  // Use system Chrome in headed mode for maximum reliability:
  // - channel: 'chrome' — real Chrome binary, not detectable as automation
  // - headless: false — Cloudflare bot detection is much less aggressive in headed mode
  // - storageState — cookies injected from state.json, no profile directory sharing
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });
  sharedContext = await browser.newContext({
    storageState: STATE_PATH,
  });
});

test.afterAll(async () => {
  if (sharedContext) {
    const browser = sharedContext.browser();
    await sharedContext.close();
    if (browser) {
      await browser.close();
    }
  }
});

// --- Test Definitions ---

test.describe('Gemini', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      sharedContext,
      'gemini',
      process.env.GEMINI_CONV_URL,
      'gemini_conv',
      {
        SELECTORS: GEMINI_SELECTORS,
      }
    );
  });

  test('deep research selectors', async () => {
    await runPlatformValidation(sharedContext, 'gemini', process.env.GEMINI_DR_URL, 'gemini_dr', {
      DEEP_RESEARCH_SELECTORS: GEMINI_DR_SELECTORS,
      DEEP_RESEARCH_LINK_SELECTORS: GEMINI_DR_LINK_SELECTORS,
    });
  });
});

test.describe('Claude', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      sharedContext,
      'claude',
      process.env.CLAUDE_CONV_URL,
      'claude_conv',
      {
        SELECTORS: CLAUDE_SELECTORS,
      }
    );
  });

  test('deep research selectors', async () => {
    await runPlatformValidation(sharedContext, 'claude', process.env.CLAUDE_DR_URL, 'claude_dr', {
      DEEP_RESEARCH_SELECTORS: CLAUDE_DR_SELECTORS,
    });
  });
});

test.describe('ChatGPT', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      sharedContext,
      'chatgpt',
      process.env.CHATGPT_CONV_URL,
      'chatgpt_conv',
      {
        SELECTORS: CHATGPT_SELECTORS,
      }
    );
  });
});

test.describe('Perplexity', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      sharedContext,
      'perplexity',
      process.env.PERPLEXITY_CONV_URL,
      'perplexity_conv',
      {
        SELECTORS: PERPLEXITY_SELECTORS,
      }
    );
  });
});
