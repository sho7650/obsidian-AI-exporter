/**
 * CSS selectors for Gemini UI elements
 * Updated based on actual DOM analysis from element-sample.html
 *
 * @see docs/adr/005-shared-selector-modules.md
 */

import type { SelectorGroup, ComputedSelectors } from './types';

export const SELECTORS = {
  // Conversation turn container (each Q&A pair)
  conversationTurn: ['.conversation-container', '[class*="conversation-container"]'],

  // User query element (Angular component)
  userQuery: ['user-query', '[class*="user-query"]'],

  // Query text lines (multiple lines per query)
  queryTextLine: ['.query-text-line', 'p[class*="query-text-line"]'],

  // Model response element (Angular component)
  modelResponse: ['model-response', '[class*="model-response"]'],

  // Model response markdown content
  modelResponseContent: [
    '.markdown.markdown-main-panel',
    '.markdown-main-panel',
    'message-content .markdown',
    '.model-response-text',
  ],

  // NOTE: the former conversationTitle group was removed 2026-07. No
  // conversation-title element has existed in Gemini's DOM since at least
  // 2026-03 (the v1 baseline recorded 0 matches from day one); titles come
  // from the first user query (see GeminiExtractor.getTitle).

  // AI-generated images inside a model response. Gemini wraps each generated
  // image in a <generated-image>/<single-image> component; the <img> carries a
  // blob: (or googleusercontent) src and alt="（AI 生成）".
  generatedImage: ['generated-image img[src]', 'single-image img[src]', 'img.image[src]'],

  // Scroll container for lazy-load detection
  // infinite-scroller (data-test-id="chat-history-container") is the actual
  // scrollable element (overflow-y: scroll). It fires onScrolledTopPastThreshold
  // when scrollTop crosses below a threshold (edge-triggered).
  // #chat-history is a non-scrolling wrapper — excluded to avoid false matches.
  scrollContainer: ['[data-test-id="chat-history-container"]', 'infinite-scroller'],
} as const satisfies SelectorGroup;

/**
 * Deep Research specific selectors
 * Used to detect and extract content from the Deep Research immersive panel
 */
export const DEEP_RESEARCH_SELECTORS = {
  // Deep Research panel (existence check)
  panel: ['deep-research-immersive-panel'],

  // Report title (moved from toolbar h2 to content h1 as of 2026-03)
  title: [
    '#extended-response-markdown-content > h1',
    'deep-research-immersive-panel h1[data-path-to-node]',
    'deep-research-immersive-panel h2.title-text',
  ],

  // Report content
  content: [
    '#extended-response-markdown-content',
    'message-content#extended-response-message-content .markdown-main-panel',
    'structured-content-container[data-test-id="message-content"] .markdown-main-panel',
  ],
} as const satisfies SelectorGroup;

/**
 * Deep Research link extraction selectors
 */
export const DEEP_RESEARCH_LINK_SELECTORS = {
  // Inline citations
  inlineCitation: [
    'source-footnote sup.superscript[data-turn-source-index]',
    'sup.superscript[data-turn-source-index]',
  ],
  // Source list container.
  // 2026-08: the `#used-sources-list` fallback was dropped — measured at zero on
  // the live Deep Research page while `deep-research-source-lists` still matches.
  // A zero-match entry is per-entry fatal to `npm run e2e:baseline:update`
  // (baseline.ts refuses to record a selector that cannot be found, ADR-016), so
  // a dead fallback blocks the whole platform's baseline (issue #402).
  sourceListContainer: ['deep-research-source-lists'],
  // Source list items
  sourceListItem: ['a[data-test-id="browse-web-item-link"]', 'a[data-test-id="browse-chip-link"]'],
  // Source title
  sourceTitle: ['[data-test-id="title"]', '.sub-title'],
  // Source domain
  sourceDomain: ['[data-test-id="domain-name"]', '.display-name'],
} as const satisfies SelectorGroup;

/**
 * Pre-computed selector strings for performance optimization
 * Avoids repeated .join(',') calls inside loops
 */
export const COMPUTED_SELECTORS = {
  conversationTurn: SELECTORS.conversationTurn.join(','),
  generatedImage: SELECTORS.generatedImage.join(','),
  sourceListItem: DEEP_RESEARCH_LINK_SELECTORS.sourceListItem.join(','),
  sourceTitle: DEEP_RESEARCH_LINK_SELECTORS.sourceTitle.join(','),
  sourceDomain: DEEP_RESEARCH_LINK_SELECTORS.sourceDomain.join(','),
} as const satisfies ComputedSelectors;
