import { describe, it, expect } from 'vitest';
import { transformCitationsToFootnotes } from '../../src/content/extractors/notebooklm-citations';

describe('transformCitationsToFootnotes', () => {
  describe('basic transformation', () => {
    it('returns input unchanged when no citations are present', () => {
      const html = '<p>Plain prose with no citations.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toBe(html);
      expect(result.footnotes).toEqual([]);
    });

    it('returns empty result for empty input', () => {
      const result = transformCitationsToFootnotes('', 0);

      expect(result.html).toBe('');
      expect(result.footnotes).toEqual([]);
    });

    it('replaces a single citation with a footnote-ref placeholder span', () => {
      const html =
        '<p>A claim<button class="xap-inline-dialog citation-marker">' +
        '<span aria-label="1: Source Title">1</span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toContain('data-footnote-ref="m0-1"');
      expect(result.html).not.toContain('citation-marker');
      expect(result.html).not.toContain('<button');
      expect(result.footnotes).toEqual(['[^m0-1]: Source Title']);
    });

    it('preserves surrounding prose around the citation', () => {
      const html =
        '<p>A claim<button class="citation-marker">' +
        '<span aria-label="1: Title">1</span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toContain('A claim');
      expect(result.html).toContain('.</p>');
    });
  });

  describe('multiple citations', () => {
    it('handles multiple distinct citations in the same message', () => {
      const html =
        '<p>First<button class="citation-marker">' +
        '<span aria-label="1: Source A">1</span></button> ' +
        'and second<button class="citation-marker">' +
        '<span aria-label="2: Source B">2</span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toContain('data-footnote-ref="m0-1"');
      expect(result.html).toContain('data-footnote-ref="m0-2"');
      expect(result.footnotes).toEqual(['[^m0-1]: Source A', '[^m0-2]: Source B']);
    });

    it('deduplicates footnote definitions when the same N is cited twice', () => {
      const html =
        '<p>Same<button class="citation-marker">' +
        '<span aria-label="3: Repeat Source">3</span></button> ' +
        'twice<button class="citation-marker">' +
        '<span aria-label="3: Repeat Source">3</span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 1);

      const matches = result.html.match(/data-footnote-ref="m1-3"/g) ?? [];
      expect(matches).toHaveLength(2);
      expect(result.footnotes).toEqual(['[^m1-3]: Repeat Source']);
    });
  });

  describe('per-message scoping', () => {
    it('scopes labels by messageIndex to avoid cross-message collisions', () => {
      const html =
        '<p>Cite<button class="citation-marker">' +
        '<span aria-label="1: First">1</span></button>.</p>';

      const r0 = transformCitationsToFootnotes(html, 0);
      const r1 = transformCitationsToFootnotes(html, 1);

      expect(r0.html).toContain('data-footnote-ref="m0-1"');
      expect(r1.html).toContain('data-footnote-ref="m1-1"');
      expect(r0.footnotes[0]).toBe('[^m0-1]: First');
      expect(r1.footnotes[0]).toBe('[^m1-1]: First');
    });
  });

  describe('"more citations" mat-icon button is excluded', () => {
    it('skips citation-marker buttons containing a mat-icon', () => {
      const html =
        '<p>A claim<button class="citation-marker">' +
        '<span aria-label="1: Source Title">1</span></button>' +
        '<button class="citation-marker">' +
        '<mat-icon>more_horiz</mat-icon></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toContain('data-footnote-ref="m0-1"');
      expect(result.html).not.toContain('mat-icon');
      expect(result.html).not.toContain('<button');
      expect(result.footnotes).toEqual(['[^m0-1]: Source Title']);
    });
  });

  describe('aria-label fallbacks', () => {
    it('falls back to the visible number when aria-label is missing', () => {
      const html =
        '<p>Cite<button class="citation-marker"><span>5</span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toContain('data-footnote-ref="m0-5"');
      expect(result.footnotes).toEqual(['[^m0-5]: 5']);
    });

    it('uses entire aria-label as title when no "N: title" separator is present', () => {
      const html =
        '<p>Cite<button class="citation-marker">' +
        '<span aria-label="Just some label">7</span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toContain('data-footnote-ref="m0-7"');
      expect(result.footnotes).toEqual(['[^m0-7]: Just some label']);
    });

    it('skips a citation that has neither aria-label nor visible number', () => {
      const html =
        '<p>Bad<button class="citation-marker"><span></span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).not.toContain('data-footnote-ref');
      expect(result.html).not.toContain('<button');
      expect(result.footnotes).toEqual([]);
    });
  });

  describe('selector variants', () => {
    it('also matches the .xap-inline-dialog.citation-marker variant', () => {
      const html =
        '<p>Cite<button class="xap-inline-dialog citation-marker">' +
        '<span aria-label="2: Variant Source">2</span></button>.</p>';
      const result = transformCitationsToFootnotes(html, 0);

      expect(result.html).toContain('data-footnote-ref="m0-2"');
      expect(result.footnotes).toEqual(['[^m0-2]: Variant Source']);
    });
  });

  describe('immutability', () => {
    it('does not mutate the input string', () => {
      const html =
        '<p>X<button class="citation-marker">' +
        '<span aria-label="1: T">1</span></button>.</p>';
      const original = html;
      transformCitationsToFootnotes(html, 0);
      expect(html).toBe(original);
    });
  });
});
