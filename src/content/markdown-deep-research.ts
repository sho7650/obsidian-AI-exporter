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
import { processPlainTextCitations } from './citation-utils';

/**
 * Source-footnote wrapped citations. String.replace with /g resets internal
 * state per call, so a module-scoped RegExp is safe to reuse.
 */
const WRAPPED_CITATION_PATTERN =
  /<source-footnote[^>]*>[\s\S]*?<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>[\s\S]*?<\/source-footnote>/gi;

/** Standalone sup citations (fallback). */
const STANDALONE_CITATION_PATTERN =
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
 * Convert inline citations to footnote reference placeholders
 *
 * Supports both standard Gemini/Claude HTML citations:
 *   `<source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>`
 * and raw plain-text bracket citations like `[1, 2]`.
 *
 * Design: We use Regex to replace HTML tags with `<span data-footnote-ref="m0-N">`
 * placeholders that survive Turndown processing, then let Turndown output [^m0-N].
 *
 * @param html HTML content to convert
 * @param sourceMap Map built from buildSourceMap()
 */
function convertInlineCitationsToFootnoteRefs(
  html: string,
  sourceMap: Map<number, DeepResearchSource>
): string {
  const replacer = (match: string, p1: string) => {
    const index = parseInt(p1, 10);
    if (sourceMap.has(index)) {
      return `<span data-footnote-ref="m0-${index}">REF</span>`;
    }
    return match; // If not in source map, leave it untouched
  };

  // Phase 1: Process HTML element-based citations via regex for performance
  // Pattern 1: source-footnote wrapped
  let result = html.replace(WRAPPED_CITATION_PATTERN, replacer);
  // Pattern 2: standalone sup element (fallback)
  result = result.replace(STANDALONE_CITATION_PATTERN, replacer);

  // Parse modified string into DOM for Phase 2
  const doc = new DOMParser().parseFromString(result, 'text/html');

  // Deep Research does not require collecting the resolved footnotes per message 
  // because all sources are appended as a single block at the bottom.
  processPlainTextCitations(
    doc,
    0, // deep research uses "m0-" as prefix consistently
    (num) => {
      const source = sourceMap.get(num);
      return source ? source.title : null;
    }
  );

  return doc.body.innerHTML;
}

/**
 * Generate References section with Obsidian footnote definitions
 *
 * Output format:
 * # References
 *
 * [^m0-1]: [Title1](URL1)
 * [^m0-2]: [Title2](URL2)
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
      // [^m0-N]: [Title](URL)
      lines.push(`[^m0-${footnoteIndex}]: [${escapeMarkdownLink(source.title)}](${safeUrl})`);
    } else {
      // URL invalid: title only
      lines.push(`[^m0-${footnoteIndex}]: ${escapeMarkdownLink(source.title)}`);
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
  const sourceMap =
    links && links.sources.length > 0
      ? buildSourceMap(links.sources)
      : new Map<number, DeepResearchSource>();

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
