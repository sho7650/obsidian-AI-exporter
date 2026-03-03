/**
 * Deep Research citation-to-footnote pipeline
 *
 * Converts inline citations (`<sup data-turn-source-index="N">`) to
 * Obsidian footnote references (`[^N]`) and generates a References
 * section with footnote definitions.
 *
 * Processing flow:
 * 1. Build source map from links
 * 2. Convert inline citations to placeholder spans
 * 3. Remove sources carousel
 * 4. Convert HTML to Markdown (Turndown)
 * 5. Append References section with footnote definitions
 */

import { htmlToMarkdown } from './markdown-rules';
import { buildSourceMap } from '../lib/source-map';
import type { DeepResearchLinks, DeepResearchSource } from '../lib/types';

/** Pre-compiled regex for source-footnote wrapped citations */
const CITATION_PATTERN_WRAPPED =
  /<source-footnote[^>]*>[\s\S]*?<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>[\s\S]*?<\/source-footnote>/gi;

/** Pre-compiled regex for standalone sup citations (fallback) */
const CITATION_PATTERN_STANDALONE =
  /<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>/gi;

/**
 * Escape Markdown link metacharacters in text
 * Prevents injection of Markdown links via crafted titles
 */
function escapeMarkdownLink(text: string): string {
  return text.replace(/[\\[\]()]/g, '\\$&');
}

/**
 * Sanitize URL to remove dangerous schemes
 */
function sanitizeUrl(url: string): string {
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'blob:'];
  const lowerUrl = url.toLowerCase().trim();

  for (const scheme of dangerousSchemes) {
    if (lowerUrl.startsWith(scheme)) {
      return ''; // Return empty for dangerous URLs
    }
  }

  return url;
}

/**
 * Create a citation replacer callback for use with String.replace()
 * Shared logic for both wrapped and standalone citation patterns.
 */
function createCitationReplacer(
  sourceMap: Map<number, DeepResearchSource>
): (_match: string, indexStr: string) => string {
  return (_match: string, indexStr: string): string => {
    const index = parseInt(indexStr, 10);
    const source = sourceMap.get(index);
    if (source) {
      // Return placeholder span with content (Turndown filters empty elements)
      // The custom Turndown rule will convert this to [^N]
      return `<span data-footnote-ref="${index}">REF</span>`;
    }
    // Source not found: log warning and remove marker silently
    console.warn(`[G2O] Citation reference ${index} not found in source map`);
    return '';
  };
}

/**
 * Convert inline citations to footnote reference placeholders
 *
 * Before: <source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>
 * After: <span data-footnote-ref="N"></span>
 *
 * Design: We insert placeholder spans that survive Turndown processing,
 * then replace them with Obsidian footnote syntax [^N] after conversion.
 * This avoids double-escaping issues where Markdown gets re-escaped by Turndown.
 *
 * Important: data-turn-source-index is 1-based and may be non-sequential
 *
 * @param html HTML content to convert
 * @param sourceMap Map built from buildSourceMap()
 */
function convertInlineCitationsToFootnoteRefs(
  html: string,
  sourceMap: Map<number, DeepResearchSource>
): string {
  const replacer = createCitationReplacer(sourceMap);

  // Pattern 1: source-footnote wrapped
  CITATION_PATTERN_WRAPPED.lastIndex = 0;
  let result = html.replace(CITATION_PATTERN_WRAPPED, replacer);

  // Pattern 2: standalone sup element (fallback)
  CITATION_PATTERN_STANDALONE.lastIndex = 0;
  result = result.replace(CITATION_PATTERN_STANDALONE, replacer);

  return result;
}

/**
 * Generate References section with Obsidian footnote definitions
 *
 * Output format:
 * # References
 *
 * [^1]: [Title1](URL1)
 * [^2]: [Title2](URL2)
 * ...
 *
 * @param sources All sources from the source list (includes unreferenced sources)
 * @returns Markdown string for References section
 */
function generateReferencesSection(sources: DeepResearchSource[]): string {
  if (sources.length === 0) {
    return '';
  }

  const lines: string[] = ['', '# References', ''];

  sources.forEach((source, arrayIndex) => {
    // data-turn-source-index is 1-based
    const footnoteIndex = arrayIndex + 1;
    const safeUrl = sanitizeUrl(source.url);

    if (safeUrl) {
      // [^N]: [Title](URL)
      lines.push(`[^${footnoteIndex}]: [${escapeMarkdownLink(source.title)}](${safeUrl})`);
    } else {
      // URL invalid: title only
      lines.push(`[^${footnoteIndex}]: ${escapeMarkdownLink(source.title)}`);
    }
  });

  return lines.join('\n');
}

/**
 * Remove sources-carousel-inline elements
 */
function removeSourcesCarousel(html: string): string {
  return html.replace(/<sources-carousel-inline[\s\S]*?<\/sources-carousel-inline>/gi, '');
}

/**
 * Convert Deep Research content with Obsidian footnotes
 *
 * Design: Converts inline citations to [^N] footnote references
 * and generates a References section with footnote definitions.
 *
 * Processing flow:
 * 1. Build source map from links
 * 2. Convert <sup data-turn-source-index> to placeholder spans
 * 3. Remove sources carousel
 * 4. Convert HTML to Markdown (Turndown)
 * 5. Replace placeholder spans with [^N] footnote refs
 * 6. Append References section with footnote definitions
 */
export function convertDeepResearchContent(html: string, links?: DeepResearchLinks): string {
  let processed = html;

  // 1. Build source map (1-based index)
  let sourceMap = new Map<number, DeepResearchSource>();
  if (links && links.sources.length > 0) {
    sourceMap = buildSourceMap(links.sources);
  }

  // 2. Convert inline citations to placeholder spans
  processed = convertInlineCitationsToFootnoteRefs(processed, sourceMap);

  // 3. Remove sources carousel
  processed = removeSourcesCarousel(processed);

  // 4. Convert HTML to Markdown (Turndown rule converts spans to [^N])
  const markdown = htmlToMarkdown(processed);

  // 5. Add References section with all sources
  if (links && links.sources.length > 0) {
    return markdown + generateReferencesSection(links.sources);
  }

  return markdown;
}
