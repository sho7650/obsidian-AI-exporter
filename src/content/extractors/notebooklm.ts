/**
 * NotebookLM Extractor
 *
 * Extracts chat conversations from Gemini Notebook / NotebookLM
 * (notebook.google.com, formerly notebooklm.google.com) with inline source
 * citations converted to footnotes.
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
import { createFootnoteRef, footnoteDefsToHtml, transformCitations } from './footnotes';
import type { CitationTransformResult } from './footnotes';

import { SELECTORS, COMPUTED_SELECTORS } from './selectors/notebooklm';

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

const ARIA_LABEL_PATTERN = /^\s*(\d+)\s*[:.]\s*(.+?)\s*$/;

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

/** Longest label the footnote rules accept (DES-019 §4.8). */
const MAX_FOOTNOTE_LABEL_LENGTH = 64;

/**
 * Assigns each original citation number of one message its own label number.
 * An original that is digits keeps them and a fallback value is reduced to its
 * digits, unless that number is empty, already taken by another original, or
 * would make the label too long: then the smallest free positive integer is
 * used. So two citations share a label only when they share an original.
 */
function createLabelNumberer(messageIndex: number): (original: string) => string {
  const assigned = new Map<string, string>();
  const taken = new Set<string>();
  const fits = (number: string): boolean =>
    `m${messageIndex}-${number}`.length <= MAX_FOOTNOTE_LABEL_LENGTH;

  return original => {
    const existing = assigned.get(original);
    if (existing !== undefined) return existing;

    let number = original.replace(/\D/g, '');
    if (number === '' || taken.has(number) || !fits(number)) {
      let next = 1;
      while (taken.has(String(next))) next++;
      number = String(next);
    }
    assigned.set(original, number);
    taken.add(number);
    return number;
  };
}

function transformCitationsToFootnotes(
  html: string,
  messageIndex: number
): CitationTransformResult {
  return transformCitations(html, {
    hasCitations: doc => doc.querySelector(COMPUTED_SELECTORS.citationButton) !== null,
    collectFootnotes: doc => {
      const buttons = Array.from(doc.querySelectorAll(COMPUTED_SELECTORS.citationButton));
      const labelNumber = createLabelNumberer(messageIndex);
      const titleByNumber = new Map<string, string>();

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
        const number = labelNumber(parsed.number);
        button.replaceWith(createFootnoteRef(doc, `m${messageIndex}-${number}`));

        if (!titleByNumber.has(number)) titleByNumber.set(number, parsed.title);
      }

      return [...titleByNumber].map(([number, title]) => ({
        label: `m${messageIndex}-${number}`,
        title,
      }));
    },
  });
}

/**
 * NotebookLM chat conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class NotebookLMExtractor extends BaseExtractor {
  readonly platform = 'notebooklm';

  // ========== ID & Title Extraction ==========

  /**
   * Extract notebook ID from URL
   *
   * URL format: https://notebook.google.com/notebook/{uuid}
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
    return 'Untitled Gemini Notebook Conversation';
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

    return sanitizeHtml(transformedHtml + footnoteDefsToHtml(footnotes));
  }
}
