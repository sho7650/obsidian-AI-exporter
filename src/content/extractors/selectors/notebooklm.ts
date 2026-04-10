/**
 * CSS Selectors for NotebookLM (notebooklm.google.com)
 *
 * Selectors are ordered by stability (HIGH → LOW).
 * NotebookLM uses Angular Material with custom elements
 * (chat-panel, chat-message, element-list-renderer, etc.)
 * and semantic CSS classes. No shadow DOM — standard
 * querySelectorAll reaches all elements.
 *
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup } from './types';

export const SELECTORS = {
  // Chat message pair container (each Q&A turn)
  conversationTurn: [
    '.chat-message-pair', // Semantic (HIGH)
    'div.chat-message-pair', // More specific (HIGH)
  ],

  // User query content
  userQuery: [
    '.from-user-container .message-text-content', // Structure (HIGH)
    '.from-user-message-inner-content .message-text-content', // Alt class (MEDIUM)
  ],

  // Assistant response content
  assistantResponse: [
    '.to-user-container .message-text-content', // Structure (HIGH)
    '.to-user-message-inner-content .message-text-content', // Alt class (MEDIUM)
  ],

  // Structured content within assistant response (contains paragraphs, lists)
  markdownContent: [
    'element-list-renderer', // Angular component (HIGH)
  ],

  // Citation markers (inline source references)
  // Excludes "more citations" button via :not(:has(mat-icon))
  citationMarker: [
    'button.citation-marker:not(:has(mat-icon))', // Numbered citation (HIGH)
    '.xap-inline-dialog.citation-marker', // Alt class (MEDIUM)
  ],

  // Notebook title (in chat panel header)
  notebookTitle: [
    '.cover-title', // Style (HIGH)
    '.cover-title.mat-headline-medium', // Full class (MEDIUM)
  ],
} as const satisfies SelectorGroup;
