/**
 * Load-readiness helpers for live selector validation.
 *
 * Live third-party SPAs (notably Gemini) intermittently stall while fetching
 * conversation history: the chat shell renders with loading spinners and an
 * empty-state placeholder, but the conversation content never appears. A single
 * `waitForSelector` timeout then makes the smoke test assert zero-matches and
 * hard-FAIL on what is really a transient backend stall.
 *
 * These helpers add bounded navigation retries and a decision step that
 * distinguishes a transient stall (loading indicator still present -> SKIP)
 * from a genuine selector regression (page settled, no loading indicator, yet
 * the ready selector is absent -> validate and FAIL).
 */

export interface LoadReadinessDeps {
  /** Wait for the page-ready selector once; resolves true if it appeared. */
  readonly waitReady: () => Promise<boolean>;
  /** Reload the page before the next attempt. */
  readonly reload: () => Promise<void>;
}

export interface RetryOptions {
  /** Total attempts (>= 1). A reload runs between attempts, not after the last. */
  readonly maxAttempts: number;
}

/**
 * Wait for the ready selector, retrying with a reload between failed attempts.
 * Returns true as soon as the selector appears, or false once attempts are
 * exhausted. Never reloads after the final attempt.
 */
export async function waitForReadyWithRetry(
  deps: LoadReadinessDeps,
  opts: RetryOptions
): Promise<boolean> {
  const maxAttempts = Math.max(1, opts.maxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await deps.waitReady()) {
      return true;
    }
    if (attempt < maxAttempts) {
      await deps.reload();
    }
  }

  return false;
}

export type LoadAction = 'validate' | 'skip';

export interface LoadDecision {
  readonly action: LoadAction;
  readonly reason: string;
}

export interface LoadOutcomeInput {
  readonly platform: string;
  /** Whether the ready selector appeared (after any retries). */
  readonly readyFound: boolean;
  /** Whether a loading indicator (spinner / empty-state) is still present. */
  readonly loadingPresent: boolean;
  /** Consecutive stall-skips recorded BEFORE this run (stall-tracker). */
  readonly priorConsecutiveStalls?: number;
  /** Threshold at which a persistent stall stops being treated as transient. */
  readonly maxConsecutiveStalls?: number;
}

/**
 * Decide whether to run selector validation or skip the test.
 *
 * - ready found                         -> validate (normal path)
 * - ready absent + loading indicator    -> skip (transient content stall),
 *   but only up to maxConsecutiveStalls in a row: a stall persisting run
 *   after run is indistinguishable from a masked regression (or dead test
 *   data) and escalates to validate -> the zero-match assertion FAILs
 * - ready absent + no loading indicator -> validate (possible real regression)
 */
export function decideLoadOutcome(input: LoadOutcomeInput): LoadDecision {
  if (input.readyFound) {
    return { action: 'validate', reason: `${input.platform}: ready selector found` };
  }
  if (input.loadingPresent) {
    const max = input.maxConsecutiveStalls ?? Number.POSITIVE_INFINITY;
    const thisStall = (input.priorConsecutiveStalls ?? 0) + 1;
    if (thisStall >= max) {
      return {
        action: 'validate',
        reason:
          `${input.platform}: content stall persisted ${thisStall} consecutive runs — ` +
          `no longer treated as transient (validating; expect FAIL until fixed)`,
      };
    }
    return {
      action: 'skip',
      reason: `${input.platform}: content did not load (transient — loading indicator present, stall ${thisStall}/${max})`,
    };
  }
  return {
    action: 'validate',
    reason: `${input.platform}: ready selector absent and no loading indicator — validating (possible selector regression)`,
  };
}
