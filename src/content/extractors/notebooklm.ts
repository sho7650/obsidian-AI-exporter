/**
 * NotebookLM Extractor
 *
 * Extracts chat conversations from NotebookLM (notebooklm.google.com)
 * with inline source citations converted to footnotes.
 *
 * NotebookLM uses Angular Material with custom elements:
 * - chat-panel / chat-message — conversation structure
 * - element-list-renderer — structured response content
 * - button.citation-marker — inline source citations
 *
 * MVP scope: Chat Q&A only (no Studio artifacts, Audio, or Mind Maps)
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import type { ConversationMessage } from '../../lib/types';

import { SELECTORS } from './selectors/notebooklm';

/**
 * NotebookLM chat conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class NotebookLMExtractor extends BaseExtractor {
  readonly platform = 'notebooklm';

  // ========== Platform Detection ==========

  /**
   * Check if this extractor can handle the current page
   *
   * IMPORTANT: Uses strict comparison (===) to prevent
   * subdomain attacks like "evil-notebooklm.google.com.attacker.com"
   */
  canExtract(): boolean {
    return window.location.hostname === 'notebooklm.google.com';
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract notebook ID from URL
   *
   * URL format: https://notebooklm.google.com/notebook/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/notebook\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Get notebook title from the cover-title element
   *
   * Priority:
   * 1. .cover-title element text
   * 2. Default title
   */
  getTitle(): string {
    const titleEl = this.queryWithFallback<HTMLElement>(SELECTORS.notebookTitle);
    if (titleEl?.textContent) {
      return this.sanitizeText(titleEl.textContent);
    }
    return 'Untitled NotebookLM Conversation';
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Iterates over .chat-message-pair containers (each containing
   * one user query + one assistant response) and extracts in order.
   */
  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    const turns = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);

    if (turns.length === 0) {
      console.warn('[G2O] No conversation turns found in NotebookLM chat panel');
      return messages;
    }

    turns.forEach((turn, index) => {
      // Extract user query from this turn
      const userEl = this.queryWithFallback<HTMLElement>(SELECTORS.userQuery, turn);
      if (userEl) {
        const content = this.extractUserContent(userEl);
        if (content) {
          messages.push({
            id: `user-${index}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
      }

      // Extract assistant response from this turn
      const assistantEl = this.queryWithFallback<HTMLElement>(SELECTORS.assistantResponse, turn);
      if (assistantEl) {
        const content = this.extractAssistantContent(assistantEl);
        if (content) {
          messages.push({
            id: `assistant-${index}`,
            role: 'assistant',
            content,
            htmlContent: content,
            index: messages.length,
          });
        }
      }
    });

    return messages;
  }

  /**
   * Extract user message content (plain text)
   */
  private extractUserContent(element: HTMLElement): string {
    if (element.textContent) {
      return this.sanitizeText(element.textContent);
    }
    return '';
  }

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * Looks for element-list-renderer within the response container.
   * All HTML is sanitized via DOMPurify to prevent XSS.
   */
  private extractAssistantContent(element: HTMLElement): string {
    // Find the structured content renderer
    const renderer = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
    if (renderer) {
      return sanitizeHtml(renderer.innerHTML);
    }

    // Fallback: use the element's innerHTML
    if (element.innerHTML) {
      return sanitizeHtml(element.innerHTML);
    }

    return '';
  }
}
