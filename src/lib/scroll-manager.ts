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
