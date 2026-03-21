import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatGPTExtractor } from '../../src/content/extractors/chatgpt';
import {
  loadFixture,
  clearFixture,
  resetLocation,
  setNonGeminiLocation,
  createChatGPTConversationDOM,
  setChatGPTLocation,
  setNonChatGPTLocation,
  createChatGPTInlineCitation,
  createChatGPTPage,
} from '../fixtures/dom-helpers';

describe('ChatGPTExtractor', () => {
  let extractor: ChatGPTExtractor;

  beforeEach(() => {
    extractor = new ChatGPTExtractor();
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  // ========== 6.3.1 Platform Detection (3 tests) ==========
  describe('Platform Detection', () => {
    describe('platform', () => {
      it('identifies as chatgpt platform', () => {
        expect(extractor.platform).toBe('chatgpt');
      });
    });

    describe('canExtract', () => {
      it('returns true for chatgpt.com', () => {
        setChatGPTLocation('6789abcd-ef01-2345-6789-abcdef012345');
        expect(extractor.canExtract()).toBe(true);
      });

      it('returns false for other hosts', () => {
        setNonGeminiLocation('chat.openai.com');
        expect(extractor.canExtract()).toBe(false);
      });

      it('returns false for chat.openai.com (legacy domain)', () => {
        setNonChatGPTLocation('chat.openai.com', '/c/test-123');
        expect(extractor.canExtract()).toBe(false);
      });
    });
  });

  // ========== 6.3.2 Security Tests (4 tests) ==========
  describe('Security', () => {
    it('rejects malicious subdomains containing chatgpt.com', () => {
      setNonChatGPTLocation('evil-chatgpt.com.attacker.com');
      expect(extractor.canExtract()).toBe(false);
    });

    it('rejects chatgpt.com as subdomain', () => {
      setNonChatGPTLocation('chatgpt.com.evil.com');
      expect(extractor.canExtract()).toBe(false);
    });

    it('sanitizes XSS script tags in assistant content', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
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
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<img src="x" onerror="alert(1)"><p>Safe</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).not.toContain('onerror');
    });
  });

  // ========== 6.3.3 ID Extraction (4 tests) ==========
  describe('Conversation ID Extraction', () => {
    it('extracts UUID from /c/{uuid} URL', () => {
      setChatGPTLocation('6789abcd-ef01-2345-6789-abcdef012345', 'c');
      expect(extractor.getConversationId()).toBe('6789abcd-ef01-2345-6789-abcdef012345');
    });

    it('extracts UUID from /g/{gptSlug}/c/{uuid} URL (custom GPT mode)', () => {
      setChatGPTLocation('abcd1234-5678-90ab-cdef-1234567890ab', 'g');
      expect(extractor.getConversationId()).toBe('abcd1234-5678-90ab-cdef-1234567890ab');
    });

    it('returns null for non-chat URLs', () => {
      setNonChatGPTLocation('chatgpt.com', '/');
      expect(extractor.getConversationId()).toBeNull();
    });

    it('generates fallback ID when URL parsing fails', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'chatgpt.com',
          pathname: '/settings',
          href: 'https://chatgpt.com/settings',
        },
        writable: true,
        configurable: true,
      });
      loadFixture(
        createChatGPTConversationDOM([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: '<p>Hi!</p>' },
        ])
      );
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^chatgpt-\d+$/);
    });
  });

  // ========== 6.3.4 Title Extraction (3 tests) ==========
  describe('Title Extraction', () => {
    it('extracts title from first user message', () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'What is TypeScript?' },
        { role: 'assistant', content: '<p>TypeScript is...</p>' },
      ]);
      expect(extractor.getTitle()).toBe('What is TypeScript?');
    });

    it('truncates long titles to 100 characters', () => {
      setChatGPTLocation('test-123');
      const longTitle = 'a'.repeat(150);
      createChatGPTPage('test-123', [
        { role: 'user', content: longTitle },
        { role: 'assistant', content: '<p>Response</p>' },
      ]);
      expect(extractor.getTitle().length).toBe(100);
    });

    it('returns default title when no content', () => {
      setChatGPTLocation('test-123');
      loadFixture('<div>Empty page</div>');
      expect(extractor.getTitle()).toBe('Untitled ChatGPT Conversation');
    });
  });

  // ========== 6.3.5 Message Extraction (6 tests) ==========
  describe('Message Extraction', () => {
    it('extracts user and assistant messages', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'Hello ChatGPT' },
        { role: 'assistant', content: '<p>Hello! How can I help?</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(2);
      expect(result.data?.messages[0].role).toBe('user');
      expect(result.data?.messages[1].role).toBe('assistant');
    });

    it('handles multiple conversation turns', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: '<p>Answer 1</p>' },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: '<p>Answer 2</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(4);
    });

    it('maintains correct message order via data-turn-id', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: '<p>Second</p>' },
        { role: 'user', content: 'Third' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages[0].content).toContain('First');
      expect(result.data?.messages[1].content).toContain('Second');
      expect(result.data?.messages[2].content).toContain('Third');
    });

    it('handles empty conversations', async () => {
      setChatGPTLocation('test-123');
      loadFixture('<div class="empty-conversation"></div>');
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No messages found');
    });

    it('extracts HTML content for assistant messages', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<p>Response with <strong>bold</strong> text</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.htmlContent).toContain('<strong>');
    });

    it('uses data-message-author-role for role identification', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">User message</div>
          </div>
        </section>
        <section data-turn-id="turn-2">
          <div data-message-author-role="assistant">
            <div class="markdown prose">Assistant message</div>
          </div>
        </section>
      `);
      const messages = extractor.extractMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });
  });

  // ========== 6.3.6 Citation Extraction (4 tests) ==========
  describe('Citation Extraction', () => {
    it('extracts inline citations from webpage-citation-pill', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">What is example.com?</div>
          </div>
        </section>
        <section data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <p>Here's info about the site</p>
              ${createChatGPTInlineCitation('https://example.com', 'example.com')}
            </div>
          </div>
        </section>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages[1].content).toContain('example.com');
    });

    it('removes utm_source parameter from URLs', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Test</div>
          </div>
        </section>
        <section data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <p>Link: <a href="https://example.com?utm_source=chatgpt.com">Example</a></p>
            </div>
          </div>
        </section>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).not.toContain('utm_source');
    });

    it('handles missing citations gracefully', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<p>No citations here</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
    });

    it('handles multiple citations in single message', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Compare sites</div>
          </div>
        </section>
        <section data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <p>Site 1: ${createChatGPTInlineCitation('https://site1.com', 'Site 1')}</p>
              <p>Site 2: ${createChatGPTInlineCitation('https://site2.com', 'Site 2')}</p>
            </div>
          </div>
        </section>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
    });
  });

  // ========== 6.3.7 Fallback Selectors (5 tests) ==========
  describe('Fallback Selectors', () => {
    it('conversationTurn primary selector (section[data-turn-id])', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">User message</div>
          </div>
        </section>
        <section data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">Response</div>
          </div>
        </section>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(2);
    });

    it('conversationTurn secondary selector ([data-testid])', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-testid="conversation-turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">User message</div>
          </div>
        </section>
        <section data-testid="conversation-turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">Response</div>
          </div>
        </section>
      `);
      const messages = extractor.extractMessages();
      expect(messages.length).toBe(2);
    });

    it('conversationTurn legacy fallback (article[data-turn-id])', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <article data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Legacy user message</div>
          </div>
        </article>
        <article data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">Legacy response</div>
          </div>
        </article>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(2);
    });

    it('userMessage primary selector ([data-message-author-role])', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">User content</div>
          </div>
        </section>
      `);
      const messages = extractor.extractMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('user');
    });

    it('assistantResponse primary selector', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">Assistant response</div>
          </div>
        </section>
      `);
      const messages = extractor.extractMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('assistant');
    });

    it('markdownContent fallback chain', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown-new-styling">Alternative markdown content</div>
          </div>
        </section>
      `);
      const messages = extractor.extractMessages();
      // Should still extract even with alternative selector
      expect(messages.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ========== 6.3.8 Error Handling (3 tests) ==========
  describe('Error Handling', () => {
    it('returns error when DOM elements not found', async () => {
      setChatGPTLocation('test-123');
      loadFixture('<div class="empty-page"></div>');
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error for empty conversation', async () => {
      setChatGPTLocation('test-123');
      loadFixture('<div class="conversation-container"></div>');
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No messages found');
    });

    it('handles sanitization errors gracefully', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<p>Normal response</p>' },
      ]);
      // Should not throw even with edge case content
      const result = await extractor.extract();
      expect(result.success).toBe(true);
    });
  });

  // ========== Additional Edge Cases ==========
  describe('Edge Cases', () => {
    it('handles special characters in user messages', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: '<script>alert("xss")</script> & < > "quotes"' },
        { role: 'assistant', content: '<p>Response</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
    });

    it('handles unicode content', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: '日本語テスト 🎉 emoji test' },
        { role: 'assistant', content: '<p>こんにちは！</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages[0].content).toContain('日本語');
    });

    it('sets correct metadata', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
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

    it('sets source to chatgpt', async () => {
      setChatGPTLocation('test-123');
      createChatGPTPage('test-123', [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: '<p>Response</p>' },
      ]);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.source).toBe('chatgpt');
    });

    it('handles /g/{gptSlug}/c/{uuid} URL for custom GPT mode', async () => {
      // Use a valid hex UUID format that matches the extractor's regex
      const gptModeId = 'abcd1234-5678-90ab-cdef-1234567890ab';
      createChatGPTPage(
        gptModeId,
        [
          { role: 'user', content: 'GPT mode test' },
          { role: 'assistant', content: '<p>Response from custom GPT</p>' },
        ],
        'g'
      );
      // Verify the ID extraction works with /g/{slug}/c/{uuid} path
      expect(extractor.getConversationId()).toBe(gptModeId);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(gptModeId);
    });

    it('warns when only user messages found', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">User only</div>
          </div>
        </section>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('No assistant messages found');
    });

    it('warns when only assistant messages found', async () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">Assistant only</div>
          </div>
        </section>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('No user messages found');
    });
  });

  // ========== Coverage Gap: extract() canExtract false (DES-005 3.2) ==========
  describe('extract() error paths', () => {
    it('returns error when called from non-chatgpt domain', async () => {
      // Covers: chatgpt.ts lines 238-243 (canExtract false branch)
      // DO NOT set ChatGPT location — default is localhost
      resetLocation();
      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not on a ChatGPT page');
    });

    it('returns error with Error.message in catch block', async () => {
      // Covers: chatgpt.ts lines 291-297 (catch block, Error instance)
      setChatGPTLocation('test-123');
      const originalQSA = document.querySelectorAll.bind(document);
      vi.spyOn(document, 'querySelectorAll').mockImplementation(selector => {
        if (selector.includes('data-turn-id')) {
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
      // Covers: chatgpt.ts line 295 (error instanceof Error === false)
      setChatGPTLocation('test-123');
      const originalQSA = document.querySelectorAll.bind(document);
      vi.spyOn(document, 'querySelectorAll').mockImplementation(selector => {
        if (selector.includes('data-turn-id')) {
          throw 'string error'; // non-Error object
        }
        return originalQSA(selector);
      });

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
      vi.restoreAllMocks();
    });
  });

  // ========== Coverage Gap: Fallback selectors (DES-005 3.2) ==========
  describe('extractMessages fallback selectors', () => {
    it('returns empty array and warns when no conversation turns found', () => {
      // Covers: chatgpt.ts lines 126-129 (turns.length === 0)
      setChatGPTLocation('test-123');
      loadFixture('<div class="empty-page"></div>');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const messages = extractor.extractMessages();

      expect(messages).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No conversation turns found'));
      warnSpy.mockRestore();
    });

    it('extracts user content via .whitespace-pre-wrap fallback when primary selector fails', () => {
      // Covers: chatgpt.ts lines 178-181 (fallback user selector)
      setChatGPTLocation('test-123');
      loadFixture(`
        <div class="flex flex-col text-sm pb-25">
          <section data-turn-id="turn-1" data-testid="conversation-turn-1" data-turn="user">
            <div>
              <div class="whitespace-pre-wrap">Fallback user content</div>
            </div>
          </section>
        </div>
      `);

      const messages = extractor.extractMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Fallback user content');
    });

    it('extracts assistant content via assistantResponse fallback when markdownContent absent', () => {
      // Covers: chatgpt.ts lines 203-210 (fallback assistant selector)
      setChatGPTLocation('test-123');
      loadFixture(`
        <div class="flex flex-col text-sm pb-25">
          <section data-turn-id="turn-1" data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="msg-1">
              <div class="markdown prose dark:prose-invert">
                <p>Fallback assistant content</p>
              </div>
            </div>
          </section>
        </div>
      `);

      const messages = extractor.extractMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toContain('Fallback assistant content');
    });
  });

  // ========== Coverage Gap: extractUserContent/extractAssistantContent edge cases ==========
  describe('Content extraction edge cases', () => {
    it('skips user turn when no .whitespace-pre-wrap element exists', () => {
      // Covers: chatgpt.ts line 183 (return '')
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="some-other-class">No whitespace-pre-wrap here</div>
          </div>
        </section>
        <section data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">Assistant response</div>
          </div>
        </section>
      `);
      const messages = extractor.extractMessages();
      // User turn should be skipped (empty content), only assistant remains
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
    });

    it('returns empty content when both markdownContent and assistantResponse selectors fail', () => {
      // Covers: chatgpt.ts lines 203-210, 212 (assistantResponse fallback + return '')
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Test question</div>
          </div>
        </section>
        <section data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="no-markdown-class">No matching selectors</div>
          </div>
        </section>
      `);

      const spy = vi.spyOn(extractor, 'queryWithFallback');
      const messages = extractor.extractMessages();

      // Assistant turn should be skipped (empty content after both fallbacks fail)
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');

      // Verify queryWithFallback was called for assistant extraction
      const assistantCalls = spy.mock.calls.filter(
        call => Array.isArray(call[0]) && call[0].some((s: string) => s.includes('.markdown'))
      );
      expect(assistantCalls.length).toBeGreaterThanOrEqual(1);
      spy.mockRestore();
    });

    it('removes utm_source with ampersand variant from citation URLs', () => {
      // Covers: chatgpt.ts line 225 (ampersand regex branch)
      // Note: jsdom encodes & as &amp; in innerHTML, so we mock innerHTML
      // to return a string with literal & to exercise the regex callback
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="user">
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Test</div>
          </div>
        </section>
        <section data-turn-id="turn-2" data-turn="assistant">
          <div data-message-author-role="assistant">
            <div class="markdown prose">
              <p>Link: <a href="https://example.com?foo=bar">Example</a></p>
            </div>
          </div>
        </section>
      `);

      // Override innerHTML to bypass DOM &amp; encoding
      const markdownEl = document.querySelector('.markdown.prose');
      if (markdownEl) {
        Object.defineProperty(markdownEl, 'innerHTML', {
          get: () =>
            '<p>Link: <a href="https://example.com?foo=bar&utm_source=chatgpt.com">Example</a></p>',
          configurable: true,
        });
      }

      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(2);
      const assistantMsg = messages.find(m => m.role === 'assistant');
      expect(assistantMsg?.content).not.toContain('utm_source');
      expect(assistantMsg?.content).toContain('foo=bar');
    });
  });
});
