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

/**
 * `content` as an inline code span nothing in it can end (DES-019 §4.3, P10):
 * the delimiter is one backtick longer than the longest run in the content,
 * padded with a space when the content starts or ends with a backtick, and the
 * span is kept on one line. A `|` beside an angle bracket is written `\|`: in a
 * GFM table row the cell split happens before code spans are parsed, so a bare
 * `|` would cut the span and leave its `<` in prose. Elsewhere `\|` shows a
 * visible backslash, an accepted cost (R2).
 */
export function wrapInlineCode(content: string): string {
  let code = content.replace(/\r?\n|\r/g, ' ');
  if (/[<>]/.test(code)) code = code.replace(/\|/g, '\\|');
  const longest = (code.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const delimiter = '`'.repeat(longest + 1);
  const padding = /^`|`$/.test(code) ? ' ' : '';
  return `${delimiter}${padding}${code}${padding}${delimiter}`;
}

/**
 * The fence currently held open, or `null` when outside any fenced block.
 * Strict mode also records the blockquote depth the fence opened at and its
 * indentation after the markers (0–3 spaces).
 */
export type OpenFence = {
  readonly char: FenceChar;
  readonly length: number;
  readonly depth?: number;
  readonly indent?: number;
} | null;

/** A line split into its blockquote markers and the text after them. */
export interface QuotePrefix {
  /** The markers exactly as written, to be kept verbatim. */
  readonly marker: string;
  readonly depth: number;
  readonly rest: string;
  /** A tab followed a `>`: how far it indents is not tracked here. */
  readonly tab: boolean;
}

/**
 * Split off blockquote markers the CommonMark way: up to three spaces, `>`,
 * then at most one space, repeated. A tab after `>` stops the split and is
 * reported, since part of it may count as indentation.
 */
export function splitBlockquotePrefix(line: string): QuotePrefix {
  let end = 0;
  let depth = 0;
  for (;;) {
    let i = end;
    while (i < line.length && i - end < 3 && line[i] === ' ') i++;
    if (line[i] !== '>') break;
    i++;
    depth++;
    if (line[i] === '\t')
      return { marker: line.slice(0, i), depth, rest: line.slice(i), tab: true };
    if (line[i] === ' ') i++;
    end = i;
  }
  return { marker: line.slice(0, end), depth, rest: line.slice(end), tab: false };
}

export interface FenceScanOptions {
  /**
   * Strip leading blockquote markers before matching. `true` strips them
   * leniently (any whitespace after `>`), which is enough for readers where
   * over-detecting a fence cannot create HTML. `'strict'` strips them the
   * CommonMark way and tracks blockquote depth and fence indentation, for
   * `escapeUserText()` (DES-019 §4.4). `scanMessageStarts()` strips nothing,
   * keeping its column-0-only policy (ADR-028).
   */
  readonly stripBlockquote?: boolean | 'strict';
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
  /**
   * Strict mode only: the line leaves it open whether the fence is still
   * open, so the caller must stop trusting fence state (DES-019 §4.4).
   */
  readonly uncertain?: boolean;
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
  if (options.stripBlockquote === 'strict') return nextStrictFenceState(state, line, options);
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

/** Leading spaces of `text`. */
function leadingSpaces(text: string): number {
  return text.length - text.trimStart().length;
}

/**
 * Strict mode (DES-019 §4.4). A fence inside a blockquote ends with the
 * blockquote, since fenced code takes no lazy continuation, so a shallower
 * line ends it and is then read at its own depth; a deeper line is code.
 *
 * Two lines are reported as uncertain while a fence is open: a tab after `>`
 * (it may or may not indent a closing delimiter), and a non-blank line
 * indented less than an indented opening fence (the fence may sit in a list
 * item that this line ends, or stay open with its real delimiter still to
 * come). The two readings disagree about later lines.
 */
/** Strict mode: whether `quote` leaves it open that the fence is still open. */
function isUncertainInFence(state: NonNullable<OpenFence>, quote: QuotePrefix): boolean {
  if (quote.tab) return true;
  return quote.rest.trim() !== '' && leadingSpaces(quote.rest) < (state.indent ?? 0);
}

function nextStrictFenceState(
  state: OpenFence,
  line: string,
  options: FenceScanOptions
): FenceStep {
  const quote = splitBlockquotePrefix(line);
  const inner = { openChars: options.openChars };
  if (state !== null) {
    const depth = state.depth ?? 0;
    if (quote.depth < depth) return nextStrictFenceState(null, line, options);
    if (quote.depth > depth) return { state, isDelimiter: false };
    if (isUncertainInFence(state, quote)) return { state, isDelimiter: false, uncertain: true };
    return nextFenceState(state, quote.rest, inner);
  }
  if (quote.tab) return { state, isDelimiter: false };
  const step = nextFenceState(null, quote.rest, inner);
  if (step.state === null) return step;
  return {
    state: { ...step.state, depth: quote.depth, indent: leadingSpaces(quote.rest) },
    isDelimiter: true,
  };
}
