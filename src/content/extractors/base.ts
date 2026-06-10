/**
 * Base extractor interface and utilities
 */

import type {
  AIPlatform,
  IConversationExtractor,
  SyncSettings,
  ExtractionResult,
  ValidationResult,
  ConversationMessage,
  ConversationMetadata,
  DeepResearchLinks,
  DeepResearchSource,
} from '../../lib/types';
import { extractErrorMessage } from '../../lib/error-utils';
import { generateHash } from '../../lib/hash';
import { sanitizeHtml } from '../../lib/sanitize';
import {
  MAX_CONVERSATION_TITLE_LENGTH,
  MAX_DEEP_RESEARCH_TITLE_LENGTH,
  PLATFORM_LABELS,
} from '../../lib/constants';

/**
 * Abstract base class for conversation extractors
 * Provides common functionality for all AI platform extractors
 */
export abstract class BaseExtractor implements IConversationExtractor {
  abstract readonly platform: AIPlatform;

  abstract canExtract(): boolean;
  abstract getConversationId(): string | null;
  abstract getTitle(): string;
  abstract extractMessages(): ConversationMessage[];

  // ========== Platform Label ==========

  /**
   * Human-readable platform name for log and error messages
   */
  protected get platformLabel(): string {
    return PLATFORM_LABELS[this.platform] ?? this.platform;
  }

  // ========== Template Method ==========

  /**
   * Main extraction method (template method pattern)
   *
   * Subclasses customize behavior via tryExtractDeepResearch() to intercept
   * for Deep Research mode. Platforms that need pre/post processing around
   * the normal flow (e.g. Gemini's auto-scroll + warning) override extract()
   * directly.
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: `Not on a ${this.platformLabel} page`,
        };
      }

      const deepResearchResult = this.tryExtractDeepResearch();
      if (deepResearchResult) {
        return deepResearchResult;
      }

      console.info(`[G2O] Extracting ${this.platformLabel} conversation`);
      const messages = this.extractMessages();
      const conversationId = this.getConversationId() || `${this.platform}-${Date.now()}`;
      const title = this.getTitle();
      return this.buildConversationResult(messages, conversationId, title, this.platform);
    } catch (error) {
      console.error(`[G2O] ${this.platformLabel} extraction error:`, error);
      return {
        success: false,
        error: extractErrorMessage(error),
      };
    }
  }

  // ========== Template Method Hooks ==========

  /**
   * Hook: attempt Deep Research extraction before normal extraction.
   * Driven by isDeepResearchVisible(); platforms without Deep Research
   * keep the default false and skip straight to normal extraction.
   * @returns ExtractionResult if Deep Research detected, null otherwise
   */
  protected tryExtractDeepResearch(): ExtractionResult | null {
    if (!this.isDeepResearchVisible()) return null;
    console.info(`[G2O] ${this.platformLabel} Deep Research panel detected, extracting report`);
    return this.buildDeepResearchResult();
  }

  /**
   * Hook: whether the platform's Deep Research panel is currently visible.
   * Override in subclasses that support Deep Research.
   */
  protected isDeepResearchVisible(): boolean {
    return false;
  }

  // ========== Settings ==========

  /**
   * Apply user settings before extraction.
   * Override in subclasses that have platform-specific settings.
   */
  applySettings(_settings: SyncSettings): void {
    // no-op by default
  }

  // ========== Deep Research Builder ==========

  /**
   * Build a Deep Research extraction result.
   * Shared logic for Claude and Gemini Deep Research modes.
   * Subclasses override getDeepResearchSelectors() and extractSourceList()
   * for platform-specific DOM access.
   */
  protected buildDeepResearchResult(): ExtractionResult {
    const title = this.getDeepResearchTitle();
    const content = this.extractDeepResearchContent();

    if (!content) {
      return {
        success: false,
        error: 'Deep Research content not found',
        warnings: ['Panel is visible but content element is empty or missing'],
      };
    }

    const titleHash = generateHash(title);
    const conversationId = `deep-research-${titleHash}`;
    const links = this.extractDeepResearchLinks();

    const messages = [
      {
        id: 'report-0',
        role: 'assistant' as const,
        content,
        htmlContent: content,
        index: 0,
      },
    ];

    return {
      success: true,
      data: {
        id: conversationId,
        title,
        url: window.location.href,
        source: this.platform,
        type: 'deep-research',
        links,
        messages,
        extractedAt: new Date(),
        metadata: this.buildMetadata(messages),
      },
    };
  }

  /**
   * Platform-specific Deep Research selectors. Override in subclasses that
   * support Deep Research; null (default) means the platform has no DR mode
   * and the title/content getters return their non-DR defaults.
   */
  protected getDeepResearchSelectors(): {
    title: readonly string[];
    content: readonly string[];
  } | null {
    return null;
  }

  /**
   * Get Deep Research report title using subclass-provided selectors.
   */
  protected getDeepResearchTitle(): string {
    const selectors = this.getDeepResearchSelectors();
    if (selectors) {
      const titleEl = this.queryWithFallback<HTMLElement>(selectors.title);
      if (titleEl?.textContent) {
        return this.sanitizeText(titleEl.textContent).substring(0, MAX_DEEP_RESEARCH_TITLE_LENGTH);
      }
    }
    return 'Untitled Deep Research Report';
  }

  /**
   * Extract Deep Research report content HTML using subclass-provided selectors.
   */
  protected extractDeepResearchContent(): string {
    const selectors = this.getDeepResearchSelectors();
    if (!selectors) return '';
    const contentEl = this.queryWithFallback<HTMLElement>(selectors.content);
    return contentEl ? sanitizeHtml(contentEl.innerHTML) : '';
  }

  /**
   * Extract Deep Research link information.
   * Sources come from the extractSourceList() hook; platforms without
   * Deep Research return no sources.
   */
  extractDeepResearchLinks(): DeepResearchLinks {
    return { sources: this.extractSourceList() };
  }

  /**
   * Hook: platform-specific Deep Research source/citation extraction.
   * Override in subclasses that support Deep Research.
   */
  protected extractSourceList(): DeepResearchSource[] {
    return [];
  }

  /**
   * Hostname of a URL, or 'unknown' when the URL cannot be parsed.
   * Shared fallback for Deep Research source domain extraction.
   */
  protected extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  // ========== DOM Sort & Message Build Utilities ==========

  /**
   * Sort elements by DOM position (document order).
   * Returns a new sorted array without mutating the input (DES-014 L-4).
   */
  protected sortByDomPosition<T extends { element: Element }>(elements: T[]): T[] {
    return [...elements].sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  /**
   * Build ConversationMessage[] from sorted element pairs.
   * @param elements - Sorted array of element/type pairs
   * @param extractUser - Function to extract user message text from element
   * @param extractAssistant - Function to extract assistant HTML from element
   */
  protected buildMessagesFromElements(
    elements: Array<{ element: Element; type: 'user' | 'assistant' }>,
    extractUser: (el: Element) => string,
    extractAssistant: (el: Element) => string
  ): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    elements.forEach((item, index) => {
      const content =
        item.type === 'user' ? extractUser(item.element) : extractAssistant(item.element);

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
   * Validate extraction result quality
   */
  validate(result: ExtractionResult): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!result.success) {
      errors.push(result.error || 'Extraction failed');
      return { isValid: false, warnings, errors };
    }

    if (!result.data) {
      errors.push('No data extracted');
      return { isValid: false, warnings, errors };
    }

    const { messages, type, metadata } = result.data;
    const isDeepResearch = type === 'deep-research';

    if (messages.length === 0) {
      errors.push('No messages found in conversation');
    }

    // Deep Research reports have only 1 message (the report itself), so skip this warning
    if (messages.length < 2 && !isDeepResearch) {
      warnings.push('Very few messages extracted - selectors may need updating');
    }

    // Check for balanced conversation (roughly equal user/assistant messages)
    // Skip for Deep Research which only has assistant content
    if (
      !isDeepResearch &&
      Math.abs(metadata.userMessageCount - metadata.assistantMessageCount) > 1
    ) {
      warnings.push('Unbalanced message count - some messages may not have been extracted');
    }

    // Check for empty content
    const emptyMessages = messages.filter(m => !m.content.trim());
    if (emptyMessages.length > 0) {
      warnings.push(`${emptyMessages.length} message(s) have empty content`);
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Build metadata from extracted messages
   */
  protected buildMetadata(messages: ConversationMessage[]): ConversationMetadata {
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;
    return {
      messageCount: messages.length,
      userMessageCount,
      assistantMessageCount,
      hasCodeBlocks: messages.some(m => m.content.includes('<code') || m.content.includes('```')),
    };
  }

  /**
   * Build a successful conversation ExtractionResult with common boilerplate
   * Handles message counting, warning generation, and result construction
   */
  protected buildConversationResult(
    messages: ConversationMessage[],
    conversationId: string,
    title: string,
    source: AIPlatform
  ): ExtractionResult {
    if (messages.length === 0) {
      return {
        success: false,
        error: 'No messages found in conversation',
        warnings: [`Primary selectors may have changed. Check ${this.platform} UI for updates.`],
      };
    }

    const warnings: string[] = [];
    const metadata = this.buildMetadata(messages);

    if (metadata.userMessageCount === 0) {
      warnings.push('No user messages found');
    }
    if (metadata.assistantMessageCount === 0) {
      warnings.push('No assistant messages found');
    }

    return {
      success: true,
      data: {
        id: conversationId,
        title,
        url: window.location.href,
        source,
        messages,
        extractedAt: new Date(),
        metadata,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Known platform suffixes in document.title, derived from PLATFORM_LABELS
   * so new platforms are picked up automatically.
   * Matches: " - Claude", " | Gemini", " - Google Gemini", " - ChatGPT", etc.
   */
  private static readonly TITLE_SUFFIX_PATTERN = new RegExp(
    `\\s*[-|]\\s*(?:Google\\s+)?(?:${Object.values(PLATFORM_LABELS).join('|')})\\s*$`,
    'i'
  );

  /**
   * Titles that are nothing but a platform name (lowercased), derived from
   * PLATFORM_LABELS plus known aliases.
   */
  private static readonly PLATFORM_ONLY_TITLES = new Set([
    'google gemini',
    ...Object.values(PLATFORM_LABELS).map(label => label.toLowerCase()),
  ]);

  /**
   * Extract conversation title from document.title, stripping platform suffixes.
   * Returns null if document.title is empty or contains only the platform name.
   *
   * Useful as a fallback for platforms where document.title reflects the
   * conversation title (Claude, ChatGPT, Perplexity). Not suitable for Gemini
   * where document.title is always "Google Gemini".
   */
  protected getPageTitle(): string | null {
    const raw = document.title?.replace(BaseExtractor.TITLE_SUFFIX_PATTERN, '').trim();
    if (!raw) return null;
    // Skip if the remaining text is just the platform name
    if (BaseExtractor.PLATFORM_ONLY_TITLES.has(raw.toLowerCase())) {
      return null;
    }
    return raw.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
  }

  /**
   * Get conversation title from first message element matching the given selectors.
   * Shared pattern for ChatGPT, Claude, and Perplexity extractors.
   *
   * @param selectors - CSS selectors to find the first message element
   * @param fallbackTitle - Title to return if no element is found
   */
  protected getFirstMessageTitle(selectors: readonly string[], fallbackTitle: string): string {
    const el = this.queryWithFallback<HTMLElement>(selectors);
    if (el?.textContent) {
      return this.sanitizeText(el.textContent).substring(0, MAX_CONVERSATION_TITLE_LENGTH);
    }
    return fallbackTitle;
  }

  /**
   * Sanitize text content
   */
  protected sanitizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract sanitized plain text from an element (empty string if none).
   */
  protected extractPlainText(element: Element): string {
    return element.textContent ? this.sanitizeText(element.textContent) : '';
  }

  /**
   * Try multiple selectors in priority order and return first successful result
   *
   * Selectors are tried sequentially (not combined) to preserve priority ordering.
   * Extractors list selectors from HIGH → LOW stability, and this method must
   * respect that order. A comma-joined querySelector would return the first
   * match in DOM order instead, breaking the priority contract.
   *
   * @param selectors - Array of CSS selectors to try in priority order
   * @param parent - Parent element to search within (defaults to document)
   * @returns First matching element or null if none found or selectors empty
   */
  protected queryWithFallback<T extends Element>(
    selectors: readonly string[],
    parent: Element | Document = document
  ): T | null {
    // Guard clause: return null for empty or invalid selector arrays
    if (!selectors || selectors.length === 0) {
      return null;
    }

    for (const selector of selectors) {
      const result = parent.querySelector<T>(selector);
      if (result) return result;
    }
    return null;
  }

  /**
   * Try multiple selectors in priority order and return all results from the first match
   *
   * Returns results from the FIRST selector that matches (not a union of all).
   * Like queryWithFallback, preserves HIGH → LOW priority ordering.
   *
   * @param selectors - Array of CSS selectors to try in priority order
   * @param parent - Parent element to search within (defaults to document)
   * @returns All matching elements from first successful selector, or empty array
   */
  protected queryAllWithFallback<T extends Element>(
    selectors: readonly string[],
    parent: Element | Document = document
  ): T[] {
    // Guard clause: return empty array for empty or invalid selector arrays
    if (!selectors || selectors.length === 0) {
      return [];
    }

    for (const selector of selectors) {
      const results = parent.querySelectorAll<T>(selector);
      if (results.length > 0) return Array.from(results);
    }
    return [];
  }
}
