/**
 * Refuse to replace a complete note with a partial capture (ADR-033).
 *
 * Issue #449: auto-scroll stopped after 27 of a conversation's 446 messages.
 * Append mode discarded the result via its `newTotal <= existingCount` guard,
 * but append mode is **off by default** — and on the fresh-save path the note
 * carries the same conversation id, resolves to the same filename, and is
 * written. 446 messages would have been replaced by 27, silently.
 *
 * Kept pure and separate from the save path so the policy can be read, tested
 * and argued about on its own.
 */

export interface TruncationGuardInput {
  /** The extraction stopped before reaching the top of the conversation. */
  truncated: boolean;
  /** Messages in the note about to be written. */
  incomingCount: number;
  /** `message_count` read from the note already on disk, when it had one. */
  existingCount?: number;
}

export type TruncationVerdict =
  | { blocked: false; countDropped: boolean }
  | { blocked: true; existingCount: number; incomingCount: number };

/** True for a count we can actually compare against. */
function isUsableCount(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Decide whether this write may proceed.
 *
 * Blocks only when all of: the capture was truncated, the existing note has a
 * usable count, and that count is strictly greater than what we are about to
 * write. **Every unknown fails open** — a user with `includeMessageCount`
 * turned off has no count in their notes, and refusing to save for them would
 * be policing uncertainty rather than preventing a proven regression.
 *
 * A count that dropped WITHOUT truncation is reported but not blocked:
 * deleting messages, or forking a thread on an edited message, legitimately
 * shortens a conversation, and blocking that would leave the extension unable
 * to reflect the new state with no way to override it.
 */
export function evaluateTruncationGuard(input: TruncationGuardInput): TruncationVerdict {
  const { truncated, incomingCount, existingCount } = input;

  if (!isUsableCount(existingCount)) {
    return { blocked: false, countDropped: false };
  }

  const countDropped = incomingCount < existingCount;
  if (truncated && countDropped) {
    return { blocked: true, existingCount, incomingCount };
  }
  return { blocked: false, countDropped };
}
