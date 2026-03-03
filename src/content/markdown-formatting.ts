/**
 * Message formatting for Obsidian notes
 *
 * Formats conversation messages into Obsidian callout, blockquote,
 * or plain text format. Also handles tool-use content rendering.
 */

import { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
import { PLATFORM_LABELS } from '../lib/constants';
import type { TemplateOptions } from '../lib/types';

/**
 * Get display label for AI assistant based on source platform
 */
function getAssistantLabel(source: string): string {
  return PLATFORM_LABELS[source] ?? 'Assistant';
}

/**
 * Format a single message according to template options
 */
export function formatMessage(
  content: string,
  role: 'user' | 'assistant',
  options: TemplateOptions,
  source: string
): string {
  // Convert HTML to Markdown for assistant messages; escape angle brackets for user messages
  const markdown = role === 'assistant' ? htmlToMarkdown(content) : escapeAngleBrackets(content);
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
