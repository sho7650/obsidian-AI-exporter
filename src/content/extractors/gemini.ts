/**
 * Gemini-specific conversation extractor
 * Based on DOM analysis from elements-sample.html
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import type { ExtractionResult, ConversationMessage } from '../../lib/types';

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
  ],

  // Conversation title (sidebar)
  conversationTitle: [
    '.conversation-title.gds-title-m',
    '.conversation-title',
    '[class*="conversation-title"]',
  ],
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

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  /**
   * Check if this extractor can handle the current page
   */
  canExtract(): boolean {
    return window.location.hostname === 'gemini.google.com';
  }

  /**
   * Deep Research パネルが表示中かどうかを判定
   */
  isDeepResearchVisible(): boolean {
    const panel = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.panel);
    return panel !== null;
  }

  /**
   * Deep Research レポートのタイトルを取得
   */
  getDeepResearchTitle(): string {
    const titleEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.title);
    if (titleEl?.textContent) {
      return this.sanitizeText(titleEl.textContent).substring(0, 200);
    }
    return 'Untitled Deep Research Report';
  }

  /**
   * Deep Research レポートの本文を抽出
   */
  extractDeepResearchContent(): string {
    const contentEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.content);
    if (contentEl) {
      return sanitizeHtml(contentEl.innerHTML);
    }
    return '';
  }

  /**
   * Get conversation ID from URL
   * URL format: https://gemini.google.com/app/{conversationId}
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/app\/([a-f0-9]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title from first user query or sidebar
   */
  getTitle(): string {
    // Try to get from first user query (first line of first query)
    const firstQueryText = this.queryWithFallback<HTMLElement>(SELECTORS.queryTextLine);
    if (firstQueryText?.textContent) {
      const title = this.sanitizeText(firstQueryText.textContent);
      return title.substring(0, 100);
    }

    // Fallback to sidebar title if available
    const sidebarTitle = this.queryWithFallback<HTMLElement>(SELECTORS.conversationTitle);
    if (sidebarTitle?.textContent) {
      return this.sanitizeText(sidebarTitle.textContent).substring(0, 100);
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
    const messages: ConversationMessage[] = [];

    const userQueries = this.queryAllWithFallback<HTMLElement>(SELECTORS.userQuery);
    const modelResponses = this.queryAllWithFallback<HTMLElement>(SELECTORS.modelResponse);

    console.info(
      `[G2O] Fallback: Found ${userQueries.length} user queries, ${modelResponses.length} model responses`
    );

    // Interleave based on DOM order
    const allElements: Array<{ element: Element; type: 'user' | 'assistant' }> = [];
    userQueries.forEach(el => allElements.push({ element: el, type: 'user' }));
    modelResponses.forEach(el => allElements.push({ element: el, type: 'assistant' }));

    // Sort by DOM position
    allElements.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    // Extract content
    allElements.forEach((item, index) => {
      const content =
        item.type === 'user'
          ? this.extractUserQueryContent(item.element)
          : this.extractModelResponseContent(item.element);

      if (content) {
        messages.push({
          id: `${item.type}-${index}`,
          role: item.type,
          content,
          htmlContent: item.type === 'assistant' ? content : undefined,
          index: messages.length,
        });
      }
    });

    return messages;
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
    // Primary: .markdown.markdown-main-panel
    const markdownEl = element.querySelector('.markdown.markdown-main-panel');
    if (markdownEl) {
      return sanitizeHtml(markdownEl.innerHTML);
    }

    // Fallback: .markdown-main-panel
    const mainPanel = element.querySelector('.markdown-main-panel');
    if (mainPanel) {
      return sanitizeHtml(mainPanel.innerHTML);
    }

    // Fallback: message-content .markdown
    const messageContent = element.querySelector('message-content .markdown');
    if (messageContent) {
      return sanitizeHtml(messageContent.innerHTML);
    }

    // Fallback: .model-response-text
    const responseText = element.querySelector('.model-response-text');
    if (responseText) {
      return sanitizeHtml(responseText.innerHTML);
    }

    // Final fallback: element's HTML
    return sanitizeHtml(element.innerHTML);
  }

  /**
   * Deep Research レポートを抽出
   */
  extractDeepResearch(): ExtractionResult {
    const title = this.getDeepResearchTitle();
    const content = this.extractDeepResearchContent();

    if (!content) {
      return {
        success: false,
        error: 'Deep Research content not found',
        warnings: ['Panel is visible but content element is empty or missing'],
      };
    }

    // タイトルからIDを生成（上書き用）
    const titleHash = this.generateHashValue(title);
    const conversationId = `deep-research-${titleHash}`;

    return {
      success: true,
      data: {
        id: conversationId,
        title,
        url: window.location.href,
        source: 'gemini',
        type: 'deep-research',
        messages: [
          {
            id: 'report-0',
            role: 'assistant',
            content,
            htmlContent: content,
            index: 0,
          },
        ],
        extractedAt: new Date(),
        metadata: {
          messageCount: 1,
          userMessageCount: 0,
          assistantMessageCount: 1,
          hasCodeBlocks: content.includes('<code') || content.includes('```'),
        },
      },
    };
  }

  /**
   * Main extraction method
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: 'Not on a Gemini page',
        };
      }

      // ルーティング: Deep Research パネルが表示中の場合はレポートを抽出
      if (this.isDeepResearchVisible()) {
        console.info('[G2O] Deep Research panel detected, extracting report');
        return this.extractDeepResearch();
      }

      // 通常の会話抽出
      console.info('[G2O] Extracting normal conversation');
      const messages = this.extractMessages();
      const warnings: string[] = [];

      if (messages.length === 0) {
        return {
          success: false,
          error: 'No messages found in conversation',
          warnings: ['Primary selectors may have changed. Check Gemini UI for updates.'],
        };
      }

      // Check for potential issues
      const userCount = messages.filter(m => m.role === 'user').length;
      const assistantCount = messages.filter(m => m.role === 'assistant').length;

      if (userCount === 0) {
        warnings.push('No user messages found');
      }
      if (assistantCount === 0) {
        warnings.push('No assistant messages found');
      }

      const conversationId = this.getConversationId() || `gemini-${Date.now()}`;
      const title = this.getTitle();

      return {
        success: true,
        data: {
          id: conversationId,
          title,
          url: window.location.href,
          source: 'gemini',
          messages,
          extractedAt: new Date(),
          metadata: {
            messageCount: messages.length,
            userMessageCount: userCount,
            assistantMessageCount: assistantCount,
            hasCodeBlocks: messages.some(
              m => m.content.includes('<code') || m.content.includes('```')
            ),
          },
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      console.error('[G2O] Extraction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }
}
