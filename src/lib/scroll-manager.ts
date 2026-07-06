/**
 * Auto-scroll coordination for lazy-loaded content
 *
 * Scrolls a container to trigger loading of all elements (e.g., Gemini's
 * infinite-scroller) and waits until the DOM stabilizes.
 */

import {
  SCROLL_POLL_INTERVAL,
  SCROLL_TIMEOUT,
  SCROLL_STABILITY_THRESHOLD,
  SCROLL_REARM_DELAY,
  SCROLL_ACCUMULATE_POLL_INTERVAL,
  SCROLL_ACCUMULATE_STEP_FACTOR,
  SCROLL_ACCUMULATE_MIN_STEP,
} from './constants';

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

  while (Date.now() - startTime < SCROLL_TIMEOUT) {
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
    }
  }

  const finalCount = countElements(elementSelector);
  console.warn(`[G2O] Auto-scroll timed out after ${SCROLL_TIMEOUT}ms with ${finalCount} elements`);
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
 * Windows are captured while scrolling **up**, so each new window's tail
 * overlaps the accumulated head. We align on that overlap and prepend the
 * non-overlapping prefix. With no detectable overlap we fall back to prepending
 * the window's not-yet-seen keys, so ordering degrades gracefully rather than
 * dropping turns. The result never contains duplicate keys.
 *
 * @param accumulated Keys gathered so far, in conversation order.
 * @param window Keys from the current window, in DOM (top→bottom) order.
 */
export function mergeWindow(accumulated: readonly string[], window: readonly string[]): string[] {
  if (accumulated.length === 0) return dedupeKeys(window);
  if (window.length === 0) return [...accumulated];

  // Largest k where the window's last k keys equal the accumulated first k keys.
  let overlap = 0;
  const maxK = Math.min(window.length, accumulated.length);
  for (let k = maxK; k >= 1; k--) {
    let matches = true;
    for (let i = 0; i < k; i++) {
      if (window[window.length - k + i] !== accumulated[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      overlap = k;
      break;
    }
  }

  const prefix = window.slice(0, window.length - overlap);
  return dedupeKeys([...prefix, ...accumulated]);
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
 * {@link SCROLL_STABILITY_THRESHOLD} consecutive iterations, or until
 * {@link SCROLL_TIMEOUT} elapses.
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
  let order: string[] = [];

  const ingest = (): void => {
    const window = harvest();
    for (const entry of window) {
      content.set(entry.key, entry.value); // last write wins → freshest content
    }
    order = mergeWindow(
      order,
      window.map(e => e.key)
    );
  };

  const toItems = (): T[] => order.map(key => content.get(key) as T);

  ingest(); // seed with the initial (bottom) window

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

  if (fullyLoaded) {
    console.info(`[G2O] Accumulated ${content.size} turns after ${iterations} scroll iterations`);
  } else {
    console.warn(
      `[G2O] Auto-scroll accumulation timed out after ${SCROLL_TIMEOUT}ms with ${content.size} turns`
    );
  }

  return { items: toItems(), fullyLoaded, itemCount: content.size, iterations, skipped: false };
}

/**
 * Scroll a container upward one step per iteration until harvesting stops
 * yielding new turns while pinned at the top, or {@link SCROLL_TIMEOUT} elapses.
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

  while (Date.now() - startTime < SCROLL_TIMEOUT) {
    const wasAtTop = container.scrollTop <= 0;
    container.scrollTop = Math.max(0, container.scrollTop - step);
    await delay(SCROLL_ACCUMULATE_POLL_INTERVAL);

    const grew = onWindow();
    iterations++;

    if (grew) {
      stable = 0;
    } else if (wasAtTop && ++stable >= SCROLL_STABILITY_THRESHOLD) {
      return { iterations, fullyLoaded: true };
    }
  }
  return { iterations, fullyLoaded: false };
}
