/**
 * Authentication pre-flight check for live selector validation.
 *
 * After navigating to a conversation URL, verifies the browser
 * stayed on the target page (authenticated) vs. being redirected
 * to a login page (auth_expired).
 */

import type { Page } from 'playwright';

/**
 * Platform-specific URL patterns that indicate a successful authenticated navigation.
 * If the current URL doesn't match, the session has expired.
 */
const AUTH_URL_PATTERNS: Readonly<Record<string, RegExp>> = {
  gemini: /^https:\/\/gemini\.google\.com\/(app|deepresearch)\//,
  claude: /^https:\/\/claude\.ai\/chat\//,
  chatgpt: /^https:\/\/chatgpt\.com\/c\//,
  perplexity: /^https:\/\/www\.perplexity\.ai\/search\//,
};

export type AuthStatus = 'authenticated' | 'auth_expired' | 'unreachable';

/**
 * Navigate to the target URL and check authentication status.
 *
 * - authenticated: URL matches the expected pattern (still on conversation page)
 * - auth_expired:  Redirected to login page
 * - unreachable:   Navigation failed (network error, HTTP 4xx/5xx)
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

    const currentUrl = page.url();
    const pattern = AUTH_URL_PATTERNS[platform];

    if (pattern && pattern.test(currentUrl)) {
      return 'authenticated';
    }

    console.warn(`[G2O Auth] ${platform}: auth_expired — expected ${pattern}, got: ${currentUrl}`);
    return 'auth_expired';
  } catch {
    return 'unreachable';
  }
}
