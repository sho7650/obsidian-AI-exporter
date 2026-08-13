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

/**
 * The #433 composition of the same invariant.
 *
 * Flattening strips one `> ` from every line, which MOVES a code fence out of
 * a callout and onto column 0 — precisely where `scanMessageStarts()` starts
 * honouring it. So a note whose fences only parse correctly under the
 * length-aware tracker (ADR-029) is the shape most likely to break the count
 * invariant this file exists to protect.
 */
describe('message count survives flattening when a message holds nested code', () => {
  const F3 = '`'.repeat(3);
  const F4 = '`'.repeat(4);

  /** A callout body whose 2nd message is a tall code block holding `codeLines`. */
  function buildBodyWithCode(messages: number, codeLines: readonly string[]): string {
    return Array.from({ length: messages }, (_, i) => {
      const isUser = i % 2 === 0;
      const header = isUser ? '> [!QUESTION] User' : '> [!NOTE] Claude';
      const content =
        i === 1
          ? codeLines.map(line => `> ${line}`)
          : Array.from({ length: 2 }, (_, n) => `> line ${n} of message ${i}`);
      return [header, ...content].join('\n');
    }).join('\n\n');
  }

  const CASES = [
    { name: 'nested block', lines: [`${F4}markdown`, `${F3}python`, 'print(1)', F3, F4] },
    { name: 'opening fence only', lines: [`${F4}markdown`, 'start with:', `${F3}md`, F4] },
    {
      name: 'message-shaped lines inside the inner block',
      lines: [`${F4}markdown`, `${F3}md`, '**User:**', '**Claude:**', F3, F4],
    },
  ] as const;

  it.each(CASES)('$name: count is unchanged by flattening', ({ lines }) => {
    const total = 8;
    const body = buildBodyWithCode(total, lines);
    expect(countExistingMessages(body)).toBe(total);

    for (const threshold of [2, 4, 50]) {
      expect(countExistingMessages(flattenLargeCallouts(body, threshold))).toBe(total);
    }
  });

  it.each(CASES)('$name: counting and tail extraction still agree', ({ lines }) => {
    const onDisk = flattenLargeCallouts(buildBodyWithCode(8, lines), 4);
    const count = countExistingMessages(onDisk);

    for (let skip = 1; skip < count; skip++) {
      expect(countExistingMessages(extractTailMessages(onDisk, skip))).toBe(count - skip);
    }
  });
});
