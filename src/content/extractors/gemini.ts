/**
 * Gemini-specific conversation extractor
 * Based on DOM analysis from elements-sample.html
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import { extractErrorMessage } from '../../lib/error-utils';
import {
  ensureAllElementsLoaded,
  describeScrollStop,
  type ScrollResult,
} from '../../lib/scroll-manager';
import { ImageMarkerCollector } from '../image-markers';
import type {
  SyncSettings,
  ExtractionResult,
  ConversationMessage,
  DeepResearchSource,
} from '../../lib/types';

import { SELECTORS, DEEP_RESEARCH_SELECTORS, COMPUTED_SELECTORS } from './selectors/gemini';

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini';

  /** Whether generated images are captured (set from settings before extract()) */
  enableImageExport = true;

  /**
   * Generated-image markers, registered (sync) while extractMessages()
   * rewrites `<img>` and drained (async) in extract(). Ids count up within one
   * extraction — safe here because Gemini extracts in a single pass — and the
   * counter and collector are reset at the start of every extract().
   */
  private readonly images = new ImageMarkerCollector();
  private imageIdCounter = 0;

  /** Apply the settings only Gemini has; the shared ones live in BaseExtractor. */
  protected applyPlatformSettings(settings: SyncSettings): void {
    this.enableImageExport = settings.enableImageExport ?? true;
  }

  /**
   * Check if Deep Research panel is currently visible
   */
  isDeepResearchVisible(): boolean {
    const panel = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.panel);
    return panel !== null;
  }

  // ========== Extraction ==========

  /**
   * Override extract() so Gemini-specific auto-scroll runs before message
   * extraction and a scroll-timeout warning is appended after.
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return { success: false, error: `Not on a ${this.platformLabel} page` };
      }
      const deepResearchResult = this.tryExtractDeepResearch();
      if (deepResearchResult) return deepResearchResult;

      // Reset per-extraction image state before extractMessages() populates it.
      this.imageIdCounter = 0;
      this.images.reset();

      const scrollResult = await this.runAutoScroll();

      console.info(`[G2O] Extracting ${this.platformLabel} conversation`);
      const messages = this.extractMessages();
      const conversationId = this.getConversationId() || `${this.platform}-${Date.now()}`;
      const title = this.getTitle();
      const baseResult = this.buildConversationResult(
        messages,
        conversationId,
        title,
        this.platform
      );

      // Fetch captured generated images (blob → base64) and attach to the data.
      const result = await this.images.attach(baseResult);

      // One builder for both engines: this warning used to be a byte-identical
      // literal here and in BaseExtractor.collectMessages() (ADR-032).
      const warning = scrollResult
        ? describeScrollStop(
            scrollResult.stopReason,
            scrollResult.elementCount,
            this.scrollDeadlines
          )
        : undefined;
      if (warning) {
        return { ...result, warnings: [...(result.warnings ?? []), warning] };
      }
      return result;
    } catch (error) {
      console.error(`[G2O] ${this.platformLabel} extraction error:`, error);
      return { success: false, error: extractErrorMessage(error) };
    }
  }

  private async runAutoScroll(): Promise<ScrollResult> {
    if (!this.enableAutoScroll) {
      return {
        fullyLoaded: true,
        elementCount: 0,
        scrollIterations: 0,
        skipped: true,
        stopReason: 'complete',
      };
    }
    const container = this.queryWithFallback<HTMLElement>(SELECTORS.scrollContainer);
    if (!container) {
      console.info('[G2O] No scroll container found, skipping auto-scroll');
      return {
        fullyLoaded: true,
        elementCount: 0,
        scrollIterations: 0,
        skipped: true,
        stopReason: 'complete',
      };
    }
    return ensureAllElementsLoaded(
      container,
      COMPUTED_SELECTORS.conversationTurn,
      this.scrollDeadlines
    );
  }

  /** Expose platform selectors to BaseExtractor's DR title/content helpers. */
  protected getDeepResearchSelectors() {
    return DEEP_RESEARCH_SELECTORS;
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
      const domain = domainEl?.textContent?.trim() || this.extractDomain(url);

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
   * Get conversation ID from URL.
   *
   * URL formats (issue #331):
   *   https://gemini.google.com/app/{conversationId}
   *   https://gemini.google.com/gem/{gemId}/{conversationId}
   *
   * Gem URLs carry TWO ids; the conversation id is the SECOND segment.
   * The first segment is the Gem's own id, shared by every conversation
   * of that Gem — using it would give all of them the same note id and
   * let them overwrite each other. A freshly opened Gem chat sits at
   * /gem/{gemId} with no conversation yet: return null so the caller
   * falls back to a timestamp id, same as a fresh /app chat.
   */
  getConversationId(): string | null {
    const path = window.location.pathname;
    const gem = path.match(/\/gem\/[a-f0-9]+\/([a-f0-9]+)/i);
    if (gem) return gem[1];
    const app = path.match(/\/app\/([a-f0-9]+)/i);
    return app ? app[1] : null;
  }

  /**
   * Get conversation title from document.title, falling back to the first
   * user query.
   *
   * Gemini renders its auto-generated chat name as
   * `"<name> - Google Gemini"` in document.title while a conversation is open
   * (verified live 2026-09-14, issue #504, ADR-040); the bare landing page and
   * a not-yet-named chat carry only "Google Gemini", which getPageTitle()
   * rejects. No in-page title element exists (the old top-bar selector group
   * never matched after 2026-03 and was removed), so the first query is the
   * only DOM fallback.
   */
  getTitle(): string {
    return (
      this.getPageTitle() ??
      this.getFirstMessageTitle(SELECTORS.queryTextLine, 'Untitled Gemini Conversation')
    );
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

    const sortedElements = this.sortByDomPosition(allElements);

    return this.buildMessagesFromElements(
      sortedElements,
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
    return this.extractPlainText(element);
  }

  /**
   * Extract model response content (HTML for markdown conversion)
   * All HTML is sanitized via DOMPurify to prevent XSS (NEW-01).
   * Generated `<img>` elements are rewritten to `data-g2o-image` markers and
   * their blob URLs recorded for async capture (see collectPendingImages).
   */
  private extractModelResponseContent(element: Element): string {
    const contentEl =
      this.queryWithFallback<HTMLElement>(SELECTORS.modelResponseContent, element) ??
      (element as HTMLElement);
    return sanitizeHtml(this.replaceGeneratedImages(contentEl));
  }

  /**
   * Return the element's innerHTML with every generated `<img>` replaced by a
   * `<img data-g2o-image="img-N">` marker; the live images are queued on the
   * shared collector for async capture (see {@link ImageMarkerCollector}).
   */
  private replaceGeneratedImages(element: HTMLElement): string {
    return this.images.rewrite(element, {
      selector: COMPUTED_SELECTORS.generatedImage,
      enabled: this.enableImageExport,
      idFor: () => `img-${++this.imageIdCounter}`,
    });
  }
}
