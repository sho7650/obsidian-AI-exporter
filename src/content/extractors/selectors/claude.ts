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
  // NOTE: a conversationBlock group used to live here. It was removed in
  // 2026-08 (issue #446): nothing in the extractor ever queried it — messages
  // are found through userMessage / assistantResponse — while its primary
  // (`.group[style*="height: auto"]`) became unmatchable when Claude stopped
  // writing that inline style, which blocked the whole platform baseline. A
  // selector no code reads is a contract obligation with no payoff.

  // User message content selectors
  //
  // Primary targets the grid container that wraps the entire user turn,
  // so multi-paragraph questions and <pre>/<code> blocks stay together
  // in a single extracted message (see issue #200).
  // Legacy selectors remain as fallbacks for older Claude DOM variants
  // that did not expose [data-testid="user-message"].
  //
  // 2026-08: two fallbacks dropped, both measured at zero on the live pages.
  // `.bg-bg-300 p` — Claude removed the bg-bg-300 token outright (the user
  // bubble is now `.bg-neutral-30 dark:…bg-surface-3 .rounded-xl`).
  // `[class*="user-message"]` — the turn is identified by the data-testid
  // attribute, not by a class; the `!font-user-message` class that made this
  // substring match work disappeared a day after bg-bg-300 did. Chasing either
  // token would only buy the next rename.
  userMessage: [
    '[data-testid="user-message"]', // Grid container (HIGH)
    '.whitespace-pre-wrap.break-words', // Legacy inner <p> (LOW fallback)
  ],

  // Assistant response selectors
  assistantResponse: [
    '.font-claude-response', // Semantic (HIGH)
    '[class*="font-claude-response"]', // Partial match (HIGH)
    '[data-is-streaming]', // Functional attribute (MEDIUM)
  ],

  // Markdown content selectors
  // 2026-07: .progressive-markdown disappeared from the live site (removed
  // under the zero-match baseline contract)
  markdownContent: [
    '.standard-markdown', // Semantic (HIGH)
    '[class*="markdown"]', // Partial match (MEDIUM)
  ],

  // NOTE (2026-08): `userWrapper` and `messageDate` used to live here. No code
  // ever read either of them — Claude date extraction was never implemented —
  // yet the live selector suite validates every declared group, so when Claude
  // dropped the `bg-bg-300` and `.text-text-500.text-xs` classes the run failed
  // over selectors nothing consumes. Declare them again only alongside the code
  // that reads them, measured against the DOM of that day.

  // Scroll container for virtualized-conversation auto-scroll (ADR-017).
  // Claude windows/evicts turns; this is the overflow-y-auto element that
  // scrolls the message list (observed live 2026-07: the div also carries
  // overflow-x-hidden, flex-1, and [scrollbar-gutter:stable]).
  scrollContainer: [
    '.overflow-y-auto.overflow-x-hidden.flex-1', // Composite (HIGH)
    '.overflow-y-auto.overflow-x-hidden', // Style pair (MEDIUM)
    'div[class*="overflow-y-auto"]', // Partial match (LOW)
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
  // 2026-08: `h1.text-text-100` dropped — text-text-100 survives elsewhere in
  // the DOM but no longer lands on an h1, so the pairing can never match.
  title: [
    '#markdown-artifact h1', // Structure (HIGH)
    '.standard-markdown h1', // Structure (HIGH)
    'h1', // Generic (LOW)
  ],

  // Report content
  content: [
    '#markdown-artifact .standard-markdown', // Structure (HIGH)
    '.standard-markdown', // Semantic (HIGH)
  ],

  // Inline citation links
  // 2026-07: the group/tag class moved from a wrapper onto the <a> itself
  inlineCitation: [
    'span.inline-flex a[href^="http"]', // Structure (HIGH)
    'a[class~="group/tag"][href^="http"]', // Class on the anchor (MEDIUM)
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
