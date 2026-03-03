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
import type {
  ConversationMessage,
  DeepResearchSource,
  DeepResearchLinks,
  ExtensionSettings,
  ExtractionResult,
} from '../../lib/types';
import { MAX_DEEP_RESEARCH_TITLE_LENGTH } from '../../lib/constants';

/**
 * CSS Selectors for normal chat extraction
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-002-claude-extractor.md Section 5.2.2
 */
const SELECTORS = {
  // Conversation block selectors (each message block)
  // Stability: HIGH → LOW order for fallback
  conversationBlock: [
    '.group[style*="height: auto"]', // Structure-based (HIGH)
    '[data-test-render-count]', // Test attribute (LOW)
    '.group', // Generic (MEDIUM)
  ],

  // User message content selectors
  userMessage: [
    '.whitespace-pre-wrap.break-words', // Content style (HIGH)
    '[data-testid="user-message"]', // Test attribute (LOW)
    '[class*="user-message"]', // Partial match (MEDIUM)
    '.bg-bg-300 p', // Structure-based (MEDIUM)
  ],

  // User message wrapper (for date extraction)
  userWrapper: [
    '.rounded-xl.pl-2\\.5.py-2\\.5', // Style attribute (HIGH)
    '.bg-bg-300', // Tailwind (MEDIUM)
    '[class*="bg-bg-300"]', // Partial match (MEDIUM)
  ],

  // Assistant response selectors
  assistantResponse: [
    '.font-claude-response', // Semantic (HIGH)
    '[class*="font-claude-response"]', // Partial match (HIGH)
    '[data-is-streaming]', // Functional attribute (MEDIUM)
  ],

  // Markdown content selectors
  markdownContent: [
    '.standard-markdown', // Semantic (HIGH)
    '.progressive-markdown', // Semantic (HIGH)
    '[class*="markdown"]', // Partial match (MEDIUM)
  ],

  // Date selectors
  messageDate: [
    'span[data-state="closed"]', // Functional attribute (MEDIUM)
    '.text-text-500.text-xs', // Tailwind (MEDIUM)
    '[class*="text-text-500"]', // Partial match (LOW)
  ],
};

/**
 * CSS Selectors for Deep Research extraction
 *
 * @see DES-002-claude-extractor.md Section 5.2.3
 */
const DEEP_RESEARCH_SELECTORS = {
  // Artifact container (existence check)
  artifact: [
    '#markdown-artifact', // ID (HIGH)
    '[id*="markdown-artifact"]', // Partial match (HIGH)
  ],

  // Report title
  title: [
    '#markdown-artifact h1', // Structure (HIGH)
    '.standard-markdown h1', // Structure (HIGH)
    'h1.text-text-100', // Tailwind (MEDIUM)
    'h1', // Generic (LOW)
  ],

  // Report content
  content: [
    '#markdown-artifact .standard-markdown', // Structure (HIGH)
    '.standard-markdown', // Semantic (HIGH)
  ],

  // Inline citation links
  inlineCitation: [
    'span.inline-flex a[href^="http"]', // Structure (HIGH)
    '.group\\/tag a[href]', // Class (MEDIUM)
    'a[target="_blank"][href^="http"]', // Attribute (MEDIUM)
  ],
};

/**
 * Pre-computed selector strings for querySelectorAll
 * Avoids repeated .join(', ') calls at runtime
 */
const JOINED_SELECTORS = {
  inlineCitation: DEEP_RESEARCH_SELECTORS.inlineCitation.join(', '),
};

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
  applySettings(settings: ExtensionSettings): void {
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

  /**
   * Get Deep Research report title from h1 element
   */
  getDeepResearchTitle(): string {
    const titleEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.title);
    if (titleEl?.textContent) {
      return this.sanitizeText(titleEl.textContent).substring(0, MAX_DEEP_RESEARCH_TITLE_LENGTH);
    }
    return 'Untitled Deep Research Report';
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

    this.sortByDomPosition(allElements);

    // Pre-extract tool content keyed by element index
    const toolContentMap = new Map<number, string>();
    if (this.enableToolContent) {
      allElements.forEach((item, index) => {
        if (item.type === 'assistant') {
          const tc = this.extractToolContentFromElement(item.element);
          if (tc) toolContentMap.set(index, tc);
        }
      });
    }

    const messages = this.buildMessagesFromElements(
      allElements,
      el => this.extractUserContent(el),
      el => this.extractAssistantContent(el)
    );

    // Attach tool content to corresponding assistant messages
    if (toolContentMap.size > 0) {
      for (const msg of messages) {
        if (msg.role === 'assistant') {
          // msg.id = "assistant-N" where N is the allElements index
          const idx = parseInt(msg.id.split('-')[1], 10);
          const tc = toolContentMap.get(idx);
          if (tc) msg.toolContent = tc;
        }
      }
    }

    return messages;
  }

  /**
   * Extract user message content (plain text)
   */
  private extractUserContent(element: Element): string {
    // Try to get text content from the element
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
      return this.extractMarkdownFromSection(responseSection);
    }

    // Non-grid fallback: existing behavior
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

    // 1. Summary button text (group/status button > span.truncate)
    const summaryButton = toolSection.querySelector('button span.truncate');
    if (summaryButton?.textContent) {
      parts.push('**' + this.sanitizeText(summaryButton.textContent) + '**');
    }

    // 2. Search queries (group/row buttons contain query text and result count)
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

    // 3. Search result items (identified by favicon images)
    const favicons = toolSection.querySelectorAll('img[alt="favicon"]');
    if (favicons.length > 0) {
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

    // 4. .standard-markdown content (code interpreter, file analysis)
    const markdownEls = toolSection.querySelectorAll('.standard-markdown');
    markdownEls.forEach(el => {
      const html = sanitizeHtml(el.innerHTML);
      if (html.trim()) {
        parts.push(html);
      }
    });

    return parts.join('\n\n');
  }

  /**
   * Extract markdown content from a grid section (.row-start-1 or .row-start-2)
   */
  private extractMarkdownFromSection(section: Element): string {
    const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, section);
    if (markdownEl) {
      return sanitizeHtml(markdownEl.innerHTML);
    }
    return sanitizeHtml(section.innerHTML);
  }

  // ========== Deep Research Extraction ==========

  /**
   * Extract Deep Research report content
   */
  extractDeepResearchContent(): string {
    const contentEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.content);
    if (contentEl) {
      return sanitizeHtml(contentEl.innerHTML);
    }
    return '';
  }

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
      let domain = '';
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
