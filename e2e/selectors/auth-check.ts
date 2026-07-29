/**
 * Authentication pre-flight check for live selector validation.
 *
 * After navigating to a conversation URL, distinguishes THREE off-nominal
 * states that v1 conflated into one:
 * - authenticated:      still on the conversation URL pattern
 * - auth_expired:       bounced to a login page, or an in-origin logged-out
 *                       shell (Gemini bounces dead sessions to /app with a
 *                       "Sign in" link instead of accounts.google.com)
 * - test_data_missing:  session is fine but the pinned conversation no longer
 *                       opens (deleted/expired conversation URL) — this must
 *                       FAIL with guidance, not silently skip as an auth issue
 */

import type { Page } from 'playwright';

/**
 * Platform-specific URL patterns that indicate a successful authenticated navigation.
 * If the current URL doesn't match, the session has expired or the test data is gone.
 */
const AUTH_URL_PATTERNS: Readonly<Record<string, RegExp>> = {
  gemini: /^https:\/\/gemini\.google\.com\/(app|deepresearch)\//,
  claude: /^https:\/\/claude\.ai\/chat\//,
  chatgpt: /^https:\/\/chatgpt\.com\/c\//,
  perplexity: /^https:\/\/www\.perplexity\.ai\/search\//,
  notebooklm: /^https:\/\/(?:notebook|notebooklm)\.google\.com\/notebook\//,
};

/**
 * DOM markers indicating a logged-out shell, consulted only when the final
 * URL is off-pattern but not a recognizable login URL. Google properties
 * bounce dead sessions to an in-origin page with sign-in links rather than
 * redirecting to accounts.google.com.
 */
const LOGGED_OUT_MARKERS: Readonly<Record<string, string>> = {
  gemini: 'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/v3/signin"]',
  notebooklm:
    'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/v3/signin"]',
};

/** URL shapes that unambiguously identify a login/authorization page. */
const LOGIN_URL_PATTERN =
  /accounts\.google\.com|auth\.openai\.com|auth0\.com|[/.]login(?:[/?#]|$)|\/signin(?:[/?#]|$)|\/auth\//i;

export type AuthStatus = 'authenticated' | 'auth_expired' | 'test_data_missing' | 'unreachable';

export function isLoginUrl(url: string): boolean {
  return LOGIN_URL_PATTERN.test(url);
}

export interface AuthResolutionInput {
  /** URL the browser actually landed on after navigation + settle time */
  finalUrl: string;
  /** Expected conversation-URL pattern; undefined for unknown platforms */
  conversationPattern: RegExp | undefined;
  /** Whether a platform logged-out DOM marker was found on the landed page */
  loggedOutMarkerPresent: boolean;
}

/**
 * Pure decision: classify the post-navigation state.
 * Extracted from the page I/O so the tri-state logic is unit-testable.
 */
export function resolveAuthStatus(
  input: AuthResolutionInput
): Exclude<AuthStatus, 'unreachable'> {
  const { finalUrl, conversationPattern, loggedOutMarkerPresent } = input;

  if (!conversationPattern) {
    // Unknown platform: nothing to judge against
    return 'authenticated';
  }
  if (conversationPattern.test(finalUrl)) {
    return 'authenticated';
  }
  if (isLoginUrl(finalUrl) || loggedOutMarkerPresent) {
    return 'auth_expired';
  }
  return 'test_data_missing';
}

/**
 * Navigate to the target URL and check authentication / test-data status.
 */
export async function checkAuthStatus(
  page: Page,
  platform: string,
  targetUrl: string
): Promise<AuthStatus> {
  try {
    // domcontentloaded — SPA sites (Gemini, Claude, ChatGPT) maintain
    // persistent WebSocket connections that prevent networkidle from resolving.
    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Allow SPA frameworks to render after DOM load
    await page.waitForTimeout(3000);

    if (!response || response.status() >= 400) {
      return 'unreachable';
    }

    const finalUrl = page.url();
    const marker = LOGGED_OUT_MARKERS[platform];
    const loggedOutMarkerPresent = marker
      ? await page.evaluate((sel: string) => document.querySelector(sel) !== null, marker)
      : false;

    const status = resolveAuthStatus({
      finalUrl,
      conversationPattern: AUTH_URL_PATTERNS[platform],
      loggedOutMarkerPresent,
    });

    if (status !== 'authenticated') {
      console.warn(
        `[G2O Auth] ${platform}: ${status} — expected ${AUTH_URL_PATTERNS[platform]}, got: ${finalUrl}`
      );
    }
    return status;
  } catch {
    return 'unreachable';
  }
}
