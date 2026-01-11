import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeminiExtractor } from '../../src/content/extractors/gemini';
import {
  loadFixture,
  clearFixture,
  setGeminiLocation,
  setNonGeminiLocation,
  createGeminiConversationDOM,
  setGeminiTitle,
  resetLocation,
  createDeepResearchDOM,
  createEmptyDeepResearchPanel,
} from '../fixtures/dom-helpers';

describe('GeminiExtractor', () => {
  let extractor: GeminiExtractor;

  beforeEach(() => {
    extractor = new GeminiExtractor();
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('platform', () => {
    it('identifies as gemini platform', () => {
      expect(extractor.platform).toBe('gemini');
    });
  });

  describe('canExtract', () => {
    it('returns true for gemini.google.com', () => {
      setGeminiLocation('abc123');
      expect(extractor.canExtract()).toBe(true);
    });

    it('returns false for other hosts', () => {
      setNonGeminiLocation('chat.openai.com');
      expect(extractor.canExtract()).toBe(false);
    });

    it('returns false for localhost', () => {
      resetLocation();
      expect(extractor.canExtract()).toBe(false);
    });
  });

  describe('getConversationId', () => {
    it('extracts ID from /app/[id] URL', () => {
      setGeminiLocation('abc123def456');
      expect(extractor.getConversationId()).toBe('abc123def456');
    });

    it('returns null for invalid URL', () => {
      setNonGeminiLocation('gemini.google.com', '/');
      expect(extractor.getConversationId()).toBeNull();
    });

    it('returns null when no ID in path', () => {
      setNonGeminiLocation('gemini.google.com', '/settings');
      expect(extractor.getConversationId()).toBeNull();
    });
  });

  describe('getTitle', () => {
    it('extracts title from first query text line', () => {
      setGeminiLocation('test123');
      loadFixture(`
        <p class="query-text-line">What is TypeScript?</p>
      `);
      expect(extractor.getTitle()).toBe('What is TypeScript?');
    });

    it('truncates long titles to 100 characters', () => {
      setGeminiLocation('test123');
      const longTitle = 'a'.repeat(150);
      loadFixture(`
        <p class="query-text-line">${longTitle}</p>
      `);
      expect(extractor.getTitle().length).toBe(100);
    });

    it('falls back to sidebar title', () => {
      setGeminiLocation('test123');
      loadFixture(`
        <div class="conversation-title">Sidebar Title</div>
      `);
      expect(extractor.getTitle()).toBe('Sidebar Title');
    });

    it('returns default title when nothing found', () => {
      setGeminiLocation('test123');
      loadFixture('<div>Empty page</div>');
      expect(extractor.getTitle()).toBe('Untitled Gemini Conversation');
    });

    it('sanitizes whitespace in title', () => {
      setGeminiLocation('test123');
      loadFixture(`
        <p class="query-text-line">  Multiple   spaces   </p>
      `);
      expect(extractor.getTitle()).toBe('Multiple spaces');
    });
  });

  describe('extractMessages', () => {
    it('extracts user and assistant messages from conversation turns', () => {
      setGeminiLocation('test123');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
      loadFixture(html);

      const messages = extractor.extractMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toContain('Hello');
      expect(messages[1].role).toBe('assistant');
    });

    it('handles multiple conversation turns', () => {
      setGeminiLocation('test123');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Second answer' },
      ]);
      loadFixture(html);

      const messages = extractor.extractMessages();
      expect(messages.length).toBe(4);
    });

    it('assigns sequential indices to messages', () => {
      setGeminiLocation('test123');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: 'Answer 1' },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: 'Answer 2' },
      ]);
      loadFixture(html);

      const messages = extractor.extractMessages();
      expect(messages[0].index).toBe(0);
      expect(messages[1].index).toBe(1);
      expect(messages[2].index).toBe(2);
      expect(messages[3].index).toBe(3);
    });

    it('returns empty array when no conversation found', () => {
      setGeminiLocation('test123');
      loadFixture('<div>No conversation</div>');

      const messages = extractor.extractMessages();
      expect(messages).toEqual([]);
    });
  });

  describe('extract', () => {
    it('returns successful result with full conversation data', async () => {
      setGeminiLocation('abc123def456');
      setGeminiTitle('Test Conversation');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '<p>Hi there!</p>' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('abc123def456');
      expect(result.data?.source).toBe('gemini');
      expect(result.data?.messages.length).toBe(2);
    });

    it('generates fallback ID when no conversation ID in URL', async () => {
      setNonGeminiLocation('gemini.google.com', '/');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      loadFixture(html);

      const result = await extractor.extract();

      // Extractor generates fallback ID: gemini-{timestamp}
      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^gemini-\d+$/);
    });

    it('returns error when no messages found', async () => {
      setGeminiLocation('abc123def456');
      loadFixture('<div>No messages</div>');

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No messages found');
    });

    it('includes metadata in result', async () => {
      setGeminiLocation('abc123def456');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer with `code`' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      const result = await extractor.extract();

      expect(result.data?.metadata).toBeDefined();
      expect(result.data?.metadata.messageCount).toBe(2);
      expect(result.data?.metadata.userMessageCount).toBe(1);
      expect(result.data?.metadata.assistantMessageCount).toBe(1);
    });

    it('includes URL in result', async () => {
      setGeminiLocation('abc123def456');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      const result = await extractor.extract();

      expect(result.data?.url).toContain('gemini.google.com');
      expect(result.data?.url).toContain('abc123def456');
    });

    it('includes warning when no user messages found', async () => {
      setGeminiLocation('abc123def456');
      // Create DOM with only assistant messages
      loadFixture(`
        <div class="app-container">
          <div class="conversation-container">
            <model-response class="selected">
              <div class="markdown markdown-main-panel">
                <p>This is an assistant message</p>
              </div>
            </model-response>
          </div>
        </div>
      `);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('No user messages found');
    });

    it('includes warning when no assistant messages found', async () => {
      setGeminiLocation('abc123def456');
      // Create DOM with only user messages
      loadFixture(`
        <div class="app-container">
          <div class="conversation-container">
            <user-query class="selected">
              <div class="query-text">
                <span class="query-text-line">User question only</span>
              </div>
            </user-query>
          </div>
        </div>
      `);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('No assistant messages found');
    });

    it('handles extraction errors gracefully', async () => {
      setGeminiLocation('abc123def456');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      // Mock extractMessages to throw an error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(extractor, 'extractMessages').mockImplementation(() => {
        throw new Error('DOM parsing failed');
      });

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOM parsing failed');
      expect(consoleSpy).toHaveBeenCalledWith('[G2O] Extraction error:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('handles unknown extraction errors', async () => {
      setGeminiLocation('abc123def456');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      // Mock extractMessages to throw a non-Error object
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(extractor, 'extractMessages').mockImplementation(() => {
        throw 'string error';
      });

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown extraction error');

      consoleSpy.mockRestore();
    });
  });

  describe('Deep Research extraction', () => {
    describe('isDeepResearchVisible', () => {
      it('returns true when panel is present', () => {
        setGeminiLocation('test123');
        loadFixture(createDeepResearchDOM('Test Report', '<p>Content</p>'));
        expect(extractor.isDeepResearchVisible()).toBe(true);
      });

      it('returns false when panel is not present', () => {
        setGeminiLocation('test123');
        loadFixture('<div>No panel</div>');
        expect(extractor.isDeepResearchVisible()).toBe(false);
      });
    });

    describe('getDeepResearchTitle', () => {
      it('extracts title from panel', () => {
        setGeminiLocation('test123');
        loadFixture(createDeepResearchDOM('Hawaii Travel Report', '<p>Content</p>'));
        expect(extractor.getDeepResearchTitle()).toBe('Hawaii Travel Report');
      });

      it('returns default title when not found', () => {
        setGeminiLocation('test123');
        loadFixture('<deep-research-immersive-panel></deep-research-immersive-panel>');
        expect(extractor.getDeepResearchTitle()).toBe('Untitled Deep Research Report');
      });
    });

    describe('extractDeepResearchContent', () => {
      it('extracts content from panel', () => {
        setGeminiLocation('test123');
        loadFixture(createDeepResearchDOM('Test', '<h1>Report</h1><p>Content</p>'));
        const content = extractor.extractDeepResearchContent();
        expect(content).toContain('<h1>Report</h1>');
        expect(content).toContain('<p>Content</p>');
      });

      it('returns empty string when content not found', () => {
        setGeminiLocation('test123');
        loadFixture(createEmptyDeepResearchPanel());
        expect(extractor.extractDeepResearchContent()).toBe('');
      });
    });

    describe('extractDeepResearch', () => {
      it('returns successful result with report data', () => {
        setGeminiLocation('test123');
        loadFixture(createDeepResearchDOM('Test Report', '<h1>Title</h1><p>Content</p>'));

        const result = extractor.extractDeepResearch();

        expect(result.success).toBe(true);
        expect(result.data?.type).toBe('deep-research');
        expect(result.data?.source).toBe('gemini');
        expect(result.data?.title).toBe('Test Report');
        expect(result.data?.messages.length).toBe(1);
        expect(result.data?.messages[0].role).toBe('assistant');
      });

      it('returns error when content is empty', () => {
        setGeminiLocation('test123');
        loadFixture(createEmptyDeepResearchPanel());

        const result = extractor.extractDeepResearch();

        expect(result.success).toBe(false);
        expect(result.error).toContain('content not found');
      });

      it('generates consistent ID from title for overwrite', () => {
        setGeminiLocation('test123');
        loadFixture(createDeepResearchDOM('Same Title', '<p>Content 1</p>'));
        const result1 = extractor.extractDeepResearch();

        clearFixture();
        loadFixture(createDeepResearchDOM('Same Title', '<p>Content 2</p>'));
        const result2 = extractor.extractDeepResearch();

        expect(result1.data?.id).toBe(result2.data?.id);
      });
    });

    describe('extract routing', () => {
      it('extracts Deep Research when panel is visible', async () => {
        setGeminiLocation('test123');
        loadFixture(createDeepResearchDOM('Report', '<p>Content</p>'));

        const result = await extractor.extract();

        expect(result.success).toBe(true);
        expect(result.data?.type).toBe('deep-research');
      });

      it('extracts normal conversation when panel is not visible', async () => {
        setGeminiLocation('test123');
        const html = createGeminiConversationDOM([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ]);
        loadFixture(html);

        const result = await extractor.extract();

        expect(result.success).toBe(true);
        expect(result.data?.type).toBeUndefined();
      });

      it('prioritizes Deep Research when both exist', async () => {
        setGeminiLocation('test123');
        const conversationHtml = createGeminiConversationDOM([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ]);
        const deepResearchHtml = createDeepResearchDOM('Report', '<p>Content</p>');
        loadFixture(conversationHtml + deepResearchHtml);

        const result = await extractor.extract();

        expect(result.success).toBe(true);
        expect(result.data?.type).toBe('deep-research');
      });
    });
  });
});
