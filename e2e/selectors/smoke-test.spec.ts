/**
 * Live Selector Validation Smoke Test
 *
 * Connects to the CDP daemon (preferred) or falls back to Playwright
 * with storageState injection.
 *
 * @see docs/adr/007-cdp-daemon-persistent-sessions.md
 * @see docs/design/DES-015-live-selector-validation.md
 */

import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from 'playwright';
import { acquireBrowserSession, type BrowserSession } from './browser-provider';
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
  NOTEBOOKLM_SELECTORS,
} from '../../src/content/extractors/selectors';
import type { SelectorGroup } from '../../src/content/extractors/selectors/types';
import { checkAuthStatus, type AuthStatus } from './auth-check';
import {
  loadBaselineGroups,
  updateBaselineGroups,
  compareWithBaseline,
  type BaselineComparison,
} from './baseline';
import { classifyResults, type SelectorResult } from './classifier';
import { waitForReadyWithRetry, decideLoadOutcome } from './load-readiness';
import { getConsecutiveStalls, recordStall, resetStalls } from './stall-tracker';
import { ATTACHMENT_NAME, type TargetDetail } from './report-builder';

/**
 * Attach the per-target detail JSON for ObsidianReporter.
 * test.info().attach is the official channel for structured data between
 * a test and a custom reporter (result.attachments in onTestEnd).
 */
async function attachDetail(detail: TargetDetail): Promise<void> {
  await test.info().attach(ATTACHMENT_NAME, {
    body: JSON.stringify(detail),
    contentType: 'application/json',
  });
}

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env.local') });

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
  notebooklm_conv: '.chat-message-pair',
};

/**
 * Loading indicators per ready-key. When the ready selector never appears but
 * one of these is still present, the content stalled mid-load (transient) and
 * the test is skipped rather than failed. Platforms without an entry always
 * fall through to validation (a genuine regression will still FAIL).
 *
 * Gemini renders `mat-progress-spinner` in its chat shell while the
 * conversation-history fetch is pending.
 */
const LOADING_SELECTORS: Readonly<Record<string, string>> = {
  gemini_conv: 'mat-progress-spinner, mat-spinner',
  gemini_dr: 'mat-progress-spinner, mat-spinner',
};

/** Number of navigation attempts (reload between failures) before giving up. */
const READY_MAX_ATTEMPTS = 3;
/** Per-attempt wait for the ready selector. */
const READY_TIMEOUT_MS = 15_000;
/** Consecutive stall-skips before a stall is treated as a real failure. */
const MAX_CONSECUTIVE_STALLS = 3;

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
    const mode: TargetDetail['mode'] = process.env.UPDATE_BASELINE === '1' ? 'update' : 'validate';

    if (authStatus === 'unreachable') {
      const reason = `${platform}: site unreachable`;
      await attachDetail({ platform, target: readyKey, mode, authStatus, skipReason: reason });
      test.skip(true, reason);
      return;
    }
    if (authStatus === 'auth_expired') {
      const reason = `${platform}: AUTH_EXPIRED — run 'npm run e2e:auth' to re-login`;
      await attachDetail({ platform, target: readyKey, mode, authStatus, skipReason: reason });
      test.skip(true, reason);
      return;
    }
    // Session is fine but the pinned conversation no longer opens: this is
    // dead test data, not an auth problem — fail loudly with the fix.
    if (authStatus === 'test_data_missing') {
      await attachDetail({ platform, target: readyKey, mode, authStatus });
    }
    expect(
      authStatus,
      `${platform}: authenticated but the conversation URL did not open (${url}) — ` +
        `the pinned test conversation is gone or its URL is invalid; ` +
        `refresh the *_CONV_URL / *_DR_URL value in e2e/.env.local`
    ).not.toBe('test_data_missing');

    // Wait for page ready, retrying with a reload between attempts. Live SPAs
    // (notably Gemini) intermittently stall while fetching conversation history,
    // leaving the shell on a loading spinner. See load-readiness.ts.
    const readySelector = READY_SELECTORS[readyKey];
    if (readySelector) {
      const readyFound = await waitForReadyWithRetry(
        {
          waitReady: async () => {
            try {
              await page.waitForSelector(readySelector, { timeout: READY_TIMEOUT_MS });
              return true;
            } catch {
              return false;
            }
          },
          reload: async () => {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
          },
        },
        { maxAttempts: READY_MAX_ATTEMPTS }
      );

      if (!readyFound) {
        const loadingSelector = LOADING_SELECTORS[readyKey];
        const loadingPresent = loadingSelector
          ? (await page.evaluate(
              (sel: string) => document.querySelectorAll(sel).length,
              loadingSelector
            )) > 0
          : false;

        // A stall that persists MAX_CONSECUTIVE_STALLS runs in a row stops
        // being "transient" and falls through to validation (-> FAIL).
        const decision = decideLoadOutcome({
          platform,
          readyFound,
          loadingPresent,
          priorConsecutiveStalls: getConsecutiveStalls(readyKey),
          maxConsecutiveStalls: MAX_CONSECUTIVE_STALLS,
        });
        console.warn(
          `${platform}: ready selector '${readySelector}' not found — ${decision.reason}`
        );
        if (decision.action === 'skip') {
          recordStall(readyKey);
          await attachDetail({
            platform,
            target: readyKey,
            mode,
            authStatus,
            skipReason: decision.reason,
          });
          test.skip(true, decision.reason);
          return;
        }
      } else {
        resetStalls(readyKey);
      }
    }

    // Validate all selectors
    const allResults: SelectorResult[] = [];
    for (const [groupName, selectors] of Object.entries(selectorGroups)) {
      const results = await validateSelectors(page, platform, groupName, selectors);
      allResults.push(...results);
    }

    // Baseline contract (v2): explicit update mode writes; normal mode enforces.
    const groupNames = Object.keys(selectorGroups);
    const updateMode = mode === 'update';
    let baselineComparisons: BaselineComparison[] = [];

    let baselineState: TargetDetail['baselineState'] = 'ok';
    let missingGroups: string[] = [];

    if (updateMode) {
      const grouped: Record<string, SelectorResult[]> = {};
      for (const result of allResults) {
        (grouped[result.group] ??= []).push(result);
      }
      // Throws (and fails this test) on zero-match entries: a broken page
      // state must never be recorded as the contract.
      updateBaselineGroups(platform, grouped);
      console.log(`${platform}: baseline updated for groups: ${groupNames.join(', ')}`);
    } else {
      const loaded = loadBaselineGroups(platform, groupNames);
      if (loaded.legacy) {
        baselineState = 'legacy';
      } else if (loaded.missingGroups.length > 0) {
        baselineState = 'missing_groups';
        missingGroups = loaded.missingGroups;
      } else {
        baselineComparisons = compareWithBaseline(allResults, loaded.entries);
      }
    }

    // Classify
    const classified = classifyResults(allResults, baselineComparisons);

    // Attach the full detail for ObsidianReporter BEFORE asserting, so a
    // failing assertion still leaves a complete record in the report.
    await attachDetail({
      platform,
      target: readyKey,
      mode,
      authStatus,
      baselineState,
      classification: classified,
    });

    // Assert: the baseline itself must be usable before its diff means anything
    expect(
      baselineState,
      `${platform}: baseline file is legacy v1 — run 'npm run e2e:baseline:update'`
    ).not.toBe('legacy');
    expect(
      baselineState,
      `${platform}: no baseline for group(s) ${missingGroups.join(', ')} — run 'npm run e2e:baseline:update'`
    ).not.toBe('missing_groups');

    // Assert: zero-match selector names always fail
    expect(
      classified.fail,
      `${platform}: selectors with zero matches: ${classified.fail.map(f => `${f.group}:${f.name}`).join(', ')}`
    ).toHaveLength(0);

    // Assert: baseline contract violations fail (lost / new_selector / removed).
    // new_selector and removed mean the code and the baseline diverged —
    // intentional selector changes must be recorded via 'npm run e2e:baseline:update'.
    expect(
      classified.baselineBlocking.map(
        b =>
          `${b.group}:${b.name} [${b.status}] ${b.baselineCount} -> ${b.currentCount} (${b.selector})`
      ),
      `${platform}: baseline contract violations — if the selector change is intentional, run 'npm run e2e:baseline:update'`
    ).toEqual([]);

    // Assert: a dead primary selector fails even while a fallback carries it.
    // The extension still works via the fallback, but a primary that stays
    // broken silently rots — fix the primary or promote the fallback.
    expect(
      classified.warn.map(
        w =>
          `${w.failedPrimary.group}:${w.failedPrimary.name} primary '${w.failedPrimary.selector}' ` +
          `has 0 matches (fallback '${w.workingFallback.selector}' carrying)`
      ),
      `${platform}: dead primary selectors — fix the primary or promote the working fallback in src/content/extractors/selectors/`
    ).toEqual([]);
  } finally {
    await page.close();
  }
}

// --- Shared browser session (CDP daemon or standalone fallback) ---

let session: BrowserSession;

test.beforeAll(async () => {
  session = await acquireBrowserSession();
  console.log(`[G2O E2E] Browser mode: ${session.mode}`);
});

test.afterAll(async () => {
  if (session) {
    await session.cleanup();
  }
});

// --- Test Definitions ---

test.describe('Gemini', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      session.context,
      'gemini',
      process.env.GEMINI_CONV_URL,
      'gemini_conv',
      {
        SELECTORS: GEMINI_SELECTORS,
      }
    );
  });

  test('deep research selectors', async () => {
    await runPlatformValidation(session.context, 'gemini', process.env.GEMINI_DR_URL, 'gemini_dr', {
      DEEP_RESEARCH_SELECTORS: GEMINI_DR_SELECTORS,
      DEEP_RESEARCH_LINK_SELECTORS: GEMINI_DR_LINK_SELECTORS,
    });
  });
});

test.describe('Claude', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      session.context,
      'claude',
      process.env.CLAUDE_CONV_URL,
      'claude_conv',
      {
        SELECTORS: CLAUDE_SELECTORS,
      }
    );
  });

  test('deep research selectors', async () => {
    await runPlatformValidation(session.context, 'claude', process.env.CLAUDE_DR_URL, 'claude_dr', {
      DEEP_RESEARCH_SELECTORS: CLAUDE_DR_SELECTORS,
    });
  });
});

test.describe('ChatGPT', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      session.context,
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
      session.context,
      'perplexity',
      process.env.PERPLEXITY_CONV_URL,
      'perplexity_conv',
      {
        SELECTORS: PERPLEXITY_SELECTORS,
      }
    );
  });
});

test.describe('NotebookLM', () => {
  test('conversation selectors', async () => {
    await runPlatformValidation(
      session.context,
      'notebooklm',
      process.env.NOTEBOOKLM_CONV_URL,
      'notebooklm_conv',
      {
        SELECTORS: NOTEBOOKLM_SELECTORS,
      }
    );
  });
});
