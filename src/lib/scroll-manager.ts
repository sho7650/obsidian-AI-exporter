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
} from './constants';

/**
 * Progress-aware accumulation deadline (issue #360, ADR-018).
 *
 * A scroll pass keeps running while it is still making progress: the pass is
 * live until either no new turns have appeared for {@link SCROLL_IDLE_TIMEOUT}
 * (a stuck/broken scroll) or the absolute {@link SCROLL_MAX_TIMEOUT} safety cap
 * is reached. Callers reset `lastProgressTime` on every iteration that surfaces
 * a new turn, so a genuinely-long conversation is never cut off mid-scroll.
 *
 * @param startTime When the pass began (`Date.now()`).
 * @param lastProgressTime When the pass last made progress (`Date.now()`).
 */
function withinDeadline(startTime: number, lastProgressTime: number): boolean {
  const now = Date.now();
  return now - lastProgressTime < SCROLL_IDLE_TIMEOUT && now - startTime < SCROLL_MAX_TIMEOUT;
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
  elementSelector: string
): Promise<ScrollResult> {
  const initialCount = countElements(elementSelector);

  if (container.scrollTop === 0) {
    console.info(
      `[G2O] scrollTop=0, scrollHeight=${container.scrollHeight}, ` +
        `clientHeight=${container.clientHeight}, elements=${initialCount}`
    );
    return { fullyLoaded: true, elementCount: initialCount, scrollIterations: 0, skipped: true };
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

  while (withinDeadline(startTime, lastProgressTime)) {
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
        console.info(
          `[G2O] DOM stabilized after ${iterations} iterations with ${currentCount} elements`
        );
        return {
          fullyLoaded: true,
          elementCount: currentCount,
          scrollIterations: iterations,
          skipped: false,
        };
      }
    } else {
      console.debug(`[G2O] Element count changed: ${previousCount} -> ${currentCount}`);
      stableCount = 0;
      previousCount = currentCount;
      lastProgressTime = Date.now(); // progress → reset the idle deadline
    }
  }

  const finalCount = countElements(elementSelector);
  console.warn(
    `[G2O] Auto-scroll timed out (no new elements for ${SCROLL_IDLE_TIMEOUT / 1000}s) ` +
      `with ${finalCount} elements`
  );
  return {
    fullyLoaded: false,
    elementCount: finalCount,
    scrollIterations: iterations,
    skipped: false,
  };
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
  harvest: () => HarvestEntry<T>[]
): Promise<AccumulateResult<T>> {
  const content = new Map<string, T>();
  const orderIndex = new Map<string, number>();
  let order: string[] = [];

  const ingest = (): void => {
    const window = harvest();
    for (const entry of window) {
      content.set(entry.key, entry.value); // last write wins → freshest content
      if (entry.order !== undefined) orderIndex.set(entry.key, entry.order);
    }
    order = mergeWindow(
      order,
      window.map(e => e.key)
    );
  };

  const toItems = (): T[] => resolveOrder(order, orderIndex).map(key => content.get(key) as T);

  // Seed at the true bottom so the newest turns are mounted before harvesting.
  // Sync may start with the view scrolled up (issue #348): the last turn is then
  // below the fold and unmounted, and because we only ever scroll *up* from the
  // seed, an unmounted tail would be lost forever. Jumping to scrollHeight first
  // pins the newest window; a conversation that fits has no scroll range and
  // stays at the top, so the skip path below still applies.
  container.scrollTop = container.scrollHeight;
  await delay(SCROLL_ACCUMULATE_POLL_INTERVAL);
  ingest();

  if (container.scrollTop <= 0) {
    console.info('[G2O] scrollTop=0 on open, conversation fits without scrolling');
    return {
      items: toItems(),
      fullyLoaded: true,
      itemCount: content.size,
      iterations: 0,
      skipped: true,
    };
  }

  console.info(
    `[G2O] Virtualized conversation — scrollTop=${container.scrollTop}, ` +
      `${content.size} turns mounted, accumulating by scrolling up`
  );

  const step = Math.max(
    SCROLL_ACCUMULATE_MIN_STEP,
    Math.floor(container.clientHeight * SCROLL_ACCUMULATE_STEP_FACTOR)
  );

  const { iterations, fullyLoaded } = await scrollUpUntilStable(container, step, () => {
    const before = content.size;
    ingest();
    return content.size > before;
  });

  logAccumulation(fullyLoaded, content.size, iterations);
  return { items: toItems(), fullyLoaded, itemCount: content.size, iterations, skipped: false };
}

/** Log the outcome of an upward accumulation pass (stabilized vs timed out). */
function logAccumulation(fullyLoaded: boolean, turns: number, iterations: number): void {
  if (fullyLoaded) {
    console.info(`[G2O] Accumulated ${turns} turns after ${iterations} scroll iterations`);
  } else {
    console.warn(
      `[G2O] Auto-scroll accumulation timed out (no new turns for ` +
        `${SCROLL_IDLE_TIMEOUT / 1000}s) with ${turns} turns`
    );
  }
}

/**
 * Scroll a container upward one step per iteration until harvesting stops
 * yielding new turns while pinned at the top, or the progress-aware deadline
 * ({@link SCROLL_IDLE_TIMEOUT} / {@link SCROLL_MAX_TIMEOUT}) elapses.
 *
 * Stability is only counted once already at the top, so a mid-scroll window that
 * happens to mount nothing new doesn't end accumulation prematurely.
 *
 * @param onWindow Ingest the freshly-mounted window; return true if it grew the
 *   accumulated set. Invoked once per iteration after each scroll settles.
 */
async function scrollUpUntilStable(
  container: HTMLElement,
  step: number,
  onWindow: () => boolean
): Promise<{ iterations: number; fullyLoaded: boolean }> {
  let stable = 0;
  let iterations = 0;
  const startTime = Date.now();
  let lastProgressTime = startTime;

  while (withinDeadline(startTime, lastProgressTime)) {
    const wasAtTop = container.scrollTop <= 0;
    container.scrollTop = Math.max(0, container.scrollTop - step);
    await delay(SCROLL_ACCUMULATE_POLL_INTERVAL);

    const grew = onWindow();
    iterations++;

    if (grew) {
      stable = 0;
      lastProgressTime = Date.now(); // progress → reset the idle deadline
    } else if (wasAtTop && ++stable >= SCROLL_STABILITY_THRESHOLD) {
      return { iterations, fullyLoaded: true };
    }
  }
  return { iterations, fullyLoaded: false };
}
