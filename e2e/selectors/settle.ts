/**
 * Settle wait for live selector validation.
 *
 * The readiness check answers "has the page started rendering?", not "has it
 * finished". Measured on 2026-08-08, `gemini_conv` is ready the moment
 * `.conversation-container` exists — the first turn — while the generated image
 * sits in the third turn behind `loading="lazy"`. Three timed loads put the gap
 * between ready and `generated-image img[src]` at 1313 / 1973 / 1631 ms, and
 * validation started immediately, so `generatedImage` intermittently read zero
 * and failed the run (issue #402 follow-up).
 *
 * The gap exists everywhere, not only on Gemini. Ready → every selector name
 * matching: gemini 774ms, claude 1562ms, chatgpt 371ms, perplexity 168ms,
 * notebooklm 16ms. Counts then keep moving for another 600–1600ms, which is the
 * window a baseline recorded at that instant freezes into the contract — the
 * likely source of ChatGPT's standing `conversationTurn 13 -> 5` advisory.
 *
 * Waiting here, before validation, fixes both modes at once: validate reads a
 * settled page, and update records settled numbers. Retrying the assertion
 * instead would leave the recorded baseline just as unstable.
 *
 * Settling is defined as "the counts stopped changing", not "every selector
 * matched". Requiring a match would spend the whole timeout on a genuinely dead
 * selector, delaying a real failure for nothing; and a late arrival changes the
 * counts anyway, so stability already covers it.
 */

/** How many consecutive identical observations mean the page has settled. */
export const SETTLE_STABLE_RUNS = 3;

/** Delay between observations (ms). */
export const SETTLE_POLL_INTERVAL_MS = 300;

/**
 * Never conclude before this much has elapsed since the wait began (ms).
 *
 * Stability alone is not enough: the counts sit perfectly still while a late
 * element is on its way, so a short run of identical observations can land
 * inside that quiet stretch and settle on the pre-arrival state. Measured on
 * GEMINI_CONV_URL, the counts held at zero for ~1337ms before the image
 * appeared, and across three timed loads the image arrived 1313 / 1973 / 1631 ms
 * after ready. 2500ms clears the slowest of those with margin.
 */
export const SETTLE_MIN_MS = 2_500;

/**
 * Upper bound on a single settle wait (ms).
 *
 * The slowest measured platform (claude) stabilised 3146ms after ready; this
 * leaves a wide margin for a slow network without letting a streaming page
 * stall the run. Matches the order of READY_TIMEOUT_MS.
 */
export const SETTLE_TIMEOUT_MS = 15_000;

/** Running state of the settle observation. */
export interface SettleProgress {
  /** The last observed counts, joined for comparison. */
  readonly signature: string;
  /** Consecutive observations that produced this signature. */
  readonly stableRuns: number;
}

/** Outcome of a settle wait. */
export interface SettleResult {
  /** False when the timeout was reached before the counts stopped changing. */
  readonly settled: boolean;
  /** Counts from the final observation. */
  readonly counts: readonly number[];
  /** Number of observations taken. */
  readonly observations: number;
  /** Wall-clock spent waiting (ms). */
  readonly elapsedMs: number;
}

/** Fold one observation into the progress, immutably. */
export function observe(
  previous: SettleProgress | null,
  counts: readonly number[]
): SettleProgress {
  const signature = counts.join(',');
  const repeated = previous !== null && previous.signature === signature;
  return { signature, stableRuns: repeated ? previous.stableRuns + 1 : 1 };
}

/** True once the same counts have been observed `requiredRuns` times in a row. */
export function isSettled(progress: SettleProgress, requiredRuns: number): boolean {
  return progress.stableRuns >= requiredRuns;
}

/** Injectable clock, so the loop is testable without a browser or real time. */
export interface SettleOptions {
  requiredRuns: number;
  pollIntervalMs: number;
  timeoutMs: number;
  /** Floor on elapsed time before stability may be accepted. */
  minElapsedMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/**
 * Sample the selector counts until they stop changing, or the timeout elapses.
 *
 * A sampling error is propagated rather than swallowed: a closed page or a
 * navigation mid-wait is a real failure, and retrying it would only produce a
 * confusing timeout later.
 *
 * @param sample Returns the current match count of every selector, in a stable order.
 */
export async function waitForSettledCounts(
  sample: () => Promise<number[]>,
  options: SettleOptions
): Promise<SettleResult> {
  const started = options.now();
  let progress: SettleProgress | null = null;
  let counts: number[] = [];
  let observations = 0;

  for (;;) {
    counts = await sample();
    observations++;
    progress = observe(progress, counts);

    const elapsed = options.now() - started;
    if (isSettled(progress, options.requiredRuns) && elapsed >= options.minElapsedMs) {
      return { settled: true, counts, observations, elapsedMs: elapsed };
    }
    if (elapsed >= options.timeoutMs) {
      return { settled: false, counts, observations, elapsedMs: elapsed };
    }
    await options.sleep(options.pollIntervalMs);
  }
}
