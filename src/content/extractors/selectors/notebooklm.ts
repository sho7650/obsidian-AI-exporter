/**
 * CSS Selectors for NotebookLM (notebooklm.google.com)
 *
 * Selectors are ordered by stability (HIGH → LOW)
 *
 * STATUS: STUB — placeholder selectors pending DOM investigation.
 * Run `npm run e2e:auth` and `npm run e2e:daemon start` to access
 * a live NotebookLM session for CDP-based DOM inspection, then
 * replace the placeholders below with real selectors.
 *
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup } from './types';

export const SELECTORS = {
  // Chat turn container (each Q&A pair)
  // TODO: identify from live DOM
  conversationTurn: [
    '[data-turn-id]', // Placeholder (UNKNOWN)
  ],

  // User query text
  // TODO: identify from live DOM
  userQuery: [
    '[data-testid="user-message"]', // Placeholder (UNKNOWN)
  ],

  // Assistant response content
  // TODO: identify from live DOM
  assistantResponse: [
    '.response-container', // Placeholder (UNKNOWN)
  ],

  // Markdown / prose content within response
  // TODO: identify from live DOM
  markdownContent: [
    '.markdown', // Placeholder (UNKNOWN)
  ],
} as const satisfies SelectorGroup;
