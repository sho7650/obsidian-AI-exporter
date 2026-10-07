import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeExtractor } from '../../src/content/extractors/claude';
import { clearFixture, resetLocation } from '../fixtures/dom-helpers';
import { createClaudeHubPage } from '../fixtures/claude-hub-dom';

describe('ClaudeExtractor on the 2026-10 transcript DOM', () => {
  let extractor: ClaudeExtractor;

  beforeEach(() => {
    extractor = new ClaudeExtractor();
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  it('extracts every message in order, the answer body without its thinking summary', async () => {
    createClaudeHubPage('hub-1', [
      { role: 'user', text: 'First question' },
      {
        role: 'assistant',
        parts: [
          { kind: 'thinking', label: 'Planned how to answer the first question.' },
          { kind: 'text', html: '<p>First answer</p>' },
        ],
      },
      { role: 'user', text: 'Second question' },
      { role: 'assistant', parts: [{ kind: 'text', html: '<p>Second answer</p>' }] },
    ]);

    const result = await extractor.extract();

    expect(result.success).toBe(true);
    const messages = result.data?.messages ?? [];
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages[0].content).toContain('First question');
    expect(messages[1].content).toContain('First answer');
    expect(messages[1].content).not.toContain('Planned how to answer');
    expect(messages[3].content).toContain('Second answer');
  });

  it('keeps the screen-reader heading and the actions bar out of an answer without markdown', async () => {
    createClaudeHubPage('hub-1', [
      { role: 'user', text: 'Say hi' },
      { role: 'assistant', heading: 'hi', parts: [] },
    ]);

    const result = await extractor.extract();

    const answer = result.data?.messages.find(m => m.role === 'assistant');
    expect(answer).toBeDefined();
    expect(answer?.content).not.toContain('Claude responded');
    expect(answer?.content).not.toContain('Jun 19');
  });
});
