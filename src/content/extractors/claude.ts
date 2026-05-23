/**
 * Claude Extractor
 *
 * Extracts conversations from Claude AI (claude.ai)
 * Supports both normal chat and Deep Research (Extended Thinking) modes
 *
 * @see docs/design/DES-002-claude-extractor.md
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import { htmlToMarkdownRaw } from '../markdown-rules';
import type {
  ConversationMessage,
  DeepResearchSource,
  DeepResearchLinks,
  SyncSettings,
  ExtractionResult,
} from '../../lib/types';
import { SELECTORS, DEEP_RESEARCH_SELECTORS, JOINED_SELECTORS } from './selectors/claude';

/**
 * Claude conversation and Deep Research extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude';
  /** Include tool-use / intermediate content (web search, code interpreter, etc.) */
  enableToolContent = false;

  /**
   * Apply user settings: enable/disable tool content extraction
   */
  applySettings(settings: SyncSettings): void {
    this.enableToolContent = settings.enableToolContent ?? false;
  }

  // ========== Platform Detection ==========

  /**
   * Check if this extractor can handle the current page
   *
   * IMPORTANT: Uses strict comparison (===) to prevent
   * subdomain attacks like "evil-claude.ai.attacker.com"
   * @see NFR-001-1 in design document
   */
  canExtract(): boolean {
    return window.location.hostname === 'claude.ai';
  }

  /**
   * Check if Deep Research mode is visible
   *
   * Detects presence of #markdown-artifact element
   * @see FR-003-3 in design document
   */
  isDeepResearchVisible(): boolean {
    const artifact = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.artifact);
    return artifact !== null;
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL format: https://claude.ai/chat/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/chat\/([a-f0-9-]{36})/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. Deep Research h1 title (if Deep Research visible)
   * 2. document.title (via getPageTitle())
   * 3. First user message content (truncated)
   * 4. Default title
   */
  getTitle(): string {
    if (this.isDeepResearchVisible()) {
      return this.getDeepResearchTitle();
    }

    return (
      this.getPageTitle() ??
      this.getFirstMessageTitle(SELECTORS.userMessage, 'Untitled Claude Conversation')
    );
  }

  /** Expose platform selectors to BaseExtractor's DR title/content helpers. */
  protected getDeepResearchSelectors() {
    return DEEP_RESEARCH_SELECTORS;
  }

  // ========== Deep Research Hook ==========

  /**
   * Intercept for Deep Research mode before normal extraction
   */
  protected tryExtractDeepResearch(): ExtractionResult | null {
    if (!this.isDeepResearchVisible()) return null;
    console.info('[G2O] Claude Deep Research panel detected, extracting report');
    return this.buildDeepResearchResult();
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Extracts User/Assistant messages in DOM order
   * @see FR-002 in design document
   */
  extractMessages(): ConversationMessage[] {
    // Collect all message elements
    const allElements: Array<{ element: Element; type: 'user' | 'assistant' }> = [];

    // Find user messages (skip nested content inside assistant responses)
    const userMessages = this.queryAllWithFallback<HTMLElement>(SELECTORS.userMessage);
    userMessages.forEach(el => {
      const assistantParent = el.closest('.font-claude-response, [class*="font-claude-response"]');
      if (!assistantParent) {
        allElements.push({ element: el, type: 'user' });
      }
    });

    // Find assistant responses
    const assistantResponses = this.queryAllWithFallback<HTMLElement>(SELECTORS.assistantResponse);
    assistantResponses.forEach(el => {
      allElements.push({ element: el, type: 'assistant' });
    });

    const sortedElements = this.sortByDomPosition(allElements);

    // Pre-extract tool content keyed by message ID (matches buildMessagesFromElements format)
    const toolContentById = new Map<string, string>();
    if (this.enableToolContent) {
      sortedElements.forEach((item, index) => {
        if (item.type === 'assistant') {
          const tc = this.extractToolContentFromElement(item.element);
          if (tc) toolContentById.set(`assistant-${index}`, tc);
        }
      });
    }

    const messages = this.buildMessagesFromElements(
      sortedElements,
      el => this.extractUserContent(el),
      el => this.extractAssistantContent(el)
    );

    // Attach tool content to corresponding assistant messages (DES-014 H-5: immutable)
    if (toolContentById.size === 0) return messages;

    return messages.map(msg => {
      const tc = toolContentById.get(msg.id);
      return tc ? { ...msg, toolContent: tc } : msg;
    });
  }

  /**
   * Extract user message content as markdown.
   *
   * Sanitizes the grid container's innerHTML via DOMPurify and converts it
   * to markdown (without angle-bracket escaping — {@link formatMessage}
   * applies that step later). This preserves paragraph breaks and
   * `<pre>`/`<code>` blocks that a plain `textContent` extraction would
   * flatten or drop entirely (see issue #200).
   *
   * Falls back to sanitized plain text for elements that produce no
   * markdown output (e.g. bare text nodes without block structure).
   */
  private extractUserContent(element: Element): string {
    const rawHtml = element.innerHTML;
    if (rawHtml) {
      const markdown = htmlToMarkdownRaw(sanitizeHtml(rawHtml)).trim();
      if (markdown) return markdown;
    }

    // Defensive fallback: preserve prior behavior for elements that have
    // only a text node and no convertible HTML structure.
    const textContent = element.textContent?.trim();
    if (textContent) {
      return this.sanitizeText(textContent);
    }
    return '';
  }

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * All HTML is sanitized via DOMPurify to prevent XSS
   * @see NFR-001-2 in design document
   */
  private extractAssistantContent(element: Element): string {
    // Grid layout: Extended Thinking or Tool-Use (.row-start-1 + .row-start-2)
    const responseSection = element.querySelector('.row-start-2');
    if (responseSection) {
      // Check if .row-start-2 has markdown content (Extended Thinking / Tool-Use)
      const markdownInSection = this.queryWithFallback<HTMLElement>(
        SELECTORS.markdownContent,
        responseSection
      );
      if (markdownInSection) {
        return sanitizeHtml(markdownInSection.innerHTML);
      }
      // .row-start-2 has no markdown content (e.g., thinking-status responses
      // where content is a grid sibling). Fall through to search entire element.
    }

    // Non-grid fallback or empty .row-start-2: search the entire element
    const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
    if (markdownEl) {
      return sanitizeHtml(markdownEl.innerHTML);
    }

    // Fallback: use the element's innerHTML
    return sanitizeHtml(element.innerHTML);
  }

  /**
   * Extract tool content from a full .font-claude-response element
   *
   * Returns tool content string if .row-start-1 contains tool-use content,
   * null otherwise (no grid, no tool section, or Extended Thinking).
   */
  private extractToolContentFromElement(element: Element): string | null {
    const responseSection = element.querySelector('.row-start-2');
    if (!responseSection) return null; // Non-grid → no tool content

    const toolSection = element.querySelector('.row-start-1');
    if (!toolSection) return null;

    const isExtendedThinking = toolSection.querySelector('[class*="group/thinking"]') !== null;
    if (isExtendedThinking) return null;

    const toolContent = this.extractToolContent(toolSection);
    return toolContent || null;
  }

  /**
   * Extract tool content from .row-start-1 section
   *
   * Extracts:
   * 1. Summary button text (e.g., "Searched the web") as bold
   * 2. Search queries (group/row buttons with query text and result count)
   * 3. Search result items (identified by favicon images)
   * 4. .standard-markdown content (code interpreter, file analysis)
   */
  private extractToolContent(toolSection: Element): string {
    const parts: string[] = [];
    this.extractToolSummary(toolSection, parts);
    this.extractToolQueries(toolSection, parts);
    this.extractToolResults(toolSection, parts);
    this.extractToolMarkdown(toolSection, parts);
    return parts.join('\n\n');
  }

  /** Summary button text (e.g., "Searched the web") as bold */
  private extractToolSummary(toolSection: Element, parts: string[]): void {
    const summaryButton = toolSection.querySelector('button span.truncate');
    if (summaryButton?.textContent) {
      parts.push('**' + this.sanitizeText(summaryButton.textContent) + '**');
    }
  }

  /** Search queries (group/row buttons with query text and result count) */
  private extractToolQueries(toolSection: Element, parts: string[]): void {
    const queryButtons = toolSection.querySelectorAll('[class*="group/row"]');
    queryButtons.forEach(btn => {
      const queryEl = btn.querySelector('.truncate');
      const countEl = btn.querySelector('p');
      if (queryEl?.textContent?.trim()) {
        let text = this.sanitizeText(queryEl.textContent);
        if (countEl?.textContent?.trim()) {
          text += ' (' + this.sanitizeText(countEl.textContent) + ')';
        }
        parts.push(text);
      }
    });
  }

  /** Search result items (identified by favicon images) */
  private extractToolResults(toolSection: Element, parts: string[]): void {
    const favicons = toolSection.querySelectorAll('img[alt="favicon"]');
    if (favicons.length === 0) return;

    const items: string[] = [];
    favicons.forEach(img => {
      // Navigate: img → container div → result row div
      const row = img.parentElement?.parentElement;
      if (!row || row.children.length < 2) return;
      // Children: [0]=favicon container, [1]=title, [2]=domain (optional)
      const title = row.children[1]?.textContent?.trim();
      const domain = row.children.length > 2 ? row.children[2]?.textContent?.trim() : undefined;
      if (title) {
        items.push(domain ? '- ' + title + ' (' + domain + ')' : '- ' + title);
      }
    });
    if (items.length > 0) {
      parts.push(items.join('\n'));
    }
  }

  /** .standard-markdown content (code interpreter, file analysis) */
  private extractToolMarkdown(toolSection: Element, parts: string[]): void {
    const markdownEls = toolSection.querySelectorAll('.standard-markdown');
    markdownEls.forEach(el => {
      const html = sanitizeHtml(el.innerHTML);
      if (html.trim()) {
        parts.push(html);
      }
    });
  }

  // ========== Deep Research Extraction ==========

  /**
   * Extract source list from Deep Research inline citations
   *
   * Deduplicates by URL and maintains DOM order
   * @see FR-003-4 in design document
   */
  extractSourceList(): DeepResearchSource[] {
    const sources: DeepResearchSource[] = [];
    const seenUrls = new Map<string, number>(); // URL -> index mapping for deduplication

    // Find all inline citation links
    const citationLinks = document.querySelectorAll<HTMLAnchorElement>(
      JOINED_SELECTORS.inlineCitation
    );

    citationLinks.forEach(link => {
      const url = link.href;
      if (!url || !url.startsWith('http')) return;

      // Skip duplicates
      if (seenUrls.has(url)) return;

      // Extract title from link text or parent
      let title = link.textContent?.trim() || '';
      if (!title || title.includes('+')) {
        // Try to get a better title from aria-label or title attribute
        title = link.getAttribute('aria-label') || link.getAttribute('title') || '';
      }
      if (!title) {
        title = 'Unknown Title';
      }

      // Extract domain
      let domain: string;
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = 'unknown';
      }

      const index = sources.length;
      seenUrls.set(url, index);

      sources.push({
        index,
        url,
        title: this.sanitizeText(title),
        domain,
      });
    });

    return sources;
  }

  /**
   * Extract all Deep Research link information
   *
   * API compatibility with GeminiExtractor
   */
  extractDeepResearchLinks(): DeepResearchLinks {
    const sources = this.extractSourceList();
    return { sources };
  }
}
