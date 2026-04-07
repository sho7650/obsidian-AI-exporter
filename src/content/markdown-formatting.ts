/**
 * Message formatting for Obsidian notes
 *
 * Formats conversation messages into Obsidian callout, blockquote,
 * or plain text format. Also handles tool-use content rendering.
 */

import { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
import { PLATFORM_LABELS } from '../lib/constants';
import type { AIPlatform, TemplateOptions } from '../lib/types';

/**
 * Maximum visible length of an auto-generated question header (issue #187).
 * Includes the trailing ellipsis when truncation occurs.
 */
const QUESTION_HEADER_MAX_LENGTH = 60;

/**
 * Get display label for AI assistant based on source platform
 */
function getAssistantLabel(source: AIPlatform): string {
  return PLATFORM_LABELS[source];
}

/**
 * Build a `## ` header line from a user message for TOC navigation (issue #187).
 *
 * - Normalizes all whitespace (including newlines) to single spaces.
 * - Truncates to {@link QUESTION_HEADER_MAX_LENGTH} characters total, preferring
 *   word-boundary breaks past the halfway mark and appending an ellipsis.
 * - Returns an empty string for empty/whitespace-only content so callers can
 *   fall back to the unheaded format.
 *
 * Exported for unit testing.
 */
export function buildQuestionHeader(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  if (normalized.length <= QUESTION_HEADER_MAX_LENGTH) {
    return `## ${normalized}`;
  }

  // Reserve one character for the ellipsis so total visible length stays within budget.
  const sliceEnd = QUESTION_HEADER_MAX_LENGTH - 1;
  const slice = normalized.substring(0, sliceEnd);
  const lastSpace = slice.lastIndexOf(' ');
  const truncated = lastSpace > sliceEnd / 2 ? slice.substring(0, lastSpace) : slice;
  return `## ${truncated}…`;
}

/**
 * Format a single message according to template options
 */
export function formatMessage(
  content: string,
  role: 'user' | 'assistant',
  options: TemplateOptions,
  source: AIPlatform
): string {
  // Convert HTML to Markdown for assistant messages; escape angle brackets for user messages
  const markdown = role === 'assistant' ? htmlToMarkdown(content) : escapeAngleBrackets(content);
  const assistantLabel = getAssistantLabel(source);

  let formatted: string;
  switch (options.messageFormat) {
    case 'callout': {
      const calloutType = role === 'user' ? options.userCalloutType : options.assistantCalloutType;
      const label = role === 'user' ? 'User' : assistantLabel;
      // Format as Obsidian callout with proper line handling
      const lines = markdown.split('\n');
      const formattedLines = lines.map((line, i) =>
        i === 0 ? `> [!${calloutType}] ${label}\n> ${line}` : `> ${line}`
      );
      formatted = formattedLines.join('\n');
      break;
    }

    case 'blockquote': {
      const label = role === 'user' ? '**User:**' : `**${assistantLabel}:**`;
      const lines = markdown.split('\n').map(line => `> ${line}`);
      formatted = `${label}\n${lines.join('\n')}`;
      break;
    }

    case 'plain':
    default: {
      const label = role === 'user' ? '**User:**' : `**${assistantLabel}:**`;
      formatted = `${label}\n\n${markdown}`;
      break;
    }
  }

  // Optional: prepend `##` question header for user messages (issue #187).
  // Uses the raw (pre-escape) content for a more readable TOC entry.
  if (role === 'user' && options.includeQuestionHeaders) {
    const header = buildQuestionHeader(content);
    if (header) {
      formatted = `${header}\n\n${formatted}`;
    }
  }

  return formatted;
}

/**
 * Format tool-use content as a collapsible callout or equivalent format
 *
 * Renders tool content (web search, code interpreter) as a separate block
 * before the assistant response message.
 *
 * @param toolContent Raw tool content string (may contain bold summary, queries, results)
 * @param options Template options for format selection
 */
export function formatToolContent(toolContent: string, options: TemplateOptions): string {
  const lines = toolContent.split('\n').filter(l => l.trim());

  // Extract first bold line as callout title (e.g., "**Searched the web**" → "Searched the web")
  let title = 'Tool Activity';
  let bodyLines = lines;
  if (lines[0]?.startsWith('**') && lines[0]?.endsWith('**')) {
    title = lines[0].slice(2, -2);
    bodyLines = lines.slice(1);
  }

  switch (options.messageFormat) {
    case 'callout': {
      // Collapsible callout: [!ABSTRACT]- collapsed by default
      if (bodyLines.length === 0) {
        return `> [!ABSTRACT]- ${title}`;
      }
      const formatted = bodyLines.map(line => `> ${line}`);
      return `> [!ABSTRACT]- ${title}\n${formatted.join('\n')}`;
    }

    case 'blockquote': {
      const header = `**${title}**`;
      const quoted = bodyLines.map(line => `> ${line}`);
      return quoted.length > 0 ? `${header}\n${quoted.join('\n')}` : header;
    }

    case 'plain':
    default: {
      return bodyLines.length > 0 ? `**${title}**\n${bodyLines.join('\n')}` : `**${title}**`;
    }
  }
}
