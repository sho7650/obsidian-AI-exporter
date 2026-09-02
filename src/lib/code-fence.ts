/**
 * Markdown code fences: one sizer for the writer, one tracker for the readers.
 *
 * Issue #433: the two Turndown code-block rules emitted a hardcoded three
 * backtick fence and never looked at the code, so a conversation *about*
 * Markdown closed its own code block at the first inner fence. The two fence
 * readers (`escapeByLine()` and `scanMessageStarts()`) then compounded it with
 * a length-blind toggle that treated that inner fence as a delimiter.
 *
 * Everything here follows CommonMark 0.31.2 §4.5:
 * - a fence is a run of at least three backticks or tildes;
 * - the closing fence uses the same character and is at least as long as the
 *   opening one, and carries nothing but spaces/tabs after it;
 * - either fence may be indented by up to three spaces (four is too many);
 * - a backtick fence's info string may not contain a backtick.
 *
 * Obsidian documents the same rule for authors ("Nesting code blocks": the
 * outer block must use more fence characters than any inner block), so sizing
 * the outer fence is what makes a nested block survive the round trip.
 *
 * ADR-029.
 */

/** CommonMark §4.5: a fence is a run of at least three fence characters. */
export const MIN_FENCE_LENGTH = 3;

/** The two fence characters CommonMark permits. They cannot be mixed. */
type FenceChar = '`' | '~';

/** Both fence characters, in the order they are probed. */
const ALL_FENCE_CHARS: readonly FenceChar[] = ['`', '~'];

/**
 * A fence-capable backtick run at the start of a line, allowing the three
 * spaces of indentation CommonMark permits. Deliberately blind to the info
 * string and to trailing text: the writer sizes against *any* such run, so the
 * result is safe under both strict and lenient consumers (ADR-029).
 */
const WRITER_FENCE_RUN_PATTERN = /^ {0,3}(`{3,})/gm;

/** Leading blockquote markers (`> `, `> > `), optionally indented. */
const BLOCKQUOTE_PREFIX_PATTERN = /^(\s*>\s*)*/;

/** Characters that may not appear in a backtick info string, plus line breaks. */
const INFO_STRING_STRIP_PATTERN = /[`\r\n]/g;

/**
 * Length of the backtick fence that can safely wrap `code`: the minimum, or
 * one more than the longest fence-capable run the code contains.
 */
export function outerFenceLength(code: string): number {
  let longest = 0;
  // `exec` in a loop over a /g regex — reset first so repeated calls are pure.
  WRITER_FENCE_RUN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WRITER_FENCE_RUN_PATTERN.exec(code)) !== null) {
    longest = Math.max(longest, match[1].length);
  }
  return longest === 0 ? MIN_FENCE_LENGTH : Math.max(MIN_FENCE_LENGTH, longest + 1);
}

/**
 * Strip what CommonMark forbids in a backtick info string (a backtick would
 * end the fence line) plus line breaks, which would break the block outright.
 */
export function sanitizeInfoString(lang: string): string {
  return lang.replace(INFO_STRING_STRIP_PATTERN, '').trim();
}

/**
 * The single writer entry point: `code` wrapped in a fence no line of it can
 * close. The surrounding newlines match what the Turndown rules emitted before
 * ADR-029, so block spacing in generated notes is unchanged.
 */
export function fenceCodeBlock(code: string, lang = ''): string {
  const trimmed = code.trim();
  const fence = '`'.repeat(outerFenceLength(trimmed));
  return `\n${fence}${sanitizeInfoString(lang)}\n${trimmed}\n${fence}\n`;
}

/** The fence currently held open, or `null` when outside any fenced block. */
export type OpenFence = { readonly char: FenceChar; readonly length: number } | null;

export interface FenceScanOptions {
  /**
   * Strip leading blockquote markers before matching. `escapeByLine()` sets
   * this because a callout carries every code line behind `> `;
   * `scanMessageStarts()` does not, keeping its column-0-only policy (ADR-028).
   */
  readonly stripBlockquote?: boolean;
  /**
   * Fence characters allowed to OPEN a block. Both by default. The message
   * counter passes backticks only: it never reads its own tildes, and a stray
   * column-0 `~~~` in a note would otherwise open a block that hides every
   * message after it (ADR-029).
   */
  readonly openChars?: readonly FenceChar[];
}

export interface FenceStep {
  /** Fence state AFTER consuming the line. */
  readonly state: OpenFence;
  /** True when the line is itself an opening or closing delimiter. */
  readonly isDelimiter: boolean;
}

/** Length of the fence-character run starting at `index`, or 0 if none. */
function runLength(text: string, index: number, char: FenceChar): number {
  let end = index;
  while (end < text.length && text[end] === char) end++;
  return end - index;
}

/** Index of the first character after up to three spaces, or -1 if more. */
function fenceStart(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  return i <= 3 ? i : -1;
}

/**
 * Advance fence state by one line. Pure: the caller threads `state` through its
 * own loop and this never mutates what it is handed.
 */
export function nextFenceState(
  state: OpenFence,
  line: string,
  options: FenceScanOptions = {}
): FenceStep {
  const prepared = options.stripBlockquote ? line.replace(BLOCKQUOTE_PREFIX_PATTERN, '') : line;
  const start = fenceStart(prepared);
  if (start === -1) return { state, isDelimiter: false };

  if (state !== null) {
    // Closing: same character, at least as long, nothing but spaces/tabs after
    // it. A trailing CR is tolerated as defence in depth — a body that reaches
    // a reader as CRLF is an ordering bug (ADR-026), not a reason to lose the
    // fence and with it every message boundary that follows (ADR-028).
    const length = runLength(prepared, start, state.char);
    if (length >= state.length && /^[ \t]*\r?$/.test(prepared.slice(start + length))) {
      return { state: null, isDelimiter: true };
    }
    return { state, isDelimiter: false };
  }

  const openChars = options.openChars ?? ALL_FENCE_CHARS;
  for (const char of openChars) {
    const length = runLength(prepared, start, char);
    if (length < MIN_FENCE_LENGTH) continue;
    // CommonMark: an info string after a backtick fence may not contain a
    // backtick, so such a line is ordinary text rather than a fence.
    if (char === '`' && prepared.slice(start + length).includes('`')) continue;
    return { state: { char, length }, isDelimiter: true };
  }

  return { state, isDelimiter: false };
}
