/**
 * Tests for the auto-scroll accumulation engine (ADR-017).
 *
 * Claude and ChatGPT virtualize the conversation: only a small moving window
 * of turns is ever mounted, and off-screen turns are evicted. The engine must
 * scroll upward, harvest each window, and accumulate/dedupe turns by a stable
 * key so the full history is captured despite never holding it all at once.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeWindow, accumulateWhileScrolling } from '../../src/lib/scroll-manager';

describe('mergeWindow', () => {
  it('returns the window verbatim when nothing is accumulated yet', () => {
    expect(mergeWindow([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('leaves the accumulation unchanged when the window is fully contained', () => {
    // We scrolled up but the same window re-mounted (no new turns).
    expect(mergeWindow(['c', 'd', 'e'], ['c', 'd'])).toEqual(['c', 'd', 'e']);
  });

  it('prepends the non-overlapping prefix, aligning on the shared suffix', () => {
    // Scrolling up: new window [a,b,c,d] overlaps accumulated head [c,d].
    expect(mergeWindow(['c', 'd'], ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('aligns on a single-element overlap', () => {
    expect(mergeWindow(['c', 'd', 'e'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('falls back to prepending de-duplicated keys when there is no overlap', () => {
    expect(mergeWindow(['d', 'e'], ['a', 'b'])).toEqual(['a', 'b', 'd', 'e']);
  });

  it('never emits duplicate keys', () => {
    expect(mergeWindow(['b', 'c'], ['a', 'b'])).toEqual(['a', 'b', 'c']);
  });
});

/**
 * Build a fake virtualized scroll container: a full list of `total` items, of
 * which only `windowSize` are ever "mounted" (returned by harvest), positioned
 * by the current scrollTop. scrollTop starts at the bottom, mirroring how
 * Claude/ChatGPT open a conversation.
 */
function createVirtualList(opts: {
  total: number;
  windowSize: number;
  clientHeight?: number;
  startAtTop?: boolean;
  /**
   * Initial scrollTop as a fraction of maxScroll (1 = bottom, default). Use a
   * value < 1 to model Sync starting with the view scrolled up, so the newest
   * turn is below the fold and not in the initially-mounted window.
   */
  startFraction?: number;
  /**
   * Total scroll range in px (default 10_000). A larger range means more scroll
   * iterations are needed to reach the top, modelling a very long conversation
   * whose accumulation exceeds the old fixed wall-clock timeout.
   */
  maxScroll?: number;
}): {
  container: HTMLElement;
  harvest: () => Array<{ key: string; value: string }>;
} {
  const { total, windowSize } = opts;
  const clientHeight = opts.clientHeight ?? 900;
  // A conversation that fits entirely in one window has no scroll range.
  const fits = total <= windowSize;
  const maxScroll = fits ? 0 : (opts.maxScroll ?? 10_000);
  const items = Array.from({ length: total }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));

  const container = document.createElement('div');
  const startFraction = opts.startAtTop ? 0 : (opts.startFraction ?? 1);
  let scrollTop = Math.round(maxScroll * startFraction);
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(maxScroll, v));
    },
    configurable: true,
  });
  Object.defineProperty(container, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(container, 'scrollHeight', {
    get: () => maxScroll + clientHeight,
    configurable: true,
  });

  const maxStart = Math.max(0, total - windowSize);
  const harvest = () => {
    const frac = maxScroll === 0 ? 0 : scrollTop / maxScroll; // 1 at bottom, 0 at top
    const start = Math.round(frac * maxStart);
    return items.slice(start, start + windowSize);
  };

  return { container, harvest };
}

/**
 * Build a list whose bottom `tail` turns NEVER evict (they stay mounted in every
 * window), while the middle evicts as you scroll up — the real Claude behavior
 * behind the #352 ordering scramble. When scrolled near the top the harvested
 * DOM window is `[0..W-1, <persistent tail>]`, so mergeWindow's overlap check
 * fails (window tail ≠ accumulated head) and it wedges the tail into the middle.
 * Each turn carries a monotonic `order` (its data-index) so the engine can sort.
 */
function createPersistentTailList(opts: {
  total: number;
  movingWindow: number;
  tail: number;
  clientHeight?: number;
}): {
  container: HTMLElement;
  harvest: () => Array<{ key: string; value: string; order: number }>;
} {
  const { total, movingWindow: W, tail: P } = opts;
  const clientHeight = opts.clientHeight ?? 900;
  const maxScroll = 10_000;
  let scrollTop = maxScroll; // opens at the bottom

  const container = document.createElement('div');
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(maxScroll, v));
    },
    configurable: true,
  });
  Object.defineProperty(container, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(container, 'scrollHeight', {
    get: () => maxScroll + clientHeight,
    configurable: true,
  });

  const maxStart = Math.max(0, total - W);
  const harvest = () => {
    const start = Math.round((scrollTop / maxScroll) * maxStart);
    const idxs = new Set<number>();
    for (let i = start; i < start + W && i < total; i++) idxs.add(i);
    for (let i = total - P; i < total; i++) idxs.add(i); // persistent, never-evicting tail
    return [...idxs]
      .sort((a, b) => a - b)
      .map(i => ({ key: `idx-${i}`, value: `v${i}`, order: i }));
  };

  return { container, harvest };
}

describe('accumulateWhileScrolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('orders turns by their monotonic index when the tail never evicts (issue #352)', async () => {
    // The last 3 turns stay mounted in every window; the middle evicts. Overlap
    // stitching alone wedges the tail into the middle — the engine must fall back
    // to the per-turn `order` to reconstruct the true conversation order.
    const { container, harvest } = createPersistentTailList({
      total: 20,
      movingWindow: 6,
      tail: 3,
    });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.itemCount).toBe(20);
    expect(result.items).toEqual(Array.from({ length: 20 }, (_, i) => `v${i}`));
  });

  it('accumulates every turn across windows despite eviction', async () => {
    const { container, harvest } = createVirtualList({ total: 12, windowSize: 4 });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.skipped).toBe(false);
    expect(result.fullyLoaded).toBe(true);
    expect(result.itemCount).toBe(12);
    // Ordered from first turn to last.
    expect(result.items).toEqual(Array.from({ length: 12 }, (_, i) => `v${i}`));
  });

  it('keeps accumulating past the old fixed 30s wall while progress continues (issue #360)', async () => {
    // A very long conversation: reaching the top takes ~150 scroll iterations,
    // far more than the old 30_000ms / 400ms ≈ 75-iteration wall-clock wall.
    // Because every step surfaces new turns, the progress-aware deadline must
    // never cut off mid-scroll — the whole conversation must be captured.
    const { container, harvest } = createVirtualList({
      total: 300,
      windowSize: 6,
      clientHeight: 1000, // step = 600px → 90_000 / 600 = 150 iterations to top
      maxScroll: 90_000,
    });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fullyLoaded).toBe(true);
    expect(result.itemCount).toBe(300);
    expect(result.items).toEqual(Array.from({ length: 300 }, (_, i) => `v${i}`));
  });

  it('stops via the idle deadline (not the absolute cap) when stuck below the top', async () => {
    // The scroll never reaches the top and no new turns ever mount after the
    // seed window: a broken/stuck scroller. Accumulation must give up promptly
    // on the no-progress (idle) deadline, not grind until the absolute cap.
    const container = document.createElement('div');
    let scrollTop = 10_000;
    Object.defineProperty(container, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.max(3_000, v); // never pins at the top
      },
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', { get: () => 900, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { get: () => 10_900, configurable: true });
    // Fixed window: the same 6 turns mount forever, so no iteration ever grows.
    const window = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));
    const harvest = () => window;

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fullyLoaded).toBe(false);
    expect(result.itemCount).toBe(6);
    // Idle deadline (~15s / 400ms ≈ 38 iters) fires long before the old 30s
    // wall (~75) or the absolute cap (~750): proves the idle path, not the cap.
    expect(result.iterations).toBeLessThan(50);
  });

  it('captures the newest turn even when Sync starts scrolled up (issue #348)', async () => {
    // The view is scrolled up on Sync, so the last turn (v19) is below the fold
    // and not in the initially-mounted window. Upward-only accumulation would
    // never reach it; the engine must seed at the bottom first.
    const { container, harvest } = createVirtualList({
      total: 20,
      windowSize: 6,
      startFraction: 0.5,
    });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.itemCount).toBe(20);
    expect(result.items).toEqual(Array.from({ length: 20 }, (_, i) => `v${i}`));
    // The regression: the final turn must be present.
    expect(result.items[result.items.length - 1]).toBe('v19');
  });

  it('skips scrolling when the container starts at the top (short conversation)', async () => {
    const { container, harvest } = createVirtualList({
      total: 3,
      windowSize: 5,
      startAtTop: true,
    });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.skipped).toBe(true);
    expect(result.items).toEqual(['v0', 'v1', 'v2']);
  });

  it('reports fullyLoaded=false when the DOM never stabilizes (timeout)', async () => {
    // Harvest that always yields a brand-new unique key → never stabilizes.
    const container = document.createElement('div');
    let scrollTop = 10_000;
    Object.defineProperty(container, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.max(0, v);
      },
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', { get: () => 900, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { get: () => 10_900, configurable: true });
    let n = 0;
    const harvest = () => [{ key: `new${n++}`, value: `val${n}` }];

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fullyLoaded).toBe(false);
    expect(result.skipped).toBe(false);
  });

  it('keeps the freshest content when a key re-appears in a later window', async () => {
    const container = document.createElement('div');
    let scrollTop = 10_000;
    Object.defineProperty(container, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.max(0, v);
      },
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', { get: () => 900, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { get: () => 10_900, configurable: true });

    let round = 0;
    const harvest = () => {
      round++;
      // First harvest: key "a" has stale (streaming) content; later: final content.
      if (round === 1) return [{ key: 'a', value: 'partial' }];
      return [{ key: 'a', value: 'final' }];
    };

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.items).toEqual(['final']);
  });
});
