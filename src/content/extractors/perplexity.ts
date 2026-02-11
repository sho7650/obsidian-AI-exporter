/**
 * Perplexity Extractor
 *
 * Extracts conversations from Perplexity AI (www.perplexity.ai)
 * Supports normal chat mode (Deep Research treated as normal conversation)
 *
 * @see docs/design/DES-004-perplexity-extractor.md
 */

import { BaseExtractor } from './base';
import { extractErrorMessage } from '../../lib/error-utils';
import { sanitizeHtml } from '../../lib/sanitize';
import type { ConversationMessage, ExtractionResult } from '../../lib/types';
import { MAX_CONVERSATION_TITLE_LENGTH } from '../../lib/constants';

/**
 * CSS Selectors for Perplexity chat extraction
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-004-perplexity-extractor.md Section 4.1
 */
const SELECTORS = {
  // User query text
  userQuery: [
    'span.select-text', // Semantic (HIGH)
    'div.bg-offset.rounded-2xl span.select-text', // Style (MEDIUM)
  ],

  // Assistant response content container
  markdownContent: [
    'div[id^="markdown-content-"]', // ID pattern (HIGH)
    '.prose.dark\\:prose-invert', // Style (MEDIUM)
  ],

  // Prose content within response
  proseContent: [
    '.prose.dark\\:prose-invert', // Standard (HIGH)
    '.prose', // Fallback (LOW)
  ],
};

/**
 * Perplexity conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class PerplexityExtractor extends BaseExtractor {
  readonly platform = 'perplexity' as const;

  // ========== Platform Detection ==========

  /**
   * Check if this extractor can handle the current page
   *
   * IMPORTANT: Uses strict comparison (===) to prevent
   * subdomain attacks like "evil-www.perplexity.ai.attacker.com"
   */
  canExtract(): boolean {
    return window.location.hostname === 'www.perplexity.ai';
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL format: https://www.perplexity.ai/search/{slug}
   * @returns Full slug string or null if not found
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/search\/(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. First user query text (truncated to MAX_CONVERSATION_TITLE_LENGTH)
   * 2. Default title
   */
  getTitle(): string {
    const firstQuery = this.queryWithFallback<HTMLElement>(SELECTORS.userQuery);
    if (firstQuery?.textContent) {
      const title = this.sanitizeText(firstQuery.textContent);
      return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
    }

    return 'Untitled Perplexity Conversation';
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Strategy: Collect user queries and assistant responses independently,
   * then pair them by sequential index (query[0] ↔ response[0], etc.)
   * @see DES-004 Section 4.2
   */
  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Collect all user queries (span.select-text)
    const queryElements = this.queryAllWithFallback<HTMLElement>(SELECTORS.userQuery);

    // Collect all assistant responses (div[id^="markdown-content-"])
    const responseElements = this.queryAllWithFallback<HTMLElement>(SELECTORS.markdownContent);

    if (queryElements.length === 0 && responseElements.length === 0) {
      console.warn('[G2O] No conversation content found with primary selectors');
      return messages;
    }

    // Pair queries and responses by sequential index
    const pairCount = Math.max(queryElements.length, responseElements.length);

    for (let i = 0; i < pairCount; i++) {
      // Add user message if query exists at this index
      if (i < queryElements.length) {
        const content = this.extractUserContent(queryElements[i]);
        if (content) {
          messages.push({
            id: `user-${i}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
      }

      // Add assistant message if response exists at this index
      if (i < responseElements.length) {
        const content = this.extractAssistantContent(responseElements[i]);
        if (content) {
          messages.push({
            id: `assistant-${i}`,
            role: 'assistant',
            content,
            htmlContent: content,
            index: messages.length,
          });
        }
      }
    }

    return messages;
  }

  /**
   * Extract user query content (plain text)
   */
  private extractUserContent(queryElement: HTMLElement): string {
    if (queryElement.textContent) {
      return this.sanitizeText(queryElement.textContent);
    }
    return '';
  }

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * Finds the .prose child element and extracts its innerHTML.
   * All HTML is sanitized via DOMPurify to prevent XSS.
   */
  private extractAssistantContent(contentElement: HTMLElement): string {
    // Find .prose child within the markdown-content container
    const proseEl = this.queryWithFallback<HTMLElement>(SELECTORS.proseContent, contentElement);
    if (proseEl) {
      return sanitizeHtml(proseEl.innerHTML);
    }

    // Fallback: use the content element's innerHTML directly
    if (contentElement.innerHTML) {
      return sanitizeHtml(contentElement.innerHTML);
    }

    return '';
  }

  // ========== Main Entry Point ==========

  /**
   * Main extraction method
   *
   * Extracts normal conversation
   * (Deep Research is treated as normal conversation)
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: 'Not on a Perplexity page',
        };
      }

      console.info('[G2O] Extracting Perplexity conversation');
      const messages = this.extractMessages();
      const conversationId = this.getConversationId() || `perplexity-${Date.now()}`;
      const title = this.getTitle();

      return this.buildConversationResult(messages, conversationId, title, 'perplexity');
    } catch (error) {
      console.error('[G2O] Perplexity extraction error:', error);
      return {
        success: false,
        error: extractErrorMessage(error),
      };
    }
  }
}
