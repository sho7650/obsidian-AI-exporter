/**
 * Load-until-stable scroll engine for Gemini's infinite-scroller.
 *
 * Scrolls a container to the top to trigger loading of all elements and waits
 * until the element count stabilizes. Every turn stays mounted once loaded, so
 * the caller reads the DOM once afterwards.
 */

import { SCROLL_POLL_INTERVAL, SCROLL_STABILITY_THRESHOLD, SCROLL_REARM_DELAY } from './constants';
import {
  crossedDeadline,
  logScrollStop,
  delay,
  DEFAULT_SCROLL_DEADLINES,
  type ScrollDeadlines,
  type ScrollStopReason,
} from './scroll-deadlines';

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
    return completeElementResult(initialCount, 0, true);
  }

  console.info(
    `[G2O] Partial load detected — scrollTop=${container.scrollTop}, ` +
      `elements=${initialCount}, auto-scrolling`
  );
  return scrollToTopUntilStable(container, elementSelector, deadlines);
}

/**
 * One load attempt: re-arm the edge trigger if already at the top, then
 * scroll to 0 and give the platform time to mount what it loaded.
 */
async function rearmAndScrollToTop(container: HTMLElement): Promise<void> {
  // Re-arm: if already at top, scroll to bottom first so the next
  // scroll-to-0 crosses the onScrolledTopPastThreshold edge trigger.
  if (container.scrollTop === 0) {
    container.scrollTop = container.scrollHeight;
    await delay(SCROLL_REARM_DELAY);
  }

  // Scroll to top — crosses the threshold, triggering content loading
  container.scrollTop = 0;
  await delay(SCROLL_POLL_INTERVAL);
}

/**
 * Repeat load attempts until the element count holds still for
 * {@link SCROLL_STABILITY_THRESHOLD} iterations or a deadline passes.
 *
 * Progress here is a change in the element count ONLY. This is deliberately
 * NOT the widened "new turn OR upward movement" definition used by
 * {@link scrollUpUntilStable} (ADR-024): this engine re-arms by jumping to
 * scrollHeight and back to 0 every iteration, so "the position moved" would
 * always be true and would disable the idle deadline entirely.
 */
async function scrollToTopUntilStable(
  container: HTMLElement,
  elementSelector: string,
  deadlines: ScrollDeadlines
): Promise<ScrollResult> {
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

    await rearmAndScrollToTop(container);
    const currentCount = countElements(elementSelector);
    iterations++;

    console.debug(
      `[G2O] Scroll iteration ${iterations}: elements=${currentCount}, ` +
        `scrollTop=${container.scrollTop}, scrollHeight=${container.scrollHeight}`
    );

    if (currentCount !== previousCount) {
      console.debug(`[G2O] Element count changed: ${previousCount} -> ${currentCount}`);
      stableCount = 0;
      previousCount = currentCount;
      lastProgressTime = Date.now(); // progress → reset the idle deadline
      continue;
    }

    if (++stableCount >= SCROLL_STABILITY_THRESHOLD) {
      logScrollStop(
        'complete',
        currentCount,
        'elements',
        iterations,
        Date.now() - startTime,
        deadlines
      );
      return completeElementResult(currentCount, iterations, false);
    }
  }
}

/** A pass that ended because every element is loaded (or none needed loading). */
function completeElementResult(
  elementCount: number,
  scrollIterations: number,
  skipped: boolean
): ScrollResult {
  return { fullyLoaded: true, elementCount, scrollIterations, skipped, stopReason: 'complete' };
}
