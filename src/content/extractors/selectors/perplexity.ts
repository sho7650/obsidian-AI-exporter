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
  // 2026-07: the bubble class bg-offset became bg-subtle; the group/query
  // ancestor is the stabler anchor
  userQuery: [
    'span.select-text', // Semantic (HIGH)
    'div[class~="group/query"] span.select-text', // Query container (MEDIUM)
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

  // The answer block itself, wherever it is mounted.
  //
  // 2026-08 (issue #444): a rollout keeps `markdownContent` as an EMPTY
  // placeholder and renders the answer beside it. The class list of the answer
  // prose is identical under both layouts, so this selector finds it either
  // way; what differs is only whether it sits inside the placeholder.
  //
  // `inline` is what separates it from a Deep Research card's own prose
  // (`… max-w-none text-sm`). That is a narrowing, not the guard: a card also
  // nests an `inline` prose, so perplexity.ts additionally excludes anything
  // inside a deepResearchCard, which the report path already owns.
  answerProse: [
    '.prose.dark\\:prose-invert.inline', // Answer block (HIGH)
    '.prose.inline', // Without the theme class (MEDIUM)
  ],

  // Deep Research report card container. Matches generic raised panels too;
  // the extractor only tags a card as a report when deepResearchProse is
  // found inside it (perplexity.ts collectTaggedElements).
  // 2026-07: the border-borderMain token disappeared site-wide (removed
  // under the zero-match baseline contract).
  deepResearchCard: [
    'div.bg-raised.rounded-lg', // Style (HIGH)
  ],

  // Prose content within a Deep Research report card (max-w-none distinguishes it)
  deepResearchProse: [
    '.prose.max-w-none', // Specific to report (HIGH)
    '.prose.dark\\:prose-invert.max-w-none', // Full match (MEDIUM)
  ],

  // Inline citation pill carrying the source URL (issue #291).
  // Observed 2026-07-02: every citation (hover-trigger pill and anchor variant)
  // wraps in a span whose data-pplx-citation-url attribute holds the source URL.
  citation: [
    'span.citation[data-pplx-citation-url]', // Semantic (HIGH)
    '[data-pplx-citation-url]', // Attribute-only fallback (MEDIUM)
  ],

  // Empty spacer span rendered before each citation pill; produces no
  // whitespace in text extraction, so it is removed during transformation.
  citationSpacer: [
    'span.citation-nbsp', // Semantic (HIGH)
  ],

  // Legacy citation pill (observed before 2026-07): rendered WITHOUT a
  // data-pplx-citation-url ancestor, so no source URL exists in the static
  // DOM. Matched only AFTER the modern-citation pass replaced every
  // URL-carrying pill; pills embedding an <a href> are kept (perplexity.ts).
  legacyCitationPill: [
    'span[class~="group/trigger"]', // Legacy hover-trigger wrapper (HIGH)
    'span.citation', // Residual citation pill after modern pass (MEDIUM)
  ],
} as const satisfies SelectorGroup;
