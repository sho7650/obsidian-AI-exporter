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

  it('leaves an expanded Thinking summary out of the answer body', async () => {
    createClaudeHubPage('hub-thought', [
      { role: 'user', text: 'Explain it' },
      {
        role: 'assistant',
        parts: [
          {
            kind: 'thinking',
            label: 'Planned the explanation.',
            expanded:
              '<div data-cds="Prose" class="prose"><div class="standard-markdown"><p>The user wants a plain explanation.</p></div></div>',
          },
          { kind: 'text', html: '<p>Here is the explanation.</p>' },
        ],
      },
    ]);

    const result = await extractor.extract();

    const answer = result.data?.messages.find(m => m.role === 'assistant');
    expect(answer?.content).toContain('Here is the explanation.');
    expect(answer?.content).not.toContain('The user wants a plain explanation.');
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

describe('Claude Tool activity on the 2026-10 transcript DOM', () => {
  let extractor: ClaudeExtractor;

  beforeEach(() => {
    extractor = new ClaudeExtractor();
    extractor.enableToolContent = true;
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  it('exports each Tool activity label of an answer, in order', async () => {
    createClaudeHubPage('hub-tools', [
      { role: 'user', text: 'Research this' },
      {
        role: 'assistant',
        parts: [
          { kind: 'tool', label: 'Loaded skill' },
          { kind: 'text', html: '<p>Checking the docs.</p>' },
          { kind: 'tool', label: 'Searched the web' },
          { kind: 'text', html: '<p>Here is the report.</p>' },
        ],
      },
    ]);

    const result = await extractor.extract();

    const answer = result.data?.messages.find(m => m.role === 'assistant');
    expect(answer?.toolContent).toBe('**Loaded skill**\n\n**Searched the web**');
    expect(answer?.content).toContain('Checking the docs.');
    expect(answer?.content).toContain('Here is the report.');
  });

  it('exports a label only, even when the user expanded the Tool activity row', async () => {
    createClaudeHubPage('hub-expanded-tool', [
      { role: 'user', text: 'Research this' },
      {
        role: 'assistant',
        parts: [
          {
            kind: 'tool',
            label: 'Searched the web',
            expanded:
              '<div data-cds-row=""><bdi>Salesforce Knowledge sharing across orgs</bdi></div>' +
              '<div class="standard-markdown"><p>Interim note from the search.</p></div>',
          },
          { kind: 'text', html: '<p>The report.</p>' },
        ],
      },
    ]);

    const result = await extractor.extract();

    const answer = result.data?.messages.find(m => m.role === 'assistant');
    expect(answer?.toolContent).toBe('**Searched the web**');
    expect(answer?.content).toContain('The report.');
    expect(answer?.content).not.toContain('Interim note from the search.');
  });

  it('never exports a Thinking summary as Tool activity', async () => {
    createClaudeHubPage('hub-thinking-only', [
      { role: 'user', text: 'Say hi' },
      {
        role: 'assistant',
        parts: [
          { kind: 'thinking', label: 'Planned a short greeting.' },
          { kind: 'text', html: '<p>Hi!</p>' },
        ],
      },
    ]);

    const result = await extractor.extract();

    const answer = result.data?.messages.find(m => m.role === 'assistant');
    expect(answer?.toolContent).toBeUndefined();
  });

  it('attaches Tool activity to the answer it belongs to, keeping conversation order', async () => {
    createClaudeHubPage('hub-mixed', [
      { role: 'user', text: 'Search something' },
      {
        role: 'assistant',
        parts: [
          { kind: 'thinking', label: 'Decided to search.' },
          { kind: 'tool', label: 'Searched the web' },
          { kind: 'text', html: '<p>Found it.</p>' },
        ],
      },
      { role: 'user', text: 'Thanks' },
      { role: 'assistant', parts: [{ kind: 'text', html: '<p>You are welcome.</p>' }] },
    ]);

    const result = await extractor.extract();

    const messages = result.data?.messages ?? [];
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages[1].toolContent).toBe('**Searched the web**');
    expect(messages[3].toolContent).toBeUndefined();
  });

  it('exports no Tool activity when the user has not opted in', async () => {
    extractor.enableToolContent = false;
    createClaudeHubPage('hub-off', [
      { role: 'user', text: 'Research this' },
      {
        role: 'assistant',
        parts: [
          { kind: 'tool', label: 'Searched the web' },
          { kind: 'text', html: '<p>The report.</p>' },
        ],
      },
    ]);

    const result = await extractor.extract();

    const answer = result.data?.messages.find(m => m.role === 'assistant');
    expect(answer?.toolContent).toBeUndefined();
    expect(answer?.content).not.toContain('Searched the web');
  });
});
