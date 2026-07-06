import { describe, it, expect } from 'vitest';
import { flattenLargeCallouts } from '../../src/lib/callout-flatten';

/** Build a callout of `n` content lines. */
function callout(label: string, n: number): string {
  const lines = [`> [!QUESTION] ${label}`];
  for (let i = 0; i < n; i++) lines.push(`> line ${i}`);
  return lines.join('\n');
}

describe('flattenLargeCallouts', () => {
  it('flattens a callout longer than the threshold to plain text', () => {
    const out = flattenLargeCallouts(callout('User', 10), 5);
    expect(out).not.toContain('> [!QUESTION]');
    expect(out).not.toMatch(/^> /m);
    expect(out.startsWith('**User:**\n\n')).toBe(true);
    expect(out).toContain('line 0');
    expect(out).toContain('line 9');
  });

  it('leaves a callout at or below the threshold unchanged', () => {
    const body = callout('User', 5); // header + 5 = 6 lines
    expect(flattenLargeCallouts(body, 10)).toBe(body);
  });

  it('flattens only the long callout when several are present', () => {
    const body = [callout('User', 2), '', callout('Gemini', 20)].join('\n');
    const out = flattenLargeCallouts(body, 5);
    expect(out).toContain('> [!QUESTION] User'); // short one kept
    expect(out).toContain('**Gemini:**'); // long one flattened
  });

  it('strips `> ` from a long plain blockquote (no callout header)', () => {
    const run = ['> a', ...Array.from({ length: 10 }, (_, i) => `> b${i}`)].join('\n');
    const out = flattenLargeCallouts(run, 5);
    expect(out).not.toMatch(/^> /m);
    expect(out).toContain('b9');
  });

  it('leaves non-blockquote content untouched', () => {
    const body = 'plain paragraph\n\n# heading';
    expect(flattenLargeCallouts(body, 5)).toBe(body);
  });

  it('preserves image wikilinks when flattening (drops only the `> `)', () => {
    const body = ['> [!NOTE] Gemini', ...Array.from({ length: 8 }, () => '> text'), '> ![[a-img-1.png]]'].join('\n');
    const out = flattenLargeCallouts(body, 5);
    expect(out).toContain('![[a-img-1.png]]');
    expect(out).not.toContain('> ![[');
  });
});
