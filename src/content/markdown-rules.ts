/**
 * Turndown HTML-to-Markdown engine with custom rules
 *
 * Leaf module — only depends on external `turndown` package.
 * Configures Turndown with custom rules for code blocks, inline code,
 * footnote references, math expressions, and tables.
 */

import TurndownService from 'turndown';

/**
 * Escape angle brackets in a single line of Markdown text.
 * Preserves blockquote markers and inline code segments.
 */
function escapeAngleBracketsInLine(line: string): string {
  // 1. Extract blockquote prefix (preserve as-is)
  const bqMatch = line.match(/^(\s*>\s*)+/);
  const prefix = bqMatch ? bqMatch[0] : '';
  const rest = line.slice(prefix.length);

  // 2. Split by inline code segments (capture group → odd indices are code)
  const parts = rest.split(/(`[^`]+`)/);

  // 3. Escape angle brackets in non-code segments.
  //    Also handle \< and \> (backslash+angle) to prevent incomplete escaping (CodeQL js/incomplete-sanitization).
  const escaped = parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // inline code — preserve
      return part.replace(/\\[<>]|[<>]/g, match => {
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
 * Escape angle brackets in Markdown text for safe Obsidian rendering.
 * Preserves brackets inside fenced code blocks, inline code, and
 * blockquote markers.
 *
 * CommonMark §2.4: \< and \> are valid backslash escapes.
 */
export function escapeAngleBrackets(text: string): string {
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

    return escapeAngleBracketsInLine(line);
  });

  return result.join('\n');
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

// Custom rule for inline code
turndown.addRule('inlineCode', {
  filter: node => {
    return node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE';
  },
  replacement: content => {
    return `\`${content}\``;
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

// Custom rule for display math blocks (Gemini KaTeX: <div data-math="...">)
turndown.addRule('mathBlock', {
  filter: node => {
    return node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-math');
  },
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-math');
    if (!latex) return _content;
    return `\n$$\n${latex}\n$$\n`;
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
    return `$${latex}$`;
  },
});

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
        headers.push(cell.textContent?.trim() || '');
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
        cells.push(cell.textContent?.trim() || '');
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
 * Convert HTML content to Markdown
 */
export function htmlToMarkdown(html: string): string {
  // Clean up HTML before conversion
  const cleaned = html.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ');

  return escapeAngleBrackets(turndown.turndown(cleaned));
}
