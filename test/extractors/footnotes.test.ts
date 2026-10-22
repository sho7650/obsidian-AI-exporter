/**
 * Tests for the shared citation → footnote helpers.
 *
 * Perplexity and NotebookLM exercise the happy path through their extractor
 * tests; these pin the two edges they never reach (DES-018 L-7).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  transformCitations,
  footnoteDefsToHtml,
  escapeMarkdownLink,
  toMarkdownSafeUrl,
} from '../../src/content/extractors/footnotes';

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

describe('escapeMarkdownLink (DES-019 §4.1)', () => {
  it.each([
    ['[a](b)', '\\[a\\]\\(b\\)'],
    ['<iframe src=x>', '\\<iframe src=x\\>'],
    // R1: the backslash is escaped in the same pass, so the run before `<` stays odd.
    ['\\<b>', '\\\\\\<b\\>'],
  ])('%s → %s', (input, expected) => {
    expect(escapeMarkdownLink(input)).toBe(expected);
  });
});

describe('toMarkdownSafeUrl (DES-019 §4.5)', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    // The URL parser encodes spaces and angle brackets; parentheses are added.
    ['https://example.com/a b<i>(x)', 'https://example.com/a%20b%3Ci%3E%28x%29'],
    // The parser leaves `)` in userinfo, where it would still end the link.
    ['https://u)ser@example.com/x', 'https://u%29ser@example.com/x'],
    // Brackets are encoded in path, query and fragment, never in an IPv6 host.
    ['https://[::1]:8080/a[b]?q=[c]#[d]', 'https://[::1]:8080/a%5Bb%5D?q=%5Bc%5D#%5Bd%5D'],
  ])('%s → %s', (input, expected) => {
    expect(toMarkdownSafeUrl(input)).toBe(expected);
  });
});
