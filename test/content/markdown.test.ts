import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  escapeAngleBrackets,
  generateFileName,
  generateContentHash,
  conversationToNote,
  convertDeepResearchContent,
} from '../../src/content/markdown';
import type { ConversationData, TemplateOptions, DeepResearchLinks } from '../../src/lib/types';

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
      expect(htmlToMarkdown('Use <code>npm install</code>')).toBe(
        'Use `npm install`'
      );
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
      const html = '<pre><code class="language-python">File "test.py", in &lt;module&gt;</code></pre>';
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
    expect(generateFileName('Hello World', 'abc123def456')).toBe(
      'hello-world-abc123de.md'
    );
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
    expect(generateFileName('Test: Special!', 'abc123def456')).toBe(
      'test-special-abc123de.md'
    );
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
    expect(generateFileName('!!!@@@###', 'abc123def456')).toBe(
      'conversation-abc123de.md'
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
      messages: [
        { id: 'u1', role: 'user', content: 'What is <Generic<T>>?', index: 0 },
      ],
    };
    const note = conversationToNote(data, defaultOptions);
    expect(note.body).toContain('\\<Generic\\<T\\>\\>');
  });

  it('does not escape code blocks in assistant messages', () => {
    const data: ConversationData = {
      ...mockData,
      messages: [
        { id: 'a1', role: 'assistant', content: '<pre><code>&lt;div&gt;test&lt;/div&gt;</code></pre>', index: 0 },
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
        { id: 'a1', role: 'assistant', content: 'Use <code>&lt;span&gt;</code> for this', index: 0 },
      ],
    };
    const note = conversationToNote(data, defaultOptions);
    expect(note.body).toContain('`<span>`');
  });

  // ========== Coverage Gap: getAssistantLabel default (DES-005 3.6) ==========
  it('uses "Assistant" label for unknown source platform', () => {
    // Covers: markdown.ts line 329 (default case in getAssistantLabel switch)
    // NOTE: Uses type cast to bypass compile-time check. This is intentional
    // to exercise the runtime default case.
    const data: ConversationData = {
      id: 'test-unknown',
      title: 'Unknown Platform Test',
      url: 'https://example.com/chat/123',
      source: 'unknown_platform' as 'gemini',
      messages: [
        { id: 'u1', role: 'user', content: 'Hello', index: 0 },
        { id: 'a1', role: 'assistant', content: '<p>Hi</p>', htmlContent: '<p>Hi</p>', index: 1 },
      ],
      extractedAt: new Date('2025-01-01T00:00:00.000Z'),
      metadata: { messageCount: 2, userMessageCount: 1, assistantMessageCount: 1, hasCodeBlocks: false },
    };

    const note = conversationToNote(data, defaultOptions);

    expect(note.body).toContain('[!NOTE] Assistant');
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
        { id: 'r0', role: 'assistant', content: '<p>Report content</p>', htmlContent: '<p>Report content</p>', index: 0 },
      ],
      extractedAt: new Date('2025-01-01T00:00:00.000Z'),
      metadata: { messageCount: 1, userMessageCount: 0, assistantMessageCount: 1, hasCodeBlocks: false },
    };

    const note = conversationToNote(data, defaultOptions);

    expect(note.body).not.toContain('## References');
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
    const html = '<p>First<sup data-turn-source-index="1"></sup> second<sup data-turn-source-index="2"></sup></p>';
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
    const html = '<p>First<sup data-turn-source-index="1"></sup> second<sup data-turn-source-index="1"></sup></p>';
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
        { index: 1, url: 'data:text/html,<script>alert(1)</script>', title: 'Data', domain: 'bad.com' },
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
