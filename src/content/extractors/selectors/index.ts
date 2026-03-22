/**
 * Aggregated selector exports for the live selector validation smoke test.
 *
 * Each platform's selectors are re-exported with a platform prefix
 * to avoid name collisions when imported together.
 *
 * COMPUTED_SELECTORS / JOINED_SELECTORS are intentionally excluded —
 * they are extractor-internal derived values. The smoke test validates
 * the raw SelectorList arrays, not the pre-joined strings.
 *
 * @see docs/adr/005-shared-selector-modules.md
 */

export {
  SELECTORS as GEMINI_SELECTORS,
  DEEP_RESEARCH_SELECTORS as GEMINI_DR_SELECTORS,
  DEEP_RESEARCH_LINK_SELECTORS as GEMINI_DR_LINK_SELECTORS,
} from './gemini';

export {
  SELECTORS as CLAUDE_SELECTORS,
  DEEP_RESEARCH_SELECTORS as CLAUDE_DR_SELECTORS,
} from './claude';

export { SELECTORS as CHATGPT_SELECTORS } from './chatgpt';

export { SELECTORS as PERPLEXITY_SELECTORS } from './perplexity';
