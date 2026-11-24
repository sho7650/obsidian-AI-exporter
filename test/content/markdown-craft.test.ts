import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../../src/content/markdown';
import { sanitizeHtml } from '../../src/lib/sanitize';

/**
 * The `<span data-g2o-craft>` marker the extractor splices in (ADR-046) is
 * turned into a `g2o-craft://` placeholder by the shared Turndown rule. The page
 * can forge the attribute, so the rule accepts only ids the background resolves.
 */
describe('g2oCraft Turndown rule', () => {
  function convert(html: string): string {
    return htmlToMarkdown(sanitizeHtml(html));
  }

  it('emits a placeholder paragraph for a valid marker', () => {
    const md = convert('<p>before</p><span data-g2o-craft="craft-1">notes.md</span><p>after</p>');

    expect(md).toBe('before\n\n[notes.md](g2o-craft://craft-1)\n\nafter');
  });

  it('escapes brackets and angle brackets in the label', () => {
    const md = convert('<span data-g2o-craft="craft-1">a[1]&lt;b&gt;.md</span>');

    expect(md).toBe('[a\\[1\\]\\<b\\>.md](g2o-craft://craft-1)');
  });

  it.each(['bad id', 'a)b', '../x', '', 'x'.repeat(129)])(
    'treats a forged marker id %j as ordinary text',
    id => {
      const md = convert(`<p>keep <span data-g2o-craft="${id}">visible</span></p>`);

      expect(md).not.toContain('g2o-craft://');
      expect(md).toContain('visible');
    }
  );

  it('does not let a span without the attribute become a placeholder', () => {
    expect(convert('<span>plain</span>')).toBe('plain');
  });

  it('keeps the marker attribute through sanitization', () => {
    expect(sanitizeHtml('<span data-g2o-craft="craft-1" onclick="x()">n</span>')).toBe(
      '<span data-g2o-craft="craft-1">n</span>'
    );
  });
});
