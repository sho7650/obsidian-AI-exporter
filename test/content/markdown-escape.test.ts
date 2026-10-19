/**
 * Escaping primitives of the fidelity layer (DES-019 §4.1, ADR-044).
 *
 * Each one escapes `\` in the same pass as its targets, so the result always
 * leaves an odd backslash run before every `<` and `>` whatever the input
 * held (R1). Expected values are written out by hand from that rule.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import {
  escapeInlineText,
  escapeDestination,
  escapeMarkdownText,
  MARKDOWN_ESCAPES,
} from '../../src/content/markdown-rules';

describe('escapeInlineText', () => {
  it.each([
    ['<a>', '\\<a\\>'],
    ['\\<a>', '\\\\\\<a\\>'],
    ['\\\\<a>', '\\\\\\\\\\<a\\>'],
    ['plain text', 'plain text'],
    ['C:\\path', 'C:\\\\path'],
  ])('%s → %s', (input, expected) => {
    expect(escapeInlineText(input)).toBe(expected);
  });
});

describe('escapeDestination', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    ['https://example.com/a(b)', 'https://example.com/a\\(b\\)'],
    // P15: Turndown's own escaper leaves the existing backslash, making the run even.
    ['a b\\<iframe src=//evil\\>', '<a b\\\\\\<iframe src=//evil\\\\\\>>'],
    ['x<y', 'x\\<y'],
  ])('%s → %s', (input, expected) => {
    expect(escapeDestination(input)).toBe(expected);
  });
});

describe('escapeMarkdownText', () => {
  it.each([
    // P14: Turndown already escapes a leading `>`; one more backslash would make it even.
    ['> quoted', '\\> quoted'],
    ['a > b', 'a \\> b'],
    ['<iframe src=x>', '\\<iframe src=x\\>'],
    ['\\<iframe>', '\\\\\\<iframe\\>'],
    ['\\\\<iframe>', '\\\\\\\\\\<iframe\\>'],
    ['`<x>`', '\\`\\<x\\>\\`'],
    ['*a* [b] _c_', '\\*a\\* \\[b\\] \\_c\\_'],
    ['# heading', '\\# heading'],
  ])('%s → %s', (input, expected) => {
    expect(escapeMarkdownText(input)).toBe(expected);
  });

  it("copies Turndown's escape list minus the leading `>` entry, in order", () => {
    // Read from Turndown's source: the list is module-internal. A Turndown
    // upgrade that changes it fails here instead of drifting silently.
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve('turndown/lib/turndown.cjs.js'), 'utf8');
    const literal = /var markdownEscapes = (\[.*?\]);\n/.exec(source)?.[1];
    expect(literal).toBeDefined();
    const theirs = new Function(`return ${literal}`)() as Array<[RegExp, string]>;
    const show = (list: ReadonlyArray<readonly [RegExp, string]>): string[] =>
      list.map(([pattern, replacement]) => `${pattern} → ${replacement}`);

    expect(show(MARKDOWN_ESCAPES)).toEqual(
      show(theirs.filter(([pattern]) => String(pattern) !== '/^>/g'))
    );
    expect(theirs).toHaveLength(MARKDOWN_ESCAPES.length + 1);
  });
});
