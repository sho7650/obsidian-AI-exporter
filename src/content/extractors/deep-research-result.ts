/**
 * Assembly of a Deep Research extraction result.
 *
 * BaseExtractor gathers the platform-specific parts through its hooks (title,
 * report HTML, sources); turning them into an ExtractionResult is the same for
 * every platform and needs no `this`, so it lives here (DES-018 M-3a).
 */

import type { AIPlatform, DeepResearchLinks, ExtractionResult } from '../../lib/types';
import { generateHash } from '../../lib/hash';
import { buildMetadata } from './extraction-result';

/** What a platform's Deep Research panel yielded. */
export interface DeepResearchParts {
  title: string;
  /** Sanitized report HTML; empty when the panel had no content. */
  content: string;
  links: DeepResearchLinks;
  source: AIPlatform;
  url: string;
}

/**
 * Build a Deep Research extraction result.
 * The id is derived from the title, so re-exporting the same report finds the
 * same note.
 */
export function buildDeepResearchExtraction(parts: DeepResearchParts): ExtractionResult {
  const { title, content, links, source, url } = parts;

  if (!content) {
    return {
      success: false,
      error: 'Deep Research content not found',
      warnings: ['Panel is visible but content element is empty or missing'],
    };
  }

  const messages = [
    {
      id: 'report-0',
      role: 'assistant' as const,
      content,
      htmlContent: content,
      index: 0,
    },
  ];

  return {
    success: true,
    data: {
      id: `deep-research-${generateHash(title)}`,
      title,
      url,
      source,
      type: 'deep-research',
      links,
      messages,
      extractedAt: new Date(),
      metadata: buildMetadata(messages),
    },
  };
}

/**
 * Hostname of a URL, or 'unknown' when the URL cannot be parsed.
 * Shared fallback for Deep Research source domain extraction.
 */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}
