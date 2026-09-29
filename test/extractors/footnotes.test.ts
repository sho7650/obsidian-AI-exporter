/**
 * Tests for the shared citation → footnote helpers.
 *
 * Perplexity and NotebookLM exercise the happy path through their extractor
 * tests; these pin the two edges they never reach (DES-018 L-7).
 */
import { describe, it, expect, vi } from 'vitest';
import { transformCitations, footnoteDefsToHtml } from '../../src/content/extractors/footnotes';

describe('transformCitations', () => {
  it('returns empty HTML untouched without consulting the platform hooks', () => {
    const hooks = { hasCitations: vi.fn(), collectFootnotes: vi.fn() };

    expect(transformCitations('', hooks)).toEqual({ html: '', footnotes: [] });
    expect(hooks.hasCitations).not.toHaveBeenCalled();
    expect(hooks.collectFootnotes).not.toHaveBeenCalled();
  });
});

describe('footnoteDefsToHtml', () => {
  it('escapes HTML metacharacters in page-derived footnote titles', () => {
    // Titles come from the page, and this string is parsed as HTML again
    // downstream, so markup in a title must arrive as text.
    const html = footnoteDefsToHtml([`[^1]: <img src=x onerror="a()"> & 'b'`]);

    expect(html).toBe(
      '<p data-footnote-def="">[^1]: &lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;</p>'
    );
  });
});
