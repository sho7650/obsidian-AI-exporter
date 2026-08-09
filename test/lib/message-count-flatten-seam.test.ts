/**
 * Fitness function for the writer ⇄ reader seam behind issue #406.
 *
 * `flattenLargeCallouts()` rewrites what a saved note looks like;
 * `countExistingMessages()` is the only thing that decides how much of a note
 * append mode believes is already there. If the rewrite changes the count, an
 * append duplicates exactly that many messages. The invariant is therefore:
 *
 *   flattening must never change the message count.
 *
 * These tests cover the seam itself. The absence of any test here is what let
 * #406 ship — both modules were individually well covered (ADR-028).
 */
import { describe, it, expect } from 'vitest';
import { countExistingMessages, extractTailMessages } from '../../src/lib/message-counter';
import { flattenLargeCallouts } from '../../src/lib/callout-flatten';

/** Build a `messages`-long callout body; every `longEvery`-th message is tall. */
function buildBody(messages: number, longEvery: number, longLines = 40): string {
  return Array.from({ length: messages }, (_, i) => {
    const isUser = i % 2 === 0;
    const header = isUser ? '> [!QUESTION] User' : '> [!NOTE] Claude';
    const lines = i > 0 && i % longEvery === 0 ? longLines : 2;
    const content = Array.from({ length: lines }, (_, n) => `> line ${n} of message ${i}`);
    return [header, ...content].join('\n');
  }).join('\n\n');
}

describe('message count survives callout flattening (issue #406)', () => {
  const body = buildBody(20, 3);
  const total = 20;

  it('the unflattened body counts as written', () => {
    expect(countExistingMessages(body)).toBe(total);
  });

  it.each([
    { threshold: 3, label: 'flattens nearly everything' },
    { threshold: 10, label: 'flattens only the tall messages' },
    { threshold: 41, label: 'flattens nothing' },
  ])('count is unchanged at maxCalloutLines=$threshold ($label)', ({ threshold }) => {
    expect(countExistingMessages(flattenLargeCallouts(body, threshold))).toBe(total);
  });

  it('a mixed note does not make append mode re-append its tail', () => {
    // The exact #406 shape: nothing new to say, yet the count disagrees.
    const onDisk = flattenLargeCallouts(body, 10);
    const existingCount = countExistingMessages(onDisk);
    const newTotal = total;

    expect(existingCount).toBe(newTotal);
    // buildAppendContent()'s step 3 guard must hold, so no tail is extracted.
    expect(newTotal <= existingCount).toBe(true);
  });

  it('counting and tail extraction agree on where each message starts', () => {
    // The two must index the same messages; if they drift, append writes from
    // the wrong offset even when the count itself is right.
    const onDisk = flattenLargeCallouts(body, 10);
    const count = countExistingMessages(onDisk);

    for (let skip = 1; skip < count; skip++) {
      const tail = extractTailMessages(onDisk, skip);
      expect(countExistingMessages(tail)).toBe(count - skip);
    }
  });
});
