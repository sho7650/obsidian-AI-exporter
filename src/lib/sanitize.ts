/**
 * HTML sanitization utility
 * Uses DOMPurify to prevent XSS attacks.
 * Pre-processes standard KaTeX HTML to data-math attribute format.
 */

import DOMPurify from 'dompurify';

/**
 * Extract LaTeX source from a standard KaTeX element's annotation.
 *
 * Standard KaTeX stores LaTeX in:
 *   <annotation encoding="application/x-tex">LATEX</annotation>
 * inside <math> → <semantics> structures.
 *
 * @returns LaTeX string, or null if no annotation found
 */
function extractLatexFromKatex(element: Element): string | null {
  const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
  return annotation?.textContent?.trim() || null;
}

/**
 * Pre-process standard KaTeX HTML structures to data-math attribute format.
 *
 * Standard KaTeX (used by Perplexity, ChatGPT, Claude) stores LaTeX source
 * in <annotation encoding="application/x-tex"> inside MathML structures.
 * DOMPurify strips MathML, so this function extracts LaTeX BEFORE sanitization
 * and converts elements to data-math format that existing Turndown rules handle.
 *
 * Processing:
 * 1. Display math: span.katex-display → div[data-math="LATEX"]
 *    (matches existing mathBlock Turndown rule: DIV[data-math])
 * 2. Inline math: span.katex → span[data-math="LATEX"]
 *    (matches existing mathInline Turndown rule: SPAN[data-math])
 *
 * Gemini coexistence: Elements already inside a [data-math] ancestor
 * (Gemini's native format) are skipped.
 *
 * @internal Exported for testing
 * @param html Raw HTML string from extractor innerHTML
 * @returns HTML with standard KaTeX converted to data-math format
 */
export function preprocessKatex(html: string): string {
  // Fast path: skip DOMParser overhead when no KaTeX content present
  if (!html.includes('katex')) {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  let modified = false;

  // Phase 1: Display math (span.katex-display → div[data-math])
  for (const el of doc.querySelectorAll('span.katex-display')) {
    if (el.closest('[data-math]')) continue; // Gemini format — skip
    const latex = extractLatexFromKatex(el);
    if (!latex) continue;
    const div = doc.createElement('div');
    div.setAttribute('data-math', latex);
    div.textContent = latex; // Turndown requires non-empty content to process the node
    el.replaceWith(div);
    modified = true;
  }

  // Phase 2: Inline math (span.katex → span[data-math])
  // After Phase 1, display math children (inner span.katex) are already removed.
  // Guard with closest() for any remaining edge cases.
  for (const el of doc.querySelectorAll('span.katex')) {
    if (el.closest('[data-math]') || el.closest('.katex-display')) continue;
    const latex = extractLatexFromKatex(el);
    if (!latex) continue;
    const span = doc.createElement('span');
    span.setAttribute('data-math', latex);
    span.textContent = latex; // Turndown requires non-empty content to process the node
    el.replaceWith(span);
    modified = true;
  }

  return modified ? doc.body.innerHTML : html;
}

/**
 * Sanitize HTML to prevent XSS attacks
 *
 * Design:
 * - Pre-processes standard KaTeX to data-math format before DOMPurify
 *   strips MathML elements (<math>, <semantics>, <annotation>)
 * - USE_PROFILES: { html: true } uses the default safe HTML allow-list
 *   (auto-removes <script>, <style>, <iframe>, <object>, <embed>, all
 *   event handler attributes (~70 kinds), and dangerous URI schemes)
 * - Cannot combine USE_PROFILES with ALLOWED_TAGS (per DOMPurify docs)
 * - Cannot combine USE_PROFILES with ALLOWED_ATTR (overrides it);
 *   use ADD_ATTR to extend the allow-list instead
 * - FORBID_TAGS adds <style> to the deny-list (CSS injection prevention)
 *
 * The uponSanitizeAttribute hook selectively allows:
 * - data-turn-source-index (Deep Research inline citations, 1-based index into source list)
 * - data-math (KaTeX math expressions — Gemini native or standard KaTeX via preprocessKatex)
 * while blocking all other data-* attributes.
 *
 * Note: The hook is added/removed per call to avoid cross-contamination
 * with other DOMPurify consumers in the same environment.
 */
export function sanitizeHtml(html: string): string {
  // Pre-process: convert standard KaTeX structures to data-math attributes
  // Must run BEFORE DOMPurify, which strips MathML elements (<math>, <annotation>)
  const preprocessed = preprocessKatex(html);

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'data-turn-source-index' || data.attrName === 'data-math') {
      data.forceKeepAttr = true;
    } else if (data.attrName.startsWith('data-')) {
      data.keepAttr = false;
    }
  });

  try {
    return DOMPurify.sanitize(preprocessed, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style'],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}
