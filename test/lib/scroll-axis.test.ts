/**
 * Tests for the scroll axis (issue #515, ADR-042).
 *
 * ChatGPT's 2026-09 thread scroller is `flex-direction: column-reverse`: its
 * scroll origin is the bottom, so `scrollTop` is 0 at the newest message and
 * negative toward the oldest (css-overflow-3 scroll origin; MDN
 * Element.scrollTop). The axis hides that difference behind one measure — the
 * distance from the top — so the accumulation engine can walk either kind.
 */

import { describe, it, expect } from 'vitest';
import { createScrollAxis } from '../../src/lib/scroll-axis';

/**
 * A scroller whose scrollTop clamps like a browser's. jsdom does no layout and
 * stores scrollTop unclamped, so the range is modelled here.
 *
 * @param range scrollHeight - clientHeight
 * @param distance Initial distance from the top.
 */
function createScroller(opts: {
  reversed: boolean;
  range: number;
  distance: number;
  /** Whether the column-reverse style is visible on the element (default true). */
  styled?: boolean;
}): HTMLElement {
  const { reversed, range } = opts;
  const clientHeight = 900;
  const min = reversed ? -range : 0;
  const max = reversed ? 0 : range;
  let scrollTop = reversed ? opts.distance - range : opts.distance;

  const el = document.createElement('div');
  if (reversed && opts.styled !== false) {
    el.style.display = 'flex';
    el.style.flexDirection = 'column-reverse';
  }
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(min, Math.min(max, v));
    },
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => range + clientHeight,
    configurable: true,
  });
  return el;
}

describe('createScrollAxis', () => {
  it('measures the distance from the top on a column-reverse scroller', () => {
    // scrollTop -1000 on a 5000px range sits 4000px below the top.
    const el = createScroller({ reversed: true, range: 5000, distance: 4000 });
    expect(el.scrollTop).toBe(-1000);

    expect(createScrollAxis(el).distanceFromTop()).toBe(4000);
  });

  it('measures the distance from the top on a normal scroller as its scrollTop', () => {
    const el = createScroller({ reversed: false, range: 5000, distance: 4000 });

    expect(createScrollAxis(el).distanceFromTop()).toBe(4000);
  });

  it('treats a scroller as reversed once it reports a negative scrollTop, even without the style', () => {
    // Insurance against the reverse moving to a wrapper element: a negative
    // scrollTop is only possible when the scroll origin is the bottom.
    const el = createScroller({ reversed: true, range: 5000, distance: 4000, styled: false });

    expect(createScrollAxis(el).distanceFromTop()).toBe(4000);
  });

  it('scrolls to a distance from the top on a column-reverse scroller', () => {
    const el = createScroller({ reversed: true, range: 5000, distance: 4000 });
    const axis = createScrollAxis(el);

    axis.scrollToDistance(1000);

    expect(el.scrollTop).toBe(-4000);
    expect(axis.distanceFromTop()).toBe(1000);
  });

  it('pins a column-reverse scroller to the bottom, where scrollTop is 0', () => {
    const el = createScroller({ reversed: true, range: 5000, distance: 1000 });
    const axis = createScrollAxis(el);

    axis.pinBottom();

    expect(el.scrollTop).toBe(0);
    expect(axis.distanceFromTop()).toBe(5000);
  });

  it('pins a normal scroller to the bottom', () => {
    const el = createScroller({ reversed: false, range: 5000, distance: 1000 });
    const axis = createScrollAxis(el);

    axis.pinBottom();

    expect(axis.distanceFromTop()).toBe(5000);
  });
});
