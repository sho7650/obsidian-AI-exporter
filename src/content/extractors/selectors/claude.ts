/**
 * CSS Selectors for Claude AI (claude.ai)
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-002-claude-extractor.md Section 5.2.2
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup, ComputedSelectors } from './types';

/**
 * CSS Selectors for normal chat extraction
 */
export const SELECTORS = {
  // Conversation block selectors (each message block)
  // Stability: HIGH → LOW order for fallback
  conversationBlock: [
    '.group[style*="height: auto"]', // Structure-based (HIGH)
    '[data-test-render-count]', // Test attribute (LOW)
    '.group', // Generic (MEDIUM)
  ],

  // User message content selectors
  //
  // Primary targets the grid container that wraps the entire user turn,
  // so multi-paragraph questions and <pre>/<code> blocks stay together
  // in a single extracted message (see issue #200).
  // Legacy selectors remain as fallbacks for older Claude DOM variants
  // that did not expose [data-testid="user-message"].
  userMessage: [
    '[data-testid="user-message"]', // Grid container (HIGH)
    '[class*="user-message"]', // Partial match (MEDIUM)
    '.whitespace-pre-wrap.break-words', // Legacy inner <p> (LOW fallback)
    '.bg-bg-300 p', // Legacy structural fallback (LOW)
  ],

  // User message wrapper (for date extraction)
  userWrapper: [
    '.rounded-xl.pl-2\\.5.py-2\\.5', // Style attribute (HIGH)
    '.bg-bg-300', // Tailwind (MEDIUM)
    '[class*="bg-bg-300"]', // Partial match (MEDIUM)
  ],

  // Assistant response selectors
  assistantResponse: [
    '.font-claude-response', // Semantic (HIGH)
    '[class*="font-claude-response"]', // Partial match (HIGH)
    '[data-is-streaming]', // Functional attribute (MEDIUM)
  ],

  // Markdown content selectors
  markdownContent: [
    '.standard-markdown', // Semantic (HIGH)
    '.progressive-markdown', // Semantic (HIGH)
    '[class*="markdown"]', // Partial match (MEDIUM)
  ],

  // Date selectors
  messageDate: [
    'span[data-state="closed"]', // Functional attribute (MEDIUM)
    '.text-text-500.text-xs', // Tailwind (MEDIUM)
    '[class*="text-text-500"]', // Partial match (LOW)
  ],
} as const satisfies SelectorGroup;

/**
 * CSS Selectors for Deep Research extraction
 *
 * @see DES-002-claude-extractor.md Section 5.2.3
 */
export const DEEP_RESEARCH_SELECTORS = {
  // Artifact container (existence check)
  artifact: [
    '#markdown-artifact', // ID (HIGH)
    '[id*="markdown-artifact"]', // Partial match (HIGH)
  ],

  // Report title
  title: [
    '#markdown-artifact h1', // Structure (HIGH)
    '.standard-markdown h1', // Structure (HIGH)
    'h1.text-text-100', // Tailwind (MEDIUM)
    'h1', // Generic (LOW)
  ],

  // Report content
  content: [
    '#markdown-artifact .standard-markdown', // Structure (HIGH)
    '.standard-markdown', // Semantic (HIGH)
  ],

  // Inline citation links
  inlineCitation: [
    'span.inline-flex a[href^="http"]', // Structure (HIGH)
    '.group\\/tag a[href]', // Class (MEDIUM)
    'a[target="_blank"][href^="http"]', // Attribute (MEDIUM)
  ],
} as const satisfies SelectorGroup;

/**
 * Pre-computed selector strings for querySelectorAll
 * Avoids repeated .join(', ') calls at runtime
 */
export const JOINED_SELECTORS = {
  inlineCitation: DEEP_RESEARCH_SELECTORS.inlineCitation.join(', '),
} as const satisfies ComputedSelectors;
