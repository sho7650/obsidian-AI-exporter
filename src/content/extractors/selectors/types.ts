/**
 * Selector type definitions for CSS selector fallback chains
 *
 * Used by platform extractors (via queryWithFallback) and
 * by the live selector validation smoke test (e2e/).
 *
 * @see docs/adr/005-shared-selector-modules.md
 */

/**
 * CSS selector fallback chain: selectors ordered by stability (HIGH → LOW).
 * queryWithFallback() tries each selector in order until one matches.
 */
export type SelectorList = readonly string[];

/**
 * Named group of selector fallback chains for a platform.
 *
 * Usage: `as const satisfies SelectorGroup`
 * - `as const` preserves literal key types (e.g., SELECTORS.conversationTurn)
 * - `satisfies` validates the structure without widening the type
 */
export type SelectorGroup = Readonly<Record<string, SelectorList>>;

/**
 * Pre-computed selector strings (SelectorList joined with ',').
 * Avoids repeated .join(',') calls inside loops.
 */
export type ComputedSelectors = Readonly<Record<string, string>>;
