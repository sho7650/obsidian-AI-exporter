/**
 * Fitness function for the writer ⇄ reader seam behind issue #433.
 *
 * `conversationToNote()` decides how a code block is fenced;
 * `countExistingMessages()` / `extractTailMessages()` decide how much of a
 * saved note append mode believes is already there; `escapeAngleBrackets()`
 * decides which characters get backslashes. All three parse fences, and #433
 * was the three of them disagreeing about where a code block ends.
 *
 * ADR-028 taught that the seam, not the unit, is what catches this class: both
 * modules were individually well covered when #406 shipped. So these tests
 * drive the real writer and the real readers over one payload matrix, and the
 * code is recovered by a reference parser defined HERE — deliberately not
 * importing src/lib/code-fence.ts, so the writer is never graded by its own
 * tracker.
 */
import { describe, it, expect } from 'vitest';
import { conversationToNote } from '../../src/content/markdown';
import { countExistingMessages, extractTailMessages } from '../../src/lib/message-counter';
import type { ConversationData, TemplateOptions } from '../../src/lib/types';

const F3 = '`'.repeat(3);
const F4 = '`'.repeat(4);
const F5 = '`'.repeat(5);

/** Code payloads a conversation about Markdown realistically produces. */
const PAYLOADS: ReadonlyArray<{ name: string; code: string }> = [
  { name: 'plain code', code: 'const x = 1;' },
  { name: 'inner block with a language', code: `# Title\n\n${F3}python\nprint(1)\n${F3}` },
  { name: 'inner bare fence', code: `text\n${F3}\ncode\n${F3}` },
  { name: 'inner four-backtick block', code: `${F4}md\n${F3}js\nx\n${F3}\n${F4}` },
  { name: 'opening fence only', code: `Put this at the top:\n\n${F3}md` },
  { name: 'closing fence only', code: `…and end it with:\n\n${F3}` },
  { name: 'indented inner fence', code: `text\n   ${F3}md\nx\n   ${F3}` },
  { name: 'inner fence with trailing spaces', code: `${F3}md  \nx\n${F3}  ` },
  { name: 'tilde block', code: '~~~md\nx\n~~~' },
  { name: 'message-shaped lines', code: `${F3}md\n**User:**\n**Claude:**\n${F3}` },
  { name: 'angle brackets and dollars', code: '<div>$HOME</div>\nif (a < b && c > d) {}' },
  { name: 'longest run wins', code: `${F3}\n${F5}\n${F3}` },
];

const FORMATS: ReadonlyArray<TemplateOptions['messageFormat']> = ['callout', 'blockquote', 'plain'];

const BASE_OPTIONS: TemplateOptions = {
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

/** Escape text for embedding in an HTML fixture, as the real DOM would hold it. */
function toHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A 4-message conversation whose second message is a code block holding `code`.
 * Message count is what append mode compares against, so it is set honestly.
 */
function noteFor(code: string, messageFormat: TemplateOptions['messageFormat']): string {
  const data: ConversationData = {
    id: 'conv433',
    title: 'Nested code',
    url: 'https://chatgpt.com/c/conv433',
    source: 'chatgpt',
    messages: [
      { role: 'user', content: 'show me the markdown' },
      {
        role: 'assistant',
        content: `<p>Here:</p><pre><code class="language-markdown">${toHtmlText(code)}</code></pre><p>after</p>`,
      },
      { role: 'user', content: 'thanks' },
      { role: 'assistant', content: '<p>welcome</p>' },
    ],
    extractedAt: new Date('2026-08-13T00:00:00Z'),
    metadata: { messageCount: 4, userMessageCount: 2, assistantMessageCount: 2 },
  };
  return conversationToNote(data, { ...BASE_OPTIONS, messageFormat }).body;
}

/** Drop one blockquote marker per line, the way flattenLargeCallouts() does. */
function dequote(body: string): string {
  return body
    .split('\n')
    .map(line => line.replace(/^> ?/, ''))
    .join('\n');
}

/**
 * Reference CommonMark fence reader — independent of src/lib/code-fence.ts on
 * purpose. Returns the content of every fenced block in `text`.
 */
function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  let open: { char: string; length: number } | null = null;
  let buffer: string[] = [];

  for (const line of text.split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    const run = match ? match[1] : '';
    const rest = match ? match[2] : '';

    if (open === null) {
      if (match && !(run[0] === '`' && rest.includes('`'))) {
        open = { char: run[0], length: run.length };
        buffer = [];
      }
      continue;
    }

    if (match && run[0] === open.char && run.length >= open.length && rest.trim() === '') {
      blocks.push(buffer.join('\n'));
      open = null;
      continue;
    }
    buffer.push(line);
  }

  if (open !== null) blocks.push(buffer.join('\n'));
  return blocks;
}

describe.each(FORMATS)('fence seam — %s format', format => {
  describe.each(PAYLOADS)('$name', ({ code }) => {
    const body = () => noteFor(code, format);

    it('P1: the code survives verbatim', () => {
      const recovered = extractCodeBlocks(dequote(body()));
      expect(recovered).toContain(code.trim());
    });

    it('P2: every message is still countable', () => {
      expect(countExistingMessages(body())).toBe(4);
    });

    it('P3: counting and tail extraction agree at every offset', () => {
      const text = body();
      for (let skip = 0; skip < 4; skip++) {
        expect(countExistingMessages(extractTailMessages(text, skip))).toBe(4 - skip);
      }
    });

    it('P4: no escaping leaks into the code block', () => {
      for (const block of extractCodeBlocks(dequote(body()))) {
        expect(block).not.toMatch(/\\[<>$]/);
      }
    });
  });
});
