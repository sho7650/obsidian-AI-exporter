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

// ========== Citation transformation (formerly notebooklm-citations.ts) ==========
//
// NotebookLM renders inline source citations as buttons:
//   <button class="citation-marker">
//     <span aria-label="N: Source Title">N</span>
//   </button>
//
// Without transformation, DOMPurify strips the <button> wrapper but keeps the
// inner number as a text node, producing output like "big claim359" where
// "359" is three citations glued to the prose. We rewrite each marker into a
// placeholder span carrying a per-message footnote label, which the existing
// `footnoteRef` Turndown rule (markdown-rules.ts) converts to Obsidian
// footnote syntax `[^label]`.

const FOOTNOTE_REF_ATTR = 'data-footnote-ref';
const ARIA_LABEL_PATTERN = /^\s*(\d+)\s*[:.]\s*(.+?)\s*$/;

interface CitationTransformResult {
  /** HTML with citation buttons replaced by footnote-ref placeholder spans. */
  html: string;
  /** Per-message footnote definition lines (`[^label]: title`), deduped. */
  footnotes: string[];
}

function parseCitation(button: Element): { number: string; title: string } | null {
  const labelEl = button.querySelector('[aria-label]');
  const ariaLabel = labelEl?.getAttribute('aria-label')?.trim() ?? '';
  const visible = (button.textContent ?? '').trim();

  const match = ariaLabel.match(ARIA_LABEL_PATTERN);
  if (match) {
    const [, number, title] = match;
    return { number, title };
  }
  if (ariaLabel.length > 0 && visible.length > 0) {
    return { number: visible, title: ariaLabel };
  }
  if (visible.length > 0) {
    return { number: visible, title: visible };
  }
  return null;
}

function isMoreCitationsButton(button: Element): boolean {
  return button.querySelector('mat-icon') !== null;
}

function transformCitationsToFootnotes(
  html: string,
  messageIndex: number
): CitationTransformResult {
  if (!html) return { html: '', footnotes: [] };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const buttons = Array.from(doc.querySelectorAll('button.citation-marker'));
  if (buttons.length === 0) return { html, footnotes: [] };

  const footnoteByNumber = new Map<string, string>();
  const order: string[] = [];

  for (const button of buttons) {
    if (isMoreCitationsButton(button)) {
      button.remove();
      continue;
    }
    const parsed = parseCitation(button);
    if (!parsed) {
      button.remove();
      continue;
    }
    const label = `m${messageIndex}-${parsed.number}`;
    const placeholder = doc.createElement('span');
    placeholder.setAttribute(FOOTNOTE_REF_ATTR, label);
    placeholder.textContent = 'REF';
    button.replaceWith(placeholder);

    if (!footnoteByNumber.has(parsed.number)) {
      footnoteByNumber.set(parsed.number, parsed.title);
      order.push(parsed.number);
    }
  }

  const footnotes = order.map(num => `[^m${messageIndex}-${num}]: ${footnoteByNumber.get(num)}`);
  return { html: doc.body.innerHTML, footnotes };
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => HTML_ESCAPE_MAP[ch] ?? ch);
}

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
        const content = this.extractPlainText(userEl);
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
        const content = this.extractAssistantContent(assistantEl, index);
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
   * Extract assistant response content (HTML for markdown conversion)
   *
   * Looks for element-list-renderer within the response container.
   * Inline citation buttons are rewritten to footnote-ref placeholder spans
   * BEFORE sanitization so the per-message footnote labels survive into
   * the markdown pipeline. Footnote definitions are appended as
   * `<p data-footnote-def>` paragraphs that the Turndown rule emits as
   * literal `[^label]: title` lines.
   *
   * All HTML is sanitized via DOMPurify to prevent XSS.
   */
  private extractAssistantContent(element: HTMLElement, messageIndex: number): string {
    const renderer = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
    const rawHtml = renderer?.innerHTML ?? element.innerHTML;
    if (!rawHtml) {
      return '';
    }

    const { html: transformedHtml, footnotes } = transformCitationsToFootnotes(
      rawHtml,
      messageIndex
    );

    const footnoteDefsHtml = footnotes
      .map(line => `<p data-footnote-def="">${escapeHtml(line)}</p>`)
      .join('');

    return sanitizeHtml(transformedHtml + footnoteDefsHtml);
  }
}
