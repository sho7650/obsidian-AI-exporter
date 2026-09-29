/**
 * Accumulation scroll engine for virtualized platforms (Claude, ChatGPT;
 * ADR-017). Only a moving window of turns is ever mounted, so the engine
 * harvests each window while scrolling up and merges them by key.
 */

import {
  SCROLL_STABILITY_THRESHOLD,
  SCROLL_ACCUMULATE_POLL_INTERVAL,
  SCROLL_ACCUMULATE_STEP_FACTOR,
  SCROLL_ACCUMULATE_MIN_STEP,
} from './constants';
import { createScrollAxis, type ScrollAxis } from './scroll-axis';
import {
  crossedDeadline,
  logScrollStop,
  delay,
  DEFAULT_SCROLL_DEADLINES,
  type ScrollDeadlines,
  type ScrollStopReason,
} from './scroll-deadlines';
import { mergeWindow, resolveOrder } from './scroll-merge';

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

/** Platform-specific tuning for one accumulation pass. */
export interface AccumulateOptions {
  /**
   * How long the view must rest at the top before the pass may complete, in ms.
   * For platforms that load older turns only after the top is reached (ChatGPT
   * since 2026-09, issue #515); without it the stability window can end the
   * pass before the older page arrives, and the result claims to be complete.
   * Default 0: completion is decided by stability alone.
   */
  readonly topSettleMs?: number;
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
  /**
   * Highest {@link HarvestEntry.order} seen in any window, i.e. the ordinal of
   * the newest turn this pass covered. Undefined when no turn carried one.
   *
   * Reported because the pass ends pinned at the *top* of the conversation, so
   * the newest turn is unmounted by then and its ordinal cannot be re-read from
   * the DOM afterwards. The sync-status badge needs it as the baseline for
   * "a message newer than the one I synced has appeared" (issue #465).
   */
  maxOrder?: number;
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
 * @param options Platform tuning; see {@link AccumulateOptions}.
 */
export async function accumulateWhileScrolling<T>(
  container: HTMLElement,
  harvest: () => HarvestEntry<T>[],
  deadlines: ScrollDeadlines = DEFAULT_SCROLL_DEADLINES,
  options: AccumulateOptions = {}
): Promise<AccumulateResult<T>> {
  const passStart = Date.now();
  const acc = createAccumulator(harvest);
  const axis = createScrollAxis(container);

  if (await seedAtBottom(axis, acc.ingest)) {
    console.info('[G2O] No scroll range on open, conversation fits without scrolling');
    return toResult(acc, 0, 'complete', true);
  }

  console.info(
    `[G2O] Virtualized conversation — scrollTop=${container.scrollTop}, ` +
      `${acc.size} turns mounted, accumulating by scrolling up`
  );

  const { iterations, stopReason } = await scrollUpUntilStable(
    axis,
    accumulateStep(container),
    deadlines,
    options.topSettleMs ?? 0,
    () => {
      const before = acc.size;
      acc.ingest();
      return acc.size > before;
    }
  );

  logScrollStop(stopReason, acc.size, 'turns', iterations, Date.now() - passStart, deadlines);
  return toResult(acc, iterations, stopReason, false);
}

/** Package the accumulated turns as the pass result. */
function toResult<T>(
  acc: Accumulator<T>,
  iterations: number,
  stopReason: ScrollStopReason,
  skipped: boolean
): AccumulateResult<T> {
  return {
    items: acc.toItems(),
    fullyLoaded: stopReason === 'complete',
    itemCount: acc.size,
    iterations,
    skipped,
    stopReason,
    maxOrder: acc.maxOrder,
  };
}

/**
 * How far each upward step travels: a fraction of the viewport, so consecutive
 * windows overlap and the merge always has an anchor.
 */
function accumulateStep(container: HTMLElement): number {
  return Math.max(
    SCROLL_ACCUMULATE_MIN_STEP,
    Math.floor(container.clientHeight * SCROLL_ACCUMULATE_STEP_FACTOR)
  );
}

/** Turns accumulated across windows: de-duplicated by key, ordered once at the end. */
interface Accumulator<T> {
  ingest: () => void;
  toItems: () => T[];
  readonly size: number;
  readonly maxOrder: number | undefined;
}

function createAccumulator<T>(harvest: () => HarvestEntry<T>[]): Accumulator<T> {
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
    get maxOrder() {
      let max: number | undefined;
      for (const value of orderIndex.values()) {
        if (max === undefined || value > max) max = value;
      }
      return max;
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
 * stays at the top. Measured through the axis, because on a column-reverse
 * scroller the pinned bottom reports scrollTop 0 (issue #515).
 */
async function seedAtBottom(axis: ScrollAxis, ingest: () => void): Promise<boolean> {
  axis.pinBottom();
  await delay(SCROLL_ACCUMULATE_POLL_INTERVAL);
  ingest();
  return axis.distanceFromTop() <= 0;
}

/**
 * One upward step: scroll, let the window mount, ingest it, and measure how far
 * the view actually travelled.
 */
async function stepUp(
  axis: ScrollAxis,
  step: number,
  onWindow: () => boolean
): Promise<{ wasAtTop: boolean; after: number; moved: number; grew: boolean }> {
  const before = axis.distanceFromTop();
  axis.scrollToDistance(Math.max(0, before - step));
  await delay(SCROLL_ACCUMULATE_POLL_INTERVAL);

  const grew = onWindow();
  const after = axis.distanceFromTop();
  return { wasAtTop: before <= 0, after, moved: before - after, grew };
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
  axis: ScrollAxis,
  step: number,
  deadlines: ScrollDeadlines,
  topSettleMs: number,
  onWindow: () => boolean
): Promise<{ iterations: number; stopReason: ScrollStopReason }> {
  let stable = 0;
  let iterations = 0;
  const startTime = Date.now();
  let lastProgressTime = startTime;
  let atTopSince: number | null = null;

  for (;;) {
    const stopReason = crossedDeadline(startTime, lastProgressTime, deadlines);
    if (stopReason !== null) return { iterations, stopReason };

    const { wasAtTop, after, moved, grew } = await stepUp(axis, step, onWindow);
    iterations++;

    console.debug(
      `[G2O] Accumulate iteration ${iterations}: distanceFromTop=${after}, ` +
        `moved=${moved}, newTurns=${grew}`
    );

    if (grew || moved > 0) {
      lastProgressTime = Date.now(); // progress → reset the idle deadline
    }

    // The top counts only from the moment the view arrived there; older turns
    // loading above push it back down and restart the wait (issue #515). A
    // hidden tab runs no rendering updates, so a platform that loads on scroll
    // loads nothing there (measured live on ChatGPT): the top never counts while
    // hidden, and the idle deadline ends the pass as partial instead.
    const visible = document.visibilityState !== 'hidden';
    atTopSince = after <= 0 && visible ? (atTopSince ?? Date.now()) : null;
    const settled = atTopSince !== null && Date.now() - atTopSince >= topSettleMs;

    if (grew) {
      stable = 0;
    } else if (wasAtTop && visible && ++stable >= SCROLL_STABILITY_THRESHOLD && settled) {
      return { iterations, stopReason: 'complete' };
    }
  }
}
