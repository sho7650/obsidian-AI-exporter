/**
 * Final HTML gate for note bodies (DES-019 §4.0, ADR-044).
 *
 * Page-derived text must never become live HTML in a note, and per-path
 * escaping alone kept missing paths. So every body the extension produces is
 * parsed once more, right before it is sent, and any line the parser reads as
 * raw HTML gets its `<` escaped. Per-path escaping stays as the fidelity layer:
 * when it is right, this gate finds nothing and returns the body unchanged.
 */
import MarkdownIt, { type PluginSimple } from 'markdown-it';
import footnote from 'markdown-it-footnote';

type LineRange = [start: number, end: number];
type Token = ReturnType<MarkdownIt['parse']>[number];

interface GateEnv {
  ranges: LineRange[];
  /** Fenced and indented code: left alone by the fail-closed pass. */
  code: LineRange[];
  /** HTML blocks: the only tokens that can run on across a blank line (types 1–5). */
  blocks: LineRange[];
  /** A raw-HTML token whose lines could not be determined. */
  unlocatable: boolean;
  footnotes?: { list?: Array<{ tokens?: Token[] }> };
}

function isHtml(token: Token): boolean {
  return token.type === 'html_inline' || token.type === 'html_block';
}

interface InlineScan {
  /** The inline token renders raw HTML, directly or through a footnote. */
  html: boolean;
  /** A footnote reference leads back to a footnote still being followed. */
  cycle: boolean;
}

/**
 * Walk an inline token's descendants and the inline footnotes they reference,
 * through footnotes nested in footnotes. Descendants, not just children: a
 * footnote written in an image alt is a child of the image token, and still
 * renders as a footnote.
 *
 * A cycle means content was lost: markdown-it-footnote 4.0.0 drops a nested
 * inline footnote's content and leaves the outer footnote referencing itself.
 * Only a return to a footnote on the current path counts, so one footnote
 * referenced twice in a paragraph is not a cycle.
 */
function scanInline(token: Token, env: GateEnv): InlineScan {
  const footnotes = env.footnotes?.list ?? [];
  const following = new Set<number>();
  let cycle = false;
  const followsToHtml = (ref: Token): boolean => {
    const id = ref.meta?.id as number;
    if (following.has(id)) {
      cycle = true;
      return false;
    }
    following.add(id);
    const found = carries(footnotes[id]?.tokens);
    following.delete(id);
    return found;
  };
  const carries = (tokens: Token[] | null | undefined): boolean =>
    (tokens ?? []).some(
      child =>
        isHtml(child) ||
        (child.type === 'footnote_ref' && followsToHtml(child)) ||
        carries(child.children)
    );
  const html = carries(token.children);
  return { html, cycle };
}

/**
 * Record the line range of every raw-HTML token. A token without a map takes
 * the range of its nearest enclosing block; with neither it is unlocatable.
 */
function collectHtmlRanges(tokens: Token[], env: GateEnv): void {
  const enclosing: Array<LineRange | null> = [];
  const record = (map: LineRange | null): void => {
    let range = map;
    for (let i = enclosing.length - 1; range === null && i >= 0; i--) range = enclosing[i];
    if (range) env.ranges.push([range[0], range[1]]);
    else env.unlocatable = true;
  };
  for (const token of tokens) {
    if (token.nesting === 1) enclosing.push(token.map as LineRange | null);
    if (token.nesting === -1) enclosing.pop();
    if ((token.type === 'fence' || token.type === 'code_block') && token.map) {
      env.code.push([token.map[0], token.map[1]]);
    }
    if (token.type === 'html_block') {
      record(token.map as LineRange | null);
      if (token.map) env.blocks.push([token.map[0], token.map[1]]);
    }
    if (token.type === 'inline') {
      const scan = scanInline(token, env);
      // Lost content cannot be located, so it takes the unlocatable path.
      if (scan.cycle) env.unlocatable = true;
      if (scan.html) record(token.map as LineRange | null);
    }
  }
}

// The footnote plugin is required: without it `[^1]: …` is a link reference
// definition, never inline-parsed, so HTML in it would be invisible here while
// Obsidian renders it. Collection runs just before the plugin's `footnote_tail`
// rule, which rewrites the stream: it drops unreferenced definitions (Obsidian
// still renders them) and moves inline footnote content into tokens with no
// line map, which are located through the `footnote_ref` that points at them.
//
// The cast is type-only: @types/markdown-it-footnote declares its parameter
// with the CommonJS declarations of @types/markdown-it, which TypeScript treats
// as a different type from the ESM ones imported here. The runtime object is
// the same.
const parser = new MarkdownIt({ html: true }).use(footnote as unknown as PluginSimple);
parser.core.ruler.before('footnote_tail', 'g2o_html_ranges', state => {
  collectHtmlRanges(state.tokens, state.env as GateEnv);
});

function scan(body: string): GateEnv {
  const env: GateEnv = { ranges: [], code: [], blocks: [], unlocatable: false };
  parser.parse(body, env);
  return env;
}

// `(?<!\\)` starts a match only where a backslash run begins. Without it, a
// long run that no `<` follows is rescanned from every position inside it,
// which is quadratic (64K backslashes took seconds).

/**
 * Escape every `<` whose preceding backslash run is even (zero included).
 * An odd run already escapes it, so existing escapes are kept as they are and
 * each `<` gains at most one backslash however often this runs.
 */
function repairLine(line: string): string {
  return line.replace(/(?<!\\)(\\*)</g, (match, run: string) =>
    run.length % 2 === 0 ? `${run}\\<` : match
  );
}

/**
 * Raw HTML and autolinks both start with a `<` that is not backslash-escaped,
 * so a body without one cannot carry live HTML and needs no parse. This is the
 * common case once per-path escaping has run, and it keeps markdown-it, whose
 * memory grows with token count (DES-019 §9), off most saves.
 */
function hasUnescapedLessThan(body: string): boolean {
  for (const [, run] of body.matchAll(/(?<!\\)(\\*)</g)) {
    if (run.length % 2 === 0) return true;
  }
  return false;
}

/** Re-parse after each repair; a repair can uncover HTML the previous parse hid. */
const MAX_ITERATIONS = 3;

/**
 * One flag per line, set for every line in `ranges` from `from` on. Built in a
 * single sweep so a body with one range per paragraph stays linear.
 */
function lineMask(lineCount: number, ranges: LineRange[], from = 0): Uint8Array {
  const mask = new Uint8Array(lineCount);
  for (const [start, end] of ranges) mask.fill(1, Math.max(start, from), Math.min(end, lineCount));
  return mask;
}

// markdown-it counts a lone CR and CRLF as line breaks, like LF, so every line
// number it reports is in these terms. Splitting on LF alone would put a
// repair on the wrong line.
const LINE_BREAK = /\r\n?|\n/;

/** Lines as markdown-it numbers them; `repairFromLine` is counted the same way. */
export function countLines(text: string): number {
  return text.split(LINE_BREAK).length;
}

function repairLines(body: string, select: (lineCount: number) => Uint8Array): string {
  // A capturing split keeps each line break, at the odd indices, as it was.
  const parts = body.split(new RegExp(`(${LINE_BREAK.source})`));
  const mask = select((parts.length + 1) / 2);
  return parts.map((part, i) => (i % 2 === 0 && mask[i / 2] ? repairLine(part) : part)).join('');
}

function countChangedLines(before: string, after: string): number {
  const old = before.split(LINE_BREAK);
  return after.split(LINE_BREAK).filter((line, i) => line !== old[i]).length;
}

/** True unless a parse of `body` finds no raw HTML and nothing it cannot place. */
function mayCarryHtml(body: string): boolean {
  try {
    const { ranges, unlocatable } = scan(body);
    return unlocatable || ranges.length > 0;
  } catch {
    return true;
  }
}

/**
 * Last resort when the parse cannot be trusted to have found everything:
 * escape every line outside code. With no earlier context on a full save, no
 * HTML block can reach these lines from outside, so line-level escaping is
 * enough. Callout headers survive because they contain no `<`.
 *
 * Escaping can itself re-pair fences, so a line that was code becomes raw
 * HTML. The result is therefore checked, and if it may still carry HTML every
 * line is escaped, code included: with every `<` behind an odd backslash run,
 * no block structure can start raw HTML.
 */
function failClosed(body: string): string {
  let code: LineRange[] = [];
  try {
    code = scan(body).code;
  } catch {
    // Unparseable: escape every line.
  }
  const outsideCode = repairLines(body, n => lineMask(n, code).map(inCode => 1 - inCode));
  if (!mayCarryHtml(outsideCode)) return outsideCode;
  return repairLines(outsideCode, n => new Uint8Array(n).fill(1));
}

export interface GateOptions {
  /**
   * First line the gate may change. Earlier lines are the user's existing note
   * on the append path: parsed for context, never rewritten. Default 0.
   */
  repairFromLine?: number;
}

/**
 * Neutralise every line that parses as raw HTML by escaping its `<`.
 *
 * Returns `null` only on the append path (`repairFromLine` > 0) when safety
 * cannot be had without changing an existing line: an HTML block from the
 * existing body runs into the new lines (backslashes are inert inside it), or
 * the parse cannot be trusted (it threw, did not settle, or found HTML it
 * cannot place). The caller then refuses the append.
 */
export function neutralizeLiveHtml(body: string): string;
export function neutralizeLiveHtml(body: string, options: GateOptions): string | null;
export function neutralizeLiveHtml(body: string, options: GateOptions = {}): string | null {
  if (!hasUnescapedLessThan(body)) return body;
  const from = options.repairFromLine ?? 0;
  let current = body;
  let iterations = 0;
  let closed = true;
  try {
    for (; iterations <= MAX_ITERATIONS; iterations++) {
      const { ranges, blocks, unlocatable } = scan(current);
      if (unlocatable) break;
      if (blocks.some(([start, end]) => start < from && end > from)) return null;
      const tail = ranges.filter(([, end]) => end > from);
      if (tail.length === 0) {
        closed = false;
        break;
      }
      if (iterations === MAX_ITERATIONS) break;
      const next = repairLines(current, n => lineMask(n, tail, from));
      if (next === current) {
        // Every `<` on the repairable lines is already escaped. A token that
        // starts on an earlier line is the user's own text running into the
        // new lines, and on the append path only an HTML block (refused
        // above) can do that across the blank separator. Any other token
        // still reported means its range was wrong: fail closed.
        closed = tail.some(([start]) => start >= from);
        break;
      }
      current = next;
    }
  } catch {
    // A parser failure must not let the body through unchecked.
  }
  if (closed) {
    // Repairing new lines alone cannot rule out an existing HTML block
    // reaching them, so an append that cannot be checked is refused.
    if (from > 0) return null;
    current = failClosed(current);
  }
  if (current !== body) {
    console.warn('[G2O Background] html gate neutralised', {
      lines: countChangedLines(body, current),
      iterations,
      failClosed: closed,
    });
  }
  return current;
}
