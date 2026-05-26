import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import { extractErrorMessage } from '../../lib/error-utils';
import type {
  ConversationMessage,
  ConversationData,
  ExtractionResult,
  SyncSettings,
} from '../../lib/types';
import { showToast, updateToast } from '../ui';

import { SELECTORS } from './selectors/notebooklm';
import { processPlainTextCitations } from '../citation-utils';

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
  messageIndex: number,
  sourceTitles: string[] = []
): CitationTransformResult {
  if (!html) {
    return { html: '', footnotes: [] };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const buttons = Array.from(doc.querySelectorAll('button.citation-marker'));

  const footnoteByNumber = new Map<string, string>();
  const order: string[] = [];

  // 1. Process Button Citations (Normal Chat)
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

  processPlainTextCitations(
    doc,
    messageIndex,
    (num) => sourceTitles[num - 1] || `Source ${num}`,
    footnoteByNumber,
    order
  );

  if (order.length === 0) {
    return { html: doc.body.innerHTML, footnotes: [] };
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

  /** Whether to extract notebook sources (driven by settings toggle) */
  private includeSources = false;

  // ========== Settings ==========

  override applySettings(settings: SyncSettings): void {
    super.applySettings(settings);
    this.includeSources = settings.enableNotebookSources ?? false;
  }

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

  // ========== Override Extract ==========
  
  override async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: `Not on a ${this.platformLabel} page`,
        };
      }

      console.info(`[G2O] Extracting ${this.platformLabel} conversation`);
      const conversationId = this.getConversationId() || `${this.platform}-${Date.now()}`;
      const title = this.getTitle();

      const messages = this.extractMessages();
      let chatResult: ExtractionResult | null = null;
      if (messages.length > 0) {
        chatResult = this.buildConversationResult(messages, conversationId, title, this.platform);
      }

      // Extract sources only when the setting is enabled
      if (!this.includeSources) {
        // Chat-only mode (default)
        if (!chatResult?.data || Array.isArray(chatResult.data)) {
          return {
            success: false,
            error: 'No chat messages found',
          };
        }
        return chatResult;
      }

      // Sources mode: extract chat + sources
      let sourcesData: ConversationData[] = [];
      try {
        sourcesData = await this.extractAllSources(conversationId, title);
      } catch (err) {
        console.warn(`[G2O] Source extraction failed/aborted, continuing with chat note:`, err);
      }

      const allData: ConversationData[] = [];

      // Add chat data with notebookTitle for path resolution
      if (chatResult?.data && !Array.isArray(chatResult.data)) {
        allData.push({ ...chatResult.data, notebookTitle: title });
      }

      // Add source data
      allData.push(...sourcesData);

      if (allData.length === 0) {
        return {
          success: false,
          error: 'No chat messages or sources found',
        };
      }

      return {
        success: true,
        data: allData,
      };

    } catch (error) {
      console.error(`[G2O] ${this.platformLabel} extraction error:`, error);
      return {
        success: false,
        error: extractErrorMessage(error),
      };
    }
  }

  // ========== Source Extraction ==========

  /**
   * Re-query source list items from the live DOM.
   * NotebookLM re-renders the panel after every click, so cached
   * node references become detached and cannot be clicked.
   */
  private getLiveSourceItems(): HTMLElement[] {
    return this.queryAllWithFallback<HTMLElement>(SELECTORS.sourceListItems);
  }

  /**
   * Wait until the source panel list is visible and has at least
   * `minCount` items.  Used after "back" navigation to confirm the
   * list has fully re-rendered before the next iteration.
   */
  private async waitForSourceList(minCount: number, timeoutMs = 8000): Promise<boolean> {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const items = this.getLiveSourceItems();
      if (items.length >= minCount) return true;
      await delay(150);
    }
    return false;
  }

  /**
   * Extract all sources sequentially using always-fresh DOM references.
   *
   * Key reliability improvements over the naïve approach:
   *  1. Re-query the source list on every iteration (avoids stale/detached refs).
   *  2. After "back" navigation, wait until the list re-appears before proceeding.
   *  3. Pass the previous content fingerprint so waitForSourceContent can
   *     confirm the viewer has actually switched to new content.
   *  4. Per-source try/catch — a single failure skips that source, not the batch.
   */
  private async extractAllSources(baseId: string, notebookTitle: string): Promise<ConversationData[]> {
    // Snapshot the total count once up front
    const totalCount = this.getLiveSourceItems().length;
    if (totalCount === 0) return [];

    // Helper to get stable prefix from mat-icon ligature name
    const getSourceTypePrefix = (iconName: string): string => {
      const name = iconName.toLowerCase();
      if (name.includes('link') || name.includes('public') || name.includes('web') || name.includes('language')) {
        return 'URL - ';
      }
      if (name.includes('description') || name.includes('drive') || name.includes('doc') || name.includes('article')) {
        return 'Doc - ';
      }
      if (name.includes('pdf')) {
        return 'PDF - ';
      }
      if (name.includes('note') || name.includes('text') || name.includes('edit') || name.includes('draft')) {
        return 'Paste - ';
      }
      if (name.includes('video') || name.includes('youtube') || name.includes('play')) {
        return 'YouTube - ';
      }
      return '';
    };

    const results: ConversationData[] = [];
    let previousContent = ''; // fingerprint to detect content switch

    for (let i = 0; i < totalCount; i++) {
      // --- 1. Re-query live DOM each iteration ---
      const items = this.getLiveSourceItems();
      const item = items[i];
      if (!item) {
        console.warn(`[G2O] Source item ${i + 1} not found in live DOM, skipping`);
        continue;
      }

      const titleEl = this.queryWithFallback<HTMLElement>(SELECTORS.sourceTitle, item);
      let sourceTitle = titleEl?.textContent?.trim() || `Source ${i + 1}`;

      // Get and apply prefix derived from DOM mat-icon
      const iconEl = item.querySelector('mat-icon');
      const iconName = iconEl?.textContent?.trim() || '';
      const prefix = getSourceTypePrefix(iconName);
      if (prefix && !sourceTitle.startsWith(prefix)) {
        sourceTitle = `${prefix}${sourceTitle}`;
      }

      updateToast(`Extracting source ${i + 1} of ${totalCount}: ${sourceTitle}...`);

      try {
        // --- 2. Click via live reference ---
        const clickTarget = this.queryWithFallback<HTMLElement>(SELECTORS.sourceListClickTarget, item);
        if (!clickTarget) {
          console.warn(`[G2O] No click target for source "${sourceTitle}", skipping`);
          continue;
        }
        clickTarget.click();

        // --- 3. Wait for content to change away from previous source ---
        const content = await this.waitForSourceContent(previousContent);

        if (content) {
          previousContent = content.substring(0, 200); // fingerprint for next iteration
          results.push({
            id: `${baseId}-source-${i}`,
            title: sourceTitle,
            notebookTitle,
            url: window.location.href,
            source: this.platform,
            type: 'notebook-source',
            messages: [{
              id: `source-${i}`,
              role: 'assistant',
              content: sanitizeHtml(content),
              htmlContent: sanitizeHtml(content),
              index: 0
            }],
            extractedAt: new Date(),
            metadata: {
              messageCount: 1,
              userMessageCount: 0,
              assistantMessageCount: 1,
              hasCodeBlocks: false
            }
          });
        } else {
          console.warn(`[G2O] Source "${sourceTitle}" timed out waiting for content`);
        }
      } catch (err) {
        console.warn(`[G2O] Failed to extract source "${sourceTitle}":`, err);
      }

      // --- 4. Navigate back and wait for list to re-render ---
      const backBtn = this.queryWithFallback<HTMLElement>(SELECTORS.panelHeaderClickable);
      if (backBtn) {
        backBtn.click();
      }

      // Wait for source list to reappear (up to 5 s) before next iteration
      const listReady = await this.waitForSourceList(totalCount);
      if (!listReady) {
        console.warn(`[G2O] Source list did not re-appear after navigating back from source ${i + 1}`);
      }
    }

    return results;
  }

  /**
   * Wait for the source viewer to show content that differs from the
   * previous source's content fingerprint.
   *
   * @param previousContent - First 200 chars of the previous source body.
   *   Empty string on the first source (no prior content to compare).
   * @param timeoutMs - Maximum wait time in milliseconds.
   */
  private async waitForSourceContent(
    previousContent = '',
    timeoutMs = 12000
  ): Promise<string> {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const deadline = Date.now() + timeoutMs;
    const identicalAcceptTime = Date.now() + 2500; // Accept identical content after 2.5s

    while (Date.now() < deadline) {
      const viewers = this.queryAllWithFallback<HTMLElement>(SELECTORS.sourceViewer);
      const viewer = viewers.find(v => v.offsetParent !== null);

      if (viewer) {
        const body = this.queryWithFallback<HTMLElement>(SELECTORS.sourceViewerBody, viewer);
        const text = body?.textContent?.trim() ?? '';

        if (text.length > 0) { // Support extremely short documents too
          const fingerprint = text.substring(0, 200);
          // Confirm it is genuinely new content (not stale from previous source)
          const isNewContent = !previousContent || fingerprint !== previousContent;
          
          if (isNewContent) {
            // Extra stabilisation delay — let any remaining lazy elements render
            await delay(400);
            const stableBody = this.queryWithFallback<HTMLElement>(SELECTORS.sourceViewerBody, viewer);
            return stableBody?.innerHTML || '';
          } else if (Date.now() > identicalAcceptTime) {
            // We waited 2.5 seconds and content is identical. 
            // Assume the user actually uploaded two identical files or empty files.
            return body?.innerHTML || '';
          }
        }
      }

      await delay(150);
    }

    return '';
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
   * Extract user message content (plain text)
   */
  private extractUserContent(element: HTMLElement): string {
    return this.extractPlainText(element);
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

    // Grab source titles from sidebar to resolve plain-text citations in Deep Research docs
    const sourceTitles = this.queryAllWithFallback<HTMLElement>(SELECTORS.sourceTitle)
      .map(el => this.sanitizeText(el.textContent || ''));

    const { html: transformedHtml, footnotes } = transformCitationsToFootnotes(
      rawHtml,
      messageIndex,
      sourceTitles
    );

    const footnoteDefsHtml = footnotes
      .map(line => `<p data-footnote-def="">${escapeHtml(line)}</p>`)
      .join('');

    return sanitizeHtml(transformedHtml + footnoteDefsHtml);
  }
}
