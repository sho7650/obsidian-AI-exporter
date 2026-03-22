/**
 * CSS Selectors for Perplexity AI (www.perplexity.ai)
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-004-perplexity-extractor.md Section 4.1
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup } from './types';

export const SELECTORS = {
  // User query text
  userQuery: [
    'span.select-text', // Semantic (HIGH)
    'div.bg-offset.rounded-2xl span.select-text', // Style (MEDIUM)
  ],

  // Assistant response content container
  markdownContent: [
    'div[id^="markdown-content-"]', // ID pattern (HIGH)
  ],

  // Prose content within response
  proseContent: [
    '.prose.dark\\:prose-invert', // Standard (HIGH)
    '.prose', // Fallback (LOW)
  ],

  // Deep Research report card container
  deepResearchCard: [
    'div.bg-raised.rounded-lg', // Style (HIGH)
    'div.border-borderMain.bg-raised', // Alternative (MEDIUM)
  ],

  // Prose content within a Deep Research report card (max-w-none distinguishes it)
  deepResearchProse: [
    '.prose.max-w-none', // Specific to report (HIGH)
    '.prose.dark\\:prose-invert.max-w-none', // Full match (MEDIUM)
  ],
} as const satisfies SelectorGroup;
