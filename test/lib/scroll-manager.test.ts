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
}): {
  container: HTMLElement;
  harvest: () => Array<{ key: string; value: string }>;
} {
  const { total, windowSize } = opts;
  const clientHeight = opts.clientHeight ?? 900;
  // A conversation that fits entirely in one window has no scroll range.
  const fits = total <= windowSize;
  const maxScroll = fits ? 0 : 10_000;
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
 * Build a fake virtualized list whose bottom mounts *lazily* (issue #352).
 *
 * Real Claude/ChatGPT virtualizers estimate `scrollHeight` from a sizer and only
 * measure the true row heights as rows mount, so `scrollHeight` grows each time
 * you pin to the bottom (ADR-017 measured 27310 → 30616). A single
 * `scrollTop = scrollHeight` jump therefore lands *short* of the true bottom and
 * the newest window is not yet mounted; you must re-pin until it stops growing.
 *
 * This models that: the reachable maximum scrollTop (`frontier`) starts below the
 * true maximum and advances by `growthPerSeed` every time scrollTop is driven to
 * the current frontier. `scrollHeight` reflects the current frontier, so a single
 * seed cannot reach `trueMax` — only repeated seeding does.
 */
function createLazyBottomList(opts: {
  total: number;
  windowSize: number;
  clientHeight?: number;
  /** Initial reachable max as a fraction of trueMax (view scrolled up on Sync). */
  startFraction?: number;
  /** How far the mounted/measured frontier advances per bottom re-pin (px). */
  growthPerSeed?: number;
}): {
  container: HTMLElement;
  harvest: () => Array<{ key: string; value: string }>;
} {
  const { total, windowSize } = opts;
  const clientHeight = opts.clientHeight ?? 900;
  const trueMax = 10_000;
  const growthPerSeed = opts.growthPerSeed ?? 2_000;
  const items = Array.from({ length: total }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));

  let frontier = Math.round(trueMax * (opts.startFraction ?? 0.5));
  let scrollTop = frontier;

  const container = document.createElement('div');
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(frontier, v));
      // Driving to the current bottom mounts/measures further rows, extending it.
      if (scrollTop >= frontier) {
        frontier = Math.min(trueMax, frontier + growthPerSeed);
      }
    },
    configurable: true,
  });
  Object.defineProperty(container, 'clientHeight', { get: () => clientHeight, configurable: true });
  // scrollHeight reflects the currently-known extent, not the (larger) truth.
  Object.defineProperty(container, 'scrollHeight', {
    get: () => frontier + clientHeight,
    configurable: true,
  });

  const maxStart = Math.max(0, total - windowSize);
  const harvest = () => {
    const start = Math.round((scrollTop / trueMax) * maxStart);
    return items.slice(start, start + windowSize);
  };

  return { container, harvest };
}

/**
 * Build a fake list whose bottom *never* settles: every pin-to-bottom grows the
 * measured height again (a still-streaming reply or lazy media re-measuring
 * below the fold). Models the pathological case for the settle phase — it must
 * be time-bounded on its own so the upward pass still gets its full budget and
 * can reach the head (code-review of the #352 fix).
 */
function createNeverSettlingBottomList(opts: {
  total: number;
  windowSize: number;
  clientHeight?: number;
  growth?: number;
}): {
  container: HTMLElement;
  harvest: () => Array<{ key: string; value: string }>;
} {
  const { total, windowSize } = opts;
  const clientHeight = opts.clientHeight ?? 900;
  const growth = opts.growth ?? 500;
  const referenceMax = 12_000;
  const items = Array.from({ length: total }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));

  let frontier = 5_000;
  let scrollTop = 5_000;

  const container = document.createElement('div');
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      // Pinning to the bottom mounts more rows and keeps growing the measured
      // height — it never stabilizes. Scrolling up (v < frontier) does not.
      if (v >= frontier) frontier += growth;
      scrollTop = Math.max(0, Math.min(frontier, v));
    },
    configurable: true,
  });
  Object.defineProperty(container, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(container, 'scrollHeight', {
    get: () => frontier + clientHeight,
    configurable: true,
  });

  const maxStart = Math.max(0, total - windowSize);
  const harvest = () => {
    const start = Math.round(Math.min(1, scrollTop / referenceMax) * maxStart);
    return items.slice(start, start + windowSize);
  };

  return { container, harvest };
}

describe('accumulateWhileScrolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not let a never-settling bottom starve the upward pass (#352 review)', async () => {
    // If bottom-settling shared one timeout with the upward pass, a bottom that
    // keeps re-measuring would burn the whole budget and the upward pass would
    // run zero iterations, losing the entire earlier conversation. Settling is
    // bounded on its own, so the upward pass still reaches the head (v0).
    const { container, harvest } = createNeverSettlingBottomList({ total: 16, windowSize: 6 });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.iterations).toBeGreaterThan(0);
    expect(result.items).toContain('v0');
  });

  it('captures the newest turn when the bottom mounts lazily (issue #352)', async () => {
    // The bottom window only mounts after the virtualizer re-measures across
    // several pins-to-bottom; a single seed lands short and drops the last turns.
    const { container, harvest } = createLazyBottomList({
      total: 20,
      windowSize: 6,
      startFraction: 0.5,
      growthPerSeed: 2_000,
    });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.itemCount).toBe(20);
    expect(result.items).toEqual(Array.from({ length: 20 }, (_, i) => `v${i}`));
    // The regression: the final turns must be present, not just the older head.
    expect(result.items[result.items.length - 1]).toBe('v19');
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
