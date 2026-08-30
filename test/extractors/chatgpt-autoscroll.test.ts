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
  /** `conversation-turn-N` ordinal, when the turn carries a data-testid. */
  ordinal?: number;
}

function renderTurn(turn: Turn): string {
  const body =
    turn.role === 'user'
      ? `<div class="whitespace-pre-wrap">${turn.content}</div>`
      : `<div class="markdown prose"><p>${turn.content}</p></div>`;
  const testId =
    turn.ordinal === undefined ? '' : ` data-testid="conversation-turn-${turn.ordinal}"`;
  return `<section data-turn-id="${turn.id}" data-turn="${turn.role}"${testId}>
    <div data-message-author-role="${turn.role}" data-message-id="${turn.id}">${body}</div>
  </section>`;
}

/**
 * @param tail Number of newest turns that never evict — they stay mounted in
 *   every window alongside the moving window, as measured on the live page
 *   (issue #353). 0 = pure moving window.
 */
function mountVirtualizedChatGPT(turns: Turn[], windowSize: number, tail = 0): void {
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
    const mounted = new Set(turns.slice(start, start + windowSize));
    for (const turn of turns.slice(turns.length - tail)) mounted.add(turn);
    scroller.innerHTML = turns
      .filter(t => mounted.has(t))
      .map(renderTurn)
      .join('');
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

/** Plain text of a message body via the DOM (avoids regex HTML stripping). */
function plainText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
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
    expect(result.data?.messages.map(m => plainText(m.content))).toEqual([
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

  it('emits the conversation-turn ordinal as the harvest order index (issue #353)', () => {
    // `data-testid="conversation-turn-N"` is numbered across the whole
    // conversation, not per mounted window: measured on a real desktop session
    // (2026-07-29), a mid-scroll window reported turns 17-21 and the top window
    // reported 1-21, with no renumbering. That makes N a usable monotonic order
    // index, the same role Claude's `data-index` plays (#352).
    document.body.innerHTML = [
      { role: 'user' as const, content: 'Q9', id: 'a', ordinal: 17 },
      { role: 'assistant' as const, content: 'A9', id: 'b', ordinal: 18 },
    ]
      .map(renderTurn)
      .join('');

    const entries = extractor['harvestWindow']();

    expect(entries.map(e => e.order)).toEqual([17, 18]);
  });

  it('omits the order index when the turn carries no conversation-turn testid', () => {
    // Degrades to merge-derived ordering rather than inventing an index.
    document.body.innerHTML = renderTurn({ role: 'user', content: 'Q1', id: 'a' });

    const entries = extractor['harvestWindow']();

    expect(entries).toHaveLength(1);
    expect(entries[0].order).toBeUndefined();
  });

  it('keeps the true order when the newest turns never evict (issue #353)', async () => {
    // The persistent-tail shape measured on the live page: the last turns stay
    // mounted in every window while the middle evicts.
    const long: Turn[] = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `M${i + 1}`,
      id: `turn-${i}`,
      ordinal: i + 1,
    }));
    mountVirtualizedChatGPT(long, 4, 3);
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data?.messages.map(m => plainText(m.content))).toEqual(long.map(t => t.content));
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

describe('ChatGPTExtractor message watermark (issue #465)', () => {
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

  it('reads the highest mounted conversation-turn ordinal', () => {
    document.body.innerHTML = [
      { role: 'user' as const, content: 'Q9', id: 'a', ordinal: 17 },
      { role: 'assistant' as const, content: 'A9', id: 'b', ordinal: 18 },
    ]
      .map(renderTurn)
      .join('');

    expect(extractor.getMessageWatermark()).toBe(18);
  });

  it('ignores turns outside the thread scroller', () => {
    // The sidebar <nav> matches loose overflow selectors and has its own list;
    // only the thread scroller may raise the watermark.
    document.body.innerHTML = `
      <nav id="sidebar">${renderTurn({ role: 'user', content: 'old', id: 'z', ordinal: 99 })}</nav>
      <div data-scroll-root="" id="scroller">
        ${renderTurn({ role: 'user', content: 'Q', id: 'a', ordinal: 5 })}
      </div>`;

    expect(extractor.getMessageWatermark()).toBe(5);
  });

  it('is null when no turn carries a conversation-turn testid', () => {
    document.body.innerHTML = renderTurn({ role: 'user', content: 'Q1', id: 'a' });

    expect(extractor.getMessageWatermark()).toBeNull();
  });

  it('reports the ordinal of the newest turn the extraction covered', async () => {
    const long: Turn[] = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `M${i + 1}`,
      id: `turn-${i}`,
      ordinal: i + 1,
    }));
    mountVirtualizedChatGPT(long, 4);
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data?.messageWatermark).toBe(12);
  });

  it('leaves the watermark unset when the platform exposes no ordinal', async () => {
    // Turns without `conversation-turn-N`: the badge must stay as it is today
    // rather than invalidate on a number it cannot trust.
    const long: Turn[] = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `M${i + 1}`,
      id: `turn-${i}`,
    }));
    mountVirtualizedChatGPT(long, 4);
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data?.messageWatermark).toBeUndefined();
  });
});
