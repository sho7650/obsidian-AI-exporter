/**
 * Claude auto-scroll (virtualization) integration tests — ADR-017.
 *
 * Claude mounts only a small window of turns; scrolling up loads earlier turns
 * while evicting later ones. These tests drive the extractor against a
 * simulated virtual list (turns rendered with `data-index`, mounted/evicted by
 * scrollTop) and assert the full history is accumulated in order.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeExtractor } from '../../src/content/extractors/claude';
import { clearFixture, setClaudeLocation, resetLocation } from '../fixtures/dom-helpers';
import type { SyncSettings } from '../../src/lib/types';

const MAX_SCROLL = 10_000;

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** Render one turn wrapped in a `data-index` virtual-row wrapper. */
function renderTurn(turn: Turn, index: number): string {
  const inner =
    turn.role === 'user'
      ? `<div class="bg-bg-300 rounded-xl"><div data-testid="user-message">${turn.content}</div></div>`
      : `<div class="font-claude-response"><div class="standard-markdown"><p>${turn.content}</p></div></div>`;
  return `<div data-index="${index}"><div data-test-render-count="2">${inner}</div></div>`;
}

/**
 * Install a virtualized Claude conversation into the DOM. Only `windowSize`
 * consecutive turns are mounted at once, chosen by the current scrollTop
 * (bottom on open). Returns nothing; sets up document.body.
 */
function mountVirtualizedClaude(turns: Turn[], windowSize: number): void {
  document.body.innerHTML = `<div class="overflow-y-auto overflow-x-hidden flex-1" id="scroller"></div>`;
  const scroller = document.getElementById('scroller') as HTMLElement;

  let scrollTop = MAX_SCROLL; // opens at the bottom
  const maxStart = Math.max(0, turns.length - windowSize);

  const render = (): void => {
    const frac = scrollTop / MAX_SCROLL;
    const start = Math.round(frac * maxStart);
    const mounted = turns.slice(start, start + windowSize);
    scroller.innerHTML = mounted.map((t, i) => renderTurn(t, start + i)).join('');
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

describe('ClaudeExtractor auto-scroll (virtualization)', () => {
  let extractor: ClaudeExtractor;

  beforeEach(() => {
    vi.useFakeTimers();
    extractor = new ClaudeExtractor();
    setClaudeLocation('1fbb8252-2bec-4ef2-bf1f-88393dd9bb5f');
  });

  afterEach(() => {
    vi.useRealTimers();
    clearFixture();
    resetLocation();
  });

  const conversation: Turn[] = [
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q2' },
    { role: 'assistant', content: 'A2' },
    { role: 'user', content: 'Q3' },
    { role: 'assistant', content: 'A3' },
  ];

  it('accumulates all virtualized turns in order when enabled', async () => {
    mountVirtualizedClaude(conversation, 3); // only 3 of 6 mounted at a time
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.data?.messages).toHaveLength(6);
    expect(result.data?.messages.map(m => plainText(m.content))).toEqual([
      'Q1',
      'A1',
      'Q2',
      'A2',
      'Q3',
      'A3',
    ]);
    // Indices are contiguous after accumulation.
    expect(result.data?.messages.map(m => m.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.warnings).toBeUndefined();
  });

  it('extracts only the mounted window when auto-scroll is disabled', async () => {
    mountVirtualizedClaude(conversation, 3);
    extractor.applySettings(settings({ enableAutoScroll: false }));

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    // Without scrolling, only the bottom window (last 3 turns) is visible.
    expect(result.data?.messages).toHaveLength(3);
  });

  it('warns when accumulation times out without ever reaching the top', async () => {
    // A container that mounts a brand-new turn on every scroll and never
    // reaches scrollTop 0 — accumulation can never stabilize.
    document.body.innerHTML = `<div class="overflow-y-auto overflow-x-hidden flex-1" id="scroller"></div>`;
    const scroller = document.getElementById('scroller') as HTMLElement;
    let scrollTop = MAX_SCROLL;
    let counter = 0;
    const renderNext = (): void => {
      counter++;
      scroller.innerHTML = renderTurn({ role: 'user', content: `Q${counter}` }, counter);
    };
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.max(1, v); // never pins at the top
        renderNext();
      },
      configurable: true,
    });
    Object.defineProperty(scroller, 'clientHeight', { get: () => 900, configurable: true });
    renderNext();
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    // Progress never stops (a new turn every scroll), so only the absolute cap
    // can end this pass — and the warning must say so rather than blaming the
    // idle deadline, which is the confusion issue #449 reported.
    const warning = result.warnings?.find(w => w.startsWith('Auto-scroll'));
    expect(warning).toBeDefined();
    expect(warning).toMatch(/time limit/);
    expect(warning).not.toMatch(/no progress/);
    expect(warning).toContain('turns captured');
  });
});
