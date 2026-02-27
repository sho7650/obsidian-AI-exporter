/**
 * Base extractor interface and utilities
 */

import type {
  AIPlatform,
  IConversationExtractor,
  ExtractionResult,
  ValidationResult,
  ConversationMessage,
  ConversationMetadata,
  DeepResearchLinks,
} from '../../lib/types';
import { extractErrorMessage } from '../../lib/error-utils';
import { generateHash } from '../../lib/hash';
import { MAX_CONVERSATION_TITLE_LENGTH, PLATFORM_LABELS } from '../../lib/constants';

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
   * Subclasses customize behavior via hook methods:
   * - tryExtractDeepResearch() — intercept for Deep Research mode
   * - onBeforeExtract() — pre-extraction setup (e.g., auto-scroll)
   * - onAfterExtract() — post-extraction mutation (e.g., append warnings)
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: `Not on a ${this.platformLabel} page`,
        };
      }

      // Hook: try deep research extraction first
      const deepResearchResult = this.tryExtractDeepResearch();
      if (deepResearchResult) {
        return deepResearchResult;
      }

      // Hook: pre-extraction (e.g., auto-scroll)
      await this.onBeforeExtract();

      // Normal conversation extraction
      console.info(`[G2O] Extracting ${this.platformLabel} conversation`);
      const messages = this.extractMessages();
      const conversationId = this.getConversationId() || `${this.platform}-${Date.now()}`;
      const title = this.getTitle();
      const result = this.buildConversationResult(messages, conversationId, title, this.platform);

      // Hook: post-extraction (e.g., append warnings)
      return this.onAfterExtract(result);
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
   * Override in subclasses that support Deep Research.
   * @returns ExtractionResult if Deep Research detected, null otherwise
   */
  protected tryExtractDeepResearch(): ExtractionResult | null {
    return null;
  }

  /**
   * Hook: called before normal extraction starts.
   * Override for pre-extraction setup (e.g., Gemini auto-scroll).
   */
  protected async onBeforeExtract(): Promise<void> {
    // no-op by default
  }

  /**
   * Hook: called after normal extraction completes.
   * Override to mutate or augment the result (e.g., append warnings).
   */
  protected onAfterExtract(result: ExtractionResult): ExtractionResult {
    return result;
  }

  // ========== Deep Research Builder ==========

  /**
   * Build a Deep Research extraction result.
   * Shared logic for Claude and Gemini Deep Research modes.
   * Subclasses override getDeepResearchTitle(), extractDeepResearchContent(),
   * and extractDeepResearchLinks() for platform-specific DOM access.
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

    const titleHash = this.generateHashValue(title);
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
   * Get Deep Research report title.
   * Override in subclasses with platform-specific selectors.
   */
  protected getDeepResearchTitle(): string {
    return 'Untitled Deep Research Report';
  }

  /**
   * Extract Deep Research report content HTML.
   * Override in subclasses with platform-specific selectors.
   */
  protected extractDeepResearchContent(): string {
    return '';
  }

  /**
   * Extract Deep Research link information.
   * Override in subclasses with platform-specific selectors.
   */
  protected extractDeepResearchLinks(): DeepResearchLinks {
    return { sources: [] };
  }

  // ========== DOM Sort & Message Build Utilities ==========

  /**
   * Sort elements by DOM position (document order).
   * Mutates the array in place.
   */
  protected sortByDomPosition(
    elements: Array<{ element: Element; type: 'user' | 'assistant' }>
  ): void {
    elements.sort((a, b) => {
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

    const { messages, type } = result.data;
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
    if (!isDeepResearch) {
      const userCount = messages.filter(m => m.role === 'user').length;
      const assistantCount = messages.filter(m => m.role === 'assistant').length;

      if (Math.abs(userCount - assistantCount) > 1) {
        warnings.push('Unbalanced message count - some messages may not have been extracted');
      }
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
   * Known platform suffixes in document.title
   * Matches: " - Claude", " | Gemini", " - Google Gemini", " - ChatGPT", etc.
   */
  private static readonly TITLE_SUFFIX_PATTERN =
    /\s*[-|]\s*(?:Google\s+)?(?:Gemini|Claude|ChatGPT|Perplexity)\s*$/i;

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
    const lower = raw.toLowerCase();
    if (['gemini', 'google gemini', 'claude', 'chatgpt', 'perplexity'].includes(lower)) {
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
  protected getFirstMessageTitle(selectors: string[], fallbackTitle: string): string {
    const el = this.queryWithFallback<HTMLElement>(selectors);
    if (el?.textContent) {
      return this.sanitizeText(el.textContent).substring(0, MAX_CONVERSATION_TITLE_LENGTH);
    }
    return fallbackTitle;
  }

  /**
   * Generate a hash from content for deduplication
   */
  protected generateHashValue(content: string): string {
    return generateHash(content);
  }

  /**
   * Sanitize text content
   */
  protected sanitizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
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
    selectors: string[],
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
    selectors: string[],
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
