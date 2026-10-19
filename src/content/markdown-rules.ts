/**
 * Turndown HTML-to-Markdown engine with custom rules
 *
 * Configures Turndown with custom rules for code blocks, inline code,
 * footnote references, math expressions, and tables.
 */

import TurndownService from 'turndown';
import { MAX_LANG_HINT_LENGTH, MAX_MATH_LENGTH } from '../lib/constants';
import {
  fenceCodeBlock,
  nextFenceState,
  splitBlockquotePrefix,
  wrapInlineCode,
  type OpenFence,
} from '../lib/code-fence';

// ============================================================
// User text: a line-local code-span scanner (DES-019 §4.4)
// ============================================================

/**
 * Escaped in user prose: angle brackets; `$`, so pasted shell/YAML (`$VAR`,
 * `$$TMP`) does not open Obsidian math, where dozens of stray `$` blank the
 * note and hang the renderer; and backticks, so no span can pair across
 * lines. The backslash run before each becomes 2n+1: always odd (R1), and
 * the user's own backslashes still display (P11).
 */
const USER_PROSE_TARGET_PATTERN = /(\\*)([<>$`])/g;

function escapeUserProse(text: string): string {
  return text.replace(USER_PROSE_TARGET_PATTERN, '$1$1\\$2');
}

/**
 * Span content Obsidian may not render as code: a GFM table row splits cells
 * before code spans are parsed, and wikilink precedence is unverified.
 */
function isUnsafeSpan(content: string): boolean {
  return content.includes('|') || content.includes('[[') || content.includes(']]');
}

interface BacktickRun {
  readonly start: number;
  readonly length: number;
  /** Preceded by an odd backslash run, so it cannot open a span. */
  readonly escaped: boolean;
}

function backtickRuns(text: string): BacktickRun[] {
  return [...text.matchAll(/(\\*)(`+)/g)].map(match => ({
    start: match.index + match[1].length,
    length: match[2].length,
    escaped: match[1].length % 2 === 1,
  }));
}

/** For each run, the index of the next run of the same length, or -1. */
function nextSameLength(runs: BacktickRun[]): number[] {
  const next = new Array<number>(runs.length).fill(-1);
  const seen = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i--) {
    next[i] = seen.get(runs[i].length) ?? -1;
    seen.set(runs[i].length, i);
  }
  return next;
}

/**
 * Escape one line's text, keeping only code spans that open and close on it
 * and pass {@link isUnsafeSpan}. Pairing follows CommonMark within the line:
 * an unescaped run opens, the next run of the same length closes.
 */
function escapeUserLine(text: string, keepSpans: boolean): string {
  if (!keepSpans) return escapeUserProse(text);
  const runs = backtickRuns(text);
  const next = nextSameLength(runs);
  let out = '';
  let pos = 0;
  for (let i = 0; i < runs.length; i++) {
    const opener = runs[i];
    const j = opener.escaped ? -1 : next[i];
    if (j === -1) continue;
    const closer = runs[j];
    const end = closer.start + closer.length;
    if (!isUnsafeSpan(text.slice(opener.start + opener.length, closer.start))) {
      out += escapeUserProse(text.slice(pos, opener.start)) + text.slice(opener.start, end);
      pos = end;
    }
    i = j;
  }
  return out + escapeUserProse(text.slice(pos));
}

/**
 * Escape a plain-text user message. Lines inside fenced blocks stay as they
 * are; fence state is tracked the CommonMark way, blockquote depth included
 * ({@link nextFenceState} in `'strict'` mode). Every other line is scanned on
 * its own, so no span crosses a line. Once fence state is uncertain, the rest
 * of the message is escaped as prose with no span kept: inside a real fence
 * the added backslashes are literal text, outside it they are escapes, so
 * both readings are safe (R2).
 */
export function escapeUserText(text: string): string {
  let fence: OpenFence = null;
  let uncertain = false;
  return text
    .split('\n')
    .map(line => {
      if (!uncertain) {
        const step = nextFenceState(fence, line, { stripBlockquote: 'strict' });
        uncertain = step.uncertain === true;
        fence = step.state;
        if (!uncertain && (step.isDelimiter || fence !== null)) return line;
      }
      const { marker, rest } = splitBlockquotePrefix(line);
      return marker + escapeUserLine(rest, !uncertain);
    })
    .join('\n');
}

// ============================================================
// Escaping primitives (DES-019 §4.1)
// ============================================================
//
// Each escapes `\` in the same pass as its targets, so whatever the input held,
// every `<` and `>` ends up behind an odd backslash run (R1). None of them may
// run over the output of another backslash-escaper.

/**
 * Escape a plain-text fragment that is never code and has had no escaping:
 * table cells, Tool activity labels, question headers.
 */
export function escapeInlineText(text: string): string {
  return text.replace(/[\\<>]/g, '\\$&');
}

/**
 * Escape a raw `href`/`src` value as a link destination, in the shape
 * Turndown uses: `<…>` around a destination that contains a space. Turndown's
 * own escaper is not reused because it leaves existing backslashes alone, so
 * `\<` in the value would become an even run (P15).
 */
export function escapeDestination(url: string): string {
  const escaped = url.replace(/[\\<>()]/g, '\\$&');
  return escaped.includes(' ') ? `<${escaped}>` : escaped;
}

/**
 * Turndown 7.2.4's text-node escape list without its `^>` entry, in the same
 * order. A test pins it to Turndown's source. `^>` is dropped because `>` is
 * escaped everywhere below, and keeping both would put two backslashes before
 * a leading `>` (P14).
 */
export const MARKDOWN_ESCAPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\/g, '\\\\'],
  [/\*/g, '\\*'],
  [/^-/g, '\\-'],
  [/^\+ /g, '\\+ '],
  [/^(=+)/g, '\\$1'],
  [/^(#{1,6}) /g, '\\$1 '],
  [/`/g, '\\`'],
  [/^~~~/g, '\\~~~'],
  [/\[/g, '\\['],
  [/\]/g, '\\]'],
  [/_/g, '\\_'],
  [/^(\d+)\. /g, '$1\\. '],
];

/**
 * Escape a raw text node for the Turndown `escape` override (§4.2). It
 * replaces Turndown's escaper rather than wrapping it: the list doubles every
 * original backslash first, so the one backslash added before `<` and `>`
 * always leaves an odd run.
 */
export function escapeMarkdownText(text: string, escapeExtra: RegExp = /[<>]/g): string {
  const escaped = MARKDOWN_ESCAPES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  );
  return escaped.replace(escapeExtra, '\\$&');
}

// ============================================================
// Turndown Configuration
// ============================================================

/**
 * Render a page-derived LaTeX value as Markdown math, or fall back to plain
 * text when the value would degrade or break Obsidian's math rendering:
 * - longer than {@link MAX_MATH_LENGTH} (malformed/abusive input), or
 * - contains a literal `$` (breaks the `$…$` / `$$…$$` delimiters).
 *
 * Multi-line LaTeX is left intact — real KaTeX inline formulas (e.g. matrices
 * with `\\` row breaks) legitimately span lines.
 *
 * On fallback, `\`, `$` and the angle brackets are escaped in one pass, so
 * the plain text is not re-parsed as math (escaping the escape character
 * prevents a preceding `\` from pairing with an inserted one) and carries no
 * live HTML (DES-019 §4.3, P9).
 *
 * In math, `<` and `>` become `\lt ` and `\gt `, standard in both MathJax
 * (Obsidian) and KaTeX. The trailing space keeps `a<b` from becoming the
 * unknown command `\ltb`. The math then holds no angle bracket at all, so
 * safety does not depend on how Obsidian treats HTML inside math.
 */
function formatMath(latex: string, display: boolean): string {
  if (latex.length > MAX_MATH_LENGTH || latex.includes('$')) {
    const plain = latex.replace(/[\\$<>]/g, '\\$&');
    return display ? `\n${plain}\n` : plain;
  }
  const tex = latex.replace(/</g, '\\lt ').replace(/>/g, '\\gt ');
  return display ? `\n$$\n${tex}\n$$\n` : `$${tex}$`;
}

// Extract a table cell's text. Cells are serialized via textContent (inline
// Turndown rules do not run inside the custom table rule), so footnote-ref
// placeholder spans must be converted to `[^label]` here or their marker
// text would leak into the cell verbatim. For the same reason the instance
// `escape()` never sees the text, so it is escaped here (DES-019 §4.3, P6).
function tableCellText(cell: Element): string {
  if (!cell.querySelector('[data-footnote-ref]')) {
    return escapeInlineText(cell.textContent?.trim() || '');
  }
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll('[data-footnote-ref]').forEach(ref => {
    const label = ref.getAttribute('data-footnote-ref');
    ref.replaceWith(label ? `[^${label}]` : '');
  });
  return escapeInlineText(clone.textContent?.trim() || '');
}

// Custom rule for code blocks with language detection
const codeBlocksRule: TurndownService.Rule = {
  filter: node => {
    return node.nodeName === 'PRE' && node.querySelector('code') !== null;
  },
  replacement: (content, node) => {
    const codeElement = node.querySelector('code');
    if (!codeElement) return content;

    // Try to detect language from class
    const className = codeElement.className || '';
    const langMatch = className.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : '';

    const code = codeElement.textContent || '';
    return fenceCodeBlock(code, lang);
  },
};

// Custom rule for ChatGPT CodeMirror code blocks (2026-03 DOM change)
// ChatGPT replaced <pre><code> with <pre> containing a CodeMirror editor (.cm-content)
// Code is in <span> elements with <br> for line breaks; header has language + Copy/Run buttons
const codemirrorCodeBlocksRule: TurndownService.Rule = {
  filter: node => {
    return (
      node.nodeName === 'PRE' &&
      node.querySelector('code') === null &&
      node.querySelector('.cm-content') !== null
    );
  },
  replacement: (_content, el) => {
    const cmContent = el.querySelector('.cm-content');
    if (!cmContent) return _content;

    // Extract code: walk .cm-content children, <br> → newline
    let code = '';
    cmContent.childNodes.forEach(child => {
      if (child.nodeName === 'BR') {
        code += '\n';
      } else {
        code += child.textContent || '';
      }
    });

    // Extract language from header (text before cm-editor, not inside buttons)
    let lang = '';
    const buttons = el.querySelectorAll('button');
    const buttonTexts = new Set<string>();
    buttons.forEach(btn => {
      const text = btn.textContent?.trim();
      if (text) buttonTexts.add(text.toLowerCase());
    });

    // Find short text elements that aren't button text or code
    const allElements = el.querySelectorAll('div');
    for (const div of allElements) {
      if (cmContent.contains(div) || div.contains(cmContent)) continue;
      if (div.querySelector('button, .cm-content, .cm-editor')) continue;
      const text = div.textContent?.trim();
      if (text && text.length > 0 && text.length < MAX_LANG_HINT_LENGTH) {
        const lower = text.toLowerCase();
        if (!buttonTexts.has(lower)) {
          lang = lower;
          break;
        }
      }
    }

    return fenceCodeBlock(code, lang);
  },
};

// Custom rule for inline code
const inlineCodeRule: TurndownService.Rule = {
  filter: node => {
    return node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE';
  },
  // Sized by wrapInlineCode so a backtick in the code cannot end the span
  // and turn the rest into prose (DES-019 §4.3, P10).
  replacement: content => wrapInlineCode(content),
};

// Custom rule for image placeholders.
// Converts <img data-g2o-image="ID" alt="A"> to a stable placeholder link
// `![A](g2o-image://ID)`, resolved per output destination in the background
// (Obsidian embed, downloaded file, or stripped for clipboard). Emitted on its
// own paragraph so the image renders as a block, not inline with prose.
const g2oImageRule: TurndownService.Rule = {
  filter: node => {
    return node.nodeName === 'IMG' && node.hasAttribute('data-g2o-image');
  },
  replacement: (_content, el) => {
    const id = el.getAttribute('data-g2o-image');
    if (!id) return '';
    const alt = el.getAttribute('alt') ?? '';
    return `\n\n![${alt}](g2o-image://${id})\n\n`;
  },
};

/** Turndown's attribute clean-up: collapse line breaks and their indentation. */
function cleanAttribute(value: string | null): string {
  return value ? value.replace(/(\n+\s*)+/g, '\n') : '';
}

/** One pass over `\`, `"` and the brackets, for a link or image title (P12). */
function titlePart(node: Element): string {
  const title = cleanAttribute(node.getAttribute('title')).replace(/[\\"<>]/g, '\\$&');
  return title ? ` "${title}"` : '';
}

// Turndown's built-in `image` and `inlineLink` write alt and title through
// module-internal escapers that leave `<` alone, and their destination escaper
// keeps existing backslashes (P12, P15). These replace them with the same
// output shape. The image filter is the exact complement of g2oImage's, so the
// two never compete for one node.
const imagesRule: TurndownService.Rule = {
  filter: node => node.nodeName === 'IMG' && !node.hasAttribute('data-g2o-image'),
  replacement: (_content, node) => {
    const el = node as Element;
    const src = el.getAttribute('src') ?? '';
    if (!src) return '';
    const alt = cleanAttribute(el.getAttribute('alt')).replace(/[\\[\]<>]/g, '\\$&');
    return `![${alt}](${escapeDestination(src)}${titlePart(el)})`;
  },
};

// Link text is ordinary text nodes, already escaped by the instance escape().
const linksRule: TurndownService.Rule = {
  filter: node => node.nodeName === 'A' && Boolean(node.getAttribute('href')),
  replacement: (content, node) => {
    const el = node as Element;
    return `[${content}](${escapeDestination(el.getAttribute('href') ?? '')}${titlePart(el)})`;
  },
};

// Custom rule for footnote reference placeholders
// Converts <span data-footnote-ref="N">REF</span> to [^N]
const footnoteRefRule: TurndownService.Rule = {
  filter: node => {
    return node.nodeName === 'SPAN' && node.hasAttribute('data-footnote-ref');
  },
  replacement: (_content, node) => {
    const index = node.getAttribute('data-footnote-ref');
    return `[^${index}]`;
  },
};

// Custom rule for footnote definitions (NotebookLM citations)
// Converts <p data-footnote-def>[^label]: title</p> to a literal footnote
// definition line. Bypasses Turndown's default text-escaping so the
// `[^label]:` syntax survives intact.
const footnoteDefRule: TurndownService.Rule = {
  filter: node => {
    return node.nodeName === 'P' && node.hasAttribute('data-footnote-def');
  },
  replacement: (_content, node) => {
    const text = (node.textContent ?? '').trim();
    return text ? `\n\n${text}` : '';
  },
};

// Custom rule for display math blocks (Gemini KaTeX: <div data-math="...">)
const mathBlockRule: TurndownService.Rule = {
  filter: node => {
    return node.nodeName === 'DIV' && node.hasAttribute('data-math');
  },
  replacement: (_content, node) => {
    const latex = node.getAttribute('data-math');
    if (!latex) return _content;
    return formatMath(latex, true);
  },
};

// Custom rule for inline math (Gemini KaTeX: <span data-math="...">)
const mathInlineRule: TurndownService.Rule = {
  filter: node => {
    return (
      node.nodeName === 'SPAN' &&
      node.hasAttribute('data-math') &&
      !node.hasAttribute('data-footnote-ref')
    );
  },
  replacement: (_content, node) => {
    const latex = node.getAttribute('data-math');
    if (!latex) return _content;
    return formatMath(latex, false);
  },
};

// Custom rule for tables
const tablesRule: TurndownService.Rule = {
  filter: 'table',
  replacement: (content, table) => {
    const rows: string[][] = [];

    // Extract headers
    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (headerRow) {
      const headers: string[] = [];
      headerRow.querySelectorAll('th, td').forEach(cell => {
        headers.push(tableCellText(cell));
      });
      if (headers.length > 0) {
        rows.push(headers);
      }
    }

    // Extract body rows
    const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
    bodyRows.forEach(row => {
      const cells: string[] = [];
      row.querySelectorAll('td, th').forEach(cell => {
        cells.push(tableCellText(cell));
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    if (rows.length === 0) return '';

    // Build markdown table
    const lines: string[] = [];
    rows.forEach((row, index) => {
      lines.push('| ' + row.join(' | ') + ' |');
      if (index === 0) {
        // Add separator after header
        lines.push('| ' + row.map(() => '---').join(' | ') + ' |');
      }
    });

    return '\n' + lines.join('\n') + '\n';
  },
};

/**
 * Every custom rule, in registration order. Turndown's `addRule()` unshifts,
 * so when two filters match the same node the later rule wins.
 */
const CUSTOM_RULES: ReadonlyArray<readonly [string, TurndownService.Rule]> = [
  ['codeBlocks', codeBlocksRule],
  ['codemirrorCodeBlocks', codemirrorCodeBlocksRule],
  ['inlineCode', inlineCodeRule],
  ['g2oImage', g2oImageRule],
  ['images', imagesRule],
  ['links', linksRule],
  ['footnoteRef', footnoteRefRule],
  ['footnoteDef', footnoteDefRule],
  ['mathBlock', mathBlockRule],
  ['mathInline', mathInlineRule],
  ['tables', tablesRule],
];

/**
 * A Turndown instance with every custom rule, so rules are defined once for
 * both instances (DES-019 §4.2). `escapeExtra` is what the instance's
 * `escape()` adds on top of Turndown's list: Turndown calls it only for
 * non-code text nodes, so code is excluded by construction.
 */
function createTurndown(escapeExtra: RegExp): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  service.escape = text => escapeMarkdownText(text, escapeExtra);
  for (const [name, rule] of CUSTOM_RULES) service.addRule(name, rule);
  return service;
}

/** Assistant answers: angle brackets only, so KaTeX `$` survives. */
const assistantTurndown = createTurndown(/[<>]/g);
/** User prompts also escape `$`: pasted shell `$VAR` must not open math. */
const userTurndown = createTurndown(/[<>$]/g);

function cleanHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ');
}

/**
 * Convert assistant HTML to Markdown. Page text is escaped as Turndown writes
 * it, so the result needs no further escaping.
 */
export function htmlToMarkdown(html: string): string {
  return assistantTurndown.turndown(cleanHtml(html));
}

/**
 * Convert user-message HTML (Claude) to Markdown, escaped the same way plus
 * `$`. The result is final Markdown (`contentFormat: 'markdown'`), never
 * passed to {@link escapeUserText}.
 */
export function userHtmlToMarkdown(html: string): string {
  return userTurndown.turndown(cleanHtml(html));
}
