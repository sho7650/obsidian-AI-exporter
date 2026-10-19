import { describe, it, expect, vi, afterEach } from 'vitest';
import { neutralizeLiveHtml } from '../../src/lib/html-gate';
import { countExistingMessages } from '../../src/lib/message-counter';

/**
 * A declaration block (`<!X`) runs to the first `>`, hiding the fence opener
 * inside it. Escaping its `<` turns it into a paragraph, the hidden fence
 * opener then closes on what used to open a fence, and the next link, which
 * was code until now, starts parsing. Each link costs one more pass.
 */
function hiddenChain(links: number): string {
  const lines: string[] = [];
  for (let i = 0; i < links; i++) lines.push(`<!X${i}`, '```', `x${i}>`, '  ```');
  lines.push('<b>end</b>');
  return lines.join('\n') + '\n';
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('neutralizeLiveHtml', () => {
  it('returns a body with no raw HTML unchanged', () => {
    const body = [
      '> [!QUESTION] User',
      '> what does \\<div\\> do?',
      '',
      '> [!NOTE] Gemini',
      '> It is a block element. `<div>` in code stays as is.',
      '>',
      '> ```html',
      '> <div>example</div>',
      '> ```',
    ].join('\n');
    expect(neutralizeLiveHtml(body)).toBe(body);
  });

  it('escapes the < of an HTML block', () => {
    expect(neutralizeLiveHtml('intro\n\n<iframe src="https://evil.example/"></iframe>\n')).toBe(
      'intro\n\n\\<iframe src="https://evil.example/">\\</iframe>\n'
    );
  });

  it('escapes inline HTML inside a callout without touching the > markers', () => {
    const body = '> [!NOTE] Gemini\n> see <img src=//evil/x> here\n';
    expect(neutralizeLiveHtml(body)).toBe('> [!NOTE] Gemini\n> see \\<img src=//evil/x> here\n');
  });

  it('adds a backslash only where the run before < is even', () => {
    // `\<b>` is already text; `\\<i>` is a literal backslash followed by live HTML.
    const body = 'a \\<b> b \\\\<i>c</i> d\n';
    expect(neutralizeLiveHtml(body)).toBe('a \\<b> b \\\\\\<i>c\\</i> d\n');
  });

  it('escapes HTML inside a referenced footnote definition', () => {
    expect(neutralizeLiveHtml('a[^1]\n\n[^1]: <img src=x>\n')).toBe(
      'a[^1]\n\n[^1]: \\<img src=x>\n'
    );
  });

  it('escapes HTML in a table cell, touching only that row', () => {
    const body = '| a | b |\n| --- | --- |\n| x | <img src=x> |\n| y | z |\n';
    expect(neutralizeLiveHtml(body)).toBe(
      '| a | b |\n| --- | --- |\n| x | \\<img src=x> |\n| y | z |\n'
    );
  });

  it('escapes HTML in a nested list item', () => {
    const body = '- one\n  - two <b>bold</b>\n- three\n';
    expect(neutralizeLiveHtml(body)).toBe('- one\n  - two \\<b>bold\\</b>\n- three\n');
  });

  it('re-parses until a repair stops uncovering new HTML', () => {
    const out = neutralizeLiveHtml(hiddenChain(1));
    expect(out).toBe('\\<!X0\n```\nx0>\n  ```\n\\<b>end\\</b>\n');
  });

  it('fails closed after three passes, escaping every line outside code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = neutralizeLiveHtml(hiddenChain(3));
    expect(out).toContain('\\<b>end\\</b>');
    expect(neutralizeLiveHtml(out)).toBe(out);
    expect(warn).toHaveBeenCalledWith(
      '[G2O Background] html gate neutralised',
      expect.objectContaining({ failClosed: true })
    );
  });

  it('logs counts only, never body text, when it changes something', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    neutralizeLiveHtml('<iframe src="https://evil.example/secret"></iframe>\n');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[G2O Background] html gate neutralised', {
      lines: 1,
      iterations: 1,
      failClosed: false,
    });
  });

  it('does not log when there is nothing to neutralise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    neutralizeLiveHtml('plain text\n');
    expect(warn).not.toHaveBeenCalled();
  });

  describe('callout headers', () => {
    const body = [
      '> [!QUESTION] User',
      '> hi',
      '',
      '> [!NOTE] Gemini',
      '> text <iframe src=x>',
      '',
      '> [!QUESTION] User',
      '> again',
    ].join('\n');

    it('keeps the header byte-identical when the first paragraph carries HTML', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const out = neutralizeLiveHtml(body);
      expect(out.split('\n')[3]).toBe('> [!NOTE] Gemini');
      expect(out.split('\n')[4]).toBe('> text \\<iframe src=x>');
      expect(countExistingMessages(out)).toBe(countExistingMessages(body));
    });

    it('keeps every header on the fail-closed path too', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const failing = `${body}\n\n${hiddenChain(3)}`;
      const out = neutralizeLiveHtml(failing);
      expect(out.startsWith('> [!QUESTION] User\n> hi\n\n> [!NOTE] Gemini\n')).toBe(true);
      expect(countExistingMessages(out)).toBe(countExistingMessages(failing));
    });
  });

  it('handles a token-dense body of 1 MiB in linear work', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = 'x <i>\n\n'.repeat(Math.floor((1024 * 1024) / 7));
    const out = neutralizeLiveHtml(body);
    expect(out.startsWith('x \\<i>\n\nx \\<i>\n\n')).toBe(true);
    expect(neutralizeLiveHtml(out)).toBe(out);
  }, 20_000);

  describe('size bound', () => {
    it.each([
      ['an HTML block of < characters', `<pre>\n${'<'.repeat(4000)}\n`],
      ['runs of \\\\< in HTML', `<b>x</b> ${'\\\\<'.repeat(1000)}\n`],
      ['a fail-closed body full of <', `${hiddenChain(3)}${'<i>'.repeat(1000)}\n`],
    ])('keeps the output within twice the input (%s)', (_name, body) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(neutralizeLiveHtml(body).length).toBeLessThanOrEqual(2 * body.length);
    });
  });

  describe('append (repairFromLine)', () => {
    it("leaves the user's existing HTML alone and repairs only the tail", () => {
      const existing = '<details>mine</details>\n\nsee <b>this</b>';
      const tail = '> [!NOTE] Gemini\n> new <img src=x>';
      const body = `${existing}\n\n${tail}`;
      expect(neutralizeLiveHtml(body, { repairFromLine: 4 })).toBe(
        `${existing}\n\n> [!NOTE] Gemini\n> new \\<img src=x>`
      );
    });

    it('reads the tail in context: a fence the existing body left open', () => {
      // Alone, the tail's fenced block is code. After the existing body's open
      // fence, the tail's first ``` closes it and the <iframe> is live.
      const existing = 'intro\n\n```\nunclosed';
      const tail = '```\n<iframe src=x>\n```';
      const out = neutralizeLiveHtml(`${existing}\n\n${tail}`, { repairFromLine: 5 });
      expect(out).toBe(`${existing}\n\n\`\`\`\n\\<iframe src=x>\n\`\`\``);
    });

    it.each([
      ['<pre>', 'a <pre> block'],
      ['<script>', 'a <script> block'],
      ['<style>', 'a <style> block'],
      ['<textarea>', 'a <textarea> block'],
      ['<!-- note', 'a comment'],
      ['<?php', 'a processing instruction'],
      ['<!DOCTYPE x', 'a declaration'],
      ['<![CDATA[', 'a CDATA section'],
    ])('refuses when the existing body ends inside %s (%s)', opener => {
      const body = `mine\n\n${opener}\nstill open\n\n> [!NOTE] Gemini\n> new text`;
      expect(neutralizeLiveHtml(body, { repairFromLine: 5 })).toBeNull();
    });

    it('accepts a closed HTML block in the existing body', () => {
      const body = 'mine\n\n<pre>\nclosed\n</pre>\n\n> [!NOTE] Gemini\n> new text';
      expect(neutralizeLiveHtml(body, { repairFromLine: 6 })).toBe(body);
    });

    it('changes nothing and logs nothing when HTML lies only before it', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const body = 'mine <b>bold</b>\n\n<div>block</div>\n\n> [!NOTE] Gemini\n> new text';
      expect(neutralizeLiveHtml(body, { repairFromLine: 4 })).toBe(body);
      expect(warn).not.toHaveBeenCalled();
    });

    it('changes only lines from it when a token spans it', () => {
      const body = 'a <b>x</b>\nb <i>y</i>\n';
      expect(neutralizeLiveHtml(body, { repairFromLine: 1 })).toBe('a <b>x</b>\nb \\<i>y\\</i>\n');
    });

    it('refuses instead of failing closed when the tail does not settle', () => {
      const body = `mine\n\n${hiddenChain(3)}`;
      expect(neutralizeLiveHtml(body, { repairFromLine: 2 })).toBeNull();
    });

    it('settles a tail that needs two passes', () => {
      const out = neutralizeLiveHtml(`mine\n\n${hiddenChain(1)}`, { repairFromLine: 2 });
      expect(out).toBe('mine\n\n\\<!X0\n```\nx0>\n  ```\n\\<b>end\\</b>\n');
    });
  });

  it('escapes HTML inside an unreferenced footnote definition', () => {
    // The footnote plugin drops unreferenced definitions from its final output,
    // but Obsidian still renders them.
    expect(neutralizeLiveHtml('[^1]: <img src=x>\n')).toBe('[^1]: \\<img src=x>\n');
  });

  it('escapes HTML inside an inline footnote', () => {
    expect(neutralizeLiveHtml('intro\n\nbefore ^[<img src=x>] after\n')).toBe(
      'intro\n\nbefore ^[\\<img src=x>] after\n'
    );
  });
});
