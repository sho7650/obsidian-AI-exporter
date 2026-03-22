/**
 * Perplexity Extractor
 *
 * Extracts conversations from Perplexity AI (www.perplexity.ai)
 * Supports normal chat mode and Deep Research reports
 *
 * @see docs/design/DES-004-perplexity-extractor.md
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import type { ConversationMessage } from '../../lib/types';

import { SELECTORS } from './selectors/perplexity';

/** Tagged element for DOM-order sorting */
type TaggedElement =
  | { type: 'user'; element: HTMLElement }
  | { type: 'response'; element: HTMLElement }
  | { type: 'report'; element: HTMLElement };

/**
 * Perplexity conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class PerplexityExtractor extends BaseExtractor {
  readonly platform = 'perplexity';

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
    const match = window.location.pathname.match(/\/search\/([^/]+)$/);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. document.title (via getPageTitle())
   * 2. First user query text (truncated to MAX_CONVERSATION_TITLE_LENGTH)
   * 3. Default title
   */
  getTitle(): string {
    return (
      this.getPageTitle() ??
      this.getFirstMessageTitle(SELECTORS.userQuery, 'Untitled Perplexity Conversation')
    );
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Strategy: Collect all content elements (user queries, responses, Deep Research
   * reports), sort them by DOM position, and build messages in document order.
   * This ensures multi-turn conversations with Deep Research maintain correct ordering.
   *
   * @see DES-004 Section 4.2
   */
  extractMessages(): ConversationMessage[] {
    const tagged = this.collectTaggedElements();

    if (tagged.length === 0) {
      console.warn('[G2O] No conversation content found with primary selectors');
      return [];
    }

    // Sort by DOM position to preserve visual ordering
    tagged.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const messages: ConversationMessage[] = [];
    let userIdx = 0;
    let responseIdx = 0;
    let reportIdx = 0;

    for (const item of tagged) {
      if (item.type === 'user') {
        const content = this.extractUserContent(item.element);
        if (content) {
          messages.push({
            id: `user-${userIdx}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
        userIdx++;
      } else if (item.type === 'report') {
        const content = this.extractReportContent(item.element);
        if (content) {
          messages.push({
            id: `report-${reportIdx}`,
            role: 'assistant',
            content,
            htmlContent: content,
            index: messages.length,
          });
        }
        reportIdx++;
      } else {
        const content = this.extractAssistantContent(item.element);
        if (content) {
          messages.push({
            id: `assistant-${responseIdx}`,
            role: 'assistant',
            content,
            htmlContent: content,
            index: messages.length,
          });
        }
        responseIdx++;
      }
    }

    return messages;
  }

  /**
   * Collect all content elements tagged by type for DOM-order sorting
   */
  private collectTaggedElements(): TaggedElement[] {
    const tagged: TaggedElement[] = [];

    for (const el of this.queryAllWithFallback<HTMLElement>(SELECTORS.userQuery)) {
      tagged.push({ type: 'user', element: el });
    }

    for (const el of this.queryAllWithFallback<HTMLElement>(SELECTORS.markdownContent)) {
      tagged.push({ type: 'response', element: el });
    }

    for (const card of this.queryAllWithFallback<HTMLElement>(SELECTORS.deepResearchCard)) {
      const proseEl = this.queryWithFallback<HTMLElement>(SELECTORS.deepResearchProse, card);
      if (proseEl) {
        tagged.push({ type: 'report', element: card });
      }
    }

    return tagged;
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

  /**
   * Extract Deep Research report content from a report card element
   *
   * The report card contains prose with max-w-none, and potentially
   * an inner prose element with the actual content.
   */
  private extractReportContent(card: HTMLElement): string {
    const proseEl = this.queryWithFallback<HTMLElement>(SELECTORS.deepResearchProse, card);
    if (proseEl) {
      const innerProse = this.queryWithFallback<HTMLElement>(SELECTORS.proseContent, proseEl);
      const targetEl = innerProse ?? proseEl;
      const content = sanitizeHtml(targetEl.innerHTML);
      if (content.trim()) {
        return content;
      }
    }
    return '';
  }
}
