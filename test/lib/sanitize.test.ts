import { describe, it, expect } from 'vitest';
import { sanitizeHtml, preprocessKatex } from '../../src/lib/sanitize';

describe('sanitizeHtml', () => {
  describe('preserves safe HTML', () => {
    it('keeps paragraph tags', () => {
      expect(sanitizeHtml('<p>Hello</p>')).toBe('<p>Hello</p>');
    });

    it('keeps formatting tags', () => {
      expect(sanitizeHtml('<strong>Bold</strong>')).toBe('<strong>Bold</strong>');
      expect(sanitizeHtml('<em>Italic</em>')).toBe('<em>Italic</em>');
    });

    it('keeps allowed attributes', () => {
      const html = '<a href="https://example.com" title="Link">Click</a>';
      expect(sanitizeHtml(html)).toBe('<a href="https://example.com" title="Link">Click</a>');
    });

    it('keeps class attribute', () => {
      expect(sanitizeHtml('<div class="container">Content</div>')).toBe(
        '<div class="container">Content</div>'
      );
    });

    it('keeps nested safe elements', () => {
      expect(sanitizeHtml('<p><strong>Bold</strong> text</p>')).toBe(
        '<p><strong>Bold</strong> text</p>'
      );
    });
  });

  describe('removes XSS vectors', () => {
    it('removes script tags completely', () => {
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
    });

    it('removes event handlers', () => {
      expect(sanitizeHtml('<div onclick="alert(1)">Content</div>')).toBe('<div>Content</div>');
    });

    it('removes javascript: URLs', () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">Click</a>')).toBe('<a>Click</a>');
    });

    it('removes nested XSS', () => {
      expect(sanitizeHtml('<div><script>alert(1)</script>Safe</div>')).toBe('<div>Safe</div>');
    });

    it('removes onerror handlers', () => {
      expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain('onerror');
    });
  });

  describe('removes CSS injection', () => {
    it('removes style tags completely', () => {
      expect(sanitizeHtml('<style>body{display:none}</style>')).toBe('');
    });
  });

  describe('enforces attribute restrictions', () => {
    it('removes general data-* attributes', () => {
      expect(sanitizeHtml('<div data-id="secret">Content</div>')).toBe('<div>Content</div>');
    });

    it('keeps data-turn-source-index attribute (Deep Research citations)', () => {
      // This attribute is explicitly allowed for inline citation processing
      expect(sanitizeHtml('<sup data-turn-source-index="5">1</sup>')).toBe(
        '<sup data-turn-source-index="5">1</sup>'
      );
    });

    it('keeps data-turn-source-index in source-footnote structure', () => {
      const html = '<source-footnote><sup data-turn-source-index="1">1</sup></source-footnote>';
      const result = sanitizeHtml(html);
      expect(result).toContain('data-turn-source-index="1"');
    });

    it('keeps data-math attribute on div (Gemini KaTeX math blocks)', () => {
      expect(sanitizeHtml('<div data-math="\\frac{a}{b}">KaTeX content</div>')).toBe(
        '<div data-math="\\frac{a}{b}">KaTeX content</div>'
      );
    });

    it('keeps data-math attribute on span (Gemini KaTeX inline math)', () => {
      expect(sanitizeHtml('<span data-math="x^2">KaTeX content</span>')).toBe(
        '<span data-math="x^2">KaTeX content</span>'
      );
    });

    it('keeps data-g2o-image marker attribute on img (image placeholder)', () => {
      const result = sanitizeHtml('<img data-g2o-image="img-1" alt="（AI 生成）">');
      expect(result).toContain('data-g2o-image="img-1"');
      expect(result).toContain('alt="（AI 生成）"');
    });

    it('strips blob: src from images (blob URLs are not resolvable in the note)', () => {
      const result = sanitizeHtml('<img src="blob:https://gemini.google.com/abc" alt="x">');
      expect(result).not.toContain('blob:');
    });

    it('keeps id attributes (allowed by DOMPurify profile)', () => {
      // Note: USE_PROFILES: { html: true } allows id attribute by default
      // ALLOWED_ATTR adds to the profile, doesn't restrict it
      expect(sanitizeHtml('<div id="test">Content</div>')).toBe('<div id="test">Content</div>');
    });
  });

  describe('handles edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('handles plain text without tags', () => {
      expect(sanitizeHtml('Just plain text')).toBe('Just plain text');
    });

    it('handles whitespace-only input', () => {
      expect(sanitizeHtml('   ')).toBe('   ');
    });
  });

  describe('standard KaTeX preprocessing integration (REQ-085)', () => {
    it('converts standard KaTeX inline math through full pipeline', () => {
      const html =
        '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x²</span></span>';
      const result = sanitizeHtml(html);
      expect(result).toContain('data-math="x^2"');
      expect(result).not.toContain('<math');
      expect(result).not.toContain('<annotation');
    });

    it('converts standard KaTeX display math through full pipeline', () => {
      const html =
        '<span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">E=mc²</span></span></span>';
      const result = sanitizeHtml(html);
      expect(result).toContain('data-math="E = mc^2"');
      expect(result).not.toContain('<math');
    });
  });
});

/** Build minimal standard KaTeX HTML for testing */
function buildKatexHtml(latex: string, display: boolean = false): string {
  const mathAttrs = display
    ? 'xmlns="http://www.w3.org/1998/Math/MathML" display="block"'
    : 'xmlns="http://www.w3.org/1998/Math/MathML"';
  const inner = `<span class="katex"><span class="katex-mathml"><math ${mathAttrs}><semantics><mrow></mrow><annotation encoding="application/x-tex">${latex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">rendered</span></span>`;
  return display ? `<span class="katex-display">${inner}</span>` : inner;
}

describe('preprocessKatex', () => {
  describe('display math conversion', () => {
    it('converts span.katex-display to div[data-math]', () => {
      const html = buildKatexHtml('E = mc^2', true);
      const result = preprocessKatex(html);
      expect(result).toContain('<div data-math="E = mc^2">');
      expect(result).not.toContain('katex-display');
    });
  });

  describe('inline math conversion', () => {
    it('converts span.katex to span[data-math]', () => {
      const html = buildKatexHtml('x^2');
      const result = preprocessKatex(html);
      expect(result).toContain('<span data-math="x^2">');
      expect(result).not.toContain('katex-mathml');
    });
  });

  describe('mixed display and inline', () => {
    it('converts both display and inline in same HTML', () => {
      const html = `<p>Inline: ${buildKatexHtml('x^2')}</p>${buildKatexHtml('E = mc^2', true)}`;
      const result = preprocessKatex(html);
      expect(result).toContain('<span data-math="x^2">');
      expect(result).toContain('<div data-math="E = mc^2">');
    });
  });

  describe('Gemini coexistence', () => {
    it('skips elements inside [data-math] ancestor', () => {
      const html =
        '<div data-math="E=mc^2"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow></mrow><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span></span></div>';
      const result = preprocessKatex(html);
      // The outer div[data-math] should be preserved unchanged
      expect(result).toContain('data-math="E=mc^2"');
      // Should not create a second data-math element
      const matches = result.match(/data-math/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('fallback behavior', () => {
    it('leaves element unchanged when no annotation found', () => {
      const html =
        '<span class="katex"><span class="katex-html" aria-hidden="true">x²</span></span>';
      const result = preprocessKatex(html);
      // No data-math created — element left as-is
      expect(result).not.toContain('data-math');
    });

    it('skips when annotation is whitespace-only', () => {
      const html =
        '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow></mrow><annotation encoding="application/x-tex">   </annotation></semantics></math></span></span>';
      const result = preprocessKatex(html);
      expect(result).not.toContain('data-math');
    });
  });

  describe('special characters', () => {
    it('decodes HTML entities in LaTeX (& in pmatrix)', () => {
      const html = buildKatexHtml('a &amp; b');
      const result = preprocessKatex(html);
      // textContent decodes &amp; to &, setAttribute re-encodes for attribute
      // When read back via getAttribute, it will be "a & b"
      // In serialized HTML, it appears as &amp; in the attribute value
      expect(result).toContain('data-math');
      // Verify the decoded value is present (DOMParser decodes, then serializes)
      expect(result).toMatch(/data-math="a &amp; b"/);
    });

    it('trims multi-line annotation content (Perplexity pattern)', () => {
      const html =
        '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow></mrow><annotation encoding="application/x-tex">\n  x = \\dfrac{-b}{2a}\n  </annotation></semantics></math></span><span class="katex-html" aria-hidden="true">rendered</span></span>';
      const result = preprocessKatex(html);
      expect(result).toContain('data-math="x = \\dfrac{-b}{2a}"');
    });
  });

  describe('early return and edge cases', () => {
    it('returns unchanged when no katex in HTML', () => {
      const html = '<p>Hello World</p>';
      const result = preprocessKatex(html);
      expect(result).toBe(html);
    });

    it('returns empty string unchanged', () => {
      expect(preprocessKatex('')).toBe('');
    });

    it('converts multiple formulas in one HTML block', () => {
      const html = `<p>${buildKatexHtml('a')}, ${buildKatexHtml('b')}, ${buildKatexHtml('c')}</p>`;
      const result = preprocessKatex(html);
      expect(result).toContain('data-math="a"');
      expect(result).toContain('data-math="b"');
      expect(result).toContain('data-math="c"');
    });
  });
});
