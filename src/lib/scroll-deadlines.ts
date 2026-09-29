/**
 * Auto-scroll deadlines and stop reporting, shared by both scroll engines.
 *
 * Why a pass ended, how that is logged, and the one user-facing warning for a
 * partial pass (ADR-018, ADR-032). No DOM access.
 */

import {
  SCROLL_IDLE_TIMEOUT,
  SCROLL_MAX_TIMEOUT,
  DEFAULT_SCROLL_IDLE_TIMEOUT_SEC,
  DEFAULT_SCROLL_MAX_TIMEOUT_SEC,
} from './constants';

/** Why an auto-scroll pass ended. */
export type ScrollStopReason = 'complete' | 'idle-timeout' | 'max-timeout';

/** The two deadlines governing one auto-scroll pass, in milliseconds. */
export interface ScrollDeadlines {
  /** Give up after this long without progress. */
  readonly idleMs: number;
  /** Absolute cap on the whole pass. */
  readonly maxMs: number;
}

/** The shipped deadlines, used when a caller supplies none. */
export const DEFAULT_SCROLL_DEADLINES: ScrollDeadlines = {
  idleMs: SCROLL_IDLE_TIMEOUT,
  maxMs: SCROLL_MAX_TIMEOUT,
};

/**
 * The user's configured deadlines, in milliseconds.
 *
 * The single conversion point: settings are stored in seconds because that is
 * what the popup shows, and nothing else in the codebase has to know that.
 */
export function resolveScrollDeadlines(settings: {
  scrollIdleTimeoutSec?: number;
  scrollMaxTimeoutSec?: number;
}): ScrollDeadlines {
  return {
    idleMs: (settings.scrollIdleTimeoutSec ?? DEFAULT_SCROLL_IDLE_TIMEOUT_SEC) * 1000,
    maxMs: (settings.scrollMaxTimeoutSec ?? DEFAULT_SCROLL_MAX_TIMEOUT_SEC) * 1000,
  };
}

/**
 * Progress-aware deadline (issue #360, ADR-018; reason added in ADR-032).
 *
 * A pass keeps running while it is still making progress — callers reset
 * `lastProgressTime` on every iteration that progresses, so a genuinely long
 * conversation is never cut off mid-scroll. What counts as progress is
 * engine-specific: newly-loaded elements for Gemini's infinite-scroller, a new
 * turn *or* upward scroll movement for the virtualized engine (ADR-024).
 *
 * Returns null while the pass may continue; otherwise which deadline was
 * crossed **first**.
 *
 * Deciding by "check idle, then check the cap" would be wrong as soon as the
 * deadlines are user-set: `idleMs > maxMs` is reachable, and the naive order
 * would then blame the idle deadline for a stop the ceiling caused. Comparing
 * the two absolute instants costs one extra comparison and cannot mis-report —
 * which is the whole point, because a report the user cannot trust is what
 * made issue #449 undiagnosable.
 */
export function crossedDeadline(
  startTime: number,
  lastProgressTime: number,
  deadlines: ScrollDeadlines
): Exclude<ScrollStopReason, 'complete'> | null {
  const now = Date.now();
  const idleAt = lastProgressTime + deadlines.idleMs;
  const maxAt = startTime + deadlines.maxMs;
  if (now < idleAt && now < maxAt) return null;
  if (now >= idleAt && now >= maxAt) return idleAt <= maxAt ? 'idle-timeout' : 'max-timeout';
  return now >= idleAt ? 'idle-timeout' : 'max-timeout';
}

/** Seconds, for log and warning text: `15` not `15000`. */
function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

/**
 * The single end-of-pass summary, shared by both engines.
 *
 * Carries elapsed time and iteration count as well as the reason, so the next
 * field report needs no arithmetic to work out which deadline fired — the
 * absence of that information is why #449 took a live investigation.
 */
export function logScrollStop(
  stopReason: ScrollStopReason,
  captured: number,
  unit: 'turns' | 'elements',
  iterations: number,
  elapsedMs: number,
  deadlines: ScrollDeadlines
): void {
  const tail =
    `${captured} ${unit} after ${iterations} iterations ` +
    `(elapsed ${(elapsedMs / 1000).toFixed(1)}s, idle ${seconds(deadlines.idleMs)}s, ` +
    `cap ${seconds(deadlines.maxMs)}s)`;

  if (stopReason === 'complete') {
    console.info(`[G2O] Auto-scroll complete — ${tail}`);
    return;
  }
  const cause =
    stopReason === 'idle-timeout'
      ? `no progress for ${seconds(deadlines.idleMs)}s`
      : `reached the ${seconds(deadlines.maxMs)}s limit`;
  console.warn(`[G2O] Auto-scroll stopped: ${cause} — ${tail}`);
}

/**
 * The user-facing warning for a partial pass, or undefined when the pass
 * completed.
 *
 * Both engines route through this, replacing two byte-identical literals that
 * had already drifted apart once in wording.
 */
export function describeScrollStop(
  stopReason: ScrollStopReason,
  captured: number,
  deadlines: ScrollDeadlines = DEFAULT_SCROLL_DEADLINES
): string | undefined {
  if (stopReason === 'complete') return undefined;
  const cause =
    stopReason === 'idle-timeout'
      ? `stopped after ${seconds(deadlines.idleMs)}s with no progress`
      : `hit its ${seconds(deadlines.maxMs)}s time limit`;
  return (
    `Auto-scroll ${cause}; earlier messages may be missing ` +
    `(${captured} turns captured). Raise the auto-scroll timeouts in Settings and sync again.`
  );
}

/**
 * Wait for a specified duration
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
