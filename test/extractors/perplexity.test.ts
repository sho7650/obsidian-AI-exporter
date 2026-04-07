import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerplexityExtractor } from '../../src/content/extractors/perplexity';
import { htmlToMarkdown } from '../../src/content/markdown';
import { sanitizeHtml } from '../../src/lib/sanitize';
import {
  loadFixture,
  clearFixture,
  resetLocation,
  createPerplexityConversationDOM,
  setPerplexityLocation,
  setNonPerplexityLocation,
  createPerplexityInlineCitation,
  createPerplexityPage,
  createPerplexityDeepResearchPage,
  createPerplexityMultiTurnWithDeepResearch,
} from '../fixtures/dom-helpers';

describe('PerplexityExtractor', () => {
  let extractor: PerplexityExtractor;

  beforeEach(() => {
    extractor = new PerplexityExtractor();
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  // ========== Platform Detection ==========
  describe('Platform Detection', () => {
    describe('platform', () => {
      it('identifies as perplexity platform', () => {
        expect(extractor.platform).toBe('perplexity');
      });
    });

    describe('canExtract', () => {
      it('returns true for www.perplexity.ai', () => {
        setPerplexityLocation('test-slug-abc123');
        expect(extractor.canExtract()).toBe(true);
      });

      it('returns false for perplexity.ai (no www)', () => {
        setNonPerplexityLocation('perplexity.ai');
        expect(extractor.canExtract()).toBe(false);
      });

      it('returns false for evil.www.perplexity.ai.attacker.com', () => {
        setNonPerplexityLocation('evil.www.perplexity.ai.attacker.com');
        expect(extractor.canExtract()).toBe(false);
      });

      it('returns false for other domains', () => {
        setNonPerplexityLocation('chatgpt.com');
        expect(extractor.canExtract()).toBe(false);
      });
    });
  });

  // ========== URL Extraction ==========
  describe('Conversation ID Extraction', () => {
    it('extracts slug from /search/{slug} URL', () => {
      setPerplexityLocation('perplexitynohtmlgou-zao-wotesu-Y8vT04G0SKap6aQTA8L6hg');
      expect(extractor.getConversationId()).toBe(
        'perplexitynohtmlgou-zao-wotesu-Y8vT04G0SKap6aQTA8L6hg'
      );
    });

    it('extracts slug with URL-encoded characters', () => {
      setPerplexityLocation('da-shou-ting-toraba-CG5SwgBvRti46_Hs1jFYAw');
      expect(extractor.getConversationId()).toBe('da-shou-ting-toraba-CG5SwgBvRti46_Hs1jFYAw');
    });

    it('returns null for non-search paths', () => {
      setNonPerplexityLocation('www.perplexity.ai', '/hub');
      expect(extractor.getConversationId()).toBeNull();
    });

    it('returns null for root path', () => {
      setNonPerplexityLocation('www.perplexity.ai', '/');
      expect(extractor.getConversationId()).toBeNull();
    });
  });

  // ========== Title Extraction ==========
  describe('Title Extraction', () => {
    it('returns first user query text', () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'What is TypeScript?' },
        { role: 'assistant', content: '<p>TypeScript is...</p>' },
      ]);
      expect(extractor.getTitle()).toBe('What is TypeScript?');
    });

    it('truncates long titles to 100 characters', () => {
      setPerplexityLocation('test-slug');
      const longTitle = 'a'.repeat(150);
      createPerplexityPage('test-slug', [
        { role: 'user', content: longTitle },
        { role: 'assistant', content: '<p>Response</p>' },
      ]);
      expect(extractor.getTitle().length).toBe(100);
    });

    it('returns default title when no queries found', () => {
      setPerplexityLocation('test-slug');
      loadFixture('<div>Empty page</div>');
      expect(extractor.getTitle()).toBe('Untitled Perplexity Conversation');
    });
  });

  // ========== Message Extraction ==========
  describe('Message Extraction', () => {
    it('extracts paired user/assistant messages', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Hello Perplexity' },
        { role: 'assistant', content: '<p>Hello! How can I help?</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(2);
      expect(result.data?.messages[0].role).toBe('user');
      expect(result.data?.messages[1].role).toBe('assistant');
    });

    it('handles multi-turn conversations', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: '<p>Answer 1</p>' },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: '<p>Answer 2</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(4);
    });

    it('returns empty array when no content found', () => {
      setPerplexityLocation('test-slug');
      loadFixture('<div class="empty-page"></div>');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const messages = extractor.extractMessages();

      expect(messages).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No conversation content found')
      );
      warnSpy.mockRestore();
    });

    it('preserves HTML content for assistant messages', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<p>Response with <strong>bold</strong> text</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.htmlContent).toContain('<strong>');
    });

    it('handles query without response (pending)', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [{ role: 'user', content: 'Pending question' }]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(1);
      expect(result.data?.messages[0].role).toBe('user');
      expect(result.warnings).toContain('No assistant messages found');
    });
  });

  // ========== Citation Handling ==========
  describe('Citation Handling', () => {
    it('preserves <a href> links after sanitization', async () => {
      setPerplexityLocation('test-slug');
      const citationHtml = createPerplexityInlineCitation('https://example.com', 'example');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Test citations' },
        { role: 'assistant', content: `<p>Here is a citation ${citationHtml}</p>` },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).toContain('href="https://example.com"');
      expect(assistantMsg?.content).toContain('example');
      // data-pplx-* attributes should be stripped by DOMPurify
      expect(assistantMsg?.content).not.toContain('data-pplx');
    });
  });

  // ========== Full Extraction ==========
  describe('Full Extraction', () => {
    it('returns success with valid data', async () => {
      setPerplexityLocation('test-slug-abc123');
      createPerplexityPage('test-slug-abc123', [
        { role: 'user', content: 'Test question' },
        { role: 'assistant', content: '<p>Test answer</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.messages.length).toBe(2);
    });

    it('sets source to perplexity', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<p>Response</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.source).toBe('perplexity');
    });

    it('returns failure when not on Perplexity page', async () => {
      resetLocation();
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not on a Perplexity page');
    });

    it('handles empty conversation', async () => {
      setPerplexityLocation('test-slug');
      loadFixture('<div class="empty-page"></div>');
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No messages found');
    });

    it('generates fallback ID when URL parsing fails', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'www.perplexity.ai',
          pathname: '/pro',
          href: 'https://www.perplexity.ai/pro',
        },
        writable: true,
        configurable: true,
      });
      loadFixture(
        createPerplexityConversationDOM([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: '<p>Hi!</p>' },
        ])
      );
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^perplexity-\d+$/);
    });

    it('sets correct metadata', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: '<pre><code>console.log("test")</code></pre>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.metadata.messageCount).toBe(2);
      expect(result.data?.metadata.userMessageCount).toBe(1);
      expect(result.data?.metadata.assistantMessageCount).toBe(1);
      expect(result.data?.metadata.hasCodeBlocks).toBe(true);
    });
  });

  // ========== Security Tests ==========
  describe('Security', () => {
    it('sanitizes XSS script tags in assistant content', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<script>alert("xss")</script><p>Safe content</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).not.toContain('<script>');
      expect(assistantMsg?.content).toContain('Safe content');
    });

    it('sanitizes XSS onerror attributes in content', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<img src="x" onerror="alert(1)"><p>Safe</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).not.toContain('onerror');
    });
  });

  // ========== Error Handling ==========
  describe('Error Handling', () => {
    it('returns error with Error.message in catch block', async () => {
      setPerplexityLocation('test-slug');
      const originalQSA = document.querySelectorAll.bind(document);
      vi.spyOn(document, 'querySelectorAll').mockImplementation(selector => {
        if (typeof selector === 'string' && selector.includes('select-text')) {
          throw new Error('DOM access failed');
        }
        return originalQSA(selector);
      });

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOM access failed');
      vi.restoreAllMocks();
    });

    it('returns stringified error for non-Error throw in catch block', async () => {
      setPerplexityLocation('test-slug');
      const originalQSA = document.querySelectorAll.bind(document);
      vi.spyOn(document, 'querySelectorAll').mockImplementation(selector => {
        if (typeof selector === 'string' && selector.includes('select-text')) {
          throw 'string error';
        }
        return originalQSA(selector);
      });

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
      vi.restoreAllMocks();
    });
  });

  // ========== Unicode Content ==========
  describe('Edge Cases', () => {
    it('handles unicode content', async () => {
      setPerplexityLocation('test-slug');
      createPerplexityPage('test-slug', [
        { role: 'user', content: '日本語テスト 🎉 emoji test' },
        { role: 'assistant', content: '<p>こんにちは！</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages[0].content).toContain('日本語');
    });
  });

  // ========== Coverage Gap: extractUserContent/extractAssistantContent edge cases ==========
  describe('Content extraction edge cases', () => {
    it('skips user query when textContent is empty', () => {
      // Covers: perplexity.ts line 157 (return '')
      setPerplexityLocation('test-slug');
      loadFixture(`
        <div class="max-w-threadContentWidth">
          <div class="group/query">
            <div class="bg-offset rounded-2xl">
              <span class="select-text"></span>
            </div>
          </div>
          <div id="markdown-content-0" class="markdown-content">
            <div class="prose dark:prose-invert">
              <p>Assistant response</p>
            </div>
          </div>
        </div>
      `);
      const messages = extractor.extractMessages();
      // User message should be skipped (empty content), only assistant remains
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
    });

    it('falls back to innerHTML when .prose child is absent', () => {
      // Covers: perplexity.ts lines 174-175 (innerHTML fallback)
      setPerplexityLocation('test-slug');
      loadFixture(`
        <div class="max-w-threadContentWidth">
          <div class="group/query">
            <div class="bg-offset rounded-2xl">
              <span class="select-text">Test question</span>
            </div>
          </div>
          <div id="markdown-content-0" class="markdown-content">
            <p>Direct HTML without prose wrapper</p>
          </div>
        </div>
      `);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(2);
      const assistantMsg = messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).toContain('Direct HTML without prose wrapper');
    });

    it('skips assistant message when container has no .prose and empty innerHTML', () => {
      // Covers: perplexity.ts line 178 (return '')
      setPerplexityLocation('test-slug');
      loadFixture(`
        <div class="max-w-threadContentWidth">
          <div class="group/query">
            <div class="bg-offset rounded-2xl">
              <span class="select-text">Test question</span>
            </div>
          </div>
          <div id="markdown-content-0" class="markdown-content"></div>
        </div>
      `);
      const messages = extractor.extractMessages();
      // Only user message should exist, assistant skipped due to empty content
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
    });
  });

  // ========== Issue #96: Math equations rendering ==========
  // Issue #96 was originally reported against v0.12.0 when Perplexity emitted
  // raw LaTeX inside <pre><code>/<code> blocks. Perplexity has since switched to
  // standard KaTeX (<span class="katex"> with <annotation encoding="application/x-tex">),
  // which preprocessKatex() in src/lib/sanitize.ts converts to data-math attributes
  // before DOMPurify strips MathML. The Turndown rules in markdown-rules.ts then
  // emit $..$ for inline math and $$..$$ for display math, which Obsidian renders
  // natively. These tests pin the current end-to-end behavior so future regressions
  // surface immediately.
  describe('Math equations rendering (issue #96)', () => {
    it('converts inline KaTeX to $..$ delimiters', () => {
      const html = `
        <p>The quadratic formula is
          <span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><annotation encoding="application/x-tex">x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}</annotation></semantics></math></span></span>
          which solves
          <span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><annotation encoding="application/x-tex">ax^2 + bx + c = 0</annotation></semantics></math></span></span>.
        </p>
      `;

      const markdown = htmlToMarkdown(sanitizeHtml(html));

      expect(markdown).toContain('$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$');
      expect(markdown).toContain('$ax^2 + bx + c = 0$');
      // Must NOT regress to inline code or fenced blocks
      expect(markdown).not.toMatch(/`x = \\frac/);
      expect(markdown).not.toMatch(/```[\s\S]*x = \\frac/);
    });

    it('converts display KaTeX to $$..$$ blocks', () => {
      const html = `
        <p>Integrating gives</p>
        <span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><annotation encoding="application/x-tex">\\int_{0}^{1} x^2\\,dx = \\frac{1}{3}</annotation></semantics></math></span></span></span>
      `;

      const markdown = htmlToMarkdown(sanitizeHtml(html));

      expect(markdown).toContain('$$');
      expect(markdown).toContain('\\int_{0}^{1} x^2\\,dx = \\frac{1}{3}');
      // Must NOT regress to fenced code blocks
      expect(markdown).not.toMatch(/```[\s\S]*\\int_/);
    });
  });

  // ========== Deep Research Report Extraction ==========
  describe('Deep Research Report', () => {
    it('extracts report content from Deep Research page', async () => {
      createPerplexityDeepResearchPage('deep-research-test', {
        query: 'Analyze market trends',
        reportTitle: 'Market Trends Analysis Report',
        reportContent: '<h1>Market Trends</h1><p>The market is growing steadily.</p>',
        summaryContent: '<p>Here is a summary of the report.</p>',
      });

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Should have: user query + report + summary = 3 messages
      expect(result.data?.messages.length).toBe(3);
    });

    it('includes report as assistant message before summary', async () => {
      createPerplexityDeepResearchPage('deep-research-test', {
        query: 'Research question',
        reportTitle: 'Deep Research Report',
        reportContent: '<h1>Report Title</h1><p>Detailed analysis here.</p>',
        summaryContent: '<p>Summary text.</p>',
      });

      const result = await extractor.extract();
      expect(result.success).toBe(true);

      const messages = result.data!.messages;
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Research question');

      // Report should be the second message (assistant)
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toContain('Report Title');
      expect(messages[1].content).toContain('Detailed analysis');

      // Summary should be the third message (assistant)
      expect(messages[2].role).toBe('assistant');
      expect(messages[2].content).toContain('Summary text');
    });

    it('extracts report with rich content (tables, lists, headings)', async () => {
      createPerplexityDeepResearchPage('deep-research-rich', {
        query: 'Complex topic',
        reportTitle: 'Comprehensive Report',
        reportContent: `
          <h1>Main Title</h1>
          <h2>Section 1</h2>
          <p>Paragraph with <strong>bold</strong> text.</p>
          <ul><li>Item 1</li><li>Item 2</li></ul>
          <table><thead><tr><th>Col A</th><th>Col B</th></tr></thead>
          <tbody><tr><td>Val 1</td><td>Val 2</td></tr></tbody></table>
        `,
      });

      const result = await extractor.extract();
      expect(result.success).toBe(true);

      const reportMsg = result.data?.messages.find((m, i) => m.role === 'assistant' && i === 1);
      expect(reportMsg).toBeDefined();
      expect(reportMsg?.content).toContain('<h1>');
      expect(reportMsg?.content).toContain('<strong>');
      expect(reportMsg?.content).toContain('<table>');
    });

    it('handles Deep Research page without summary', async () => {
      createPerplexityDeepResearchPage('deep-research-no-summary', {
        query: 'Question without summary',
        reportTitle: 'Report Only',
        reportContent: '<p>Report content only.</p>',
        // No summaryContent
      });

      const result = await extractor.extract();
      expect(result.success).toBe(true);

      // Should have: user query + report = 2 messages
      expect(result.data?.messages.length).toBe(2);
      expect(result.data?.messages[0].role).toBe('user');
      expect(result.data?.messages[1].role).toBe('assistant');
      expect(result.data?.messages[1].content).toContain('Report content only');
    });

    it('sets htmlContent on report messages', async () => {
      createPerplexityDeepResearchPage('deep-research-html', {
        query: 'Test HTML content',
        reportTitle: 'HTML Test',
        reportContent: '<p>Report with <em>emphasis</em>.</p>',
        summaryContent: '<p>Summary here.</p>',
      });

      const result = await extractor.extract();
      expect(result.success).toBe(true);

      const reportMsg = result.data!.messages[1];
      expect(reportMsg.htmlContent).toBeDefined();
      expect(reportMsg.htmlContent).toContain('<em>');
    });

    it('preserves citation links in report content', async () => {
      const citationHtml = createPerplexityInlineCitation('https://example.com', 'source');
      createPerplexityDeepResearchPage('deep-research-citations', {
        query: 'Test citations',
        reportTitle: 'Report with Citations',
        reportContent: `<p>Key finding ${citationHtml} supports this.</p>`,
      });

      const result = await extractor.extract();
      expect(result.success).toBe(true);

      const reportMsg = result.data!.messages[1];
      expect(reportMsg.content).toContain('href="https://example.com"');
    });

    it('preserves DOM order in multi-turn with Deep Research', async () => {
      // Real-world scenario: normal Q&A turn 1, then Deep Research turn 2
      // The report should appear after the second query, not after the first
      createPerplexityMultiTurnWithDeepResearch('multi-turn-dr', {
        firstQuery: 'Can I get AppleCare in Japan?',
        firstResponse: '<p>Yes, AppleCare is global.</p>',
        secondQuery: 'Hidden limitations of AppleCare',
        reportTitle: 'AppleCare Limitations Report',
        reportContent: '<h1>Detailed Report</h1><p>Here are the limitations.</p>',
        summaryContent: '<p>Summary of the report.</p>',
      });

      const result = await extractor.extract();
      expect(result.success).toBe(true);

      const messages = result.data!.messages;
      // Expected order: query1 → response1 → query2 → report → summary
      expect(messages.length).toBe(5);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Can I get AppleCare in Japan?');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toContain('AppleCare is global');
      expect(messages[2].role).toBe('user');
      expect(messages[2].content).toBe('Hidden limitations of AppleCare');
      expect(messages[3].role).toBe('assistant');
      expect(messages[3].content).toContain('Detailed Report');
      expect(messages[4].role).toBe('assistant');
      expect(messages[4].content).toContain('Summary of the report');
    });
  });
});
