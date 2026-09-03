/**
 * Perplexity Extractor
 *
 * Extracts conversations from Perplexity AI (www.perplexity.ai)
 * Supports normal chat mode and Deep Research reports
 *
 * @see docs/design/DES-004-perplexity-extractor.md
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import { isHttpUrl } from '../../lib/validation';
import type { ConversationMessage } from '../../lib/types';
import {
  createFootnoteRef,
  escapeMarkdownLink,
  footnoteDefsToHtml,
  transformCitations,
} from './footnotes';
import type { CitationTransformResult } from './footnotes';

import { SELECTORS } from './selectors/perplexity';

// ========== Layout selectors kept out of the live contract ==========
//
// Both groups below are DETECTION-ONLY: neither can be guaranteed to match on
// a freshly loaded conversation, so neither may live in SELECTORS — the live
// baseline refuses to record a zero-match selector, and a name that cannot be
// recorded blocks the whole platform (ADR-016, issues #402/#444).

/**
 * The pre-2026-08 answer placeholder.
 *
 * Perplexity removed `#markdown-content-N` id and all; the answer now renders
 * as a bare `.prose.inline`. Users who have not received the rollout still see
 * the placeholder, so it stays as a collection anchor and as the guard that
 * keeps an answer inside it from being counted twice — but it is invisible to
 * the live contract and belongs here rather than in SELECTORS.
 */
const LEGACY_MARKDOWN_CONTENT: readonly string[] = ['div[id^="markdown-content-"]'];

/**
 * The Deep Research report body.
 *
 * Under the old layout it was inline prose inside a raised card
 * (`div.bg-raised.rounded-lg`). Since 2026-08 the report collapses to an
 * attachment card that carries NO body at all, and the report mounts only
 * after the user opens it, into a `?preview=1` side panel.
 *
 * `max-w-none` is what marks report prose under both layouts, and under both
 * it wraps the report's own `inline` prose — so matching on it alone both
 * finds the report and excludes it from the answer set, with no need to name
 * the card itself (whose class list changed from `rounded-lg` to
 * `rounded-xl` in the same rollout).
 *
 * A collapsed card matches nothing here, which is exactly right: there is no
 * report body in the DOM to extract.
 */
const DEEP_RESEARCH_PROSE: readonly string[] = [
  '.prose.max-w-none',
  '.prose.dark\\:prose-invert.max-w-none',
];

// ========== Citation transformation (issue #291) ==========
//
// Perplexity renders inline source citations as "pill" spans:
//
//   <span class="citation inline" data-pplx-citation=""
//         data-pplx-citation-url="https://example.com/...">
//     <span class="group/trigger ...">          ← hover-trigger variant (no <a>)
//       ... <span>example.co</span><span>+1</span> ...
//   OR
//     <span class="inline-flex" aria-label="Source Title">  ← anchor variant
//       <a href="https://example.com/...">... <span>example.co</span> ...</a>
//
// Without transformation, DOMPurify strips the wrappers but keeps the pill
// text nodes, gluing "example.co+1" to the prose (the bug reported in #291).
// Every citation carries its source URL in data-pplx-citation-url, so each
// pill is rewritten into a footnote-ref placeholder span, with per-message
// footnote definitions linking title and URL (same pipeline as NotebookLM).

/** Attribute carrying the source URL on modern citation spans. */
const CITATION_URL_ATTR = 'data-pplx-citation-url';

/** A source collected from one message's citations. */
interface CitationSource {
  number: number;
  title: string;
  /** True when the title came from aria-label (richer than pill text). */
  hasRichTitle: boolean;
}

/**
 * Resolve a human-readable title for a citation.
 *
 * Priority: aria-label (anchor variant carries the source title) →
 * pill text with the trailing "+N" counter stripped → URL hostname.
 */
function parseCitationTitle(citation: Element, url: string): { title: string; rich: boolean } {
  const ariaLabel = citation.querySelector('[aria-label]')?.getAttribute('aria-label')?.trim();
  if (ariaLabel) return { title: ariaLabel, rich: true };

  const pillText = (citation.textContent ?? '').replace(/\+\d+\s*$/, '').trim();
  if (pillText) return { title: pillText, rich: false };

  return { title: new URL(url).hostname, rich: false };
}

/**
 * Normalize a citation URL for use inside `[title](url)` markdown syntax:
 * the URL constructor percent-encodes spaces and other raw characters, and
 * parentheses are escaped manually (they are valid in URLs but terminate
 * the markdown link target).
 */
function toMarkdownSafeUrl(url: string): string {
  return new URL(url).href.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * Rewrite modern citation pills into footnote-ref placeholder spans,
 * deduping by URL. The same source cited twice reuses one footnote label;
 * labels are `m{messageIndex}-{n}` so they stay unique across messages.
 * When a later duplicate carries a richer aria-label title, it upgrades
 * the stored title.
 */
function collectCitationSources(doc: Document, messageIndex: number): Map<string, CitationSource> {
  const sources = new Map<string, CitationSource>();

  for (const citation of doc.querySelectorAll(SELECTORS.citation.join(', '))) {
    // Guard against nested matches detached by an earlier replacement
    if (!citation.isConnected) continue;

    const url = citation.getAttribute(CITATION_URL_ATTR) ?? '';
    if (!isHttpUrl(url)) {
      // No usable URL. Keep the pill only if it embeds a working anchor
      // (Turndown converts it to a markdown link); otherwise remove it so
      // its text is not glued to the prose.
      if (!citation.querySelector('a[href]')) {
        citation.remove();
      }
      continue;
    }

    const parsed = parseCitationTitle(citation, url);
    const existing = sources.get(url);
    if (!existing) {
      sources.set(url, {
        number: sources.size + 1,
        title: parsed.title,
        hasRichTitle: parsed.rich,
      });
    } else if (parsed.rich && !existing.hasRichTitle) {
      sources.set(url, { ...existing, title: parsed.title, hasRichTitle: true });
    }

    const number = sources.get(url)!.number;
    citation.replaceWith(createFootnoteRef(doc, `m${messageIndex}-${number}`));
  }

  return sources;
}

/**
 * Remove citation artifacts that cannot be converted to footnotes:
 *
 * - Legacy pills (observed before 2026-07): rendered WITHOUT a
 *   data-pplx-citation-url ancestor — the source URL genuinely does not
 *   exist in the static DOM. Modern pills were already replaced, so any
 *   remaining `.citation` element is legacy. Pills embedding a working
 *   <a href> are kept (Turndown converts them to markdown links).
 * - Empty `citation-nbsp` spacer spans (contribute no whitespace).
 */
function removeCitationResidue(doc: Document): void {
  for (const residue of doc.querySelectorAll(SELECTORS.legacyCitationPill.join(', '))) {
    if (!residue.isConnected) continue;
    if (residue.querySelector('a[href]') || residue.closest('a[href]')) continue;
    residue.remove();
  }

  for (const spacer of doc.querySelectorAll(SELECTORS.citationSpacer.join(', '))) {
    spacer.remove();
  }
}

function transformCitationsToFootnotes(
  html: string,
  messageIndex: number
): CitationTransformResult {
  const citationGroups = [
    SELECTORS.citation,
    SELECTORS.legacyCitationPill,
    SELECTORS.citationSpacer,
  ];

  return transformCitations(html, {
    hasCitations: doc => citationGroups.some(group => doc.querySelector(group.join(', '))),
    collectFootnotes: doc => {
      const sources = collectCitationSources(doc, messageIndex);
      removeCitationResidue(doc);

      return [...sources.entries()].map(
        ([url, source]) =>
          `[^m${messageIndex}-${source.number}]: ` +
          `[${escapeMarkdownLink(source.title)}](${toMarkdownSafeUrl(url)})`
      );
    },
  });
}

/** Tagged element for DOM-order sorting */
type TaggedElement =
  | { type: 'user'; element: HTMLElement }
  | { type: 'response'; element: HTMLElement }
  | { type: 'report'; element: HTMLElement };

/**
 * Perplexity conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class PerplexityExtractor extends BaseExtractor {
  readonly platform = 'perplexity';

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL format: https://www.perplexity.ai/search/{slug}
   * @returns Full slug string or null if not found
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/search\/([^/]+)$/);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. document.title (via getPageTitle())
   * 2. First user query text (truncated to MAX_CONVERSATION_TITLE_LENGTH)
   * 3. Default title
   */
  getTitle(): string {
    return (
      this.getPageTitle() ??
      this.getFirstMessageTitle(SELECTORS.userQuery, 'Untitled Perplexity Conversation')
    );
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Strategy: Collect all content elements (user queries, responses, Deep Research
   * reports), sort them by DOM position, and build messages in document order.
   * This ensures multi-turn conversations with Deep Research maintain correct ordering.
   *
   * @see DES-004 Section 4.2
   */
  extractMessages(): ConversationMessage[] {
    const tagged = this.collectTaggedElements();

    if (tagged.length === 0) {
      console.warn('[G2O] No conversation content found with primary selectors');
      return [];
    }

    // Sort by DOM position to preserve visual ordering
    const sorted = this.sortByDomPosition(tagged);

    const messages: ConversationMessage[] = [];
    const ordinals = { user: 0, response: 0, report: 0 };

    for (const item of sorted) {
      // The ordinal advances for every element of its kind, extracted or not,
      // so ids stay aligned with DOM position even when one element is empty.
      const message = this.messageFor(item, ordinals[item.type]++, messages.length);
      if (message) messages.push(message);
    }

    return messages;
  }

  /** The message for one tagged element, or null when it yields no content. */
  private messageFor(
    item: TaggedElement,
    ordinal: number,
    index: number
  ): ConversationMessage | null {
    if (item.type === 'user') {
      const content = this.extractPlainText(item.element);
      return content ? { id: `user-${ordinal}`, role: 'user', content, index } : null;
    }

    const content =
      item.type === 'report'
        ? this.extractReportContent(item.element, index)
        : this.extractAssistantContent(item.element, index);
    if (!content) return null;

    const kind = item.type === 'report' ? 'report' : 'assistant';
    return { id: `${kind}-${ordinal}`, role: 'assistant', content, htmlContent: content, index };
  }

  /**
   * Collect all content elements tagged by type for DOM-order sorting
   */
  private collectTaggedElements(): TaggedElement[] {
    const tagged: TaggedElement[] = [];

    for (const el of this.queryAllWithFallback<HTMLElement>(SELECTORS.userQuery)) {
      tagged.push({ type: 'user', element: el });
    }

    for (const el of this.queryAllWithFallback<HTMLElement>(LEGACY_MARKDOWN_CONTENT)) {
      tagged.push({ type: 'response', element: el });
    }

    // An answer that is NOT inside a markdown-content placeholder (issue #444).
    //
    // Perplexity now serves two layouts at once. Under the newer one the
    // placeholder is present but empty and the answer renders as its sibling,
    // so anchoring only on the placeholder loses every assistant message while
    // the user query — read from a different subtree — survives alone.
    //
    // Collecting these unconditionally is safe rather than clever: under the
    // old layout every answer prose IS inside a placeholder, so this set is
    // empty and nothing is added twice. Deep Research report prose is skipped
    // because the report path below already owns it — a report nests an
    // `inline` prose of its own that would otherwise be counted as an answer.
    for (const prose of this.queryAllWithFallback<HTMLElement>(SELECTORS.answerProse)) {
      if (this.isInside(prose, LEGACY_MARKDOWN_CONTENT)) continue;
      if (this.isInside(prose, DEEP_RESEARCH_PROSE)) continue;
      tagged.push({ type: 'response', element: prose });
    }

    for (const prose of this.queryAllWithFallback<HTMLElement>(DEEP_RESEARCH_PROSE)) {
      tagged.push({ type: 'report', element: prose });
    }

    return tagged;
  }

  /** True when `el` sits inside an element matching any of `selectors`. */
  private isInside(el: HTMLElement, selectors: readonly string[]): boolean {
    return selectors.some(selector => {
      try {
        return el.closest(selector) !== null;
      } catch {
        // An invalid selector must not abort extraction; treat it as no match.
        return false;
      }
    });
  }

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * Perplexity uses two layouts for `#markdown-content-N`:
   *   (1) Legacy: a single `.prose` child wraps the whole answer.
   *   (2) New: multiple sibling `.has-inline-images > div > .prose` blocks,
   *       one per section (observed around 2026-04). Using querySelector
   *       here dropped every block after the first, truncating the answer.
   *
   * Strategy: collect all `.prose` descendants and concatenate their innerHTML
   * in document order. querySelectorAll already returns DOM order, so a single
   * matching selector covers both layouts.
   *
   * Inline citations (both hover-trigger pills and anchor pills) carry their
   * source URL in data-pplx-citation-url (observed 2026-07-02, issue #291)
   * and are rewritten to footnote-ref placeholders BEFORE sanitization so the
   * URLs survive DOMPurify's data-* attribute stripping.
   *
   * All HTML is sanitized via DOMPurify to prevent XSS.
   */
  private extractAssistantContent(contentElement: HTMLElement, messageIndex: number): string {
    const proseEls = this.queryAllWithFallback<HTMLElement>(SELECTORS.proseContent, contentElement);

    // Fallback: use the content element's innerHTML directly
    const rawHtml =
      proseEls.length > 0 ? proseEls.map(el => el.innerHTML).join('\n') : contentElement.innerHTML;

    if (!rawHtml) {
      return '';
    }

    return this.toSanitizedHtmlWithFootnotes(rawHtml, messageIndex);
  }

  /**
   * Extract Deep Research report content from the report prose element.
   *
   * The `max-w-none` prose is the report's outer wrapper; the rendered body is
   * an inner prose inside it under both the inline-card layout and the
   * `?preview=1` panel, so the inner element is preferred and the wrapper is
   * the fallback. Citations are converted to footnotes the same way as normal
   * answers.
   */
  private extractReportContent(reportProse: HTMLElement, messageIndex: number): string {
    const innerProse = this.queryWithFallback<HTMLElement>(SELECTORS.proseContent, reportProse);
    const targetEl = innerProse ?? reportProse;
    const content = this.toSanitizedHtmlWithFootnotes(targetEl.innerHTML, messageIndex);
    return content.trim() ? content : '';
  }

  /**
   * Convert raw response HTML to sanitized HTML with citation footnotes
   * appended as `<p data-footnote-def>` paragraphs.
   */
  private toSanitizedHtmlWithFootnotes(rawHtml: string, messageIndex: number): string {
    const { html, footnotes } = transformCitationsToFootnotes(rawHtml, messageIndex);
    return sanitizeHtml(html + footnoteDefsToHtml(footnotes));
  }
}
