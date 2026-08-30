/**
 * New-message watcher for the sync-status badge (issue #465, ADR-036).
 *
 * Answers one question: has the conversation grown past what the last sync
 * covered? On Claude and ChatGPT every turn carries a conversation-wide ordinal
 * that is monotonic and never renumbered, so an ordinal ABOVE the synced one is
 * proof of a new turn — while scrolling, which mounts and unmounts turns
 * constantly, can only ever surface ordinals at or below it.
 *
 * Platforms without such an ordinal supply no baseline, and this watcher then
 * does nothing at all: a badge that clears itself for a scroll would be worse
 * than one that lingers.
 */

import { NEW_MESSAGE_POLL_INTERVAL } from '../lib/constants';
import type { StopWatching } from './conversation-watcher';

/**
 * Start watching for a turn newer than the one a sync covered.
 *
 * `syncedWatermark` comes from the extraction itself
 * ({@link import('../lib/types').ConversationData.messageWatermark}), never
 * from a DOM read after the sync: the auto-scroll pass ends pinned at the top
 * of the conversation, where the newest turn is unmounted.
 *
 * Fires at most once, then stops polling — the badge it invalidates is gone.
 */
export function startNewMessageWatcher(params: {
  /** Ordinal the sync covered. Null/undefined disarms the watcher entirely. */
  syncedWatermark: number | null | undefined;
  /** Highest ordinal currently mounted, e.g. `extractor.getMessageWatermark()`. */
  getWatermark: () => number | null;
  /** Called once, with the ordinal that proved a new turn arrived. */
  onNewMessage: (watermark: number) => void;
  intervalMs?: number;
}): StopWatching {
  const {
    syncedWatermark,
    getWatermark,
    onNewMessage,
    intervalMs = NEW_MESSAGE_POLL_INTERVAL,
  } = params;

  if (syncedWatermark === null || syncedWatermark === undefined) {
    return () => {};
  }

  const timer = setInterval(() => {
    const watermark = readWatermark(getWatermark);
    // null marks "nothing mounted / read failed", which says nothing about
    // whether a message arrived. Equal or lower is the user scrolling.
    if (watermark === null || watermark <= syncedWatermark) return;

    clearInterval(timer);
    onNewMessage(watermark);
  }, intervalMs);

  return () => clearInterval(timer);
}

/** The current ordinal, or null when the DOM could not be read. */
function readWatermark(getWatermark: () => number | null): number | null {
  try {
    return getWatermark();
  } catch (error) {
    console.debug('[G2O] Message watermark read failed:', error);
    return null;
  }
}
