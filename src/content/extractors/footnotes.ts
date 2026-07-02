/**
 * Shared footnote-placeholder helpers for citation transforms
 *
 * Platform extractors (NotebookLM, Perplexity) rewrite their inline citation
 * DOM into placeholder elements BEFORE sanitization:
 *   - <span data-footnote-ref="label">REF</span>   → `[^label]`   (footnoteRef rule)
 *   - <p data-footnote-def>[^label]: title</p>     → literal line (footnoteDef rule)
 * Both attributes are allow-listed in sanitizeHtml() and converted to Obsidian
 * footnote syntax by the Turndown rules in markdown-rules.ts.
 */

export const FOOTNOTE_REF_ATTR = 'data-footnote-ref';

export interface CitationTransformResult {
  /** HTML with citation elements replaced by footnote-ref placeholder spans. */
  html: string;
  /** Per-message footnote definition lines (`[^label]: title`), deduped. */
  footnotes: string[];
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Escape Markdown link metacharacters in text.
 * Prevents injection of Markdown links via crafted titles.
 */
export function escapeMarkdownLink(text: string): string {
  return text.replace(/[\\[\]()]/g, '\\$&');
}

/**
 * Create a footnote-ref placeholder span for the given label.
 *
 * The non-empty 'REF' text is required — Turndown skips empty inline
 * elements, so an empty span would never reach the footnoteRef rule.
 */
export function createFootnoteRef(doc: Document, label: string): HTMLSpanElement {
  const placeholder = doc.createElement('span');
  placeholder.setAttribute(FOOTNOTE_REF_ATTR, label);
  placeholder.textContent = 'REF';
  return placeholder;
}

/**
 * Wrap footnote definition lines in `<p data-footnote-def>` paragraphs so the
 * footnoteDef Turndown rule emits them as literal `[^label]: title` lines.
 */
export function footnoteDefsToHtml(footnotes: string[]): string {
  return footnotes.map(line => `<p data-footnote-def="">${escapeHtml(line)}</p>`).join('');
}
