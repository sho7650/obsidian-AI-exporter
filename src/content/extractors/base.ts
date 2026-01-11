/**
 * Base extractor interface and utilities
 */

import type {
  IConversationExtractor,
  ExtractionResult,
  ValidationResult,
  ConversationMessage,
} from '../../lib/types';
import { generateHash } from '../../lib/hash';

/**
 * Abstract base class for conversation extractors
 * Provides common functionality for all AI platform extractors
 */
export abstract class BaseExtractor implements IConversationExtractor {
  abstract readonly platform: 'gemini' | 'claude' | 'perplexity';

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
   * Try multiple selectors and return first successful result
   */
  protected queryWithFallback<T extends Element>(
    selectors: string[],
    parent: Element | Document = document
  ): T | null {
    for (const selector of selectors) {
      const result = parent.querySelector<T>(selector);
      if (result) return result;
    }
    return null;
  }

  /**
   * Try multiple selectors and return all results
   */
  protected queryAllWithFallback<T extends Element>(
    selectors: string[],
    parent: Element | Document = document
  ): NodeListOf<T> | T[] {
    for (const selector of selectors) {
      const results = parent.querySelectorAll<T>(selector);
      if (results.length > 0) return results;
    }
    return [] as unknown as NodeListOf<T>;
  }
}
