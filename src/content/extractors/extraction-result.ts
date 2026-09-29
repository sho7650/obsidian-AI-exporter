/**
 * Platform-independent checks and summaries of an extraction result.
 *
 * Pure functions over ExtractionResult / ConversationMessage: nothing here
 * reads the DOM or depends on which platform produced the messages, so they
 * live outside BaseExtractor (DES-018 M-3b).
 */

import type {
  ExtractionResult,
  ValidationResult,
  ConversationMessage,
  ConversationMetadata,
} from '../../lib/types';

/**
 * Build metadata from extracted messages
 */
export function buildMetadata(messages: ConversationMessage[]): ConversationMetadata {
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
 * Validate extraction result quality
 */
export function validateExtraction(result: ExtractionResult): ValidationResult {
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
  if (!isDeepResearch && Math.abs(metadata.userMessageCount - metadata.assistantMessageCount) > 1) {
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
