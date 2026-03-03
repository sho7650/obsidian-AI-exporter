/**
 * Gemini-specific conversation extractor
 * Based on DOM analysis from elements-sample.html
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import {
  MAX_DEEP_RESEARCH_TITLE_LENGTH,
  MAX_CONVERSATION_TITLE_LENGTH,
  SCROLL_TIMEOUT,
} from '../../lib/constants';
import { ensureAllElementsLoaded, type ScrollResult } from '../../lib/scroll-manager';
import type {
  ExtensionSettings,
  ExtractionResult,
  ConversationMessage,
  DeepResearchSource,
  DeepResearchLinks,
} from '../../lib/types';

/**
 * CSS selectors for Gemini UI elements
 * Updated based on actual DOM analysis from element-sample.html
 */
const SELECTORS = {
  // Conversation turn container (each Q&A pair)
  conversationTurn: ['.conversation-container', '[class*="conversation-container"]'],

  // User query element (Angular component)
  userQuery: ['user-query', '[class*="user-query"]'],

  // Query text lines (multiple lines per query)
  queryTextLine: ['.query-text-line', 'p[class*="query-text-line"]'],

  // Model response element (Angular component)
  modelResponse: ['model-response', '[class*="model-response"]'],

  // Model response markdown content
  modelResponseContent: [
    '.markdown.markdown-main-panel',
    '.markdown-main-panel',
    'message-content .markdown',
    '.model-response-text',
  ],

  // Conversation title (top bar + sidebar)
  conversationTitle: [
    '[data-test-id="conversation-title"]',
    '.conversation-title.gds-title-m',
    '.conversation-title',
    '[class*="conversation-title"]',
  ],

  // Scroll container for lazy-load detection
  // infinite-scroller (data-test-id="chat-history-container") is the actual
  // scrollable element (overflow-y: scroll). It fires onScrolledTopPastThreshold
  // when scrollTop crosses below a threshold (edge-triggered).
  // #chat-history is a non-scrolling wrapper — excluded to avoid false matches.
  scrollContainer: ['[data-test-id="chat-history-container"]', 'infinite-scroller'],
};

/**
 * Deep Research specific selectors
 * Used to detect and extract content from the Deep Research immersive panel
 */
const DEEP_RESEARCH_SELECTORS = {
  // Deep Research panel (existence check)
  panel: ['deep-research-immersive-panel'],

  // Report title
  title: [
    'deep-research-immersive-panel h2.title-text.gds-title-s',
    'deep-research-immersive-panel .title-text',
    'toolbar h2.title-text',
  ],

  // Report content
  content: [
    '#extended-response-markdown-content',
    'message-content#extended-response-message-content .markdown-main-panel',
    'structured-content-container[data-test-id="message-content"] .markdown-main-panel',
  ],
};

/**
 * Deep Research link extraction selectors
 */
const DEEP_RESEARCH_LINK_SELECTORS = {
  // Inline citations
  inlineCitation: [
    'source-footnote sup.superscript[data-turn-source-index]',
    'sup.superscript[data-turn-source-index]',
  ],
  // Source list container
  sourceListContainer: ['deep-research-source-lists', '#used-sources-list'],
  // Source list items
  sourceListItem: ['a[data-test-id="browse-web-item-link"]', 'a[data-test-id="browse-chip-link"]'],
  // Source title
  sourceTitle: ['[data-test-id="title"]', '.sub-title'],
  // Source domain
  sourceDomain: ['[data-test-id="domain-name"]', '.display-name'],
};

/**
 * Pre-computed selector strings for performance optimization
 * Avoids repeated .join(',') calls inside loops
 */
const COMPUTED_SELECTORS = {
  conversationTurn: SELECTORS.conversationTurn.join(','),
  sourceListItem: DEEP_RESEARCH_LINK_SELECTORS.sourceListItem.join(','),
  sourceTitle: DEEP_RESEARCH_LINK_SELECTORS.sourceTitle.join(','),
  sourceDomain: DEEP_RESEARCH_LINK_SELECTORS.sourceDomain.join(','),
} as const;

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini';

  /** Whether auto-scroll is enabled (set from settings before extract()) */
  enableAutoScroll = false;

  /**
   * Apply user settings: enable/disable auto-scroll
   */
  applySettings(settings: ExtensionSettings): void {
    this.enableAutoScroll = settings.enableAutoScroll ?? false;
  }

  /** Stores scroll result from onBeforeExtract for onAfterExtract */
  private lastScrollResult: ScrollResult | null = null;

  /**
   * Check if this extractor can handle the current page
   */
  canExtract(): boolean {
    return window.location.hostname === 'gemini.google.com';
  }

  /**
   * Check if Deep Research panel is currently visible
   */
  isDeepResearchVisible(): boolean {
    const panel = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.panel);
    return panel !== null;
  }

  // ========== Template Method Hooks ==========

  /**
   * Intercept for Deep Research mode before normal extraction
   */
  protected tryExtractDeepResearch(): ExtractionResult | null {
    if (!this.isDeepResearchVisible()) return null;
    console.info('[G2O] Deep Research panel detected, extracting report');
    return this.buildDeepResearchResult();
  }

  /**
   * Pre-extraction: run auto-scroll to load all messages
   */
  protected async onBeforeExtract(): Promise<void> {
    if (!this.enableAutoScroll) {
      this.lastScrollResult = {
        fullyLoaded: true,
        elementCount: 0,
        scrollIterations: 0,
        skipped: true,
      };
      return;
    }

    const container = this.queryWithFallback<HTMLElement>(SELECTORS.scrollContainer);
    if (!container) {
      console.info('[G2O] No scroll container found, skipping auto-scroll');
      this.lastScrollResult = {
        fullyLoaded: true,
        elementCount: 0,
        scrollIterations: 0,
        skipped: true,
      };
      return;
    }

    this.lastScrollResult = await ensureAllElementsLoaded(
      container,
      COMPUTED_SELECTORS.conversationTurn
    );
  }

  /**
   * Post-extraction: append scroll timeout warning if needed
   */
  protected onAfterExtract(result: ExtractionResult): ExtractionResult {
    const sr = this.lastScrollResult;
    if (sr && !sr.fullyLoaded && !sr.skipped) {
      const warning =
        `Auto-scroll timed out after ${SCROLL_TIMEOUT / 1000}s. ` +
        `Some earlier messages may be missing (${sr.elementCount} turns loaded).`;
      if (result.warnings) {
        result.warnings.push(warning);
      } else {
        result.warnings = [warning];
      }
    }
    this.lastScrollResult = null;
    return result;
  }

  /**
   * Get title of the Deep Research report
   */
  getDeepResearchTitle(): string {
    const titleEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.title);
    if (titleEl?.textContent) {
      return this.sanitizeText(titleEl.textContent).substring(0, MAX_DEEP_RESEARCH_TITLE_LENGTH);
    }
    return 'Untitled Deep Research Report';
  }

  /**
   * Extract Deep Research report body content
   */
  extractDeepResearchContent(): string {
    const contentEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.content);
    if (contentEl) {
      return sanitizeHtml(contentEl.innerHTML);
    }
    return '';
  }

  /**
   * Extract source list from Deep Research panel
   * Sources are in the deep-research-source-lists element
   *
   * Important: data-turn-source-index is 1-based
   * Mapping: data-turn-source-index="N" → sources[N-1]
   */
  extractSourceList(): DeepResearchSource[] {
    const sources: DeepResearchSource[] = [];
    const sourceLinks = document.querySelectorAll(COMPUTED_SELECTORS.sourceListItem);

    sourceLinks.forEach((link, index) => {
      const anchor = link as HTMLAnchorElement;
      const url = anchor.href;

      // Extract title using pre-computed selector
      const titleEl = anchor.querySelector(COMPUTED_SELECTORS.sourceTitle);
      const title = titleEl?.textContent?.trim() || 'Unknown Title';

      // Extract domain (fallback to URL parsing) using pre-computed selector
      const domainEl = anchor.querySelector(COMPUTED_SELECTORS.sourceDomain);
      let domain = domainEl?.textContent?.trim() || '';
      if (!domain) {
        try {
          domain = new URL(url).hostname;
        } catch {
          domain = 'unknown';
        }
      }

      sources.push({
        index, // 0-based array index
        url,
        title: this.sanitizeText(title),
        domain,
      });
    });

    return sources;
  }

  /**
   * Extract all Deep Research link information
   * Only extracts source list; inline citations are processed during Markdown conversion
   */
  extractDeepResearchLinks(): DeepResearchLinks {
    const sources = this.extractSourceList();

    return {
      sources,
    };
  }

  /**
   * Get conversation ID from URL
   * URL format: https://gemini.google.com/app/{conversationId}
   *          or https://gemini.google.com/gem/{conversationId}
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/(app|gem)\/([a-f0-9]+)/i);
    return match ? match[2] : null;
  }

  /**
   * Get conversation title from top bar, first user query, or sidebar
   */
  getTitle(): string {
    // Priority 1: Top bar title ([data-test-id="conversation-title"] or sidebar)
    const topBarTitle = this.queryWithFallback<HTMLElement>(SELECTORS.conversationTitle);
    if (topBarTitle?.textContent) {
      const title = this.sanitizeText(topBarTitle.textContent);
      if (title) {
        return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
      }
    }

    // Priority 2: First user query text
    const firstQueryText = this.queryWithFallback<HTMLElement>(SELECTORS.queryTextLine);
    if (firstQueryText?.textContent) {
      const title = this.sanitizeText(firstQueryText.textContent);
      return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
    }

    return 'Untitled Gemini Conversation';
  }

  /**
   * Extract all messages from the conversation
   * Iterates through each conversation-container to extract Q&A pairs
   */
  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Get all conversation turns (each contains one Q&A pair)
    const turns = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);

    if (turns.length === 0) {
      console.warn('[G2O] No conversation turns found, trying fallback extraction');
      return this.extractMessagesFromRoot();
    }

    console.info(`[G2O] Found ${turns.length} conversation turns`);

    // Process each conversation turn
    turns.forEach((turn, index) => {
      // Extract user query from this turn
      const userQuery = turn.querySelector('user-query');
      if (userQuery) {
        const content = this.extractUserQueryContent(userQuery);
        if (content) {
          messages.push({
            id: `user-${index}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
      }

      // Extract model response from this turn
      const modelResponse = turn.querySelector('model-response');
      if (modelResponse) {
        const content = this.extractModelResponseContent(modelResponse);
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
   * Extract messages from document root (fallback for non-standard layouts)
   */
  private extractMessagesFromRoot(): ConversationMessage[] {
    const userQueries = this.queryAllWithFallback<HTMLElement>(SELECTORS.userQuery);
    const modelResponses = this.queryAllWithFallback<HTMLElement>(SELECTORS.modelResponse);

    console.info(
      `[G2O] Fallback: Found ${userQueries.length} user queries, ${modelResponses.length} model responses`
    );

    const allElements: Array<{ element: Element; type: 'user' | 'assistant' }> = [];
    userQueries.forEach(el => allElements.push({ element: el, type: 'user' }));
    modelResponses.forEach(el => allElements.push({ element: el, type: 'assistant' }));

    this.sortByDomPosition(allElements);

    return this.buildMessagesFromElements(
      allElements,
      el => this.extractUserQueryContent(el),
      el => this.extractModelResponseContent(el)
    );
  }

  /**
   * Extract user query content with multi-line support
   * Joins all .query-text-line elements with newlines
   */
  private extractUserQueryContent(element: Element): string {
    // Get all query text lines and join them
    const lines = element.querySelectorAll('.query-text-line');

    if (lines.length > 0) {
      const textParts: string[] = [];
      lines.forEach(line => {
        const text = line.textContent?.trim();
        if (text) {
          textParts.push(text);
        }
      });
      if (textParts.length > 0) {
        return textParts.join('\n');
      }
    }

    // Fallback: try queryTextLine selector
    const textEl = this.queryWithFallback<HTMLElement>(SELECTORS.queryTextLine, element);
    if (textEl?.textContent) {
      return this.sanitizeText(textEl.textContent);
    }

    // Final fallback: element's full text content
    return this.sanitizeText(element.textContent || '');
  }

  /**
   * Extract model response content (HTML for markdown conversion)
   * All HTML is sanitized via DOMPurify to prevent XSS (NEW-01)
   */
  private extractModelResponseContent(element: Element): string {
    const contentEl = this.queryWithFallback<HTMLElement>(SELECTORS.modelResponseContent, element);
    if (contentEl) {
      return sanitizeHtml(contentEl.innerHTML);
    }
    // Final fallback: element's HTML
    return sanitizeHtml(element.innerHTML);
  }
}
