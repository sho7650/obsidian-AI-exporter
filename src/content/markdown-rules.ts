/**
 * Turndown HTML-to-Markdown engine with custom rules
 *
 * Configures Turndown with custom rules for code blocks, inline code,
 * footnote references, math expressions, and tables.
 */

import TurndownService from 'turndown';
import { MAX_LANG_HINT_LENGTH, MAX_MATH_LENGTH } from '../lib/constants';

/** Leading blockquote prefix (one or more `> ` markers) to preserve as-is. */
const BLOCKQUOTE_PREFIX_PATTERN = /^(\s*>\s*)+/;
/** Inline code segments — capture group means odd split indices are code. */
const INLINE_CODE_SPLIT_PATTERN = /(`[^`]+`)/;
/** Angle brackets, including backslash-escaped forms (`\<`, `\>`). */
const ANGLE_BRACKET_PATTERN = /\\[<>]|[<>]/g;
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
 */
function escapeByLine(text: string, pattern: RegExp): string {
  const lines = text.split('\n');
  let inFencedBlock = false;

  const result = lines.map(line => {
    // Detect fenced code delimiter (may be inside a blockquote)
    const stripped = line.replace(/^(\s*>\s*)*/, '');
    if (/^`{3,}/.test(stripped)) {
      inFencedBlock = !inFencedBlock;
      return line;
    }

    if (inFencedBlock) return line;

    return escapeSpecialCharsInLine(line, pattern);
  });

  return result.join('\n');
}

/**
 * Escape angle brackets in Markdown text for safe Obsidian rendering.
 * Preserves brackets inside fenced code blocks, inline code, and
 * blockquote markers. Leaves `$` untouched so assistant KaTeX math survives.
 *
 * CommonMark §2.4: \< and \> are valid backslash escapes.
 */
export function escapeAngleBrackets(text: string): string {
  return escapeByLine(text, ANGLE_BRACKET_PATTERN);
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
// Turndown Configuration
// ============================================================

// Initialize Turndown with custom rules
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// Custom rule for code blocks with language detection
turndown.addRule('codeBlocks', {
  filter: node => {
    return node.nodeName === 'PRE' && node.querySelector('code') !== null;
  },
  replacement: (content, node) => {
    const codeElement = (node as HTMLElement).querySelector('code');
    if (!codeElement) return content;

    // Try to detect language from class
    const className = codeElement.className || '';
    const langMatch = className.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : '';

    const code = codeElement.textContent || '';
    return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
  },
});

// Custom rule for ChatGPT CodeMirror code blocks (2026-03 DOM change)
// ChatGPT replaced <pre><code> with <pre> containing a CodeMirror editor (.cm-content)
// Code is in <span> elements with <br> for line breaks; header has language + Copy/Run buttons
turndown.addRule('codemirrorCodeBlocks', {
  filter: node => {
    return (
      node.nodeName === 'PRE' &&
      node.querySelector('code') === null &&
      node.querySelector('.cm-content') !== null
    );
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
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

    return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
  },
});

// Custom rule for inline code
turndown.addRule('inlineCode', {
  filter: node => {
    return node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE';
  },
  replacement: content => {
    return `\`${content}\``;
  },
});

// Custom rule for image placeholders.
// Converts <img data-g2o-image="ID" alt="A"> to a stable placeholder link
// `![A](g2o-image://ID)`, resolved per output destination in the background
// (Obsidian embed, downloaded file, or stripped for clipboard). Emitted on its
// own paragraph so the image renders as a block, not inline with prose.
turndown.addRule('g2oImage', {
  filter: node => {
    return node.nodeName === 'IMG' && (node as HTMLElement).hasAttribute('data-g2o-image');
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const id = el.getAttribute('data-g2o-image');
    if (!id) return '';
    const alt = el.getAttribute('alt') ?? '';
    return `\n\n![${alt}](g2o-image://${id})\n\n`;
  },
});

// Custom rule for footnote reference placeholders
// Converts <span data-footnote-ref="N">REF</span> to [^N]
turndown.addRule('footnoteRef', {
  filter: node => {
    return node.nodeName === 'SPAN' && (node as HTMLElement).hasAttribute('data-footnote-ref');
  },
  replacement: (_content, node) => {
    const index = (node as HTMLElement).getAttribute('data-footnote-ref');
    return `[^${index}]`;
  },
});

// Custom rule for footnote definitions (NotebookLM citations)
// Converts <p data-footnote-def>[^label]: title</p> to a literal footnote
// definition line. Bypasses Turndown's default text-escaping so the
// `[^label]:` syntax survives intact.
turndown.addRule('footnoteDef', {
  filter: node => {
    return node.nodeName === 'P' && (node as HTMLElement).hasAttribute('data-footnote-def');
  },
  replacement: (_content, node) => {
    const text = (node.textContent ?? '').trim();
    return text ? `\n\n${text}` : '';
  },
});

/**
 * Render a page-derived LaTeX value as Markdown math, or fall back to plain
 * text when the value would degrade or break Obsidian's math rendering:
 * - longer than {@link MAX_MATH_LENGTH} (malformed/abusive input), or
 * - contains a literal `$` (breaks the `$…$` / `$$…$$` delimiters).
 *
 * Multi-line LaTeX is left intact — real KaTeX inline formulas (e.g. matrices
 * with `\\` row breaks) legitimately span lines.
 *
 * On fallback, backslashes are escaped first, then `$` → `\$`, so the plain
 * text is not re-parsed as math (escaping the escape character prevents a
 * preceding `\` from pairing with the inserted one and re-opening a delimiter).
 */
function formatMath(latex: string, display: boolean): string {
  if (latex.length > MAX_MATH_LENGTH || latex.includes('$')) {
    const plain = latex.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
    return display ? `\n${plain}\n` : plain;
  }
  return display ? `\n$$\n${latex}\n$$\n` : `$${latex}$`;
}

// Custom rule for display math blocks (Gemini KaTeX: <div data-math="...">)
turndown.addRule('mathBlock', {
  filter: node => {
    return node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-math');
  },
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-math');
    if (!latex) return _content;
    return formatMath(latex, true);
  },
});

// Custom rule for inline math (Gemini KaTeX: <span data-math="...">)
turndown.addRule('mathInline', {
  filter: node => {
    return (
      node.nodeName === 'SPAN' &&
      (node as HTMLElement).hasAttribute('data-math') &&
      !(node as HTMLElement).hasAttribute('data-footnote-ref')
    );
  },
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-math');
    if (!latex) return _content;
    return formatMath(latex, false);
  },
});

// Extract a table cell's text. Cells are serialized via textContent (inline
// Turndown rules do not run inside the custom table rule), so footnote-ref
// placeholder spans must be converted to `[^label]` here or their marker
// text would leak into the cell verbatim.
function tableCellText(cell: Element): string {
  if (!cell.querySelector('[data-footnote-ref]')) {
    return cell.textContent?.trim() || '';
  }
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll('[data-footnote-ref]').forEach(ref => {
    const label = ref.getAttribute('data-footnote-ref');
    ref.replaceWith(label ? `[^${label}]` : '');
  });
  return clone.textContent?.trim() || '';
}

// Custom rule for tables
turndown.addRule('tables', {
  filter: 'table',
  replacement: (content, node) => {
    const table = node as HTMLTableElement;
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
});

/**
 * Convert HTML content to Markdown without escaping angle brackets.
 *
 * Use this when the caller will apply {@link escapeAngleBrackets} later
 * (e.g. via {@link formatMessage} in markdown-formatting.ts), to avoid
 * double-escaping `<` and `>` characters.
 */
export function htmlToMarkdownRaw(html: string): string {
  // Clean up HTML before conversion
  const cleaned = html.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ');

  return turndown.turndown(cleaned);
}

/**
 * Convert HTML content to Markdown with angle brackets escaped for safe
 * Obsidian rendering. Use this when the result is the final markdown and
 * no further escaping will be applied.
 */
export function htmlToMarkdown(html: string): string {
  return escapeAngleBrackets(htmlToMarkdownRaw(html));
}
