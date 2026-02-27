/**
 * HTML to Markdown conversion using Turndown
 */

import TurndownService from 'turndown';
import type {
  ConversationData,
  ObsidianNote,
  NoteFrontmatter,
  TemplateOptions,
  DeepResearchLinks,
  DeepResearchSource,
} from '../lib/types';
import { generateHash } from '../lib/hash';
import { buildSourceMap } from '../lib/source-map';
import {
  MAX_FILENAME_BASE_LENGTH,
  FILENAME_ID_SUFFIX_LENGTH,
  PLATFORM_LABELS,
} from '../lib/constants';

// ============================================================
// Deep Research Link Processing Functions (Obsidian Footnote Mode)
// ============================================================

/** Pre-compiled regex for source-footnote wrapped citations */
const CITATION_PATTERN_WRAPPED =
  /<source-footnote[^>]*>[\s\S]*?<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>[\s\S]*?<\/source-footnote>/gi;

/** Pre-compiled regex for standalone sup citations (fallback) */
const CITATION_PATTERN_STANDALONE =
  /<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>/gi;

/**
 * Escape Markdown link metacharacters in text
 * Prevents injection of Markdown links via crafted titles
 */
function escapeMarkdownLink(text: string): string {
  return text.replace(/[\\[\]()]/g, '\\$&');
}

/**
 * Sanitize URL to remove dangerous schemes
 */
function sanitizeUrl(url: string): string {
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'blob:'];
  const lowerUrl = url.toLowerCase().trim();

  for (const scheme of dangerousSchemes) {
    if (lowerUrl.startsWith(scheme)) {
      return ''; // Return empty for dangerous URLs
    }
  }

  return url;
}

/**
 * Create a citation replacer callback for use with String.replace()
 * Shared logic for both wrapped and standalone citation patterns.
 */
function createCitationReplacer(
  sourceMap: Map<number, DeepResearchSource>
): (_match: string, indexStr: string) => string {
  return (_match: string, indexStr: string): string => {
    const index = parseInt(indexStr, 10);
    const source = sourceMap.get(index);
    if (source) {
      // Return placeholder span with content (Turndown filters empty elements)
      // The custom Turndown rule will convert this to [^N]
      return `<span data-footnote-ref="${index}">REF</span>`;
    }
    // Source not found: log warning and remove marker silently
    console.warn(`[G2O] Citation reference ${index} not found in source map`);
    return '';
  };
}

/**
 * Convert inline citations to footnote reference placeholders
 *
 * Before: <source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>
 * After: <span data-footnote-ref="N"></span>
 *
 * Design: We insert placeholder spans that survive Turndown processing,
 * then replace them with Obsidian footnote syntax [^N] after conversion.
 * This avoids double-escaping issues where Markdown gets re-escaped by Turndown.
 *
 * Important: data-turn-source-index is 1-based and may be non-sequential
 *
 * @param html HTML content to convert
 * @param sourceMap Map built from buildSourceMap()
 */
function convertInlineCitationsToFootnoteRefs(
  html: string,
  sourceMap: Map<number, DeepResearchSource>
): string {
  const replacer = createCitationReplacer(sourceMap);

  // Pattern 1: source-footnote wrapped
  CITATION_PATTERN_WRAPPED.lastIndex = 0;
  let result = html.replace(CITATION_PATTERN_WRAPPED, replacer);

  // Pattern 2: standalone sup element (fallback)
  CITATION_PATTERN_STANDALONE.lastIndex = 0;
  result = result.replace(CITATION_PATTERN_STANDALONE, replacer);

  return result;
}

/**
 * Generate References section with Obsidian footnote definitions
 *
 * Output format:
 * # References
 *
 * [^1]: [Title1](URL1)
 * [^2]: [Title2](URL2)
 * ...
 *
 * @param sources All sources from the source list (includes unreferenced sources)
 * @returns Markdown string for References section
 */
function generateReferencesSection(sources: DeepResearchSource[]): string {
  if (sources.length === 0) {
    return '';
  }

  const lines: string[] = ['', '# References', ''];

  sources.forEach((source, arrayIndex) => {
    // data-turn-source-index is 1-based
    const footnoteIndex = arrayIndex + 1;
    const safeUrl = sanitizeUrl(source.url);

    if (safeUrl) {
      // [^N]: [Title](URL)
      lines.push(`[^${footnoteIndex}]: [${escapeMarkdownLink(source.title)}](${safeUrl})`);
    } else {
      // URL invalid: title only
      lines.push(`[^${footnoteIndex}]: ${escapeMarkdownLink(source.title)}`);
    }
  });

  return lines.join('\n');
}

/**
 * Remove sources-carousel-inline elements
 */
function removeSourcesCarousel(html: string): string {
  return html.replace(/<sources-carousel-inline[\s\S]*?<\/sources-carousel-inline>/gi, '');
}

/**
 * Convert Deep Research content with Obsidian footnotes
 *
 * Design: Converts inline citations to [^N] footnote references
 * and generates a References section with footnote definitions.
 *
 * Processing flow:
 * 1. Build source map from links
 * 2. Convert <sup data-turn-source-index> to placeholder spans
 * 3. Remove sources carousel
 * 4. Convert HTML to Markdown (Turndown)
 * 5. Replace placeholder spans with [^N] footnote refs
 * 6. Append References section with footnote definitions
 */
export function convertDeepResearchContent(html: string, links?: DeepResearchLinks): string {
  let processed = html;

  // 1. Build source map (1-based index)
  let sourceMap = new Map<number, DeepResearchSource>();
  if (links && links.sources.length > 0) {
    sourceMap = buildSourceMap(links.sources);
  }

  // 2. Convert inline citations to placeholder spans
  processed = convertInlineCitationsToFootnoteRefs(processed, sourceMap);

  // 3. Remove sources carousel
  processed = removeSourcesCarousel(processed);

  // 4. Convert HTML to Markdown (Turndown rule converts spans to [^N])
  const markdown = htmlToMarkdown(processed);

  // 5. Add References section with all sources
  if (links && links.sources.length > 0) {
    return markdown + generateReferencesSection(links.sources);
  }

  return markdown;
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

  return turndown.turndown(cleaned);
}

/**
 * Generate sanitized filename from title
 */
export function generateFileName(title: string, conversationId: string): string {
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9\u3000-\u9fff\uac00-\ud7af]+/g, '-') // Keep Japanese/Korean chars
    .replace(/^-+|-+$/g, '')
    .substring(0, MAX_FILENAME_BASE_LENGTH);

  const idSuffix = conversationId.substring(0, FILENAME_ID_SUFFIX_LENGTH);
  return `${sanitized || 'conversation'}-${idSuffix}.md`;
}

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return generateHash(content);
}

/**
 * Get display label for AI assistant based on source platform
 */
function getAssistantLabel(source: string): string {
  return PLATFORM_LABELS[source] ?? 'Assistant';
}

/**
 * Format a single message according to template options
 */
function formatMessage(
  content: string,
  role: 'user' | 'assistant',
  options: TemplateOptions,
  source: string
): string {
  // Convert HTML to Markdown for assistant messages
  const markdown = role === 'assistant' ? htmlToMarkdown(content) : content;
  const assistantLabel = getAssistantLabel(source);

  switch (options.messageFormat) {
    case 'callout': {
      const calloutType = role === 'user' ? options.userCalloutType : options.assistantCalloutType;
      const label = role === 'user' ? 'User' : assistantLabel;
      // Format as Obsidian callout with proper line handling
      const lines = markdown.split('\n');
      const formattedLines = lines.map((line, i) =>
        i === 0 ? `> [!${calloutType}] ${label}\n> ${line}` : `> ${line}`
      );
      return formattedLines.join('\n');
    }

    case 'blockquote': {
      const label = role === 'user' ? '**User:**' : `**${assistantLabel}:**`;
      const lines = markdown.split('\n').map(line => `> ${line}`);
      return `${label}\n${lines.join('\n')}`;
    }

    case 'plain':
    default: {
      const label = role === 'user' ? '**User:**' : `**${assistantLabel}:**`;
      return `${label}\n\n${markdown}`;
    }
  }
}

/**
 * Convert conversation data to Obsidian note
 */
export function conversationToNote(data: ConversationData, options: TemplateOptions): ObsidianNote {
  const now = new Date().toISOString();

  // Generate frontmatter
  const frontmatter: NoteFrontmatter = {
    id: `${data.source}_${data.id}`,
    title: data.title,
    source: data.source,
    ...(data.type && { type: data.type }),
    url: data.url,
    created: data.extractedAt.toISOString(),
    modified: now,
    tags:
      data.type === 'deep-research'
        ? ['ai-research', 'deep-research', data.source]
        : ['ai-conversation', data.source],
    message_count: data.messages.length,
  };

  // Generate body - different format for Deep Research vs normal conversation
  let body: string;

  if (data.type === 'deep-research') {
    // Deep Research: convert with links support (footnotes + References)
    if (data.messages.length === 0) {
      body = '';
    } else {
      body = convertDeepResearchContent(data.messages[0].content, data.links);
    }
  } else {
    // Normal conversation format (callout style)
    const bodyParts: string[] = [];

    for (const message of data.messages) {
      const formatted = formatMessage(message.content, message.role, options, data.source);
      bodyParts.push(formatted);
    }

    body = bodyParts.join('\n\n');
  }

  // Generate filename and content hash
  const fileName = generateFileName(data.title, data.id);
  const contentHash = generateContentHash(body);

  return {
    fileName,
    frontmatter,
    body,
    contentHash,
  };
}
