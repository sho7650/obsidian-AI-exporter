/**
 * The guard that stops a partial capture from replacing a complete note
 * (issue #449, ADR-033).
 *
 * The reported sync captured 27 of 446 messages because auto-scroll stopped
 * early. Append mode happened to be on, so `newTotal <= existingCount`
 * discarded it — but append mode is OFF by default, and on that path the note
 * carries the same conversation id, resolves to the same filename, and is
 * written: 446 messages replaced by 27, with nothing said.
 *
 * Every unknown fails OPEN. The guard exists to prevent a proven regression,
 * not to police uncertainty: a user with `includeMessageCount` off has no
 * count in their notes and must still be able to save.
 */
import { describe, it, expect } from 'vitest';
import { evaluateTruncationGuard } from '../../src/lib/truncation-guard';

describe('evaluateTruncationGuard', () => {
  it('blocks the reported case: a truncated capture with fewer messages', () => {
    const verdict = evaluateTruncationGuard({
      truncated: true,
      incomingCount: 27,
      existingCount: 446,
    });

    expect(verdict.blocked).toBe(true);
    if (verdict.blocked) {
      expect(verdict.existingCount).toBe(446);
      expect(verdict.incomingCount).toBe(27);
    }
  });

  it('allows a complete capture even when the count dropped', () => {
    // Deleting messages, or forking a thread on an edited message, legitimately
    // shortens a conversation. Blocking it would leave the extension unable to
    // reflect the new state with no way to override.
    const verdict = evaluateTruncationGuard({
      truncated: false,
      incomingCount: 27,
      existingCount: 446,
    });

    expect(verdict.blocked).toBe(false);
    if (!verdict.blocked) {
      expect(verdict.countDropped).toBe(true);
    }
  });

  it('allows a truncated capture that still has at least as many messages', () => {
    expect(
      evaluateTruncationGuard({ truncated: true, incomingCount: 446, existingCount: 446 }).blocked
    ).toBe(false);
    expect(
      evaluateTruncationGuard({ truncated: true, incomingCount: 500, existingCount: 446 }).blocked
    ).toBe(false);
  });

  it('fails open when the existing note has no message count', () => {
    // includeMessageCount is a user setting; its absence is not evidence.
    expect(
      evaluateTruncationGuard({ truncated: true, incomingCount: 27, existingCount: undefined })
        .blocked
    ).toBe(false);
  });

  it('fails open on a count that is not a usable number', () => {
    for (const bad of [Number.NaN, -1, 0]) {
      expect(
        evaluateTruncationGuard({ truncated: true, incomingCount: 27, existingCount: bad }).blocked
      ).toBe(false);
    }
  });

  it('reports no drop when the conversation grew', () => {
    const verdict = evaluateTruncationGuard({
      truncated: false,
      incomingCount: 500,
      existingCount: 446,
    });

    expect(verdict.blocked).toBe(false);
    if (!verdict.blocked) {
      expect(verdict.countDropped).toBe(false);
    }
  });
});
