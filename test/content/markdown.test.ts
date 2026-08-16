import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  escapeAngleBrackets,
  escapeUserText,
  generateFileName,
  generateContentHash,
  conversationToNote,
  convertDeepResearchContent,
} from '../../src/content/markdown';
import { sanitizeHtml } from '../../src/lib/sanitize';
import { MAX_MATH_LENGTH } from '../../src/lib/constants';
import type { ConversationData, TemplateOptions, DeepResearchLinks } from '../../src/lib/types';

describe('escapeUserText — math dollar escaping (Obsidian hang fix)', () => {
  it('escapes $ so shell/YAML text is not parsed as math', () => {
    expect(escapeUserText('TMP=$(mktemp)')).toBe('TMP=\\$(mktemp)');
    expect(escapeUserText('${S3_ACCESS_KEY}')).toBe('\\${S3_ACCESS_KEY}');
  });

  it('escapes doubled $$ (compose escaping) as two literal dollars', () => {
    expect(escapeUserText('cat "$$TMP"')).toBe('cat "\\$\\$TMP"');
  });

  it('still escapes angle brackets like escapeAngleBrackets', () => {
    expect(escapeUserText('a > b')).toBe('a \\> b');
  });

  it('preserves $ inside fenced code blocks', () => {
    const input = '```\n$x = 1\n```';
    expect(escapeUserText(input)).toBe(input);
  });

  it('preserves $ inside inline code', () => {
    expect(escapeUserText('use `$HOME` now')).toBe('use `$HOME` now');
  });
});

describe('escapeAngleBrackets — leaves $ untouched (assistant math preserved)', () => {
  it('does not escape $ so KaTeX math survives', () => {
    expect(escapeAngleBrackets('$$E = mc^2$$')).toBe('$$E = mc^2$$');
    expect(escapeAngleBrackets('inline $x^2$ math')).toBe('inline $x^2$ math');
  });
});

describe('htmlToMarkdown — image placeholders', () => {
  it('converts a data-g2o-image marker to a g2o-image placeholder link', () => {
    const md = htmlToMarkdown('<img data-g2o-image="img-1" alt="（AI 生成）">');
    expect(md).toContain('![（AI 生成）](g2o-image://img-1)');
  });

  it('handles a marker with no alt text', () => {
    const md = htmlToMarkdown('<img data-g2o-image="img-2">');
    expect(md).toContain('![](g2o-image://img-2)');
  });

  it('places the placeholder on its own line within surrounding content', () => {
    const md = htmlToMarkdown('<p>Before</p><img data-g2o-image="img-3" alt="a"><p>After</p>');
    expect(md).toContain('![a](g2o-image://img-3)');
    expect(md).toContain('Before');
    expect(md).toContain('After');
  });
});

describe('htmlToMarkdown', () => {
  describe('basic formatting', () => {
    it('converts paragraphs', () => {
      expect(htmlToMarkdown('<p>Hello World</p>')).toBe('Hello World');
    });

    it('converts bold text', () => {
      expect(htmlToMarkdown('<strong>Bold</strong>')).toBe('**Bold**');
    });

    it('converts italic text', () => {
      expect(htmlToMarkdown('<em>Italic</em>')).toBe('*Italic*');
    });

    it('converts headings', () => {
      expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title');
      expect(htmlToMarkdown('<h2>Subtitle</h2>')).toBe('## Subtitle');
      expect(htmlToMarkdown('<h3>Section</h3>')).toBe('### Section');
    });

    it('converts links', () => {
      expect(htmlToMarkdown('<a href="https://example.com">Link</a>')).toBe(
        '[Link](https://example.com)'
      );
    });

    it('converts lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = htmlToMarkdown(html);
      // Turndown adds extra spaces after bullet marker
      expect(result).toContain('-   Item 1');
      expect(result).toContain('-   Item 2');
    });
  });

  describe('code blocks', () => {
    it('converts fenced code blocks with language', () => {
      const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('```javascript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('```');
    });

    it('converts fenced code blocks without language', () => {
      const html = '<pre><code>plain code</code></pre>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('```');
      expect(result).toContain('plain code');
    });

    it('converts inline code', () => {
      expect(htmlToMarkdown('Use <code>npm install</code>')).toBe('Use `npm install`');
    });

    // Issue #433: a conversation *about* Markdown closed its own code block at
    // the first inner fence, because the fence was hardcoded to three
    // backticks. CommonMark §4.5 / Obsidian "Nesting code blocks": the outer
    // fence must be longer than any fence the content holds (ADR-029).
    describe('nested code blocks (issue #433)', () => {
      const F3 = '`'.repeat(3);
      const F4 = '`'.repeat(4);

      it('wraps a pre>code block containing an inner fence in a longer fence', () => {
        const code = `# Title\n\n${F3}python\nprint(1)\n${F3}`;
        const html = `<pre><code class="language-markdown">${code}</code></pre>`;
        const result = htmlToMarkdown(html);

        expect(result).toContain(`${F4}markdown\n`);
        expect(result.trim().endsWith(F4)).toBe(true);
        // The inner block survives verbatim, fence lines included.
        expect(result).toContain(`${F3}python\nprint(1)\n${F3}`);
      });

      it('wraps a CodeMirror block containing an inner fence in a longer fence', () => {
        const html = `<pre><div><div><div class="flex items-center text-sm font-medium">Markdown</div>
          <div><button aria-label="Copy"></button></div></div>
          <div><div class="cm-editor"><div class="cm-scroller"><div class="cm-content">
          <span># Title</span><br><span>${F3}python</span><br><span>print(1)</span><br><span>${F3}</span>
          </div></div></div></div></div></pre>`;
        const result = htmlToMarkdown(html);

        expect(result).toContain(`${F4}markdown\n`);
        expect(result).toContain(`${F3}python\nprint(1)\n${F3}`);
      });

      it('grows the fence past the longest inner run, not just the first', () => {
        const code = `${F3}\ntext\n${'`'.repeat(5)}\n${F3}`;
        const html = `<pre><code class="language-md">${code}</code></pre>`;
        expect(htmlToMarkdown(html)).toContain(`${'`'.repeat(6)}md\n`);
      });

      it('leaves ordinary code blocks on the minimum fence', () => {
        const html = '<pre><code class="language-python">x = 1</code></pre>';
        expect(htmlToMarkdown(html)).toBe(`${F3}python\nx = 1\n${F3}`);
      });
    });

    // ChatGPT CodeMirror code blocks (2026-03 DOM change)
    // ChatGPT replaced <pre><code> with <pre> containing CodeMirror editor
    describe('ChatGPT CodeMirror structure', () => {
      it('converts CodeMirror code block with language', () => {
        const html = `<pre class="overflow-visible!">
          <div class="relative w-full">
            <div><div class="relative"><div><div><div><div>
              <div class="sticky">
                <div class="flex items-center justify-between">
                  <div class="flex items-center text-sm font-medium">Python</div>
                  <div><button aria-label="Copy"></button><button aria-label="Run code"><div>Run</div></button></div>
                </div>
              </div>
              <div><div class="relative"><div class="cm-editor"><div class="cm-scroller">
                <div class="cm-content">
                  <span>def</span><span> </span><span>hello</span><span>():</span><br>
                  <span>    </span><span>print</span><span>(</span><span>"world"</span><span>)</span>
                </div>
              </div></div></div></div>
            </div></div></div></div></div></div>
          </div>
        </pre>`;
        const result = htmlToMarkdown(html);
        expect(result).toContain('```python');
        expect(result).toContain('def hello():');
        expect(result).toContain('    print("world")');
        expect(result).toContain('```');
        // Header text should NOT appear in output
        expect(result).not.toMatch(/\bRun\b/);
        expect(result).not.toMatch(/\bCopy\b/);
      });

      it('converts CodeMirror code block without language header', () => {
        const html = `<pre><div><div><div><div><div><div><div>
          <div><div class="relative"><div class="cm-editor"><div class="cm-scroller">
            <div class="cm-content">
              <span>echo</span><span> </span><span>"hello"</span>
            </div>
          </div></div></div></div>
        </div></div></div></div></div></div></div></pre>`;
        const result = htmlToMarkdown(html);
        expect(result).toContain('```');
        expect(result).toContain('echo "hello"');
      });

      it('handles multi-line CodeMirror code with br elements', () => {
        const html = `<pre><div><div><div><div><div><div><div>
          <div class="flex items-center justify-between">
            <div class="flex items-center text-sm font-medium">JavaScript</div>
            <div><button aria-label="Copy"></button></div>
          </div>
          <div><div class="relative"><div class="cm-editor"><div class="cm-scroller">
            <div class="cm-content">
              <span>const</span><span> </span><span>a</span><span> = </span><span>1</span><span>;</span><br>
              <span>const</span><span> </span><span>b</span><span> = </span><span>2</span><span>;</span><br>
              <span>console</span><span>.</span><span>log</span><span>(</span><span>a</span><span> + </span><span>b</span><span>);</span>
            </div>
          </div></div></div></div>
        </div></div></div></div></div></div></div></pre>`;
        const result = htmlToMarkdown(html);
        expect(result).toContain('```javascript');
        expect(result).toContain('const a = 1;');
        expect(result).toContain('const b = 2;');
        expect(result).toContain('console.log(a + b);');
      });

      it('does not interfere with standard pre+code blocks', () => {
        // Ensure existing <pre><code> pattern still works
        const html = '<pre><code class="language-python">x = 1</code></pre>';
        const result = htmlToMarkdown(html);
        expect(result).toContain('```python');
        expect(result).toContain('x = 1');
      });
    });
  });

  describe('tables', () => {
    it('converts HTML tables to markdown', () => {
      const html = `
        <table>
          <thead><tr><th>A</th><th>B</th></tr></thead>
          <tbody><tr><td>1</td><td>2</td></tr></tbody>
        </table>
      `;
      const result = htmlToMarkdown(html);
      expect(result).toContain('| A | B |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| 1 | 2 |');
    });

    it('handles tables without thead', () => {
      const html = `
        <table>
          <tr><td>Header 1</td><td>Header 2</td></tr>
          <tr><td>Cell 1</td><td>Cell 2</td></tr>
        </table>
      `;
      const result = htmlToMarkdown(html);
      expect(result).toContain('|');
    });
  });

  describe('whitespace handling', () => {
    it('converts <br> to spaces (Turndown behavior)', () => {
      // Note: br tags are replaced with \n before turndown, but turndown
      // may collapse them to spaces in inline context
      const result = htmlToMarkdown('Line 1<br>Line 2');
      expect(result).toBe('Line 1 Line 2');
    });

    it('converts &nbsp; to spaces', () => {
      expect(htmlToMarkdown('Hello&nbsp;World')).toBe('Hello World');
    });
  });

  describe('math rendering', () => {
    it('converts display math div to $$ block', () => {
      const html = '<div data-math="\\frac{a}{b}"><span class="katex">nested spans</span></div>';
      const result = htmlToMarkdown(html);
      expect(result).toBe('$$\n\\frac{a}{b}\n$$');
    });

    it('converts inline math span to $ delimiters', () => {
      const html = '<span data-math="x^2"><span class="katex">nested</span></span>';
      const result = htmlToMarkdown(html);
      expect(result).toBe('$x^2$');
    });

    it('falls through when data-math attribute is absent', () => {
      const html = '<div class="math-block">plain text</div>';
      const result = htmlToMarkdown(html);
      expect(result).toBe('plain text');
    });

    it('falls through when data-math is empty', () => {
      const html = '<div data-math="">fallback content</div>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('fallback content');
    });

    it('preserves LaTeX backslash commands', () => {
      const html = '<div data-math="\\int_0^1 \\frac{dx}{x}">katex</div>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('\\int_0^1 \\frac{dx}{x}');
    });

    it('handles inline math within a paragraph', () => {
      const html = '<p>The value of <span data-math="x^2">x²</span> is important.</p>';
      const result = htmlToMarkdown(html);
      expect(result).toBe('The value of $x^2$ is important.');
    });

    it('handles display math between paragraphs', () => {
      const html = '<p>Before</p><div data-math="E = mc^2">katex</div><p>After</p>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('Before');
      expect(result).toContain('$$\nE = mc^2\n$$');
      expect(result).toContain('After');
    });

    describe('size limit & fallback (M-2)', () => {
      it('keeps a formula exactly at the length limit as math', () => {
        const latex = 'a'.repeat(MAX_MATH_LENGTH);
        const result = htmlToMarkdown(`<span data-math="${latex}">x</span>`);
        expect(result).toBe(`$${latex}$`);
      });

      it('falls back to plain text for an oversized inline formula', () => {
        const latex = 'a'.repeat(MAX_MATH_LENGTH + 1);
        const result = htmlToMarkdown(`<span data-math="${latex}">x</span>`);
        expect(result).not.toContain('$');
        expect(result).toContain(latex);
      });

      it('falls back to plain text for an oversized display formula', () => {
        const latex = 'b'.repeat(MAX_MATH_LENGTH + 1);
        const result = htmlToMarkdown(`<div data-math="${latex}">x</div>`);
        expect(result).not.toContain('$$');
        expect(result).toContain(latex);
      });

      it('escapes a literal $ in an inline value instead of emitting math', () => {
        const result = htmlToMarkdown('<span data-math="a$b">x</span>');
        expect(result).toBe('a\\$b');
      });

      it('escapes literal $ in a display value instead of emitting a math block', () => {
        const result = htmlToMarkdown('<div data-math="a$$b">x</div>');
        expect(result).not.toContain('$$\na');
        expect(result).toContain('a\\$\\$b');
      });

      it('keeps multi-line inline LaTeX as math (real KaTeX matrices span lines)', () => {
        const latex = '\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}';
        const result = htmlToMarkdown(`<span data-math="${latex}">x</span>`);
        expect(result).toBe(`$${latex}$`);
      });

      it('escapes backslashes before $ so a preceding \\ cannot re-open math', () => {
        // data-math value is `\a$b`: the backslash must be escaped first, else the
        // inserted `\` before `$` pairs with it and leaves the $ unescaped.
        const result = htmlToMarkdown('<span data-math="\\a$b">x</span>');
        expect(result).toBe('\\\\a\\$b');
      });
    });
  });

  describe('standard KaTeX math (REQ-085)', () => {
    /** Build standard KaTeX HTML for full-pipeline tests */
    function buildKatexHtml(latex: string, display: boolean = false): string {
      const mathAttrs = display
        ? 'xmlns="http://www.w3.org/1998/Math/MathML" display="block"'
        : 'xmlns="http://www.w3.org/1998/Math/MathML"';
      const inner = `<span class="katex"><span class="katex-mathml"><math ${mathAttrs}><semantics><mrow></mrow><annotation encoding="application/x-tex">${latex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">rendered</span></span>`;
      return display ? `<span class="katex-display">${inner}</span>` : inner;
    }

    it('converts standard KaTeX display math to $$ block', () => {
      const html = buildKatexHtml('E = mc^2', true);
      const result = htmlToMarkdown(sanitizeHtml(html));
      expect(result).toContain('$$\nE = mc^2\n$$');
    });

    it('converts standard KaTeX inline math to $ delimiters', () => {
      const html = buildKatexHtml('x^2');
      const result = htmlToMarkdown(sanitizeHtml(html));
      expect(result).toBe('$x^2$');
    });

    it('handles inline math within paragraph text', () => {
      const html = `<p>The value of ${buildKatexHtml('x^2')} is important.</p>`;
      const result = htmlToMarkdown(sanitizeHtml(html));
      expect(result).toBe('The value of $x^2$ is important.');
    });

    it('handles complex LaTeX with HTML entities (pmatrix &)', () => {
      const html = buildKatexHtml('\\begin{pmatrix} a &amp; b \\end{pmatrix}');
      const result = htmlToMarkdown(sanitizeHtml(html));
      expect(result).toContain('$\\begin{pmatrix} a & b \\end{pmatrix}$');
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      expect(htmlToMarkdown('')).toBe('');
    });

    it('handles plain text', () => {
      expect(htmlToMarkdown('Just text')).toBe('Just text');
    });
  });

  describe('angle bracket escaping (REQ-083)', () => {
    it('escapes angle brackets in plain text HTML', () => {
      // Turndown decodes &lt; to < — our escaping must catch it
      const result = htmlToMarkdown('<p>Error in &lt;module&gt;</p>');
      expect(result).toBe('Error in \\<module\\>');
    });

    it('does not escape angle brackets inside code blocks', () => {
      const html =
        '<pre><code class="language-python">File "test.py", in &lt;module&gt;</code></pre>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('<module>');
      expect(result).not.toContain('\\<module\\>');
    });

    it('does not escape angle brackets inside inline code', () => {
      const result = htmlToMarkdown('Use <code>&lt;span&gt;</code> for this');
      expect(result).toBe('Use `<span>` for this');
    });
  });
});

describe('escapeAngleBrackets', () => {
  describe('basic escaping', () => {
    it('escapes bare angle brackets', () => {
      expect(escapeAngleBrackets('<module>')).toBe('\\<module\\>');
    });

    it('escapes nested angle brackets', () => {
      expect(escapeAngleBrackets('<Generic<T>>')).toBe('\\<Generic\\<T\\>\\>');
    });

    it('escapes multiple angle brackets per line', () => {
      expect(escapeAngleBrackets('<a> and <b>')).toBe('\\<a\\> and \\<b\\>');
    });

    it('returns plain text unchanged', () => {
      expect(escapeAngleBrackets('plain text')).toBe('plain text');
    });

    it('returns empty string unchanged', () => {
      expect(escapeAngleBrackets('')).toBe('');
    });
  });

  describe('fenced code block preservation', () => {
    it('preserves angle brackets in fenced code blocks', () => {
      const input = '```\n<div>test</div>\n```';
      expect(escapeAngleBrackets(input)).toBe('```\n<div>test</div>\n```');
    });

    it('preserves angle brackets in fenced code blocks with language', () => {
      const input = '```typescript\nconst x: Array<string> = [];\n```';
      expect(escapeAngleBrackets(input)).toBe(input);
    });

    it('preserves fenced code blocks inside blockquotes', () => {
      const input = '> ```\n> <code>\n> ```';
      expect(escapeAngleBrackets(input)).toBe(input);
    });

    // Issue #433, second order: the length-blind fence toggle thought the
    // inner fence had closed the block, so it escaped angle brackets *inside*
    // the code and left the ones after it alone (ADR-029).
    describe('blocks holding an inner fence', () => {
      const F3 = '`'.repeat(3);
      const F4 = '`'.repeat(4);

      it('preserves angle brackets across an inner fence', () => {
        const input = [`${F4}markdown`, `${F3}html`, '<div>a</div>', F3, F4].join('\n');
        expect(escapeAngleBrackets(input)).toBe(input);
      });

      it('still escapes text that follows the closing fence', () => {
        const input = [`${F4}md`, `${F3}html`, '<div>a</div>', F3, F4, 'after <span>'].join('\n');
        const expected = [`${F4}md`, `${F3}html`, '<div>a</div>', F3, F4, 'after \\<span\\>'].join(
          '\n'
        );
        expect(escapeAngleBrackets(input)).toBe(expected);
      });

      it('does not let an inner fence with an info string close the block', () => {
        const input = [F3, `${F3}html`, '<div>a</div>'].join('\n');
        expect(escapeAngleBrackets(input)).toBe(input);
      });

      it('preserves a tilde block a user pasted', () => {
        const input = ['~~~md', '<div>a</div>', '~~~'].join('\n');
        expect(escapeAngleBrackets(input)).toBe(input);
      });
    });
  });

  describe('inline code preservation', () => {
    it('preserves angle brackets in inline code', () => {
      expect(escapeAngleBrackets('Use `<span>` for this')).toBe('Use `<span>` for this');
    });

    it('escapes outside inline code but preserves inside', () => {
      expect(escapeAngleBrackets('The `<div>` element and <module>')).toBe(
        'The `<div>` element and \\<module\\>'
      );
    });
  });

  describe('blockquote marker preservation', () => {
    it('preserves blockquote markers', () => {
      expect(escapeAngleBrackets('> text with <tag>')).toBe('> text with \\<tag\\>');
    });

    it('preserves nested blockquote markers', () => {
      expect(escapeAngleBrackets('> > nested <tag>')).toBe('> > nested \\<tag\\>');
    });
  });

  describe('mixed content', () => {
    it('handles text before and after fenced code block', () => {
      const input = 'Before <module>\n```\n<div>\n```\nAfter <span>';
      const expected = 'Before \\<module\\>\n```\n<div>\n```\nAfter \\<span\\>';
      expect(escapeAngleBrackets(input)).toBe(expected);
    });

    it('handles inline code mixed with bare angles', () => {
      const input = '`<a>` then <b> then `<c>`';
      const expected = '`<a>` then \\<b\\> then `<c>`';
      expect(escapeAngleBrackets(input)).toBe(expected);
    });
  });
});

describe('generateFileName', () => {
  it('creates filename from title and ID', () => {
    expect(generateFileName('Hello World', 'abc123def456')).toBe('hello-world-abc123de.md');
  });

  it('preserves Japanese characters', () => {
    const result = generateFileName('日本語テスト', 'abc123def456');
    expect(result).toContain('日本語テスト');
    expect(result.endsWith('.md')).toBe(true);
  });

  it('preserves Korean characters', () => {
    const result = generateFileName('한글테스트', 'abc123def456');
    expect(result).toContain('한글테스트');
  });

  it('removes special characters', () => {
    expect(generateFileName('Test: Special!', 'abc123def456')).toBe('test-special-abc123de.md');
  });

  it('truncates long titles to 50 characters', () => {
    const longTitle = 'a'.repeat(100);
    const result = generateFileName(longTitle, 'abc123def456');
    // 50 chars title + '-' + 8 char ID suffix + '.md'
    expect(result.length).toBeLessThanOrEqual(50 + 1 + 8 + 3);
  });

  it('handles empty title with fallback', () => {
    expect(generateFileName('', 'abc123def456')).toBe('conversation-abc123de.md');
  });

  it('handles title with only special characters', () => {
    expect(generateFileName('!!!@@@###', 'abc123def456')).toBe('conversation-abc123de.md');
  });
});

describe('generateFileName — naming scheme (#328)', () => {
  const DATE = new Date(2026, 6, 5); // 2026-07-05, local time

  it('defaults to the title-id scheme when scheme is omitted', () => {
    expect(generateFileName('Hello World', 'abc123def456')).toBe('hello-world-abc123de.md');
  });

  it("'title-id' scheme uses the 8-char conversation id suffix", () => {
    expect(generateFileName('Hello World', 'abc123def456', 'title-id')).toBe(
      'hello-world-abc123de.md'
    );
  });

  it("'title-date' scheme uses the local YYYY-MM-DD suffix instead of the id", () => {
    expect(generateFileName('Top 5 Headlines', 'abc123def456', 'title-date', DATE)).toBe(
      'top-5-headlines-2026-07-05.md'
    );
  });

  it("'title-date' still sanitizes the title and applies the empty fallback", () => {
    expect(generateFileName('', 'abc123def456', 'title-date', DATE)).toBe(
      'conversation-2026-07-05.md'
    );
    expect(generateFileName('Test: Special!', 'abc123def456', 'title-date', DATE)).toBe(
      'test-special-2026-07-05.md'
    );
  });
});

describe('generateContentHash', () => {
  it('returns consistent hash', () => {
    const content = 'test content';
    expect(generateContentHash(content)).toBe(generateContentHash(content));
  });

  it('delegates to generateHash', () => {
    // Verify behavior matches generateHash
    expect(generateContentHash('test content')).toBe('5b9662eb');
  });

  it('handles empty content', () => {
    expect(generateContentHash('')).toBe('00000000');
  });
});

describe('conversationToNote', () => {
  const mockData: ConversationData = {
    id: 'conv123',
    title: 'Test Conversation',
    url: 'https://gemini.google.com/app/conv123',
    source: 'gemini',
    messages: [
      { id: 'msg1', role: 'user', content: 'Hello', index: 0 },
      { id: 'msg2', role: 'assistant', content: '<p>Hi there!</p>', index: 1 },
    ],
    extractedAt: new Date('2025-01-10T00:00:00Z'),
    metadata: {
      messageCount: 2,
      userMessageCount: 1,
      assistantMessageCount: 1,
      hasCodeBlocks: false,
    },
  };

  const defaultOptions: TemplateOptions = {
    includeId: true,
    includeTitle: true,
    includeTags: true,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
  };

  it('attaches captured images to the note', () => {
    const dataWithImages: ConversationData = {
      ...mockData,
      messages: [
        { id: 'msg1', role: 'user', content: 'draw', index: 0 },
        {
          id: 'msg2',
          role: 'assistant',
          content: '<p>Here</p><img data-g2o-image="img-1" alt="（AI 生成）">',
          index: 1,
        },
      ],
      images: [{ id: 'img-1', mimeType: 'image/png', data: 'UE5H', alt: '（AI 生成）' }],
    };
    const note = conversationToNote(dataWithImages, defaultOptions);
    expect(note.images).toEqual(dataWithImages.images);
    expect(note.body).toContain('![（AI 生成）](g2o-image://img-1)');
  });

  it('attaches an empty images array when the conversation has none', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.images).toEqual([]);
  });

  it('uses the title-id filename scheme by default (#328)', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.fileName).toBe('test-conversation-conv123.md');
  });

  it('uses the title-date filename scheme when configured (#328)', () => {
    const note = conversationToNote(mockData, { ...defaultOptions, filenameScheme: 'title-date' });
    expect(note.fileName).toMatch(/^test-conversation-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('never leaks a DOM-derived per-message id into the filename or frontmatter id', () => {
    // ConversationMessage.id is now sourced from page-controlled DOM attributes
    // (data-turn-id, data-index). This invariant guards it from ever reaching a
    // sink: the filename derives from data.id and the frontmatter id is
    // `${source}_${data.id}` — never message.id.
    const evil = '../../etc/passwd"><script>';
    const data: ConversationData = {
      ...mockData,
      messages: [{ id: evil, role: 'user', content: 'hi', index: 0 }],
    };
    const note = conversationToNote(data, defaultOptions);
    expect(note.fileName).not.toContain('etc');
    expect(note.fileName).not.toContain('script');
    expect(note.frontmatter.id).toBe('gemini_conv123');
    expect(note.frontmatter.id).not.toContain(evil);
  });

  it('generates frontmatter with required fields', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.frontmatter.id).toBe('gemini_conv123');
    expect(note.frontmatter.title).toBe('Test Conversation');
    expect(note.frontmatter.source).toBe('gemini');
    expect(note.frontmatter.url).toBe('https://gemini.google.com/app/conv123');
  });

  it('generates frontmatter with tags', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.frontmatter.tags).toContain('ai-conversation');
    expect(note.frontmatter.tags).toContain('gemini');
  });

  it('formats messages as callouts', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.body).toContain('[!QUESTION]');
    expect(note.body).toContain('[!NOTE]');
    expect(note.body).toContain('User');
    expect(note.body).toContain('Gemini');
  });

  it('converts HTML to markdown in assistant messages', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.body).toContain('Hi there!');
    expect(note.body).not.toContain('<p>');
  });

  it('generates content hash', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('generates fileName', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.fileName).toBe('test-conversation-conv123.md');
  });

  it('formats as blockquote when specified', () => {
    const options = { ...defaultOptions, messageFormat: 'blockquote' as const };
    const note = conversationToNote(mockData, options);
    expect(note.body).toContain('**User:**');
    expect(note.body).toContain('**Gemini:**');
    expect(note.body).toContain('> ');
  });

  it('formats as plain when specified', () => {
    const options = { ...defaultOptions, messageFormat: 'plain' as const };
    const note = conversationToNote(mockData, options);
    expect(note.body).toContain('**User:**');
    expect(note.body).toContain('**Gemini:**');
    expect(note.body).not.toContain('[!');
  });

  it('handles multiple messages', () => {
    const dataWithMore: ConversationData = {
      ...mockData,
      messages: [
        { id: 'msg1', role: 'user', content: 'First question', index: 0 },
        { id: 'msg2', role: 'assistant', content: 'First answer', index: 1 },
        { id: 'msg3', role: 'user', content: 'Second question', index: 2 },
        { id: 'msg4', role: 'assistant', content: 'Second answer', index: 3 },
      ],
    };
    const note = conversationToNote(dataWithMore, defaultOptions);
    expect(note.body).toContain('First question');
    expect(note.body).toContain('First answer');
    expect(note.body).toContain('Second question');
    expect(note.body).toContain('Second answer');
  });

  // ========== Timezone support ==========
  it('uses UTC format by default when no timezone specified', () => {
    const note = conversationToNote(mockData, defaultOptions);
    // extractedAt is 2025-01-10T00:00:00Z → created should be UTC ISO
    expect(note.frontmatter.created).toBe('2025-01-10T00:00:00+00:00');
  });

  it('formats created date in specified timezone', () => {
    const options: TemplateOptions = { ...defaultOptions, timezone: 'Asia/Tokyo' };
    const note = conversationToNote(mockData, options);
    // 2025-01-10T00:00:00Z → JST is +09:00
    expect(note.frontmatter.created).toBe('2025-01-10T09:00:00+09:00');
  });

  it('formats modified date in specified timezone', () => {
    const options: TemplateOptions = { ...defaultOptions, timezone: 'Asia/Tokyo' };
    const note = conversationToNote(mockData, options);
    // modified is "now" — just verify it has JST offset
    expect(note.frontmatter.modified).toMatch(/\+09:00$/);
  });

  // ========== Angle bracket escaping in conversationToNote (REQ-083) ==========
  it('escapes angle brackets in assistant messages', () => {
    const data: ConversationData = {
      ...mockData,
      messages: [
        { id: 'a1', role: 'assistant', content: '<p>Error in &lt;module&gt;</p>', index: 0 },
      ],
    };
    const note = conversationToNote(data, defaultOptions);
    expect(note.body).toContain('\\<module\\>');
  });

  it('escapes angle brackets in user messages', () => {
    const data: ConversationData = {
      ...mockData,
      messages: [{ id: 'u1', role: 'user', content: 'What is <Generic<T>>?', index: 0 }],
    };
    const note = conversationToNote(data, defaultOptions);
    expect(note.body).toContain('\\<Generic\\<T\\>\\>');
  });

  it('does not escape code blocks in assistant messages', () => {
    const data: ConversationData = {
      ...mockData,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: '<pre><code>&lt;div&gt;test&lt;/div&gt;</code></pre>',
          index: 0,
        },
      ],
    };
    const note = conversationToNote(data, defaultOptions);
    expect(note.body).toContain('<div>');
    expect(note.body).not.toContain('\\<div\\>');
  });

  it('does not escape inline code in assistant messages', () => {
    const data: ConversationData = {
      ...mockData,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'Use <code>&lt;span&gt;</code> for this',
          index: 0,
        },
      ],
    };
    const note = conversationToNote(data, defaultOptions);
    expect(note.body).toContain('`<span>`');
  });

  // ========== Coverage Gap: empty sources in Deep Research (DES-005 3.6) ==========
  it('omits References section when links.sources is empty', () => {
    // Covers: markdown.ts line 176 branch (sources.length === 0)
    const data: ConversationData = {
      id: 'deep-research-empty-refs',
      title: 'Deep Research No Sources',
      url: 'https://gemini.google.com/app/test',
      source: 'gemini',
      type: 'deep-research',
      links: { sources: [] },
      messages: [
        {
          id: 'r0',
          role: 'assistant',
          content: '<p>Report content</p>',
          htmlContent: '<p>Report content</p>',
          index: 0,
        },
      ],
      extractedAt: new Date('2025-01-01T00:00:00.000Z'),
      metadata: {
        messageCount: 1,
        userMessageCount: 0,
        assistantMessageCount: 1,
        hasCodeBlocks: false,
      },
    };

    const note = conversationToNote(data, defaultOptions);

    expect(note.body).not.toContain('## References');
  });

  // ========== Issue #187: Question headers ==========
  describe('includeQuestionHeaders option (issue #187)', () => {
    const baseData: ConversationData = {
      id: 'header-test',
      title: 'Header Test',
      url: 'https://gemini.google.com/app/header-test',
      source: 'gemini',
      messages: [
        { id: 'm1', role: 'user', content: 'How does TLS work?', index: 0 },
        { id: 'm2', role: 'assistant', content: '<p>It uses keys.</p>', index: 1 },
        { id: 'm3', role: 'user', content: 'What about HTTP/3?', index: 2 },
        { id: 'm4', role: 'assistant', content: '<p>It uses QUIC.</p>', index: 3 },
      ],
      extractedAt: new Date('2025-01-01T00:00:00Z'),
      metadata: {
        messageCount: 4,
        userMessageCount: 2,
        assistantMessageCount: 2,
        hasCodeBlocks: false,
      },
    };

    it('omits headers when option is false (default)', () => {
      const note = conversationToNote(baseData, defaultOptions);
      expect(note.body).not.toMatch(/^## How does TLS work\?$/m);
      expect(note.body).not.toMatch(/^## What about HTTP\/3\?$/m);
    });

    it('prepends `## ` header before each user callout when enabled', () => {
      const note = conversationToNote(baseData, {
        ...defaultOptions,
        includeQuestionHeaders: true,
      });

      expect(note.body).toMatch(
        /^## How does TLS work\?\n\n> \[!QUESTION\] User\n> How does TLS work\?/m
      );
      expect(note.body).toMatch(
        /^## What about HTTP\/3\?\n\n> \[!QUESTION\] User\n> What about HTTP\/3\?/m
      );
    });

    it('does not prepend headers before assistant messages', () => {
      const note = conversationToNote(baseData, {
        ...defaultOptions,
        includeQuestionHeaders: true,
      });

      // Assistant content should never appear as an H2 heading
      expect(note.body).not.toMatch(/^## It uses keys\./m);
      expect(note.body).not.toMatch(/^## It uses QUIC\./m);
    });

    it('truncates long questions to 60 characters with ellipsis', () => {
      const longText =
        'Please explain quantum mechanics in simple terms that a ten year old child would easily understand';
      const data: ConversationData = {
        ...baseData,
        messages: [{ id: 'm1', role: 'user', content: longText, index: 0 }],
      };

      const note = conversationToNote(data, {
        ...defaultOptions,
        includeQuestionHeaders: true,
      });

      const headerLine = note.body.split('\n').find(l => l.startsWith('## '));
      expect(headerLine).toBeDefined();
      expect(headerLine!.endsWith('…')).toBe(true);
      // Visible length (excluding the leading "## ") must stay within budget
      const visible = headerLine!.slice(3);
      expect(visible.length).toBeLessThanOrEqual(60);
      // Truncated text must be a complete word-prefix of the original (i.e. break
      // happened on a space, not mid-word)
      const textWithoutEllipsis = visible.slice(0, -1);
      expect(longText.startsWith(textWithoutEllipsis + ' ')).toBe(true);
    });

    it('hard-truncates a single very long word', () => {
      const longWord = 'A' + 'a'.repeat(100);
      const data: ConversationData = {
        ...baseData,
        messages: [{ id: 'm1', role: 'user', content: longWord, index: 0 }],
      };

      const note = conversationToNote(data, {
        ...defaultOptions,
        includeQuestionHeaders: true,
      });

      const headerLine = note.body.split('\n').find(l => l.startsWith('## '));
      expect(headerLine).toBeDefined();
      expect(headerLine!.endsWith('…')).toBe(true);
      const visible = headerLine!.slice(3);
      // Total visible length stays within the 60-char budget
      expect(visible.length).toBeLessThanOrEqual(60);
    });

    it('normalizes multi-line user content into a single header line', () => {
      const data: ConversationData = {
        ...baseData,
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'First line\n\n  Second   line\twith tabs',
            index: 0,
          },
        ],
      };

      const note = conversationToNote(data, {
        ...defaultOptions,
        includeQuestionHeaders: true,
      });

      expect(note.body).toMatch(/^## First line Second line with tabs$/m);
    });

    it('skips header for empty user content', () => {
      const data: ConversationData = {
        ...baseData,
        messages: [
          { id: 'm1', role: 'user', content: '   \n\t  ', index: 0 },
          { id: 'm2', role: 'assistant', content: '<p>Hi</p>', index: 1 },
        ],
      };

      const note = conversationToNote(data, {
        ...defaultOptions,
        includeQuestionHeaders: true,
      });

      // No leading H2 line
      expect(note.body).not.toMatch(/^## /m);
    });

    it('works with blockquote message format', () => {
      const note = conversationToNote(baseData, {
        ...defaultOptions,
        messageFormat: 'blockquote',
        includeQuestionHeaders: true,
      });

      expect(note.body).toMatch(/^## How does TLS work\?\n\n\*\*User:\*\*/m);
    });

    it('works with plain message format', () => {
      const note = conversationToNote(baseData, {
        ...defaultOptions,
        messageFormat: 'plain',
        includeQuestionHeaders: true,
      });

      expect(note.body).toMatch(/^## How does TLS work\?\n\n\*\*User:\*\*/m);
    });
  });
});

// ============================================================
// Deep Research Link Processing Tests
// ============================================================
// Internal helpers (sanitizeUrl, convertInlineCitationsToFootnoteRefs,
// generateReferencesSection, removeSourcesCarousel) are tested indirectly
// through convertDeepResearchContent integration tests below.

describe('convertDeepResearchContent', () => {
  it('converts citations to footnotes with References section', () => {
    // data-turn-source-index is 1-based, sources array is 0-based
    const html = '<p>Text<sup data-turn-source-index="1"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [{ index: 0, url: 'https://example.com', title: 'Source', domain: 'example.com' }],
    };

    const result = convertDeepResearchContent(html, links);

    // v3.0: Footnote reference in text
    expect(result).toContain('[^1]');
    // v3.0: References section with footnote definitions
    expect(result).toContain('# References');
    expect(result).toContain('[^1]: [Source](https://example.com)');
  });

  it('removes sources carousel', () => {
    const html = '<p>Text</p><sources-carousel-inline>carousel</sources-carousel-inline>';
    const result = convertDeepResearchContent(html, undefined);

    expect(result).not.toContain('carousel');
    expect(result).toContain('Text');
  });

  it('works without links (no References section)', () => {
    const html = '<p>Simple content</p>';
    const result = convertDeepResearchContent(html, undefined);

    expect(result).toContain('Simple content');
    expect(result).not.toContain('# References');
  });

  it('handles multiple sources with 1-based index mapping', () => {
    const html =
      '<p>First<sup data-turn-source-index="1"></sup> second<sup data-turn-source-index="2"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [
        { index: 0, url: 'https://example.com/a', title: 'Article A', domain: 'example.com' },
        { index: 1, url: 'https://example.org/b', title: 'Article B', domain: 'example.org' },
      ],
    };

    const result = convertDeepResearchContent(html, links);

    // v3.0: Footnote references in text
    expect(result).toContain('[^1]');
    expect(result).toContain('[^2]');
    // v3.0: References section with all sources
    expect(result).toContain('# References');
    expect(result).toContain('[^1]: [Article A](https://example.com/a)');
    expect(result).toContain('[^2]: [Article B](https://example.org/b)');
  });

  it('handles duplicate citations with same footnote number', () => {
    const html =
      '<p>First<sup data-turn-source-index="1"></sup> second<sup data-turn-source-index="1"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [{ index: 0, url: 'https://example.com', title: 'Source', domain: 'example.com' }],
    };

    const result = convertDeepResearchContent(html, links);

    // Both citations use [^1], plus one in definition = 3 occurrences
    expect((result.match(/\[\^1\]/g) || []).length).toBe(3);
    expect(result).toContain('# References');
  });

  it('includes all sources in References even if unreferenced', () => {
    // Only index 1 is referenced, but all 3 sources should appear in References
    const html = '<p>Text<sup data-turn-source-index="1"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [
        { index: 0, url: 'https://a.com', title: 'A', domain: 'a.com' },
        { index: 1, url: 'https://b.com', title: 'B', domain: 'b.com' },
        { index: 2, url: 'https://c.com', title: 'C', domain: 'c.com' },
      ],
    };

    const result = convertDeepResearchContent(html, links);

    expect(result).toContain('[^1]: [A](https://a.com)');
    expect(result).toContain('[^2]: [B](https://b.com)');
    expect(result).toContain('[^3]: [C](https://c.com)');
  });

  it('rejects dangerous URL schemes in source references', () => {
    const html = '<p>Text</p>';
    const links: DeepResearchLinks = {
      sources: [
        { index: 0, url: 'javascript:alert(1)', title: 'XSS', domain: 'bad.com' },
        {
          index: 1,
          url: 'data:text/html,<script>alert(1)</script>',
          title: 'Data',
          domain: 'bad.com',
        },
        { index: 2, url: 'https://safe.com', title: 'Safe', domain: 'safe.com' },
      ],
    };

    const result = convertDeepResearchContent(html, links);

    // Dangerous URLs must not appear in output
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('data:text');
    // Safe URL preserved
    expect(result).toContain('[^3]: [Safe](https://safe.com)');
    // Dangerous sources show title only (no link)
    expect(result).toContain('[^1]: XSS');
    expect(result).toContain('[^2]: Data');
  });

  it('rejects non-http URL schemes not on any denylist (allowlist enforcement)', () => {
    const html = '<p>Text</p>';
    const links: DeepResearchLinks = {
      sources: [
        { index: 0, url: 'file:///etc/passwd', title: 'File', domain: 'localhost' },
        { index: 1, url: 'mailto:a@b.com', title: 'Mail', domain: 'b.com' },
        { index: 2, url: '  \tjavascript:alert(1)', title: 'Sneaky', domain: 'bad.com' },
        { index: 3, url: 'https://safe.com', title: 'Safe', domain: 'safe.com' },
      ],
    };

    const result = convertDeepResearchContent(html, links);

    expect(result).not.toContain('file://');
    expect(result).not.toContain('mailto:');
    expect(result).not.toContain('javascript:');
    // Non-http(s) sources fall back to title only
    expect(result).toContain('[^1]: File');
    expect(result).toContain('[^2]: Mail');
    expect(result).toContain('[^3]: Sneaky');
    expect(result).toContain('[^4]: [Safe](https://safe.com)');
  });
});

describe('conversationToNote with Deep Research links', () => {
  const defaultOptions: TemplateOptions = {
    includeId: true,
    includeTitle: true,
    includeSource: true,
    includeTags: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
  };

  it('converts Deep Research with links to note with footnotes and References', () => {
    const links: DeepResearchLinks = {
      sources: [{ index: 0, url: 'https://example.com', title: 'Source', domain: 'example.com' }],
    };

    const deepResearchData: ConversationData = {
      id: 'dr123',
      title: 'Research Report',
      url: 'https://gemini.google.com/app/dr123',
      source: 'gemini',
      type: 'deep-research',
      links,
      messages: [
        {
          id: 'report-0',
          role: 'assistant',
          // data-turn-source-index is 1-based
          content: '<p>Content<sup data-turn-source-index="1"></sup></p>',
          index: 0,
        },
      ],
      extractedAt: new Date('2024-01-01'),
      metadata: {
        messageCount: 1,
        userMessageCount: 0,
        assistantMessageCount: 1,
        hasCodeBlocks: false,
      },
    };

    const note = conversationToNote(deepResearchData, defaultOptions);

    expect(note.frontmatter.type).toBe('deep-research');
    expect(note.frontmatter.tags).toContain('deep-research');
    // v3.0: Obsidian native footnotes
    expect(note.body).toContain('[^1]');
    expect(note.body).toContain('# References');
    expect(note.body).toContain('[^1]: [Source](https://example.com)');
  });
});

// ============================================================
// Tool Content Callout Rendering Tests (REQ-084 Step 5)
// ============================================================

describe('conversationToNote with toolContent', () => {
  const defaultOptions: TemplateOptions = {
    includeId: true,
    includeTitle: true,
    includeSource: true,
    includeTags: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
  };

  const baseData: ConversationData = {
    id: 'tc-test',
    title: 'Tool Content Test',
    url: 'https://claude.ai/chat/tc-test',
    source: 'claude',
    messages: [],
    extractedAt: new Date('2025-01-10T00:00:00Z'),
    metadata: {
      messageCount: 2,
      userMessageCount: 1,
      assistantMessageCount: 1,
      hasCodeBlocks: false,
    },
  };

  it('callout format: renders [!ABSTRACT]- callout before [!NOTE] callout', () => {
    const data: ConversationData = {
      ...baseData,
      messages: [
        { id: 'u0', role: 'user', content: 'Search for Rust', index: 0 },
        {
          id: 'a1',
          role: 'assistant',
          content: '<p>Here are the results.</p>',
          toolContent:
            '**Searched the web**\nRust latest version 2026 (10 results)\n- Rust Versions | Rust Changelogs (releases.rs)',
          index: 1,
        },
      ],
    };

    const note = conversationToNote(data, defaultOptions);

    // Tool content rendered as [!ABSTRACT]- callout
    expect(note.body).toContain('> [!ABSTRACT]- Searched the web');
    expect(note.body).toContain('> Rust latest version 2026 (10 results)');
    expect(note.body).toContain('> - Rust Versions | Rust Changelogs (releases.rs)');
    // Assistant response rendered as [!NOTE] callout
    expect(note.body).toContain('[!NOTE] Claude');
    expect(note.body).toContain('Here are the results.');
    // [!ABSTRACT]- appears before [!NOTE]
    const abstractIdx = note.body.indexOf('[!ABSTRACT]-');
    const noteIdx = note.body.indexOf('[!NOTE] Claude');
    expect(abstractIdx).toBeLessThan(noteIdx);
  });

  it('callout format: summary extracted as title from bold first line', () => {
    const data: ConversationData = {
      ...baseData,
      messages: [
        { id: 'u0', role: 'user', content: 'Test', index: 0 },
        {
          id: 'a1',
          role: 'assistant',
          content: '<p>Response</p>',
          toolContent: '**Analyzed code**\nFile analysis complete',
          index: 1,
        },
      ],
    };

    const note = conversationToNote(data, defaultOptions);

    expect(note.body).toContain('> [!ABSTRACT]- Analyzed code');
    expect(note.body).toContain('> File analysis complete');
  });

  it('callout format: no body renders title-only callout', () => {
    const data: ConversationData = {
      ...baseData,
      messages: [
        { id: 'u0', role: 'user', content: 'Test', index: 0 },
        {
          id: 'a1',
          role: 'assistant',
          content: '<p>Response</p>',
          toolContent: '**Searched the web**',
          index: 1,
        },
      ],
    };

    const note = conversationToNote(data, defaultOptions);

    expect(note.body).toContain('> [!ABSTRACT]- Searched the web');
    // Should not have extra empty body lines
    expect(note.body).not.toMatch(/> \[!ABSTRACT\]- Searched the web\n>/);
  });

  it('blockquote format: renders bold title + blockquoted body', () => {
    const options = { ...defaultOptions, messageFormat: 'blockquote' as const };
    const data: ConversationData = {
      ...baseData,
      messages: [
        { id: 'u0', role: 'user', content: 'Test', index: 0 },
        {
          id: 'a1',
          role: 'assistant',
          content: '<p>Response</p>',
          toolContent: '**Searched the web**\nQuery results here',
          index: 1,
        },
      ],
    };

    const note = conversationToNote(data, options);

    expect(note.body).toContain('**Searched the web**');
    expect(note.body).toContain('> Query results here');
  });

  it('plain format: renders bold title + plain body', () => {
    const options = { ...defaultOptions, messageFormat: 'plain' as const };
    const data: ConversationData = {
      ...baseData,
      messages: [
        { id: 'u0', role: 'user', content: 'Test', index: 0 },
        {
          id: 'a1',
          role: 'assistant',
          content: '<p>Response</p>',
          toolContent: '**Searched the web**\nQuery results here',
          index: 1,
        },
      ],
    };

    const note = conversationToNote(data, options);

    expect(note.body).toContain('**Searched the web**');
    expect(note.body).toContain('Query results here');
    // Should not have blockquote markers in plain mode
    expect(note.body).not.toContain('> Query results here');
    expect(note.body).not.toContain('[!ABSTRACT]');
  });

  it('no toolContent: assistant message renders normally', () => {
    const data: ConversationData = {
      ...baseData,
      messages: [
        { id: 'u0', role: 'user', content: 'Hello', index: 0 },
        { id: 'a1', role: 'assistant', content: '<p>Hi there!</p>', index: 1 },
      ],
    };

    const note = conversationToNote(data, defaultOptions);

    expect(note.body).not.toContain('[!ABSTRACT]');
    expect(note.body).toContain('[!NOTE] Claude');
    expect(note.body).toContain('Hi there!');
  });
});

/**
 * The truncation flag rides on the note but never on the note's content
 * (issue #449, ADR-033).
 */
describe('conversationToNote — truncated capture', () => {
  const options: TemplateOptions = {
    includeId: true,
    includeTitle: true,
    includeTags: true,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
    timezone: 'UTC',
  };

  function data(truncated?: boolean): ConversationData {
    return {
      id: 'c1',
      title: 'T',
      url: 'https://claude.ai/chat/c1',
      source: 'claude',
      messages: [{ role: 'user', content: 'q', id: 'm1', index: 0 }],
      extractedAt: new Date('2026-08-16T00:00:00Z'),
      metadata: { messageCount: 1, userMessageCount: 1, assistantMessageCount: 0 },
      ...(truncated === undefined ? {} : { truncated }),
    } as ConversationData;
  }

  it('carries the flag to the note so the background can act on it', () => {
    expect(conversationToNote(data(true), options).truncated).toBe(true);
  });

  it('omits the flag entirely for a complete capture', () => {
    expect('truncated' in conversationToNote(data(), options)).toBe(false);
    expect('truncated' in conversationToNote(data(false), options)).toBe(false);
  });

  it('never leaks the flag into the note frontmatter', () => {
    const note = conversationToNote(data(true), options);

    expect(JSON.stringify(note.frontmatter)).not.toContain('truncated');
  });
});
