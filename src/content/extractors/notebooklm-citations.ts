/**
 * NotebookLM citation-to-footnote transformation
 *
 * NotebookLM renders inline source citations as buttons:
 *   <button class="citation-marker">
 *     <span aria-label="N: Source Title">N</span>
 *   </button>
 *
 * Without transformation, DOMPurify strips the <button> wrapper but keeps the
 * inner number as a text node, producing output like "big claim359" where
 * "359" is three citations glued to the prose. This module rewrites each
 * marker into a placeholder span carrying a per-message footnote label,
 * which the existing `footnoteRef` Turndown rule (markdown-rules.ts) converts
 * to Obsidian footnote syntax `[^label]`. The footnote definitions are
 * returned alongside so the extractor can append them to the assistant
 * message body.
 */

const FOOTNOTE_REF_ATTR = 'data-footnote-ref';

const ARIA_LABEL_PATTERN = /^\s*(\d+)\s*[:.]\s*(.+?)\s*$/;

export interface CitationTransformResult {
  /** HTML with citation buttons replaced by footnote-ref placeholder spans. */
  html: string;
  /** Per-message footnote definition lines (`[^label]: title`), deduped. */
  footnotes: string[];
}

interface ParsedCitation {
  number: string;
  title: string;
}

function parseCitation(button: Element): ParsedCitation | null {
  const labelEl = button.querySelector('[aria-label]');
  const ariaLabel = labelEl?.getAttribute('aria-label')?.trim() ?? '';
  const visible = (button.textContent ?? '').trim();

  const match = ariaLabel.match(ARIA_LABEL_PATTERN);
  if (match) {
    const [, number, title] = match;
    return { number, title };
  }

  if (ariaLabel.length > 0 && visible.length > 0) {
    return { number: visible, title: ariaLabel };
  }

  if (visible.length > 0) {
    return { number: visible, title: visible };
  }

  return null;
}

function isMoreCitationsButton(button: Element): boolean {
  return button.querySelector('mat-icon') !== null;
}

export function transformCitationsToFootnotes(
  html: string,
  messageIndex: number
): CitationTransformResult {
  if (!html) {
    return { html: '', footnotes: [] };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const buttons = Array.from(doc.querySelectorAll('button.citation-marker'));

  if (buttons.length === 0) {
    return { html, footnotes: [] };
  }

  const footnoteByNumber = new Map<string, string>();
  const order: string[] = [];

  for (const button of buttons) {
    if (isMoreCitationsButton(button)) {
      button.remove();
      continue;
    }

    const parsed = parseCitation(button);
    if (!parsed) {
      button.remove();
      continue;
    }

    const label = `m${messageIndex}-${parsed.number}`;
    const placeholder = doc.createElement('span');
    placeholder.setAttribute(FOOTNOTE_REF_ATTR, label);
    placeholder.textContent = 'REF';
    button.replaceWith(placeholder);

    if (!footnoteByNumber.has(parsed.number)) {
      footnoteByNumber.set(parsed.number, parsed.title);
      order.push(parsed.number);
    }
  }

  const footnotes = order.map(num => `[^m${messageIndex}-${num}]: ${footnoteByNumber.get(num)}`);

  return { html: doc.body.innerHTML, footnotes };
}
