/**
 * Sync status model for the persistent status badge (issue #458, ADR-034).
 *
 * DOM-free on purpose: `ui.ts` renders whatever this module decides, so the
 * decision of "did the sync succeed" lives in exactly one place and cannot
 * drift from what the toast says.
 */

import type { MultiOutputResponse, OutputResult } from '../lib/types';

/** How the last sync ended. */
export type SyncStatusKind = 'success' | 'partial' | 'error';

/**
 * The result of the **last** sync attempt.
 *
 * Deliberately NOT "is this conversation up to date": new messages added after
 * a sync do not clear the badge (Phase 3 of the #458 plan was not implemented),
 * so the UI must present this as a point-in-time record and always show `at`.
 */
export interface SyncStatus {
  readonly kind: SyncStatusKind;
  /** When the sync finished. */
  readonly at: Date;
  /**
   * `getConversationId()` at sync time — null when the platform could not
   * derive one (e.g. a brand-new chat that has no id yet).
   */
  readonly conversationKey: string | null;
  /** Name the note was actually saved under, when a destination reported one. */
  readonly fileName?: string;
  readonly results: readonly OutputResult[];
  readonly warnings: readonly string[];
  /** Append mode only: how many messages were added. */
  readonly messagesAppended?: number;
  /**
   * Why the sync failed before any destination ran (unreachable Obsidian,
   * extraction failure). `results` is empty in that case, so without this the
   * badge would say "failed" and show nothing about what went wrong.
   */
  readonly error?: string;
}

/**
 * Build the badge status from a save result.
 *
 * The three-way split mirrors `displaySaveResults()` exactly — all succeeded /
 * some succeeded / none succeeded — because a badge that disagrees with the
 * toast it appears next to is worse than no badge.
 */
export function buildSyncStatus(params: {
  saveResult: MultiOutputResponse;
  fileName: string;
  warnings?: readonly string[];
  conversationKey: string | null;
  at: Date;
}): SyncStatus {
  const { saveResult, fileName, warnings = [], conversationKey, at } = params;

  // `allSuccessful` is vacuously true for an empty result set, so anySuccessful
  // is checked first: nothing ran means nothing succeeded.
  const kind: SyncStatusKind = !saveResult.anySuccessful
    ? 'error'
    : saveResult.allSuccessful
      ? 'success'
      : 'partial';

  const savedAs = saveResult.results.find(r => r.savedAs)?.savedAs;
  const destinationWarnings = saveResult.results
    .map(r => r.warning)
    .filter((w): w is string => Boolean(w));

  return {
    kind,
    at,
    conversationKey,
    fileName: savedAs ?? fileName,
    results: saveResult.results,
    warnings: [...destinationWarnings, ...warnings],
    ...(saveResult.messagesAppended === undefined
      ? {}
      : { messagesAppended: saveResult.messagesAppended }),
  };
}

/**
 * Build the badge status for a sync that failed before any destination ran.
 *
 * These are the failures a user who looked away most needs to still see —
 * "Obsidian is not running" is invisible once its six-second toast expires.
 */
export function buildFailedSyncStatus(params: {
  error: string;
  conversationKey: string | null;
  at: Date;
}): SyncStatus {
  return {
    kind: 'error',
    at: params.at,
    conversationKey: params.conversationKey,
    results: [],
    warnings: [],
    error: params.error,
  };
}

/**
 * Whether a status describes a conversation the user has since navigated away
 * from. A stale status must be cleared: showing another conversation's result
 * is not merely unhelpful, it is wrong.
 */
export function isStale(status: SyncStatus, currentConversationKey: string | null): boolean {
  return status.conversationKey !== currentConversationKey;
}

/** How old a status is, as a message key plus its numeric substitution. */
export interface StatusAge {
  readonly key: 'age_justNow' | 'age_minutes' | 'age_hours' | 'age_days';
  readonly value: number;
}

/**
 * Describe how long ago a sync happened.
 *
 * The badge deliberately does not claim the conversation is up to date — new
 * messages do not clear it — so the detail panel always states the age and the
 * user can judge for themselves.
 */
export function describeAge(at: Date, now: Date): StatusAge {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);

  // A negative age means the clock moved backwards, not that the sync is in
  // the future; "just now" is the only honest thing to say about it.
  if (minutes < 1) return { key: 'age_justNow', value: 0 };
  if (minutes < 60) return { key: 'age_minutes', value: minutes };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'age_hours', value: hours };

  return { key: 'age_days', value: Math.floor(hours / 24) };
}
