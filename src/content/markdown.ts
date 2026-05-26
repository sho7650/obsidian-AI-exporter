/**
 * HTML to Markdown conversion — barrel re-export + orchestrator
 *
 * Internal modules:
 * - markdown-rules.ts      — Turndown engine (leaf, no internal deps)
 * - markdown-deep-research.ts — Citation → footnote pipeline
 * - markdown-formatting.ts — Message formatting templates
 */

import { formatMessage, formatToolContent } from './markdown-formatting';
import { convertDeepResearchContent } from './markdown-deep-research';
import { generateHash } from '../lib/hash';
import { MAX_FILENAME_BASE_LENGTH, FILENAME_ID_SUFFIX_LENGTH } from '../lib/constants';
import type {
  ConversationData,
  ObsidianNote,
  NoteFrontmatter,
  TemplateOptions,
} from '../lib/types';
import { formatDateWithTimezone } from '../lib/date-utils';

// Re-exports (preserve existing import paths)
export { escapeAngleBrackets } from './markdown-rules';
export { convertDeepResearchContent } from './markdown-deep-research';

import { htmlToMarkdown } from './markdown-rules';
export { htmlToMarkdown };

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
 * Convert conversation data to Obsidian note
 *
 * For NotebookLM notebook-source types, generates filenames under the
 * sources/ subdirectory. The chat note (when it has a notebookTitle) is
 * named chat.md. Source titles are linked from the chat note via wikilinks.
 */
export function conversationToNote(
  data: ConversationData,
  options: TemplateOptions,
  /** Source titles for wikilink injection (chat notes only) */
  sourceLinks?: string[]
): ObsidianNote {
  const timezone = options.timezone ?? 'UTC';
  const now = formatDateWithTimezone(new Date(), timezone);

  // Generate frontmatter
  const frontmatter: NoteFrontmatter = {
    id: `${data.source}_${data.id}`,
    title: data.title,
    source: data.source,
    ...(data.type && { type: data.type }),
    url: data.url,
    created: formatDateWithTimezone(data.extractedAt, timezone),
    modified: now,
    tags:
      data.type === 'deep-research'
        ? ['ai-research', 'deep-research', data.source]
        : data.type === 'notebook-source'
          ? ['ai-notebook', 'notebook-source', data.source]
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
  } else if (data.type === 'notebook-source') {
    // Notebook Source: format directly as markdown without callouts
    if (data.messages.length === 0) {
      body = '';
    } else {
      body = htmlToMarkdown(data.messages[0].content);
    }
  } else {
    // Normal conversation format (callout style)
    const bodyParts: string[] = [];

    for (const message of data.messages) {
      // Render tool content as separate collapsible callout before assistant message
      if (message.toolContent) {
        bodyParts.push(formatToolContent(message.toolContent, options));
      }
      const formatted = formatMessage(message.content, message.role, options, data.source);
      bodyParts.push(formatted);
    }

    body = bodyParts.join('\n\n');

    // Append wikilinks to sources if provided (NotebookLM chat note)
    if (sourceLinks && sourceLinks.length > 0) {
      const linksSection = [
        '',
        '## Sources',
        '',
        ...sourceLinks.map(link => `- ${link}`),
      ].join('\n');
      body = body + '\n' + linksSection;
    }
  }

  // Generate filename
  // NotebookLM notebook-source: use sources/{title}.md
  // NotebookLM chat with notebookTitle: use chat.md
  // Default: standard filename generation
  let fileName: string;
  if (data.type === 'notebook-source') {
    const sourceFileName = generateFileName(data.title, data.id);
    fileName = `sources/${sourceFileName}`;
  } else if (data.notebookTitle) {
    // Chat note within a notebook folder
    fileName = 'chat.md';
  } else {
    fileName = generateFileName(data.title, data.id);
  }

  const contentHash = generateContentHash(body);

  return {
    fileName,
    frontmatter,
    body,
    contentHash,
  };
}

