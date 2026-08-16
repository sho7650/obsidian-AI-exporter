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
import { captureImage } from '../image-capture';
import type {
  SyncSettings,
  ExtractionResult,
  ConversationMessage,
  DeepResearchSource,
  ExtractedImage,
} from '../../lib/types';

import { SELECTORS, DEEP_RESEARCH_SELECTORS, COMPUTED_SELECTORS } from './selectors/gemini';

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini';

  /** Whether generated images are captured (set from settings before extract()) */
  enableImageExport = true;

  /**
   * Generated-image capture state, populated (sync) while extractMessages()
   * rewrites `<img>` into markers and drained (async) in extract(). Reset at
   * the start of every extract() so re-runs never carry stale ids.
   */
  private imageIdCounter = 0;
  private pendingImages: Array<{ id: string; alt: string; element: HTMLImageElement }> = [];
  /** Reasons images could not be captured, surfaced as a warning (issue: revoked blob URLs). */
  private imageFailures: string[] = [];

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
      this.pendingImages = [];
      this.imageFailures = [];

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
      const result = await this.attachImages(baseResult);

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
   * Get conversation title from the first user query.
   *
   * Gemini stopped rendering a conversation-title element by 2026-03 (the
   * old top-bar selector group never matched again), so the first query has
   * been the de-facto title source ever since; the dead path was removed.
   */
  getTitle(): string {
    return this.getFirstMessageTitle(SELECTORS.queryTextLine, 'Untitled Gemini Conversation');
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
   * `<img data-g2o-image="img-N">` marker. Each replaced image's blob URL and
   * alt text are recorded in {@link pendingImages} for later async capture.
   * Operates on a clone so the live DOM is never mutated.
   */
  private replaceGeneratedImages(element: HTMLElement): string {
    if (!element.querySelector(COMPUTED_SELECTORS.generatedImage)) {
      return element.innerHTML;
    }

    const clone = element.cloneNode(true) as HTMLElement;
    const imgs = clone.querySelectorAll<HTMLImageElement>(COMPUTED_SELECTORS.generatedImage);
    // The clone's images are markers-to-be; the LIVE elements are what capture
    // needs, because a revoked blob URL can only be read back off the rendered
    // bitmap. querySelectorAll is document order, so index i pairs the two.
    const live = element.querySelectorAll<HTMLImageElement>(COMPUTED_SELECTORS.generatedImage);
    imgs.forEach((img, index) => {
      // Image export disabled: drop the generated image so a src-less <img>
      // does not leak an empty `![]()` link into the note.
      if (!this.enableImageExport) {
        img.remove();
        return;
      }

      const src = img.getAttribute('src') ?? '';
      const element = live[index];
      if (!src || !element) return;
      const id = `img-${++this.imageIdCounter}`;
      const alt = img.getAttribute('alt') ?? '';
      this.pendingImages.push({ id, alt, element });

      const marker = clone.ownerDocument.createElement('img');
      marker.setAttribute('data-g2o-image', id);
      if (alt) marker.setAttribute('alt', alt);
      img.replaceWith(marker);
    });

    return clone.innerHTML;
  }

  /**
   * Attach captured images to a successful extraction result (immutably).
   * Failed fetches are skipped; their markers remain in the body and are
   * resolved away per output destination.
   */
  private async attachImages(result: ExtractionResult): Promise<ExtractionResult> {
    if (!result.success || !result.data) return result;
    const images = await this.collectPendingImages();
    const warnings =
      this.imageFailures.length > 0
        ? [
            ...(result.warnings ?? []),
            `${this.imageFailures.length} image(s) could not be captured: ${[...new Set(this.imageFailures)].join('; ')}`,
          ]
        : result.warnings;
    return { ...result, data: { ...result.data, images }, ...(warnings && { warnings }) };
  }

  /**
   * Drain {@link pendingImages}, fetching each blob URL as base64 in the page
   * context. Sequential to avoid overwhelming the page; a handful of images.
   */
  private async collectPendingImages(): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = [];
    for (const pending of this.pendingImages) {
      const result = await captureImage(pending.element, pending.id, pending.alt);
      if (result.image) {
        images.push(result.image);
        continue;
      }
      // Never drop an image in silence: a lost one leaves an empty assistant
      // message that looks identical to image export being switched off.
      const reason = result.reason ?? 'unknown error';
      console.warn(`[G2O] Image capture failed (${pending.id}): ${reason}`);
      this.imageFailures.push(reason);
    }
    return images;
  }
}
