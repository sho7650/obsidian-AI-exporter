/**
 * Base extractor interface and utilities
 */

import type {
  IConversationExtractor,
  ExtractionResult,
  ValidationResult,
  ConversationMessage,
  ConversationMetadata,
} from '../../lib/types';
import { generateHash } from '../../lib/hash';

// Re-export for backward compatibility (function moved to lib/error-utils.ts)
export { extractErrorMessage } from '../../lib/error-utils';

/**
 * Abstract base class for conversation extractors
 * Provides common functionality for all AI platform extractors
 */
export abstract class BaseExtractor implements IConversationExtractor {
  abstract readonly platform: 'gemini' | 'claude' | 'perplexity' | 'chatgpt';

  abstract canExtract(): boolean;
  abstract extract(): Promise<ExtractionResult>;
  abstract getConversationId(): string | null;
  abstract getTitle(): string;
  abstract extractMessages(): ConversationMessage[];

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
    source: 'gemini' | 'claude' | 'perplexity' | 'chatgpt'
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
