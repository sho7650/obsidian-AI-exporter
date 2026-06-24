/**
 * ChatGPT Extractor
 *
 * Extracts conversations from ChatGPT (chatgpt.com)
 * Supports normal chat mode (Deep Research treated as normal conversation)
 *
 * @see docs/design/DES-003-chatgpt-extractor.md
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import type { ConversationMessage } from '../../lib/types';

import { SELECTORS } from './selectors/chatgpt';

/**
 * ChatGPT conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt';

  // ========== Platform Detection ==========

  /**
   * Check if this extractor can handle the current page
   *
   * IMPORTANT: Uses strict comparison (===) to prevent
   * subdomain attacks like "evil-chatgpt.com.attacker.com"
   * @see NFR-001-1 in design document
   */
  canExtract(): boolean {
    return window.location.hostname === 'chatgpt.com';
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL formats:
   *   https://chatgpt.com/c/{uuid}
   *   https://chatgpt.com/g/{gpt-slug}/c/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    // Match /c/{uuid} pattern (works for both regular and custom GPT URLs)
    const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. document.title (via getPageTitle())
   * 2. First user message content (truncated to MAX_CONVERSATION_TITLE_LENGTH)
   * 3. Default title
   */
  getTitle(): string {
    return (
      this.getPageTitle() ??
      this.getFirstMessageTitle(SELECTORS.userMessage, 'Untitled ChatGPT Conversation')
    );
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Uses section[data-turn-id] to find conversation turns (with article fallback),
   * then extracts User/Assistant messages in DOM order
   * @see FR-002 in design document
   */
  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Find all conversation turns
    const turns = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);

    if (turns.length === 0) {
      console.warn('[G2O] No conversation turns found with primary selectors');
      return messages;
    }

    // Process each turn
    turns.forEach((turn, index) => {
      // Determine role from data-turn attribute or data-message-author-role
      const turnRole = turn.getAttribute('data-turn');
      const messageEl = turn.querySelector('[data-message-author-role]');
      const authorRole = messageEl?.getAttribute('data-message-author-role');

      const role = turnRole || authorRole;

      if (role === 'user') {
        const content = this.extractUserContent(turn);
        if (content) {
          messages.push({
            id: `user-${index}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
      } else if (role === 'assistant') {
        const content = this.extractAssistantContent(turn);
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
  private extractUserContent(turnElement: Element): string {
    // Find user message content within the turn
    const contentEl = this.queryWithFallback<HTMLElement>(SELECTORS.userMessage, turnElement);
    if (contentEl?.textContent) {
      return this.sanitizeText(contentEl.textContent);
    }

    // Fallback: try to get any .whitespace-pre-wrap content
    const fallbackEl = turnElement.querySelector('.whitespace-pre-wrap');
    if (fallbackEl?.textContent) {
      return this.sanitizeText(fallbackEl.textContent);
    }

    return '';
  }

  /**
   * Reasoning-summary label inside a thinking turn (e.g. "Thought for 47s",
   * "Thought for a few seconds").
   *
   * A gpt-*-thinking assistant turn renders short reasoning-summary
   * `.markdown.prose` blocks BEFORE this label and the real answer AFTER it.
   * The summaries and the answer share an identical wrapper structure, so this
   * localized button text is the only available boundary marker (see #281).
   *
   * The English branch requires the trailing "for" keyword so transient
   * control buttons like "Thinking…" / "Continue reasoning" are not matched,
   * while still accepting natural-language durations. Matching is best-effort:
   * unrecognized locales fall back to keeping every block, so the answer is
   * never dropped.
   */
  private static readonly REASONING_LABEL_PATTERN =
    /^(?:thought|thinking|reasoned|worked)\s+for\b|^(?:思考|考え)/i;

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * A single assistant turn can contain MULTIPLE `.markdown.prose` blocks
   * across separate `[data-message-id]` wrappers (issue #281). All answer
   * blocks are collected and joined in DOM order so later parts of the
   * response are not dropped. Reasoning-summary blocks preceding a
   * "Thought for Ns" label are excluded best-effort (Claude-consistent).
   *
   * All HTML is sanitized via DOMPurify to prevent XSS, and utm_source
   * parameters are stripped from citation URLs.
   * @see NFR-001-2 in design document
   */
  private extractAssistantContent(turnElement: Element): string {
    const markdownEls = this.queryAllWithFallback<HTMLElement>(
      SELECTORS.markdownContent,
      turnElement
    );

    if (markdownEls.length > 0) {
      const answerEls = this.selectAnswerBlocks(turnElement, markdownEls);
      return answerEls.map(el => this.sanitizeBlockHtml(el.innerHTML)).join('\n\n');
    }

    // Fallback: try assistantResponse selectors
    const assistantEl = this.queryWithFallback<HTMLElement>(
      SELECTORS.assistantResponse,
      turnElement
    );
    if (assistantEl) {
      return this.sanitizeBlockHtml(assistantEl.innerHTML);
    }

    return '';
  }

  /**
   * Clean citation URLs and sanitize a single content block's HTML.
   */
  private sanitizeBlockHtml(html: string): string {
    return sanitizeHtml(this.cleanCitationUrls(html));
  }

  /**
   * Choose which markdown blocks belong to the answer.
   *
   * With a single block, behavior is unchanged. With multiple blocks, a
   * "Thought for Ns" reasoning label (if detected) marks the boundary: only
   * blocks positioned after it are kept. If no label is found, or excluding
   * reasoning would leave nothing, all blocks are kept so the answer is never
   * lost (safety floor — degrades to "join everything").
   */
  private selectAnswerBlocks(turnElement: Element, blocks: HTMLElement[]): HTMLElement[] {
    if (blocks.length <= 1) {
      return blocks;
    }

    const reasoningLabel = this.findReasoningLabel(turnElement);
    if (!reasoningLabel) {
      return blocks;
    }

    const afterLabel = blocks.filter(
      block =>
        (reasoningLabel.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    );
    return afterLabel.length > 0 ? afterLabel : blocks;
  }

  /**
   * Find the reasoning-summary label button within an assistant turn.
   * Returns the first button whose text matches REASONING_LABEL_PATTERN,
   * or null when none is present (non-thinking response).
   */
  private findReasoningLabel(turnElement: Element): HTMLElement | null {
    const buttons = turnElement.querySelectorAll<HTMLElement>('button');
    for (const button of buttons) {
      const text = button.textContent?.trim() ?? '';
      if (ChatGPTExtractor.REASONING_LABEL_PATTERN.test(text)) {
        return button;
      }
    }
    return null;
  }

  /**
   * Clean utm_source parameter from citation URLs
   *
   * ChatGPT adds ?utm_source=chatgpt.com to citation URLs.
   * Uses DOM-level manipulation instead of regex for safety.
   * @see DES-003-chatgpt-extractor.md Section 8.2
   */
  private cleanCitationUrls(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('a[href]').forEach(el => {
      const anchor = el as HTMLAnchorElement;
      try {
        const url = new URL(anchor.href);
        if (url.searchParams.get('utm_source') === 'chatgpt.com') {
          url.searchParams.delete('utm_source');
          anchor.href = url.toString();
        }
      } catch {
        // malformed href — leave for DOMPurify to handle
      }
    });
    return doc.body.innerHTML;
  }
}
