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

// Re-exports (preserve existing import paths)
export { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
export { convertDeepResearchContent } from './markdown-deep-research';

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
      // Render tool content as separate collapsible callout before assistant message
      if (message.toolContent) {
        bodyParts.push(formatToolContent(message.toolContent, options));
      }
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
