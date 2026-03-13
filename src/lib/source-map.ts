/**
 * Source Map Utility for Deep Research
 *
 * Builds a Map from 1-based turn-source-index to DeepResearchSource.
 * This is used to look up source information during citation processing.
 */

import type { DeepResearchSource } from './types';

/**
 * Build a Map from data-turn-source-index (1-based) to DeepResearchSource.
 *
 * The DOM uses 1-based indexing (data-turn-source-index="1" for first source),
 * while the source array uses 0-based indexing.
 *
 * @param sources - Array of DeepResearchSource objects (0-based array)
 * @returns Map with 1-based keys for DOM attribute lookup
 *
 * @example
 *   const map = buildSourceMap(sources);
 *   const source = map.get(5); // Gets source for data-turn-source-index="5"
 */
export function buildSourceMap(sources: DeepResearchSource[]): Map<number, DeepResearchSource> {
  const map = new Map<number, DeepResearchSource>();

  sources.forEach((source, arrayIndex) => {
    // data-turn-source-index is 1-based
    // arrayIndex=0 → data-turn-source-index=1
    const turnSourceIndex = arrayIndex + 1;
    map.set(turnSourceIndex, source);
  });

  return map;
}
