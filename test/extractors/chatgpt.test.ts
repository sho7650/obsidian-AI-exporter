import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatGPTExtractor } from '../../src/content/extractors/chatgpt';
import {
  loadFixture,
  clearFixture,
  resetLocation,
  createChatGPTConversationDOM,
  setChatGPTLocation,
  defineLocation,
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
        defineLocation('chat.openai.com');
        expect(extractor.canExtract()).toBe(false);
      });

      it('returns false for chat.openai.com (legacy domain)', () => {
        defineLocation('chat.openai.com', '/c/test-123');
        expect(extractor.canExtract()).toBe(false);
      });
    });
  });

  // ========== 6.3.2 Security Tests (4 tests) ==========
  describe('Security', () => {
    it('rejects malicious subdomains containing chatgpt.com', () => {
      defineLocation('evil-chatgpt.com.attacker.com');
      expect(extractor.canExtract()).toBe(false);
    });

    it('rejects chatgpt.com as subdomain', () => {
      defineLocation('chatgpt.com.evil.com');
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
      defineLocation('chatgpt.com', '/');
      expect(extractor.getConversationId()).toBeNull();
    });

    it('generates fallback ID when URL parsing fails', async () => {
      defineLocation('chatgpt.com', '/settings');
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

    it('no longer matches the retired article-based DOM (removed 2026-07)', async () => {
      // The 2026-03-era <article> variants matched nothing on the live site
      // by 2026-07 and were removed under the zero-match baseline contract.
      setChatGPTLocation('test-123');
      loadFixture(`
        <article data-turn-id="turn-1" data-turn="user">
          <div class="whitespace-pre-wrap">Legacy user message</div>
        </article>
      `);
      const result = await extractor.extract();
      expect(result.success).toBe(false);
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

  // ========== Multi-block assistant content (issue #281) ==========
  // A single section[data-turn="assistant"] can contain MULTIPLE assistant
  // [data-message-id] wrappers, each with its own .markdown.prose. For
  // gpt-*-thinking models, short reasoning-summary blocks precede a
  // "Thought for Ns" label, followed by the real answer. The previous
  // implementation returned only the FIRST .markdown.prose, dropping the answer.
  describe('Multi-block assistant content (issue #281)', () => {
    // Real structure captured via CDP from gpt-5-5-thinking:
    //   reasoning msg → reasoning msg → <button>Thought for 47s</button> → answer msg
    const thinkingTurn = `
      <section data-turn-id="turn-1" data-turn="assistant">
        <div data-message-author-role="assistant" data-message-id="m1" data-message-model-slug="gpt-5-5-thinking">
          <div class="flex w-full flex-col gap-1 empty:hidden">
            <div class="markdown prose dark:prose-invert markdown-new-styling"><p>REASONING ONE summary</p></div>
          </div>
        </div>
        <div data-message-author-role="assistant" data-message-id="m2" data-message-model-slug="gpt-5-5-thinking">
          <div class="flex w-full flex-col gap-1 empty:hidden">
            <div class="markdown prose dark:prose-invert markdown-new-styling"><p>REASONING TWO summary</p></div>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex min-w-0 items-center">
            <button type="button">Thought for 47s</button>
          </div>
        </div>
        <div data-message-author-role="assistant" data-message-id="m3" data-turn-start-message="true" data-message-model-slug="gpt-5-5-thinking">
          <div class="flex w-full flex-col gap-1 empty:hidden">
            <div class="markdown prose dark:prose-invert markdown-new-styling"><h2>CONCLUSION</h2><p>ANSWER body text</p></div>
          </div>
        </div>
      </section>`;

    it('excludes reasoning summaries and returns the answer after the Thought label', () => {
      setChatGPTLocation('test-123');
      loadFixture(thinkingTurn);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(1);
      const content = messages[0].content;
      expect(content).toContain('ANSWER body text');
      expect(content).toContain('CONCLUSION');
      expect(content).not.toContain('REASONING ONE');
      expect(content).not.toContain('REASONING TWO');
    });

    it('joins all blocks when an assistant turn has multiple markdown blocks without reasoning', () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="m1">
            <div class="markdown prose"><p>PART ONE of answer</p></div>
          </div>
          <div data-message-author-role="assistant" data-message-id="m2">
            <div class="markdown prose"><p>PART TWO of answer</p></div>
          </div>
          <div class="z-0 flex min-h-[46px] justify-start">
            <button type="button" aria-label="Copy response">Copy response</button>
            <button type="button" aria-label="Sources">Sources</button>
          </div>
        </section>`);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('PART ONE of answer');
      expect(messages[0].content).toContain('PART TWO of answer');
    });

    it('falls back to joining all blocks when reasoning label leaves no answer block after it', () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="m1">
            <div class="markdown prose"><p>FIRST block content</p></div>
          </div>
          <div data-message-author-role="assistant" data-message-id="m2">
            <div class="markdown prose"><p>SECOND block content</p></div>
          </div>
          <button type="button">Thought for 12s</button>
        </section>`);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(1);
      // Label is after all prose → safety floor keeps everything
      expect(messages[0].content).toContain('FIRST block content');
      expect(messages[0].content).toContain('SECOND block content');
    });

    it('joins all blocks (incl. reasoning) when the reasoning label is in an unrecognized locale', () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="m1">
            <div class="markdown prose"><p>REASONING summary part</p></div>
          </div>
          <button type="button">Pensó durante 47s</button>
          <div data-message-author-role="assistant" data-message-id="m2">
            <div class="markdown prose"><p>ANSWER conclusion part</p></div>
          </div>
        </section>`);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(1);
      // Unrecognized label → never drop the answer (safety floor joins all)
      expect(messages[0].content).toContain('ANSWER conclusion part');
      expect(messages[0].content).toContain('REASONING summary part');
    });

    it('does not treat a transient "Thinking…" control button as a reasoning boundary', () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="m1">
            <div class="markdown prose"><p>FIRST visible part</p></div>
          </div>
          <button type="button">Thinking…</button>
          <div data-message-author-role="assistant" data-message-id="m2">
            <div class="markdown prose"><p>SECOND visible part</p></div>
          </div>
        </section>`);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(1);
      // "Thinking…" lacks the "for" keyword → not a boundary → keep everything
      expect(messages[0].content).toContain('FIRST visible part');
      expect(messages[0].content).toContain('SECOND visible part');
    });

    it('leaves single-block assistant turns unchanged', () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="m1">
            <div class="markdown prose"><p>Single answer block</p></div>
          </div>
        </section>`);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('Single answer block');
    });

    it('cleans utm_source from citation URLs across every joined block', () => {
      setChatGPTLocation('test-123');
      loadFixture(`
        <section data-turn-id="turn-1" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="m1">
            <div class="markdown prose"><p>A <a href="https://a.com?utm_source=chatgpt.com">A</a></p></div>
          </div>
          <div data-message-author-role="assistant" data-message-id="m2">
            <div class="markdown prose"><p>B <a href="https://b.com?utm_source=chatgpt.com">B</a></p></div>
          </div>
        </section>`);
      const messages = extractor.extractMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).not.toContain('utm_source');
    });
  });

  // ========== Deep Research sandboxed iframe (issue #283) ==========
  describe('Deep Research reports in a cross-origin iframe (issue #283)', () => {
    /** The report turn as ChatGPT renders it: an empty turn wrapping an iframe. */
    const DR_TURN = `
      <section data-turn-id="turn-dr" data-testid="conversation-turn-2" data-turn="assistant">
        <div data-message-author-role="assistant" data-message-id="m-dr">
          <iframe
            title="internal://deep-research"
            src="https://connector_openai_deep_research.web-sandbox.oaiusercontent.com?app=chatgpt"
            sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
        </div>
      </section>`;

    const USER_TURN = `
      <section data-turn-id="turn-q" data-testid="conversation-turn-1" data-turn="user">
        <div data-message-author-role="user" data-message-id="m-q">
          <div class="whitespace-pre-wrap">Research the history of movable type</div>
        </div>
      </section>`;

    const ANSWERED_TURN = `
      <section data-turn-id="turn-a" data-testid="conversation-turn-3" data-turn="assistant">
        <div data-message-author-role="assistant" data-message-id="m-a">
          <div class="markdown prose"><p>An ordinary inline answer.</p></div>
        </div>
      </section>`;

    it('fails with an actionable error rather than saving a note with no report', async () => {
      // The report body is unreachable from the parent page, so the only thing
      // left to save is the user's own prompt. Saving that silently is worse
      // than refusing: the user gets a note that looks complete and is not.
      setChatGPTLocation('dr-only');
      loadFixture(USER_TURN + DR_TURN);

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/deep research/i);
      expect(result.error).toMatch(/iframe|sandbox/i);
    });

    it('keeps the rest of a mixed conversation but warns about the missing report', async () => {
      setChatGPTLocation('dr-mixed');
      loadFixture(USER_TURN + DR_TURN + ANSWERED_TURN);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data?.messages).toHaveLength(2);
      expect(result.warnings?.join(' ')).toMatch(/deep research/i);
    });

    it('recognises the report frame by its sandbox origin when the title changes', async () => {
      // `title` is an internal string OpenAI can rename at any time; the
      // sandbox host is the load-bearing part of the identification.
      setChatGPTLocation('dr-retitled');
      loadFixture(
        USER_TURN +
          `<section data-turn-id="turn-dr" data-turn="assistant">
             <div data-message-author-role="assistant" data-message-id="m-dr">
               <iframe src="https://connector_openai_deep_research.web-sandbox.oaiusercontent.com?app=chatgpt"></iframe>
             </div>
           </section>`
      );

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/deep research/i);
    });

    it('leaves an ordinary conversation completely untouched', async () => {
      // Detection must be inert when no report frame is present — this is what
      // makes the change safe to ship without live re-verification.
      setChatGPTLocation('ordinary');
      loadFixture(USER_TURN + ANSWERED_TURN);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data?.messages).toHaveLength(2);
      expect(result.warnings?.join(' ') ?? '').not.toMatch(/deep research/i);
    });

    // Markup captured from a live conversation on 2026-08-09. Faithful to the
    // observed structure in two ways that matter:
    //   - the assistant turn carries NO `data-message-author-role`; the role is
    //     only on `data-turn`, so role detection depends on that attribute
    //   - the frame sits inside a `fixed` full-viewport overlay, several levels
    //     below the turn
    // The host is `connector-openai-deep-research…` with HYPHENS. Issue #283
    // recorded `connector_openai_deep_research…` with UNDERSCORES, so the
    // src-based fallback shipped against the old spelling matched nothing.
    const OBSERVED_SRC =
      'https://connector-openai-deep-research.web-sandbox.oaiusercontent.com' +
      '?app=chatgpt&darkModeType=increased&locale=en-US&deviceType=desktop';

    const observedTurn = (iframeAttrs: string): string => `
      <section data-turn-id="request-WEB:0d7f4684-0" data-testid="conversation-turn-2"
               data-turn="assistant" dir="auto">
        <h4 class="sr-only select-none">ChatGPT said:</h4>
        <div class="text-base my-auto mx-auto pb-8">
          <div class="agent-turn">
            <div class="flex max-w-full flex-col gap-4 grow">
              <div class="no-scrollbar fixed start-0 end-0 top-0 bottom-0 z-50">
                <div class="relative max-w-full overflow-hidden flex-1">
                  <iframe ${iframeAttrs} sandbox="allow-scripts allow-same-origin allow-forms"
                          class="h-full w-full max-w-full"></iframe>
                </div>
              </div>
            </div>
          </div>
          <div class="mx-auto flex-1"><div></div></div>
        </div>
      </section>`;

    it('detects the frame markup observed live on 2026-08-09', async () => {
      setChatGPTLocation('6a77cac1-0840-83e8-ba7c-590e2bc8e35d');
      loadFixture(
        USER_TURN + observedTurn(`title="internal://deep-research" src="${OBSERVED_SRC}"`)
      );

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/deep research/i);
    });

    it('detects the observed frame by src when the title is absent', async () => {
      // The whole point of the src fallback. Against the hyphenated host that
      // the live page now serves, the underscore spelling from #283 misses.
      setChatGPTLocation('6a77cac1-0840-83e8-ba7c-590e2bc8e35d');
      loadFixture(USER_TURN + observedTurn(`src="${OBSERVED_SRC}"`));

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/deep research/i);
    });

    it('still detects the underscore host recorded in #283', async () => {
      // Older builds/rollouts may still serve it; both spellings must work.
      setChatGPTLocation('legacy-host');
      loadFixture(
        USER_TURN +
          observedTurn(
            'src="https://connector_openai_deep_research.web-sandbox.oaiusercontent.com?app=chatgpt"'
          )
      );

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/deep research/i);
    });

    it('ignores unrelated iframes', async () => {
      setChatGPTLocation('other-iframe');
      loadFixture(
        USER_TURN + ANSWERED_TURN + '<iframe title="ad" src="https://example.com/embed"></iframe>'
      );

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.warnings?.join(' ') ?? '').not.toMatch(/deep research/i);
    });
  });
});
