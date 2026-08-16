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

  it('splices new keys in at their anchor when the window ends with a persistent tail (issue #353)', () => {
    // The decisive step of the live ChatGPT trace (see TURN_WINDOWS below):
    // turns 14-16 have evicted, but the newest turns 17-21 stay mounted, so the
    // window is [1..13, 17..21] while the accumulation already holds [2..21].
    // The window's *suffix* is the persistent tail and never matches the
    // accumulated head — but the window still contains the anchor (2), which is
    // where the unseen turn 1 belongs.
    expect(mergeWindow(turns(2, 21), [...turns(1, 13), ...turns(17, 21)])).toEqual(turns(1, 21));
  });

  it('appends a trailing run of new keys after its preceding anchor', () => {
    // New keys sitting *below* an already-seen key must not be prepended.
    expect(mergeWindow(['a', 'b'], ['a', 'c'])).toEqual(['a', 'c', 'b']);
  });
});

/** Turn keys `t{from}`..`t{to}`, mirroring ChatGPT's conversation-turn numbering. */
function turns(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => `t${from + i}`);
}

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

/**
 * The mounted-turn windows captured from a real, logged-in desktop ChatGPT
 * conversation of 21 turns (2026-07-29, issue #353). Each row is one harvest,
 * scrolling upward from the bottom; the numbers are the `conversation-turn-N`
 * ordinals of the turns mounted at that moment.
 *
 * Note rows 6-7: turns 14-16 (then 13) have been evicted from the middle while
 * the newest turns 17-21 stay mounted — the shape that makes suffix/prefix
 * overlap stitching fail.
 */
const TURN_WINDOWS: readonly (readonly number[])[] = [
  [17, 18, 19, 20, 21], // seed (bottom)
  [17, 18, 19, 20, 21],
  [13, 14, 15, 16, 17, 18, 19, 20, 21],
  [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20, 21],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 18, 19, 20, 21], // top
];

/**
 * Replay a recorded sequence of mounted windows: harvest N returns the Nth
 * recorded window (the last one repeats once the script is exhausted, as it
 * does on the real page once scrolling is pinned at the top).
 *
 * The scroll range is sized so the engine reaches scrollTop 0 exactly as the
 * script runs out, letting the normal stability check end accumulation.
 *
 * @param withOrder Emit a monotonic `order` per turn (Claude's `data-index`
 *   layer). Omitted for the ChatGPT-equivalent case, where ordering must come
 *   from the merge itself.
 */
function createRecordedWindowList(
  windows: readonly (readonly number[])[],
  withOrder = false
): {
  container: HTMLElement;
  harvest: () => Array<{ key: string; value: string; order?: number }>;
} {
  const clientHeight = 900;
  const step = Math.max(400, Math.floor(clientHeight * 0.6));
  const maxScroll = step * (windows.length - 1);
  let scrollTop = maxScroll;
  let harvests = 0;

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

  const harvest = () => {
    const window = windows[Math.min(harvests, windows.length - 1)];
    harvests++;
    return window.map(n => ({
      key: `t${n}`,
      value: `v${n}`,
      ...(withOrder ? { order: n } : {}),
    }));
  };

  return { container, harvest };
}

/**
 * Build a virtualized list from explicit per-turn pixel heights.
 *
 * Unlike {@link createVirtualList} (which maps scroll *fraction* to a window of
 * fixed size), this models the real thing: each turn occupies a real span of the
 * scroll range, and the mounted window is whichever turns intersect the
 * viewport. That is what makes a single very tall turn expressible — while it
 * fills the viewport it is the *only* mounted turn, so every harvest returns the
 * same key no matter how far the engine scrolls (issue #365).
 *
 * @param heights Per-turn heights in px, first turn → last turn.
 */
function createVirtualListByHeights(
  heights: readonly number[],
  clientHeight: number
): {
  container: HTMLElement;
  harvest: () => Array<{ key: string; value: string; order: number }>;
} {
  const offsets: number[] = [];
  let acc = 0;
  for (const h of heights) {
    offsets.push(acc);
    acc += h;
  }
  const maxScroll = Math.max(0, acc - clientHeight);
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
  Object.defineProperty(container, 'scrollHeight', { get: () => acc, configurable: true });

  const harvest = () =>
    heights
      .map((h, i) => ({ i, top: offsets[i], bottom: offsets[i] + h }))
      .filter(t => t.bottom > scrollTop && t.top < scrollTop + clientHeight)
      .map(t => ({ key: `idx-${t.i}`, value: `v${t.i}`, order: t.i }));

  return { container, harvest };
}

describe('accumulateWhileScrolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reconstructs the true order from the live ChatGPT window trace, without any order index (issue #353)', async () => {
    // ChatGPT turns are keyed by uuid, so the `order` fallback that fixed Claude
    // (#352) is unavailable — the merge itself has to get this right.
    const { container, harvest } = createRecordedWindowList(TURN_WINDOWS);

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.itemCount).toBe(21);
    expect(result.items).toEqual(Array.from({ length: 21 }, (_, i) => `v${i + 1}`));
  });

  it('reconstructs the same order from the live trace when an order index is present', async () => {
    // Belt-and-suspenders layer: ChatGPT's `conversation-turn-N` ordinal fed
    // through HarvestEntry.order must agree with the merge-derived order.
    const { container, harvest } = createRecordedWindowList(TURN_WINDOWS, true);

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.itemCount).toBe(21);
    expect(result.items).toEqual(Array.from({ length: 21 }, (_, i) => `v${i + 1}`));
  });

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

  it('captures the turns above a single viewport-dwarfing turn (issue #365)', async () => {
    // Measured on live Claude via the CDP daemon (2026-08-02, 1440x900):
    //   clientHeight 852 -> step = floor(852 * 0.6) = 511px
    //   idle window     = 15_000 / 400 = 37 iterations
    //   => at most 37 * 511 = 18_907px may be traversed without a new turn
    //   code blocks render at 14px/22.75px line-height (measured 22.16 px/line)
    //   => a ~1000-line code block turn is ~22_160px and blows past that limit.
    // Crossing such a turn surfaces no new key by construction (the key is the
    // turn's own data-index), so an idle deadline that only counts new turns as
    // progress aborts mid-conversation and loses everything above it.
    const TALL_TURN = 22_160;
    const heights = [...Array(10).fill(800), TALL_TURN, ...Array(10).fill(800)];
    const { container, harvest } = createVirtualListByHeights(heights, 852);

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fullyLoaded).toBe(true);
    expect(result.itemCount).toBe(21);
    // The regression: the turns *above* the tall one must survive.
    expect(result.items.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => `v${i}`));
  });

  it('gives up when neither new turns nor the scroll position move', async () => {
    // The counterpart guard for the fix above: widening "progress" to include
    // scroll movement must not defeat ADR-018's stuck-scroller detection. Here
    // the container refuses to move at all, so the idle deadline must still fire
    // promptly rather than grinding to the absolute cap (~750 iterations).
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollTop', {
      get: () => 5_000,
      set: () => {}, // a scroller that ignores every write
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', { get: () => 852, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { get: () => 50_000, configurable: true });
    const window = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }));

    const promise = accumulateWhileScrolling(container, () => window);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fullyLoaded).toBe(false);
    expect(result.itemCount).toBe(6);
    // 15_000ms / 400ms ≈ 38 iterations, plus slack — nowhere near the cap.
    expect(result.iterations).toBeLessThan(45);
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
    // The scroller still travels 10_900 → 3_000 before pinning, i.e. ~15
    // iterations of real upward movement, and movement is progress (issue
    // #365). The idle deadline (~38 iters) then runs from the moment motion
    // stops, so ~53 iterations total — still nowhere near the absolute cap
    // (~750): this proves the idle path, not the cap.
    expect(result.iterations).toBeLessThan(80);
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

/**
 * Which deadline ended a pass (issue #449, ADR-032).
 *
 * A user reported "timed out (no new turns for 15s) with 27 turns" on a
 * 446-message conversation and concluded from that sentence that the stop was
 * idle-based rather than the 300s ceiling. They could not have known: both
 * engines emitted the same sentence whichever deadline fired, and the
 * arithmetic (257,486px at 511px/step ≈ 504 iterations needed, ~500-714
 * affordable inside 300s) is genuinely ambiguous.
 */
describe('scroll stop reason', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** A scroller that refuses to move and never surfaces a new turn. */
  function createStuckList(): {
    container: HTMLElement;
    harvest: () => Array<{ key: string; value: string }>;
  } {
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollTop', {
      get: () => 5_000, // every write is ignored: the position never changes
      set: () => {},
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', { get: () => 900, configurable: true });
    Object.defineProperty(container, 'scrollHeight', { get: () => 5_900, configurable: true });
    return { container, harvest: () => [{ key: 'k0', value: 'v0' }] };
  }

  it('reports idle-timeout when the scroller stops responding', async () => {
    const { container, harvest } = createStuckList();

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fullyLoaded).toBe(false);
    expect(result.stopReason).toBe('idle-timeout');
  });

  it('reports max-timeout when the pass keeps progressing past the ceiling', async () => {
    // Moves every iteration and mounts new turns, so the idle deadline never
    // fires; only the absolute cap can end it. 400ms per iteration against a
    // 300s cap allows ~750 iterations, and reaching the top needs 2000.
    const { container, harvest } = createVirtualList({
      total: 4_000,
      windowSize: 4,
      clientHeight: 1_000,
      maxScroll: 1_200_000,
    });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.fullyLoaded).toBe(false);
    expect(result.stopReason).toBe('max-timeout');
  });

  it('reports complete when the top is reached', async () => {
    const { container, harvest } = createVirtualList({ total: 12, windowSize: 4 });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.stopReason).toBe('complete');
  });

  it('reports complete when the conversation needs no scrolling at all', async () => {
    const { container, harvest } = createVirtualList({ total: 3, windowSize: 4 });

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.skipped).toBe(true);
    expect(result.stopReason).toBe('complete');
  });

  it('keeps fullyLoaded and stopReason in agreement', async () => {
    // Two fields describing one fact must never disagree.
    const cases = [
      createVirtualList({ total: 12, windowSize: 4 }),
      createVirtualList({ total: 3, windowSize: 4 }),
      createStuckList(),
    ];

    for (const { container, harvest } of cases) {
      const promise = accumulateWhileScrolling(container, harvest);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.fullyLoaded).toBe(result.stopReason === 'complete');
    }
  });

  it('logs a different sentence for each deadline, and never blames idle for the ceiling', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const stuck = createStuckList();
    let promise = accumulateWhileScrolling(stuck.container, stuck.harvest);
    await vi.runAllTimersAsync();
    await promise;
    const idleMessage = warn.mock.calls.map(c => String(c[0])).join('\n');

    warn.mockClear();
    const long = createVirtualList({
      total: 4_000,
      windowSize: 4,
      clientHeight: 1_000,
      maxScroll: 1_200_000,
    });
    promise = accumulateWhileScrolling(long.container, long.harvest);
    await vi.runAllTimersAsync();
    await promise;
    const capMessage = warn.mock.calls.map(c => String(c[0])).join('\n');

    expect(idleMessage).not.toBe(capMessage);
    expect(capMessage).not.toMatch(/no new turns|no progress/i);
    expect(idleMessage).toMatch(/no progress/i);
  });

  it('reports max-timeout when the caller sets an idle deadline longer than the cap', async () => {
    // Reachable once the deadlines are user-set: whichever threshold is crossed
    // first has to win, or the report lies.
    const { container, harvest } = createStuckList();

    const promise = accumulateWhileScrolling(container, harvest, {
      idleMs: 60_000,
      maxMs: 5_000,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.stopReason).toBe('max-timeout');
  });

  it('honours a caller-supplied idle deadline', async () => {
    const { container, harvest } = createStuckList();

    const promise = accumulateWhileScrolling(container, harvest, {
      idleMs: 2_000,
      maxMs: 300_000,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    // 2000ms / 400ms poll ≈ 5 iterations, versus ~38 at the 15s default.
    expect(result.stopReason).toBe('idle-timeout');
    expect(result.iterations).toBeLessThan(10);
  });

  it('falls back to the shipped 15s/300s deadlines when none are supplied', async () => {
    const { container, harvest } = createStuckList();

    const promise = accumulateWhileScrolling(container, harvest);
    await vi.runAllTimersAsync();
    const result = await promise;

    // 15_000 / 400 ≈ 38 iterations before the idle deadline fires.
    expect(result.iterations).toBeGreaterThan(30);
    expect(result.iterations).toBeLessThan(45);
  });
});
