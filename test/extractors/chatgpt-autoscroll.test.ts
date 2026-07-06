/**
 * ChatGPT auto-scroll (virtualization) integration tests — ADR-017.
 *
 * ChatGPT mounts only a window of turns and evicts off-screen ones. These tests
 * drive the extractor against a simulated virtual list (turns keyed by
 * data-turn-id) and assert the full history is accumulated in order.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ChatGPTExtractor } from '../../src/content/extractors/chatgpt';
import { SELECTORS } from '../../src/content/extractors/selectors/chatgpt';
import {
  clearFixture,
  loadFixture,
  setChatGPTLocation,
  resetLocation,
} from '../fixtures/dom-helpers';
import type { SyncSettings } from '../../src/lib/types';

const MAX_SCROLL = 10_000;

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

function renderTurn(turn: Turn): string {
  const body =
    turn.role === 'user'
      ? `<div class="whitespace-pre-wrap">${turn.content}</div>`
      : `<div class="markdown prose"><p>${turn.content}</p></div>`;
  return `<section data-turn-id="${turn.id}" data-turn="${turn.role}">
    <div data-message-author-role="${turn.role}" data-message-id="${turn.id}">${body}</div>
  </section>`;
}

function mountVirtualizedChatGPT(turns: Turn[], windowSize: number): void {
  // Mirror real ChatGPT: a sidebar <nav> that also matches overflow-y-auto class
  // selectors (scrollTop 0), plus the actual thread scroller marked
  // data-scroll-root. The container selector must pick the scroll-root, not the
  // nav — otherwise accumulation is skipped (regression guard for the nav bug).
  document.body.innerHTML = `
    <nav class="flex-1 flex-col overflow-y-auto" id="sidebar"></nav>
    <div data-scroll-root="" class="flex-1 flex-col not-print:overflow-y-auto" id="scroller"></div>`;
  const scroller = document.getElementById('scroller') as HTMLElement;

  let scrollTop = MAX_SCROLL;
  const maxStart = Math.max(0, turns.length - windowSize);

  const render = (): void => {
    const frac = scrollTop / MAX_SCROLL;
    const start = Math.round(frac * maxStart);
    const mounted = turns.slice(start, start + windowSize);
    scroller.innerHTML = mounted.map(renderTurn).join('');
  };

  Object.defineProperty(scroller, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(MAX_SCROLL, v));
      render();
    },
    configurable: true,
  });
  Object.defineProperty(scroller, 'clientHeight', { get: () => 900, configurable: true });
  Object.defineProperty(scroller, 'scrollHeight', {
    get: () => MAX_SCROLL + 900,
    configurable: true,
  });

  render();
}

function settings(overrides: Partial<SyncSettings> = {}): SyncSettings {
  return { enableAutoScroll: true, ...overrides } as SyncSettings;
}

describe('ChatGPTExtractor auto-scroll (virtualization)', () => {
  let extractor: ChatGPTExtractor;

  beforeEach(() => {
    vi.useFakeTimers();
    extractor = new ChatGPTExtractor();
    setChatGPTLocation('6789abcd-ef01-2345-6789-abcdef012345');
  });

  afterEach(() => {
    vi.useRealTimers();
    clearFixture();
    resetLocation();
  });

  const conversation: Turn[] = Array.from({ length: 8 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: i % 2 === 0 ? `Q${i / 2 + 1}` : `A${(i - 1) / 2 + 1}`,
    id: `turn-${i}`,
  }));

  it('accumulates all virtualized turns in order when enabled', async () => {
    mountVirtualizedChatGPT(conversation, 3);
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.data?.messages).toHaveLength(8);
    expect(result.data?.messages.map(m => m.content.replace(/<[^>]+>/g, '').trim())).toEqual([
      'Q1',
      'A1',
      'Q2',
      'A2',
      'Q3',
      'A3',
      'Q4',
      'A4',
    ]);
    expect(result.data?.messages.map(m => m.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.warnings).toBeUndefined();
  });

  it('extracts only the mounted window when auto-scroll is disabled', async () => {
    mountVirtualizedChatGPT(conversation, 3);
    extractor.applySettings(settings({ enableAutoScroll: false }));

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.data?.messages).toHaveLength(3);
  });

  it('scroll-container selector matches the real captured desktop DOM', () => {
    // The daemon serves ChatGPT's mweb layout, so this fixture (captured desktop
    // DOM, same conversation) is how we validate the container selector against
    // real markup. See ADR-017 open questions.
    vi.useRealTimers();
    const html = readFileSync(
      resolve(__dirname, '../fixtures/html/chatgpt/chat-simple.html'),
      'utf-8'
    );
    loadFixture(html);

    const container = extractor['queryWithFallback']<HTMLElement>(SELECTORS.scrollContainer);
    expect(container).not.toBeNull();
  });
});
