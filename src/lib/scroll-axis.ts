/**
 * Direction-independent view of a vertical scroller (issue #515, ADR-042).
 *
 * A normal scroller has its scroll origin at the top: `scrollTop` is 0 there
 * and grows downward. A `flex-direction: column-reverse` scroller — ChatGPT's
 * thread since 2026-09 — has its origin at the bottom: `scrollTop` is 0 at the
 * newest message and negative toward the oldest, down to
 * `-(scrollHeight - clientHeight)` (css-overflow-3 "scroll origin"; MDN
 * Element.scrollTop). Code that reads `scrollTop === 0` as "at the top" mistakes
 * the bottom of such a scroller for the top.
 *
 * The axis exposes one measure that means the same on both: the distance from
 * the top, 0 at the oldest content.
 */

export interface ScrollAxis {
  /** Distance from the top in px: 0 at the oldest content, larger further down. */
  distanceFromTop(): number;
  /** Scroll so the view sits `distance` px from the top (the browser clamps). */
  scrollToDistance(distance: number): void;
  /** Scroll to the newest content. */
  pinBottom(): void;
}

/** scrollHeight - clientHeight: how far the scroller can travel. */
function scrollRange(container: HTMLElement): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

/** Whether the scroller's origin is at the bottom (column-reverse). */
function isReversed(container: HTMLElement): boolean {
  return getComputedStyle(container).flexDirection === 'column-reverse';
}

export function createScrollAxis(container: HTMLElement): ScrollAxis {
  let reversed = isReversed(container);

  /**
   * Current scrollTop, latching `reversed` on the first negative reading: a
   * negative scrollTop is only possible with the origin at the bottom, so it
   * still identifies the direction if the style moves to another element.
   */
  const readScrollTop = (): number => {
    const top = container.scrollTop;
    if (top < 0) reversed = true;
    return top;
  };

  return {
    distanceFromTop: () => {
      const top = readScrollTop();
      return reversed ? top + scrollRange(container) : top;
    },
    scrollToDistance: distance => {
      readScrollTop();
      container.scrollTop = reversed ? distance - scrollRange(container) : distance;
    },
    pinBottom: () => {
      readScrollTop();
      container.scrollTop = reversed ? 0 : container.scrollHeight;
    },
  };
}
