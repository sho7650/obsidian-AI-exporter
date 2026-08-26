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
  // 2026-07: the bubble class bg-offset became bg-subtle.
  // 2026-08: the `group/query` ancestor disappeared; the bubble itself
  // (bg-subtle rounded-2xl) is what now scopes the query text.
  userQuery: [
    'span.select-text', // Semantic (HIGH)
    'div.bg-subtle.rounded-2xl span.select-text', // Query bubble (MEDIUM)
  ],

  // Prose content within response
  proseContent: [
    '.prose.dark\\:prose-invert', // Standard (HIGH)
    '.prose', // Fallback (LOW)
  ],

  // The answer block itself, wherever it is mounted — the ONLY container the
  // assistant message is read out of since 2026-08.
  //
  // Issue #444 saw the first half of the rollout: `#markdown-content-N` stayed
  // as an EMPTY placeholder and the answer rendered beside it. The second half
  // removed the placeholder id outright, so nothing anchors an answer any more
  // except its own class list. The legacy placeholder still exists for users
  // who have not received the rollout, but as a private selector in
  // perplexity.ts — it can no longer be validated against a live page, and a
  // selector the live contract cannot see does not belong in this group
  // (ADR-016, issue #402).
  //
  // `inline` is what separates it from a Deep Research report body
  // (`… max-w-none …`). That is a narrowing, not the guard: a report nests an
  // `inline` prose of its own, so perplexity.ts additionally excludes anything
  // inside the report prose, which the report path already owns.
  answerProse: [
    '.prose.dark\\:prose-invert.inline', // Answer block (HIGH)
    '.prose.inline', // Without the theme class (MEDIUM)
    '.prose[data-renderer="lm"]', // Renderer hook, added 2026-08 (LOW)
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
