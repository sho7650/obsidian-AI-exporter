import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotebookLMExtractor } from '../../src/content/extractors/notebooklm';
import { htmlToMarkdown } from '../../src/content/markdown';
import {
  loadFixture,
  clearFixture,
  resetLocation,
  setNotebookLMLocation,
  createNotebookLMPage,
} from '../fixtures/dom-helpers';

describe('NotebookLMExtractor', () => {
  let extractor: NotebookLMExtractor;

  beforeEach(() => {
    extractor = new NotebookLMExtractor();
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  // ========== Platform Detection ==========
  describe('Platform Detection', () => {
    it('identifies as notebooklm platform', () => {
      expect(extractor.platform).toBe('notebooklm');
    });

    it('returns true for notebooklm.google.com', () => {
      setNotebookLMLocation('test-notebook-id');
      expect(extractor.canExtract()).toBe(true);
    });

    it('returns false for other hosts', () => {
      // Use gemini location as a non-notebooklm host
      Object.defineProperty(window, 'location', {
        value: { hostname: 'gemini.google.com', pathname: '/app/123' },
        writable: true,
        configurable: true,
      });
      expect(extractor.canExtract()).toBe(false);
    });
  });

  // ========== Conversation ID ==========
  describe('getConversationId', () => {
    it('extracts notebook UUID from URL', () => {
      setNotebookLMLocation('02c6ebb0-b0b2-4960-bdc2-bfdb4e7b88a9');
      expect(extractor.getConversationId()).toBe('02c6ebb0-b0b2-4960-bdc2-bfdb4e7b88a9');
    });

    it('returns null for non-notebook URLs', () => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'notebooklm.google.com',
          pathname: '/',
        },
        writable: true,
        configurable: true,
      });
      expect(extractor.getConversationId()).toBeNull();
    });
  });

  // ========== Title ==========
  describe('getTitle', () => {
    it('extracts title from .cover-title element', () => {
      setNotebookLMLocation('test-id');
      loadFixture(`
        <section class="chat-panel">
          <chat-panel>
            <div class="chat-panel-content">
              <chat-panel-header>
                <div class="cover-image">
                  <div class="cover-content">
                    <div class="cover-title mat-headline-medium">My Notebook Title</div>
                  </div>
                </div>
              </chat-panel-header>
            </div>
          </chat-panel>
        </section>
      `);
      expect(extractor.getTitle()).toBe('My Notebook Title');
    });

    it('falls back to default when .cover-title is absent', () => {
      setNotebookLMLocation('test-id');
      loadFixture('<div></div>');
      expect(extractor.getTitle()).toBe('Untitled NotebookLM Conversation');
    });
  });

  // ========== Message Extraction ==========
  describe('extractMessages', () => {
    it('extracts user and assistant messages from chat-message-pair', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'What is PSP?' },
        {
          role: 'assistant',
          content: `
            <labs-tailwind-structural-element-view-v2>
              <paragraph-element-view>
                <div class="paragraph is-rich-chat-ui normal">
                  <span>PSP is a self-improvement framework.</span>
                </div>
              </paragraph-element-view>
            </labs-tailwind-structural-element-view-v2>`,
        },
      ]);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data?.messages).toHaveLength(2);
      expect(result.data?.messages[0].role).toBe('user');
      expect(result.data?.messages[0].content).toContain('What is PSP?');
      expect(result.data?.messages[1].role).toBe('assistant');
      expect(result.data?.messages[1].content).toContain('PSP is a self-improvement framework');
    });

    it('extracts multiple Q&A pairs in order', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'First question' },
        {
          role: 'assistant',
          content:
            '<labs-tailwind-structural-element-view-v2><paragraph-element-view><div class="paragraph is-rich-chat-ui normal"><span>First answer</span></div></paragraph-element-view></labs-tailwind-structural-element-view-v2>',
        },
        { role: 'user', content: 'Second question' },
        {
          role: 'assistant',
          content:
            '<labs-tailwind-structural-element-view-v2><paragraph-element-view><div class="paragraph is-rich-chat-ui normal"><span>Second answer</span></div></paragraph-element-view></labs-tailwind-structural-element-view-v2>',
        },
      ]);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data?.messages).toHaveLength(4);
      expect(result.data?.messages[0].content).toContain('First question');
      expect(result.data?.messages[1].content).toContain('First answer');
      expect(result.data?.messages[2].content).toContain('Second question');
      expect(result.data?.messages[3].content).toContain('Second answer');
    });

    it('handles empty conversation', async () => {
      setNotebookLMLocation('test-id');
      loadFixture(
        '<section class="chat-panel"><chat-panel><div class="chat-panel-content"></div></chat-panel></section>'
      );
      const result = await extractor.extract();
      // May succeed with warnings or fail — either is acceptable
      expect(result).toBeDefined();
    });
  });

  // ========== Citation Handling ==========
  // Issue #185: inline citations were rendered as bare numbers ("big claim359")
  // because citation buttons were stripped by DOMPurify but their inner text
  // survived. These tests pin the fix: citations become Obsidian footnote refs
  // with per-message labels, and footnote definitions are appended after the
  // assistant prose.
  describe('Citation extraction', () => {
    it('converts inline citation buttons to Obsidian footnote refs and definitions', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'Question' },
        {
          role: 'assistant',
          content: `
            <labs-tailwind-structural-element-view-v2>
              <paragraph-element-view>
                <div class="paragraph is-rich-chat-ui normal">
                  <span>A big claim</span>
                  <span><button class="xap-inline-dialog citation-marker"><span aria-label="1: First Source">1</span></button></span>
                  <span>.</span>
                </div>
              </paragraph-element-view>
            </labs-tailwind-structural-element-view-v2>`,
        },
      ]);

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();

      const markdown = htmlToMarkdown(assistantMsg!.content);

      // Footnote ref appears in the prose
      expect(markdown).toContain('[^m0-1]');
      // Footnote definition is appended (with the source title from aria-label)
      expect(markdown).toContain('[^m0-1]: First Source');
      // Bug regression guard: bare digit no longer glued to the prose
      expect(markdown).not.toMatch(/big claim\d/);
      // No leftover citation button artifact
      expect(markdown).not.toContain('citation-marker');
    });

    it('drops the "more citations" mat-icon button without producing a footnote', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'Question' },
        {
          role: 'assistant',
          content: `
            <labs-tailwind-structural-element-view-v2>
              <paragraph-element-view>
                <div class="paragraph is-rich-chat-ui normal">
                  <span>Sourced fact</span>
                  <span><button class="xap-inline-dialog citation-marker"><span aria-label="2: Real Source">2</span></button></span>
                  <span><button class="xap-inline-dialog citation-marker"><mat-icon>more_horiz</mat-icon></button></span>
                  <span>.</span>
                </div>
              </paragraph-element-view>
            </labs-tailwind-structural-element-view-v2>`,
        },
      ]);

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      const markdown = htmlToMarkdown(assistantMsg!.content);

      expect(markdown).toContain('[^m0-2]: Real Source');
      // Only one footnote ref; the mat-icon button is silently dropped
      expect(markdown.match(/\[\^m0-/g) ?? []).toHaveLength(2); // 1 ref + 1 def line
      expect(markdown).not.toContain('mat-icon');
      expect(markdown).not.toContain('more_horiz');
    });

    it('keeps footnote labels unique across assistant turns', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'Q1' },
        {
          role: 'assistant',
          content: `
            <labs-tailwind-structural-element-view-v2>
              <paragraph-element-view>
                <div class="paragraph is-rich-chat-ui normal">
                  <span>First</span>
                  <span><button class="citation-marker"><span aria-label="1: Source A">1</span></button></span>
                  <span>.</span>
                </div>
              </paragraph-element-view>
            </labs-tailwind-structural-element-view-v2>`,
        },
        { role: 'user', content: 'Q2' },
        {
          role: 'assistant',
          content: `
            <labs-tailwind-structural-element-view-v2>
              <paragraph-element-view>
                <div class="paragraph is-rich-chat-ui normal">
                  <span>Second</span>
                  <span><button class="citation-marker"><span aria-label="1: Source B">1</span></button></span>
                  <span>.</span>
                </div>
              </paragraph-element-view>
            </labs-tailwind-structural-element-view-v2>`,
        },
      ]);

      const result = await extractor.extract();
      expect(result.success).toBe(true);

      const assistants = result.data?.messages.filter(m => m.role === 'assistant') ?? [];
      expect(assistants).toHaveLength(2);
      const md0 = htmlToMarkdown(assistants[0].content);
      const md1 = htmlToMarkdown(assistants[1].content);

      // Per-turn labels prevent cross-message [^N] collisions
      expect(md0).toContain('[^m0-1]: Source A');
      expect(md1).toContain('[^m1-1]: Source B');
      expect(md0).not.toContain('[^m1-1]');
      expect(md1).not.toContain('[^m0-1]');
    });

    it('falls back to the visible number when aria-label is missing', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'Question' },
        {
          role: 'assistant',
          content: `
            <labs-tailwind-structural-element-view-v2>
              <paragraph-element-view>
                <div class="paragraph is-rich-chat-ui normal">
                  <span>Cite</span>
                  <span><button class="citation-marker"><span>5</span></button></span>
                  <span>.</span>
                </div>
              </paragraph-element-view>
            </labs-tailwind-structural-element-view-v2>`,
        },
      ]);

      const result = await extractor.extract();
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      const markdown = htmlToMarkdown(assistantMsg!.content);

      expect(markdown).toContain('[^m0-5]');
      expect(markdown).toContain('[^m0-5]: 5');
    });
  });

  // ========== Metadata ==========
  describe('Metadata', () => {
    it('sets source to notebooklm', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'Test' },
        {
          role: 'assistant',
          content:
            '<labs-tailwind-structural-element-view-v2><paragraph-element-view><div class="paragraph is-rich-chat-ui normal"><span>Response</span></div></paragraph-element-view></labs-tailwind-structural-element-view-v2>',
        },
      ]);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data?.source).toBe('notebooklm');
    });

    it('sets correct message counts', async () => {
      createNotebookLMPage('test-id', [
        { role: 'user', content: 'Q1' },
        {
          role: 'assistant',
          content:
            '<labs-tailwind-structural-element-view-v2><paragraph-element-view><div class="paragraph is-rich-chat-ui normal"><span>A1</span></div></paragraph-element-view></labs-tailwind-structural-element-view-v2>',
        },
        { role: 'user', content: 'Q2' },
        {
          role: 'assistant',
          content:
            '<labs-tailwind-structural-element-view-v2><paragraph-element-view><div class="paragraph is-rich-chat-ui normal"><span>A2</span></div></paragraph-element-view></labs-tailwind-structural-element-view-v2>',
        },
      ]);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data?.metadata.messageCount).toBe(4);
      expect(result.data?.metadata.userMessageCount).toBe(2);
      expect(result.data?.metadata.assistantMessageCount).toBe(2);
    });
  });

  // ========== Fallback Selectors ==========
  describe('Fallback Selectors', () => {
    it('works with primary conversationTurn selector (.chat-message-pair)', async () => {
      setNotebookLMLocation('test-id');
      loadFixture(`
        <div class="chat-message-pair">
          <chat-message>
            <div class="from-user-container">
              <mat-card class="from-user-message-card-content">
                <mat-card-content class="from-user-message-inner-content message-content">
                  <div class="message-text-content"><div><p>User question</p></div></div>
                </mat-card-content>
              </mat-card>
            </div>
          </chat-message>
          <chat-message>
            <div class="to-user-container">
              <mat-card class="to-user-message-card-content">
                <mat-card-content class="to-user-message-inner-content message-content">
                  <div class="message-text-content"><div><element-list-renderer>
                    <labs-tailwind-structural-element-view-v2>
                      <paragraph-element-view>
                        <div class="paragraph is-rich-chat-ui normal"><span>Answer</span></div>
                      </paragraph-element-view>
                    </labs-tailwind-structural-element-view-v2>
                  </element-list-renderer></div></div>
                </mat-card-content>
              </mat-card>
            </div>
          </chat-message>
        </div>
      `);

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data?.messages.some(m => m.role === 'user')).toBe(true);
    });
  });

  // ========== Branch Coverage: extractUserContent / extractAssistantContent ==========
  describe('Content extraction fallback paths', () => {
    it('skips user message when textContent is empty', async () => {
      setNotebookLMLocation('test-123');
      loadFixture(`
        <section class="chat-panel"><chat-panel><div class="chat-panel-content">
          <div class="chat-message-pair is-rich-chat-ui">
            <chat-message class="individual-message">
              <div class="from-user-container">
                <mat-card class="mat-mdc-card mdc-card from-user-message-card-content">
                  <mat-card-content class="mat-mdc-card-content from-user-message-inner-content message-content">
                    <div class="message-text-content mat-body-medium"></div>
                  </mat-card-content>
                </mat-card>
              </div>
            </chat-message>
            <chat-message class="individual-message">
              <div class="to-user-container">
                <mat-card class="mat-mdc-card mdc-card to-user-message-card-content">
                  <mat-card-content class="mat-mdc-card-content message-content to-user-message-inner-content">
                    <div class="message-text-content mat-body-medium">
                      <div><element-list-renderer><p>Response</p></element-list-renderer></div>
                    </div>
                  </mat-card-content>
                </mat-card>
              </div>
            </chat-message>
          </div>
        </div></chat-panel></section>
      `);

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      // No user message should be extracted (empty textContent)
      expect(result.data?.messages.every(m => m.role === 'assistant')).toBe(true);
    });

    it('falls back to innerHTML when no element-list-renderer found', async () => {
      setNotebookLMLocation('test-123');
      loadFixture(`
        <section class="chat-panel"><chat-panel><div class="chat-panel-content">
          <div class="chat-message-pair is-rich-chat-ui">
            <chat-message class="individual-message">
              <div class="from-user-container">
                <mat-card class="mat-mdc-card mdc-card from-user-message-card-content">
                  <mat-card-content class="mat-mdc-card-content from-user-message-inner-content message-content">
                    <div class="message-text-content mat-body-medium">
                      <div class="is-rich-chat-ui" role="heading" aria-level="3"><p>Question</p></div>
                    </div>
                  </mat-card-content>
                </mat-card>
              </div>
            </chat-message>
            <chat-message class="individual-message">
              <div class="to-user-container">
                <mat-card class="mat-mdc-card mdc-card to-user-message-card-content">
                  <mat-card-content class="mat-mdc-card-content message-content to-user-message-inner-content">
                    <div class="message-text-content mat-body-medium">
                      <div><p>Direct content without renderer</p></div>
                    </div>
                  </mat-card-content>
                </mat-card>
              </div>
            </chat-message>
          </div>
        </div></chat-panel></section>
      `);

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      const assistantMsg = result.data?.messages.find(m => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.content).toContain('Direct content without renderer');
    });

    it('skips assistant message when both renderer and innerHTML are empty', async () => {
      setNotebookLMLocation('test-123');
      loadFixture(`
        <section class="chat-panel"><chat-panel><div class="chat-panel-content">
          <div class="chat-message-pair is-rich-chat-ui">
            <chat-message class="individual-message">
              <div class="from-user-container">
                <mat-card class="mat-mdc-card mdc-card from-user-message-card-content">
                  <mat-card-content class="mat-mdc-card-content from-user-message-inner-content message-content">
                    <div class="message-text-content mat-body-medium">
                      <div class="is-rich-chat-ui" role="heading" aria-level="3"><p>Question</p></div>
                    </div>
                  </mat-card-content>
                </mat-card>
              </div>
            </chat-message>
            <chat-message class="individual-message">
              <div class="to-user-container">
                <mat-card class="mat-mdc-card mdc-card to-user-message-card-content">
                  <mat-card-content class="mat-mdc-card-content message-content to-user-message-inner-content">
                    <div class="message-text-content mat-body-medium"></div>
                  </mat-card-content>
                </mat-card>
              </div>
            </chat-message>
          </div>
        </div></chat-panel></section>
      `);

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      // Only user message, no assistant (empty content skipped)
      expect(result.data?.messages.every(m => m.role === 'user')).toBe(true);
    });
  });

  // ========== Error Handling ==========
  describe('Error handling', () => {
    it('returns error when called from non-notebooklm domain', async () => {
      resetLocation();
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not on a NotebookLM page');
    });
  });
});
