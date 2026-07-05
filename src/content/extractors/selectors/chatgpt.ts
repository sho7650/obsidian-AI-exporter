/**
 * CSS Selectors for ChatGPT (chatgpt.com)
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-003-chatgpt-extractor.md Section 5.3.2
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup } from './types';

export const SELECTORS = {
  // Conversation turn (each Q&A pair)
  // ChatGPT changed from <article> to <section> in 2026-03; the article
  // variants matched nothing on the live site by 2026-07 and were removed
  // (the baseline contract rejects zero-match entries).
  conversationTurn: [
    'section[data-turn-id]', // Current structure (HIGH)
    'section[data-testid^="conversation-turn"]', // Current test attr (MEDIUM)
  ],

  // User message
  userMessage: [
    '[data-message-author-role="user"] .whitespace-pre-wrap', // Structure (HIGH)
    'section[data-turn="user"] .whitespace-pre-wrap', // Current structure (HIGH)
    '.user-message-bubble-color .whitespace-pre-wrap', // Style (MEDIUM)
  ],

  // Assistant message
  assistantResponse: [
    '[data-message-author-role="assistant"] .markdown.prose', // Structure (HIGH)
    'section[data-turn="assistant"] .markdown.prose', // Current structure (HIGH)
    '.markdown.prose.dark\\:prose-invert', // Style (MEDIUM)
  ],

  // Markdown content
  markdownContent: [
    '.markdown.prose', // Semantic (HIGH)
    '.markdown-new-styling', // Style (MEDIUM)
  ],
} as const satisfies SelectorGroup;
