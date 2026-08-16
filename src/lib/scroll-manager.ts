/**
 * Auto-scroll coordination for lazy-loaded content
 *
 * Scrolls a container to trigger loading of all elements (e.g., Gemini's
 * infinite-scroller) and waits until the DOM stabilizes.
 */

import {
  SCROLL_POLL_INTERVAL,
  SCROLL_IDLE_TIMEOUT,
  SCROLL_MAX_TIMEOUT,
  SCROLL_STABILITY_THRESHOLD,
  SCROLL_REARM_DELAY,
  SCROLL_ACCUMULATE_POLL_INTERVAL,
  SCROLL_ACCUMULATE_STEP_FACTOR,
  SCROLL_ACCUMULATE_MIN_STEP,
  DEFAULT_SCROLL_IDLE_TIMEOUT_SEC,
  DEFAULT_SCROLL_MAX_TIMEOUT_SEC,
} from './constants';

/** Why an auto-scroll pass ended. */
export type ScrollStopReason = 'complete' | 'idle-timeout' | 'max-timeout';

/** The two deadlines governing one auto-scroll pass, in milliseconds. */
export interface ScrollDeadlines {
  /** Give up after this long without progress. */
  readonly idleMs: number;
  /** Absolute cap on the whole pass. */
  readonly maxMs: number;
}

/** The shipped deadlines, used when a caller supplies none. */
export const DEFAULT_SCROLL_DEADLINES: ScrollDeadlines = {
  idleMs: SCROLL_IDLE_TIMEOUT,
  maxMs: SCROLL_MAX_TIMEOUT,
};

/**
 * The user's configured deadlines, in milliseconds.
 *
 * The single conversion point: settings are stored in seconds because that is
 * what the popup shows, and nothing else in the codebase has to know that.
 */
export function resolveScrollDeadlines(settings: {
  scrollIdleTimeoutSec?: number;
  scrollMaxTimeoutSec?: number;
}): ScrollDeadlines {
  return {
    idleMs: (settings.scrollIdleTimeoutSec ?? DEFAULT_SCROLL_IDLE_TIMEOUT_SEC) * 1000,
    maxMs: (settings.scrollMaxTimeoutSec ?? DEFAULT_SCROLL_MAX_TIMEOUT_SEC) * 1000,
  };
}

/**
 * Progress-aware deadline (issue #360, ADR-018; reason added in ADR-032).
 *
 * A pass keeps running while it is still making progress — callers reset
 * `lastProgressTime` on every iteration that progresses, so a genuinely long
 * conversation is never cut off mid-scroll. What counts as progress is
 * engine-specific: newly-loaded elements for Gemini's infinite-scroller, a new
 * turn *or* upward scroll movement for the virtualized engine (ADR-024).
 *
 * Returns null while the pass may continue; otherwise which deadline was
 * crossed **first**.
 *
 * Deciding by "check idle, then check the cap" would be wrong as soon as the
 * deadlines are user-set: `idleMs > maxMs` is reachable, and the naive order
 * would then blame the idle deadline for a stop the ceiling caused. Comparing
 * the two absolute instants costs one extra comparison and cannot mis-report —
 * which is the whole point, because a report the user cannot trust is what
 * made issue #449 undiagnosable.
 */
function crossedDeadline(
  startTime: number,
  lastProgressTime: number,
  deadlines: ScrollDeadlines
): Exclude<ScrollStopReason, 'complete'> | null {
  const now = Date.now();
  const idleAt = lastProgressTime + deadlines.idleMs;
  const maxAt = startTime + deadlines.maxMs;
  if (now < idleAt && now < maxAt) return null;
  if (now >= idleAt && now >= maxAt) return idleAt <= maxAt ? 'idle-timeout' : 'max-timeout';
  return now >= idleAt ? 'idle-timeout' : 'max-timeout';
}

/** Seconds, for log and warning text: `15` not `15000`. */
function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

/**
 * The single end-of-pass summary, shared by both engines.
 *
 * Carries elapsed time and iteration count as well as the reason, so the next
 * field report needs no arithmetic to work out which deadline fired — the
 * absence of that information is why #449 took a live investigation.
 */
function logScrollStop(
  stopReason: ScrollStopReason,
  captured: number,
  unit: 'turns' | 'elements',
  iterations: number,
  elapsedMs: number,
  deadlines: ScrollDeadlines
): void {
  const tail =
    `${captured} ${unit} after ${iterations} iterations ` +
    `(elapsed ${(elapsedMs / 1000).toFixed(1)}s, idle ${seconds(deadlines.idleMs)}s, ` +
    `cap ${seconds(deadlines.maxMs)}s)`;

  if (stopReason === 'complete') {
    console.info(`[G2O] Auto-scroll complete — ${tail}`);
    return;
  }
  const cause =
    stopReason === 'idle-timeout'
      ? `no progress for ${seconds(deadlines.idleMs)}s`
      : `reached the ${seconds(deadlines.maxMs)}s limit`;
  console.warn(`[G2O] Auto-scroll stopped: ${cause} — ${tail}`);
}

/**
 * The user-facing warning for a partial pass, or undefined when the pass
 * completed.
 *
 * Both engines route through this, replacing two byte-identical literals that
 * had already drifted apart once in wording.
 */
export function describeScrollStop(
  stopReason: ScrollStopReason,
  captured: number,
  deadlines: ScrollDeadlines = DEFAULT_SCROLL_DEADLINES
): string | undefined {
  if (stopReason === 'complete') return undefined;
  const cause =
    stopReason === 'idle-timeout'
      ? `stopped after ${seconds(deadlines.idleMs)}s with no progress`
      : `hit its ${seconds(deadlines.maxMs)}s time limit`;
  return (
    `Auto-scroll ${cause}; earlier messages may be missing ` +
    `(${captured} turns captured). Raise the auto-scroll timeouts in Settings and sync again.`
  );
}

/** Count, log and package the partial result of a timed-out element-load pass. */
function partialElementResult(
  stopReason: Exclude<ScrollStopReason, 'complete'>,
  elementSelector: string,
  iterations: number,
  startTime: number,
  deadlines: ScrollDeadlines
): ScrollResult {
  const elementCount = countElements(elementSelector);
  logScrollStop(
    stopReason,
    elementCount,
    'elements',
    iterations,
    Date.now() - startTime,
    deadlines
  );
  return {
    fullyLoaded: false,
    elementCount,
    scrollIterations: iterations,
    skipped: false,
    stopReason,
  };
}

/**
 * Result of the auto-scroll process
 */
export interface ScrollResult {
  /** Whether all messages loaded before timeout */
  fullyLoaded: boolean;
  /** Number of elements found after scrolling */
  elementCount: number;
  /** Total scroll-poll iterations performed */
  scrollIterations: number;
  /** Whether scrolling was unnecessary (already at top or no container) */
  skipped: boolean;
  /** Which deadline ended the pass, or 'complete' (ADR-032). */
  stopReason: ScrollStopReason;
}

/**
 * Wait for a specified duration
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Count elements matching the given selector in the document
 */
function countElements(selector: string): number {
  return document.querySelectorAll(selector).length;
}

/**
 * Scroll to top of a container to trigger lazy loading of all elements.
 *
 * Gemini's infinite-scroller fires `onScrolledTopPastThreshold` (edge-triggered)
 * when scrollTop crosses **below** a threshold. To re-trigger on subsequent
 * iterations, we must first scroll **above** the threshold (re-arm) by jumping
 * to scrollHeight, then back to 0.
 *
 * Verified via getEventListeners() on live Gemini page (2026-02-21):
 *   - scroll, onInitialScroll, onScrolledTopPastThreshold
 *
 * @param container The scrollable container element
 * @param elementSelector CSS selector for the elements to count
 */
export async function ensureAllElementsLoaded(
  container: HTMLElement,
  elementSelector: string,
  deadlines: ScrollDeadlines = DEFAULT_SCROLL_DEADLINES
): Promise<ScrollResult> {
  const initialCount = countElements(elementSelector);

  if (container.scrollTop === 0) {
    console.info(
      `[G2O] scrollTop=0, scrollHeight=${container.scrollHeight}, ` +
        `clientHeight=${container.clientHeight}, elements=${initialCount}`
    );
    return {
      fullyLoaded: true,
      elementCount: initialCount,
      scrollIterations: 0,
      skipped: true,
      stopReason: 'complete',
    };
  }

  console.info(
    `[G2O] Partial load detected — scrollTop=${container.scrollTop}, ` +
      `elements=${initialCount}, auto-scrolling`
  );

  let previousCount = 0;
  let stableCount = 0;
  let iterations = 0;
  const startTime = Date.now();
  let lastProgressTime = startTime;

  for (;;) {
    const stopReason = crossedDeadline(startTime, lastProgressTime, deadlines);
    if (stopReason !== null) {
      return partialElementResult(stopReason, elementSelector, iterations, startTime, deadlines);
    }

    // Re-arm: if already at top, scroll to bottom first so the next
    // scroll-to-0 crosses the onScrolledTopPastThreshold edge trigger.
    if (container.scrollTop === 0) {
      container.scrollTop = container.scrollHeight;
      await delay(SCROLL_REARM_DELAY);
    }

    // Scroll to top — crosses the threshold, triggering content loading
    container.scrollTop = 0;
    await delay(SCROLL_POLL_INTERVAL);

    const currentCount = countElements(elementSelector);
    iterations++;

    console.debug(
      `[G2O] Scroll iteration ${iterations}: elements=${currentCount}, ` +
        `scrollTop=${container.scrollTop}, scrollHeight=${container.scrollHeight}`
    );

    if (currentCount === previousCount) {
      stableCount++;
      if (stableCount >= SCROLL_STABILITY_THRESHOLD) {
        logScrollStop(
          'complete',
          currentCount,
          'elements',
          iterations,
          Date.now() - startTime,
          deadlines
        );
        return {
          fullyLoaded: true,
          elementCount: currentCount,
          scrollIterations: iterations,
          skipped: false,
          stopReason: 'complete',
        };
      }
    } else {
      console.debug(`[G2O] Element count changed: ${previousCount} -> ${currentCount}`);
      stableCount = 0;
      previousCount = currentCount;
      lastProgressTime = Date.now(); // progress → reset the idle deadline
    }
  }
}

// ============================================================
// Accumulation engine for virtualized platforms (Claude, ChatGPT)
// ============================================================

/** One turn harvested from the currently-mounted window. */
export interface HarvestEntry<T> {
  /** Stable per-turn identity used for de-duplication across windows. */
  key: string;
  /** The extracted value (e.g. a ConversationMessage). */
  value: T;
  /**
   * Optional monotonic conversation-order index for this turn (Claude's
   * `data-index`, ChatGPT's `conversation-turn-N` ordinal). When *every*
   * harvested turn supplies one, accumulation orders the result by it; otherwise
   * the order established by {@link mergeWindow} stands. Both paths are expected
   * to agree — the index is a second, independent signal, not a repair for the
   * merge (issues #352, #353).
   */
  order?: number;
}

/** Result of accumulating a virtualized conversation via scrolling. */
export interface AccumulateResult<T> {
  /** De-duplicated values in conversation order (first turn → last turn). */
  items: T[];
  /** Whether harvesting stabilized at the top before timing out. */
  fullyLoaded: boolean;
  /** Number of distinct turns captured. */
  itemCount: number;
  /** Upward scroll/harvest iterations performed. */
  iterations: number;
  /** Whether scrolling was unnecessary (already at the top). */
  skipped: boolean;
  /** Which deadline ended the pass, or 'complete' (ADR-032). */
  stopReason: ScrollStopReason;
}

/**
 * Merge a newly-harvested window of keys into the accumulated ordering.
 *
 * A window's DOM order is always globally truthful — it is document order — so
 * every already-seen key in it is a valid **anchor**: each run of not-yet-seen
 * keys belongs immediately before the seen key that follows it. Merging by
 * anchor rather than by aligning the window's suffix against the accumulated
 * head is what makes this correct when the newest turns never evict: on both
 * Claude and ChatGPT the last few turns stay mounted in *every* window, so a
 * window harvested near the top looks like `[0…6, <persistent tail>]`. Its
 * suffix is that tail and can never match the accumulated (older) head, but the
 * anchor it needs — the first key it shares with the accumulation — is right
 * there in the window (issues #352, #353).
 *
 * A trailing run with no following anchor goes directly after the last anchor;
 * a window sharing nothing with the accumulation is prepended whole, since
 * windows are only ever harvested while scrolling **upward**. Keys are never
 * dropped and the result never contains duplicates.
 *
 * @param accumulated Keys gathered so far, in conversation order.
 * @param window Keys from the current window, in DOM (top→bottom) order.
 */
export function mergeWindow(accumulated: readonly string[], window: readonly string[]): string[] {
  if (accumulated.length === 0) return dedupeKeys(window);
  if (window.length === 0) return [...accumulated];

  const known = new Set(accumulated);
  const runBefore = new Map<string, string[]>(); // anchor key → run to insert ahead of it
  const staged = new Set<string>();
  let run: string[] = [];
  let lastAnchor: string | null = null;

  for (const key of window) {
    if (known.has(key)) {
      if (run.length > 0) {
        runBefore.set(key, [...(runBefore.get(key) ?? []), ...run]);
        run = [];
      }
      lastAnchor = key;
    } else if (!staged.has(key)) {
      staged.add(key);
      run.push(key);
    }
  }

  const lead = lastAnchor === null ? run : [];
  const trail = lastAnchor === null ? [] : run;

  const merged = [...lead];
  for (const key of accumulated) {
    merged.push(...(runBefore.get(key) ?? []), key);
    if (key === lastAnchor) merged.push(...trail);
  }
  return dedupeKeys(merged);
}

/**
 * Final key order for the accumulated turns.
 *
 * When *every* captured turn carries a monotonic order index, sort by it — the
 * platform's own statement of conversation order. Otherwise keep the order
 * {@link mergeWindow} established, which is authoritative on its own; the index
 * is a corroborating signal, not a repair (issues #352, #353).
 */
function resolveOrder(order: readonly string[], orderIndex: ReadonlyMap<string, number>): string[] {
  if (order.length > 0 && order.every(k => orderIndex.has(k))) {
    return [...order].sort((a, b) => (orderIndex.get(a) as number) - (orderIndex.get(b) as number));
  }
  return [...order];
}

/** Remove duplicate keys, keeping first occurrence. */
function dedupeKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * Accumulate all turns of a virtualized conversation by scrolling upward.
 *
 * The container mounts only a small window of turns at a time (older turns are
 * evicted as you scroll away), so we cannot read the whole conversation in one
 * pass. Instead we harvest the current window, scroll up by a fraction of the
 * viewport (keeping windows overlapping), harvest again, and merge — repeating
 * until the top is reached and no new turns appear for
 * {@link SCROLL_STABILITY_THRESHOLD} consecutive iterations, or the
 * progress-aware deadline ({@link SCROLL_IDLE_TIMEOUT} / {@link SCROLL_MAX_TIMEOUT})
 * elapses.
 *
 * De-duplication is by {@link HarvestEntry.key}; the most recently harvested
 * value for a key wins, so a turn that was mid-stream on first sight is replaced
 * by its final content if re-harvested.
 *
 * @param container The scrollable, virtualized conversation container.
 * @param harvest Returns the currently-mounted window in DOM (top→bottom) order.
 */
export async function accumulateWhileScrolling<T>(
  container: HTMLElement,
  harvest: () => HarvestEntry<T>[],
  deadlines: ScrollDeadlines = DEFAULT_SCROLL_DEADLINES
): Promise<AccumulateResult<T>> {
  const passStart = Date.now();
  const acc = createAccumulator(harvest);

  if (await seedAtBottom(container, acc.ingest)) {
    console.info('[G2O] scrollTop=0 on open, conversation fits without scrolling');
    return {
      items: acc.toItems(),
      fullyLoaded: true,
      itemCount: acc.size,
      iterations: 0,
      skipped: true,
      stopReason: 'complete',
    };
  }

  console.info(
    `[G2O] Virtualized conversation — scrollTop=${container.scrollTop}, ` +
      `${acc.size} turns mounted, accumulating by scrolling up`
  );

  const step = Math.max(
    SCROLL_ACCUMULATE_MIN_STEP,
    Math.floor(container.clientHeight * SCROLL_ACCUMULATE_STEP_FACTOR)
  );

  const { iterations, stopReason } = await scrollUpUntilStable(container, step, deadlines, () => {
    const before = acc.size;
    acc.ingest();
    return acc.size > before;
  });

  logScrollStop(stopReason, acc.size, 'turns', iterations, Date.now() - passStart, deadlines);
  return {
    items: acc.toItems(),
    fullyLoaded: stopReason === 'complete',
    itemCount: acc.size,
    iterations,
    skipped: false,
    stopReason,
  };
}

/** Turns accumulated across windows: de-duplicated by key, ordered once at the end. */
function createAccumulator<T>(harvest: () => HarvestEntry<T>[]): {
  ingest: () => void;
  toItems: () => T[];
  readonly size: number;
} {
  const content = new Map<string, T>();
  const orderIndex = new Map<string, number>();
  let order: string[] = [];

  return {
    ingest: () => {
      const window = harvest();
      for (const entry of window) {
        content.set(entry.key, entry.value); // last write wins → freshest content
        if (entry.order !== undefined) orderIndex.set(entry.key, entry.order);
      }
      order = mergeWindow(
        order,
        window.map(e => e.key)
      );
    },
    toItems: () => resolveOrder(order, orderIndex).map(key => content.get(key) as T),
    get size() {
      return content.size;
    },
  };
}

/**
 * Pin the newest window before harvesting, and report whether the conversation
 * fits without scrolling at all.
 *
 * Sync may start with the view scrolled up (issue #348): the last turn is then
 * below the fold and unmounted, and because we only ever scroll *up* from the
 * seed, an unmounted tail would be lost forever. Jumping to scrollHeight first
 * pins the newest window; a conversation that fits has no scroll range and
 * stays at the top.
 */
async function seedAtBottom(container: HTMLElement, ingest: () => void): Promise<boolean> {
  container.scrollTop = container.scrollHeight;
  await delay(SCROLL_ACCUMULATE_POLL_INTERVAL);
  ingest();
  return container.scrollTop <= 0;
}

/**
 * Scroll a container upward one step per iteration until harvesting stops
 * yielding new turns while pinned at the top, or the progress-aware deadline
 * ({@link SCROLL_IDLE_TIMEOUT} / {@link SCROLL_MAX_TIMEOUT}) elapses.
 *
 * Stability is only counted once already at the top, so a mid-scroll window that
 * happens to mount nothing new doesn't end accumulation prematurely.
 *
 * **Progress is a new turn OR upward scroll movement** (issue #365). A turn
 * taller than the viewport mounts as a single row that stays mounted while the
 * engine crawls up through it, so by construction it surfaces no new key — and
 * a turn taller than `SCROLL_IDLE_TIMEOUT / poll × step` would abort the whole
 * pass if only new turns counted. Measured on live Claude (1440×900): step is
 * 511px and the idle window is 37 iterations, so the limit was 18,907px, while
 * a ~1000-line code block renders ~22,160px tall (14px font, 22.75px
 * line-height) — reliably fatal. Counting movement is safe because upward travel
 * is monotonically decreasing and therefore finite: once the top is reached (or
 * the scroller stops responding) movement ceases and the idle deadline resumes
 * its original job of detecting a genuinely stuck scroll.
 *
 * This widened definition is deliberately NOT shared with
 * {@link ensureAllElementsLoaded}: that engine re-arms by jumping to
 * `scrollHeight` and back to 0 every iteration, so "the position moved" is
 * always true there and would disable its idle deadline entirely (ADR-024).
 *
 * @param onWindow Ingest the freshly-mounted window; return true if it grew the
 *   accumulated set. Invoked once per iteration after each scroll settles.
 */
async function scrollUpUntilStable(
  container: HTMLElement,
  step: number,
  deadlines: ScrollDeadlines,
  onWindow: () => boolean
): Promise<{ iterations: number; stopReason: ScrollStopReason }> {
  let stable = 0;
  let iterations = 0;
  const startTime = Date.now();
  let lastProgressTime = startTime;

  for (;;) {
    const stopReason = crossedDeadline(startTime, lastProgressTime, deadlines);
    if (stopReason !== null) return { iterations, stopReason };

    const before = container.scrollTop;
    const wasAtTop = before <= 0;
    container.scrollTop = Math.max(0, before - step);
    await delay(SCROLL_ACCUMULATE_POLL_INTERVAL);

    const grew = onWindow();
    const moved = before - container.scrollTop;
    iterations++;

    console.debug(
      `[G2O] Accumulate iteration ${iterations}: scrollTop=${container.scrollTop}, ` +
        `moved=${moved}, newTurns=${grew}`
    );

    if (grew || moved > 0) {
      lastProgressTime = Date.now(); // progress → reset the idle deadline
    }

    if (grew) {
      stable = 0;
    } else if (wasAtTop && ++stable >= SCROLL_STABILITY_THRESHOLD) {
      return { iterations, stopReason: 'complete' };
    }
  }
}
