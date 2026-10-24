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
  it('writes structured entries as attributes and text, HTML-escaped', () => {
    // Titles and URLs come from the page, and this string is parsed as HTML
    // again downstream, so markup in either must arrive as text.
    const html = footnoteDefsToHtml([
      { label: 'm1-1', title: `<img src=x onerror="a()"> & 'b'`, url: 'https://e.com/?a=1&b="2"' },
      { label: 'm1-2', title: 'No URL' },
    ]);

    expect(html).toBe(
      '<p data-footnote-def="m1-1" data-footnote-url="https://e.com/?a=1&amp;b=&quot;2&quot;">' +
        '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;</p>' +
        '<p data-footnote-def="m1-2">No URL</p>'
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
