/**
 * `escapeUserText()` as a line-local code-span scanner (DES-019 §4.4).
 *
 * User prompts are plain text. A `<` is left unescaped only inside code the
 * scanner can prove Obsidian renders as code; anything uncertain is escaped
 * (R2). Every expected value is written out by hand. Where the reading of a
 * case depends on CommonMark block structure, the final gate (markdown-it)
 * must find nothing left to do in the output.
 */
import { describe, it, expect } from 'vitest';
import { escapeUserText } from '../../src/content/markdown-rules';
import { neutralizeLiveHtml } from '../../src/lib/html-gate';

const F3 = '```';
const lines = (...parts: string[]): string => parts.join('\n');

describe('escapeUserText: inline code spans', () => {
  it.each([
    // F2: escaped backticks are literal to Obsidian, so this is not code.
    ['escaped backticks around a tag', '\\`<x>\\`', '\\\\\\`\\<x\\>\\\\\\`'],
    ['a real span', '`<x>`', '`<x>`'],
    ['a span delimited by two backticks', '``a`b``', '``a`b``'],
    ['an unclosed span', '`<x>', '\\`\\<x\\>'],
    ['an escaped backslash before a real span', '\\\\`<x>`', '\\\\`<x>`'],
    // P11: the run before `<` is doubled plus one, so it is always odd.
    ['two backslashes before a tag', '\\\\<x>', '\\\\\\\\\\<x\\>'],
    ['a dollar outside code', 'a $HOME', 'a \\$HOME'],
    ['a dollar inside a span', 'use `$HOME` now', 'use `$HOME` now'],
    // Span safety checks: the span may not exist in Obsidian.
    ['a span holding a pipe', '| `a | <iframe>` |', '| \\`a | \\<iframe\\>\\` |'],
    ['a span holding a wikilink', '`[[x]] <iframe>`', '\\`[[x]] \\<iframe\\>\\`'],
  ])('%s', (_name, input, expected) => {
    expect(escapeUserText(input)).toBe(expected);
  });

  it.each([
    ['a plain paragraph', lines('`<a', '<b>`'), lines('\\`\\<a', '\\<b\\>\\`')],
    ['list items', lines('- `open', '- <iframe>`'), lines('- \\`open', '- \\<iframe\\>\\`')],
    ['a heading', lines('# `a', '<iframe>`'), lines('# \\`a', '\\<iframe\\>\\`')],
  ])('never lets a span cross a line (%s)', (_name, input, expected) => {
    expect(escapeUserText(input)).toBe(expected);
  });
});

describe('escapeUserText: fences in blockquotes', () => {
  it.each([
    [
      'a real quoted fence',
      lines(`> ${F3}`, '> <img>', `> ${F3}`),
      lines(`> ${F3}`, '> <img>', `> ${F3}`),
    ],
    [
      'an over-indented quote "fence" (indented code)',
      lines(`>     ${F3}`, '> <img>', `>     ${F3}`),
      lines('>     \\`\\`\\`', '> \\<img\\>', '>     \\`\\`\\`'),
    ],
    [
      'a tab after `>`',
      lines(`>\t${F3}`, '> <img>', `>\t${F3}`),
      lines('>\t\\`\\`\\`', '> \\<img\\>', '>\t\\`\\`\\`'),
    ],
    [
      'a line that drops the quote',
      lines(`> ${F3}`, '<iframe>', `> ${F3}`),
      lines(`> ${F3}`, '\\<iframe\\>', `> ${F3}`),
    ],
    [
      'a line that drops one level',
      lines(`> > ${F3}`, '> <iframe>', `> > ${F3}`),
      lines(`> > ${F3}`, '> \\<iframe\\>', `> > ${F3}`),
    ],
    [
      'a deeper line inside the fence',
      lines(`> ${F3}`, '> > <x>', `> ${F3}`),
      lines(`> ${F3}`, '> > <x>', `> ${F3}`),
    ],
  ])('%s', (_name, input, expected) => {
    expect(escapeUserText(input)).toBe(expected);
  });
});

describe('escapeUserText: indented fences whose extent is uncertain (DES-019 §4.4, F-01)', () => {
  it.each([
    [
      '(a) a list item ends, and the fence in it',
      lines('- item', '', `  ${F3}`, '  code', '<iframe src=x>', `  ${F3}`, '<img src=x>'),
      lines(
        '- item',
        '',
        `  ${F3}`,
        '  code',
        '\\<iframe src=x\\>',
        '  \\`\\`\\`',
        '\\<img src=x\\>'
      ),
    ],
    [
      '(b) a top-level indented fence stays open',
      lines(`  ${F3}`, 'code', `  ${F3}`, '  <iframe src=x>'),
      lines(`  ${F3}`, 'code', '  \\`\\`\\`', '  \\<iframe src=x\\>'),
    ],
    [
      '(c) no fence is trusted after the uncertain line',
      lines(`  ${F3}`, 'code', `  ${F3}`, F3, '<img src=x>', F3),
      lines(`  ${F3}`, 'code', '  \\`\\`\\`', '\\`\\`\\`', '\\<img src=x\\>', '\\`\\`\\`'),
    ],
    [
      '(d) content indented at least as far as the fence',
      lines(`  ${F3}`, '  <x>', `  ${F3}`),
      lines(`  ${F3}`, '  <x>', `  ${F3}`),
    ],
    ['(e) a fence opened at column 0', lines(F3, '<x>', F3), lines(F3, '<x>', F3)],
  ])('%s', (_name, input, expected) => {
    const output = escapeUserText(input);
    expect(output).toBe(expected);
    expect(neutralizeLiveHtml(output)).toBe(output);
  });
});
