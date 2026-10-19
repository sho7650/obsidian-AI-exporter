/**
 * Turndown HTML-to-Markdown engine with custom rules
 *
 * Configures Turndown with custom rules for code blocks, inline code,
 * footnote references, math expressions, and tables.
 */

import TurndownService from 'turndown';
import { MAX_LANG_HINT_LENGTH, MAX_MATH_LENGTH } from '../lib/constants';
import { fenceCodeBlock, nextFenceState, wrapInlineCode, type OpenFence } from '../lib/code-fence';

/** Leading blockquote prefix (one or more `> ` markers) to preserve as-is. */
const BLOCKQUOTE_PREFIX_PATTERN = /^(\s*>\s*)+/;
/** Inline code segments — capture group means odd split indices are code. */
const INLINE_CODE_SPLIT_PATTERN = /(`[^`]+`)/;
/**
 * Angle brackets plus `$`. Used for user text so pasted shell/YAML (`$VAR`,
 * `$$TMP`) is not parsed by Obsidian as `$...$` / `$$...$$` math — dozens of
 * stray `$` otherwise create giant "math" spans that blank the note and hang
 * the KaTeX/MathJax renderer.
 */
const ANGLE_BRACKET_DOLLAR_PATTERN = /\\[<>]|[<>$]/g;

/**
 * Escape special characters in a single line of Markdown text, preserving
 * blockquote markers and inline code segments. `pattern` selects which
 * characters are escaped.
 */
function escapeSpecialCharsInLine(line: string, pattern: RegExp): string {
  // 1. Extract blockquote prefix (preserve as-is)
  const bqMatch = line.match(BLOCKQUOTE_PREFIX_PATTERN);
  const prefix = bqMatch ? bqMatch[0] : '';
  const rest = line.slice(prefix.length);

  // 2. Split by inline code segments (capture group → odd indices are code)
  const parts = rest.split(INLINE_CODE_SPLIT_PATTERN);

  // 3. Escape target characters in non-code segments.
  //    Also handle \< and \> (backslash+angle) to prevent incomplete escaping (CodeQL js/incomplete-sanitization).
  const escaped = parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // inline code — preserve
      return part.replace(pattern, match => {
        if (match.length === 2) {
          // \< or \> → escaped backslash + escaped angle bracket
          return '\\\\' + '\\' + match[1];
        }
        return '\\' + match;
      });
    })
    .join('');

  return prefix + escaped;
}

/**
 * Escape target characters across Markdown text, skipping fenced code blocks
 * (where the characters are already literal in Obsidian).
 *
 * Fence state comes from {@link nextFenceState}, which is length- and
 * character-aware: an inner fence inside a longer block is content, not a
 * delimiter. A length-blind toggle used to lose track there and write escaped
 * `\<div\>` into the middle of a code block (issue #433, ADR-029).
 *
 * Both fence characters open a block here — a user may paste a tilde-fenced
 * block, and its contents deserve the same protection.
 */
function escapeByLine(text: string, pattern: RegExp): string {
  const lines = text.split('\n');
  // Delimiters may sit inside a blockquote (`> ```), so markers are stripped
  // before matching.
  let fence: OpenFence = null;

  const result = lines.map(line => {
    const step = nextFenceState(fence, line, { stripBlockquote: true });
    fence = step.state;
    if (step.isDelimiter || fence !== null) return line;

    return escapeSpecialCharsInLine(line, pattern);
  });

  return result.join('\n');
}

/**
 * Escape user-message text for safe Obsidian rendering: angle brackets AND
 * `$`. User prompts are plain text that frequently contains pasted shell/YAML
 * `$`, which must not be interpreted as math. Fenced/inline code is preserved.
 */
export function escapeUserText(text: string): string {
  return escapeByLine(text, ANGLE_BRACKET_DOLLAR_PATTERN);
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
