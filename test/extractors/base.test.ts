import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseExtractor } from '../../src/content/extractors/base';
import type {
  ExtractionResult,
  ExtensionSettings,
  ConversationMessage,
  ConversationData,
} from '../../src/lib/types';

// Concrete implementation for testing abstract BaseExtractor
class TestExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  // Allow tests to control canExtract behavior
  canExtractValue = true;

  canExtract(): boolean {
    return this.canExtractValue;
  }

  getConversationId(): string | null {
    return 'test-id';
  }

  getTitle(): string {
    return 'Test Title';
  }

  extractMessages(): ConversationMessage[] {
    return [];
  }

  // Expose protected methods for testing
  public testSanitizeText(text: string): string {
    return this.sanitizeText(text);
  }

  public testQueryWithFallback<T extends Element>(
    selectors: string[],
    parent?: Element | Document
  ): T | null {
    return this.queryWithFallback(selectors, parent);
  }

  public testQueryAllWithFallback<T extends Element>(
    selectors: string[],
    parent?: Element | Document
  ): NodeListOf<T> | T[] {
    return this.queryAllWithFallback(selectors, parent);
  }

  public testGenerateHashValue(content: string): string {
    return this.generateHashValue(content);
  }

  public testGetPageTitle(): string | null {
    return this.getPageTitle();
  }

  public testSortByDomPosition(
    elements: Array<{ element: Element; type: 'user' | 'assistant' }>
  ): void {
    this.sortByDomPosition(elements);
  }

  public testBuildMessagesFromElements(
    elements: Array<{ element: Element; type: 'user' | 'assistant' }>,
    extractUser: (el: Element) => string,
    extractAssistant: (el: Element) => string
  ): ConversationMessage[] {
    return this.buildMessagesFromElements(elements, extractUser, extractAssistant);
  }

  public get testPlatformLabel(): string {
    return this.platformLabel;
  }
}

describe('BaseExtractor', () => {
  let extractor: TestExtractor;

  beforeEach(() => {
    extractor = new TestExtractor();
    document.body.innerHTML = '';
  });

  describe('validate', () => {
    it('returns invalid for failed extraction', () => {
      const result: ExtractionResult = { success: false, error: 'Failed' };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Failed');
    });

    it('returns invalid for failed extraction with no error message', () => {
      const result: ExtractionResult = { success: false };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Extraction failed');
    });

    it('returns invalid for null data', () => {
      const result: ExtractionResult = {
        success: true,
        data: undefined as unknown as ConversationData,
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No data extracted');
    });

    it('returns invalid for empty messages', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [],
          extractedAt: new Date(),
          metadata: {
            messageCount: 0,
            userMessageCount: 0,
            assistantMessageCount: 0,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No messages found in conversation');
    });

    it('warns on very few messages', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [{ id: '1', role: 'user', content: 'Hello', index: 0 }],
          extractedAt: new Date(),
          metadata: {
            messageCount: 1,
            userMessageCount: 1,
            assistantMessageCount: 0,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(true);
      expect(validation.warnings.some((w) => w.includes('Very few messages'))).toBe(
        true
      );
    });

    it('warns on unbalanced message count', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: 'Hello', index: 0 },
            { id: '2', role: 'user', content: 'Hello again', index: 1 },
            { id: '3', role: 'user', content: 'Hello once more', index: 2 },
          ],
          extractedAt: new Date(),
          metadata: {
            messageCount: 3,
            userMessageCount: 3,
            assistantMessageCount: 0,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.warnings.some((w) => w.includes('Unbalanced'))).toBe(true);
    });

    it('warns on empty content', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: '', index: 0 },
            { id: '2', role: 'assistant', content: 'Response', index: 1 },
          ],
          extractedAt: new Date(),
          metadata: {
            messageCount: 2,
            userMessageCount: 1,
            assistantMessageCount: 1,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.warnings.some((w) => w.includes('empty content'))).toBe(true);
    });

    it('returns valid for good extraction', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: 'Hello', index: 0 },
            { id: '2', role: 'assistant', content: 'Hi there!', index: 1 },
          ],
          extractedAt: new Date(),
          metadata: {
            messageCount: 2,
            userMessageCount: 1,
            assistantMessageCount: 1,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('sanitizeText', () => {
    it('collapses multiple spaces', () => {
      expect(extractor.testSanitizeText('hello    world')).toBe('hello world');
    });

    it('trims whitespace', () => {
      expect(extractor.testSanitizeText('  hello  ')).toBe('hello');
    });

    it('handles newlines and tabs', () => {
      expect(extractor.testSanitizeText('hello\n\tworld')).toBe('hello world');
    });

    it('handles empty string', () => {
      expect(extractor.testSanitizeText('')).toBe('');
    });

    it('handles only whitespace', () => {
      expect(extractor.testSanitizeText('   \n\t   ')).toBe('');
    });
  });

  describe('queryWithFallback', () => {
    it('returns first matching element', () => {
      document.body.innerHTML = '<div class="target">Found</div>';
      const result = extractor.testQueryWithFallback<HTMLDivElement>([
        '.missing',
        '.target',
      ]);
      expect(result?.textContent).toBe('Found');
    });

    it('returns null if no match', () => {
      document.body.innerHTML = '<div>No match</div>';
      const result = extractor.testQueryWithFallback(['.missing1', '.missing2']);
      expect(result).toBeNull();
    });

    it('searches within parent element', () => {
      document.body.innerHTML = `
        <div id="parent"><span class="target">Inside</span></div>
        <span class="target">Outside</span>
      `;
      const parent = document.getElementById('parent')!;
      const result = extractor.testQueryWithFallback<HTMLSpanElement>(
        ['.target'],
        parent
      );
      expect(result?.textContent).toBe('Inside');
    });

    it('uses first successful selector', () => {
      document.body.innerHTML = `
        <div class="first">First</div>
        <div class="second">Second</div>
      `;
      const result = extractor.testQueryWithFallback<HTMLDivElement>([
        '.first',
        '.second',
      ]);
      expect(result?.textContent).toBe('First');
    });
  });

  describe('queryAllWithFallback', () => {
    it('returns all matching elements for first successful selector', () => {
      document.body.innerHTML = `
        <div class="item">1</div>
        <div class="item">2</div>
      `;
      const results = extractor.testQueryAllWithFallback<HTMLDivElement>([
        '.missing',
        '.item',
      ]);
      expect(results.length).toBe(2);
    });

    it('returns empty array if no match', () => {
      document.body.innerHTML = '<div>No match</div>';
      const results = extractor.testQueryAllWithFallback(['.missing']);
      expect(results.length).toBe(0);
    });

    it('searches within parent element', () => {
      document.body.innerHTML = `
        <div id="parent">
          <span class="item">Inside 1</span>
          <span class="item">Inside 2</span>
        </div>
        <span class="item">Outside</span>
      `;
      const parent = document.getElementById('parent')!;
      const results = extractor.testQueryAllWithFallback<HTMLSpanElement>(
        ['.item'],
        parent
      );
      expect(results.length).toBe(2);
    });

    it('returns results from first successful selector only', () => {
      document.body.innerHTML = `
        <div class="first">First 1</div>
        <div class="first">First 2</div>
        <div class="second">Second</div>
      `;
      const results = extractor.testQueryAllWithFallback<HTMLDivElement>([
        '.first',
        '.second',
      ]);
      expect(results.length).toBe(2);
      expect(Array.from(results).every((el) => el.classList.contains('first'))).toBe(
        true
      );
    });
  });

  describe('getPageTitle', () => {
    it('strips " - Claude" suffix', () => {
      document.title = 'Test Topic - Claude';
      expect(extractor.testGetPageTitle()).toBe('Test Topic');
    });

    it('strips " - ChatGPT" suffix', () => {
      document.title = 'Test Topic - ChatGPT';
      expect(extractor.testGetPageTitle()).toBe('Test Topic');
    });

    it('strips " - Perplexity" suffix', () => {
      document.title = 'Test Topic - Perplexity';
      expect(extractor.testGetPageTitle()).toBe('Test Topic');
    });

    it('strips " - Google Gemini" suffix', () => {
      document.title = 'Test Topic - Google Gemini';
      expect(extractor.testGetPageTitle()).toBe('Test Topic');
    });

    it('strips " | Gemini" suffix', () => {
      document.title = 'Test Topic | Gemini';
      expect(extractor.testGetPageTitle()).toBe('Test Topic');
    });

    it('returns raw title when no known suffix', () => {
      document.title = 'Some Conversation Title';
      expect(extractor.testGetPageTitle()).toBe('Some Conversation Title');
    });

    it('returns null when title is only a platform name', () => {
      for (const name of ['Gemini', 'Google Gemini', 'Claude', 'ChatGPT', 'Perplexity']) {
        document.title = name;
        expect(extractor.testGetPageTitle()).toBeNull();
      }
    });

    it('returns null for empty title', () => {
      document.title = '';
      expect(extractor.testGetPageTitle()).toBeNull();
    });

    it('truncates to MAX_CONVERSATION_TITLE_LENGTH', () => {
      document.title = 'a'.repeat(200);
      expect(extractor.testGetPageTitle()!.length).toBe(100);
    });
  });

  describe('generateHashValue', () => {
    it('delegates to hash function', () => {
      const hash = extractor.testGenerateHashValue('test content');
      expect(hash).toBe('5b9662eb');
    });

    it('returns consistent hash', () => {
      const hash1 = extractor.testGenerateHashValue('same content');
      const hash2 = extractor.testGenerateHashValue('same content');
      expect(hash1).toBe(hash2);
    });

    it('returns 8-character hex string', () => {
      const hash = extractor.testGenerateHashValue('any content');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('platformLabel', () => {
    it('returns correct label for gemini', () => {
      expect(extractor.testPlatformLabel).toBe('Gemini');
    });
  });

  describe('extract (template method)', () => {
    it('returns error when canExtract is false', async () => {
      extractor.canExtractValue = false;
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not on a Gemini page');
    });

    it('returns no-messages error when extractMessages returns empty', async () => {
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No messages found');
    });

    it('catches exceptions and returns error result', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      extractor.extractMessages = () => {
        throw new Error('DOM crashed');
      };

      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toBe('DOM crashed');

      consoleSpy.mockRestore();
    });

    it('calls hooks in correct order', async () => {
      const callOrder: string[] = [];

      // Make extractMessages return data so we reach all hooks
      extractor.extractMessages = () => [
        { id: 'user-0', role: 'user', content: 'Hello', index: 0 },
        { id: 'assistant-0', role: 'assistant', content: 'Hi', index: 1 },
      ];

      // Spy on the template method hook points via prototype
      const origBeforeExtract = extractor['onBeforeExtract'].bind(extractor);
      extractor['onBeforeExtract'] = async () => {
        callOrder.push('onBeforeExtract');
        return origBeforeExtract();
      };

      const origAfterExtract = extractor['onAfterExtract'].bind(extractor);
      extractor['onAfterExtract'] = (result: ExtractionResult) => {
        callOrder.push('onAfterExtract');
        return origAfterExtract(result);
      };

      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(callOrder).toEqual(['onBeforeExtract', 'onAfterExtract']);
    });
  });

  describe('sortByDomPosition', () => {
    it('sorts elements into DOM order', () => {
      document.body.innerHTML = `
        <div class="first">First</div>
        <div class="second">Second</div>
        <div class="third">Third</div>
      `;
      const first = document.querySelector('.first')!;
      const second = document.querySelector('.second')!;
      const third = document.querySelector('.third')!;

      // Deliberately out of order
      const elements: Array<{ element: Element; type: 'user' | 'assistant' }> = [
        { element: third, type: 'assistant' },
        { element: first, type: 'user' },
        { element: second, type: 'assistant' },
      ];

      extractor.testSortByDomPosition(elements);

      expect(elements[0].element).toBe(first);
      expect(elements[1].element).toBe(second);
      expect(elements[2].element).toBe(third);
    });
  });

  describe('buildMessagesFromElements', () => {
    it('builds messages from elements with correct roles and content', () => {
      document.body.innerHTML = `
        <div class="user">Hello</div>
        <div class="assistant"><p>Hi there</p></div>
      `;
      const userEl = document.querySelector('.user')!;
      const assistantEl = document.querySelector('.assistant')!;

      const elements: Array<{ element: Element; type: 'user' | 'assistant' }> = [
        { element: userEl, type: 'user' },
        { element: assistantEl, type: 'assistant' },
      ];

      const messages = extractor.testBuildMessagesFromElements(
        elements,
        (el) => el.textContent || '',
        (el) => el.innerHTML
      );

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[0].htmlContent).toBeUndefined();
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('<p>Hi there</p>');
      expect(messages[1].htmlContent).toBe('<p>Hi there</p>');
    });

    it('skips elements with empty content', () => {
      document.body.innerHTML = `
        <div class="user"></div>
        <div class="assistant"><p>Response</p></div>
      `;
      const userEl = document.querySelector('.user')!;
      const assistantEl = document.querySelector('.assistant')!;

      const elements: Array<{ element: Element; type: 'user' | 'assistant' }> = [
        { element: userEl, type: 'user' },
        { element: assistantEl, type: 'assistant' },
      ];

      const messages = extractor.testBuildMessagesFromElements(
        elements,
        () => '',
        (el) => el.innerHTML
      );

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].index).toBe(0);
    });

    it('assigns correct sequential index to messages', () => {
      document.body.innerHTML = `
        <div class="a">A</div>
        <div class="b">B</div>
        <div class="c">C</div>
      `;

      const elements: Array<{ element: Element; type: 'user' | 'assistant' }> = [
        { element: document.querySelector('.a')!, type: 'user' },
        { element: document.querySelector('.b')!, type: 'assistant' },
        { element: document.querySelector('.c')!, type: 'user' },
      ];

      const messages = extractor.testBuildMessagesFromElements(
        elements,
        (el) => el.textContent || '',
        (el) => el.textContent || ''
      );

      expect(messages[0].index).toBe(0);
      expect(messages[1].index).toBe(1);
      expect(messages[2].index).toBe(2);
      expect(messages[0].id).toBe('user-0');
      expect(messages[1].id).toBe('assistant-1');
      expect(messages[2].id).toBe('user-2');
    });
  });

  describe('applySettings', () => {
    it('is a no-op by default (does not throw)', () => {
      const settings = { enableAutoScroll: true, enableToolContent: true } as ExtensionSettings;
      expect(() => extractor.applySettings(settings)).not.toThrow();
    });

    it('does not modify base extractor state', () => {
      const settings = { enableAutoScroll: true, enableToolContent: true } as ExtensionSettings;
      extractor.applySettings(settings);
      // Base extractor has no settings properties to check,
      // just confirm it remains functional
      expect(extractor.platform).toBe('gemini');
    });
  });
});
