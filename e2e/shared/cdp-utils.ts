/**
 * Chrome DevTools Protocol utilities.
 *
 * Shared between e2e/auth/setup-profile.ts and e2e/daemon/.
 */

/**
 * Wait for Chrome's CDP endpoint to become available.
 *
 * Polls `http://127.0.0.1:{port}/json/version` until a
 * successful response or the timeout is reached.
 */
export async function waitForCDP(
  port: number,
  timeoutMs = 15_000,
  pollIntervalMs = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`CDP endpoint not available on port ${port} after ${timeoutMs}ms`);
}
