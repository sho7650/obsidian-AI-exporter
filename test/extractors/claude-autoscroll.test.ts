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
 * The thread scroller as Claude renders it (measured live 2026-09-12): the
 * overflow classes plus the `data-autoscroll-container` marker.
 */
const SCROLLER_HTML =
  '<div class="overflow-y-auto overflow-x-hidden flex-1" data-autoscroll-container="true" id="scroller"></div>';

/**
 * Claude's left sidebar (`dframe-nav-scroll`, live 2026-09-12): it precedes the
 * thread in document order, carries the SAME overflow classes as the thread
 * scroller, is itself scrollable, and holds no conversation rows. It is the
 * decoy that issue #499 tripped over.
 */
const SIDEBAR_HTML =
  '<div class="dframe-nav-scroll flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden" id="sidebar"></div>';

const SIDEBAR_SCROLL_HEIGHT = 985;
const SIDEBAR_CLIENT_HEIGHT = 723;

/** Make the sidebar decoy scrollable and record how far it was scrolled. */
function installSidebarScrolling(sidebar: HTMLElement): { readonly maxScrolled: () => number } {
  let scrollTop = 0;
  let maxScrolled = 0;
  Object.defineProperty(sidebar, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(SIDEBAR_SCROLL_HEIGHT - SIDEBAR_CLIENT_HEIGHT, v));
      maxScrolled = Math.max(maxScrolled, scrollTop);
    },
    configurable: true,
  });
  Object.defineProperty(sidebar, 'clientHeight', {
    get: () => SIDEBAR_CLIENT_HEIGHT,
    configurable: true,
  });
  Object.defineProperty(sidebar, 'scrollHeight', {
    get: () => SIDEBAR_SCROLL_HEIGHT,
    configurable: true,
  });
  return { maxScrolled: () => maxScrolled };
}

/**
 * Install a virtualized Claude conversation into the DOM. Only `windowSize`
 * consecutive turns are mounted at once, chosen by the current scrollTop
 * (bottom on open). Returns nothing; sets up document.body.
 *
 * With `withSidebar`, the sidebar decoy is mounted BEFORE the scroller, as on
 * the live page.
 */
function mountVirtualizedClaude(turns: Turn[], windowSize: number, withSidebar = false): void {
  document.body.innerHTML = withSidebar ? SIDEBAR_HTML + SCROLLER_HTML : SCROLLER_HTML;
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

  it('scrolls the thread, not a sidebar that shares its overflow classes (issue #499)', async () => {
    // Claude's 2026-09 sidebar matches the class-based container selector and
    // sorts first, so a first-match lookup scrolled the sidebar while the
    // thread stayed put — only the initially mounted tail was exported.
    mountVirtualizedClaude(conversation, 3, true);
    const sidebar = installSidebarScrolling(document.getElementById('sidebar') as HTMLElement);
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.data?.messages.map(m => plainText(m.content))).toEqual([
      'Q1',
      'A1',
      'Q2',
      'A2',
      'Q3',
      'A3',
    ]);
    expect(sidebar.maxScrolled()).toBe(0);
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

describe('ClaudeExtractor message watermark (issue #465)', () => {
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

  it('reads the highest mounted data-index', () => {
    mountVirtualizedClaude(conversation, 6);

    expect(extractor.getMessageWatermark()).toBe(5);
  });

  it('reads only what is mounted, so a window near the top reports a low ordinal', () => {
    // This is why the badge baseline cannot be a post-sync DOM read: the pass
    // leaves the scroller at the top, where the newest turn is unmounted.
    document.body.innerHTML =
      '<div data-index="0"></div><div data-index="1"></div><div data-index="2"></div>';

    expect(extractor.getMessageWatermark()).toBe(2);
  });

  it('ignores data-index rows outside the conversation scroller', () => {
    // `[data-index]` is a bare attribute selector, and Claude's own chrome uses
    // virtualized lists too. A sidebar row must never raise the watermark, or
    // scrolling the sidebar would clear the badge.
    document.body.innerHTML = `
      <nav id="sidebar"><div data-index="99"></div></nav>
      <div class="overflow-y-auto overflow-x-hidden flex-1">
        <div data-index="2"></div><div data-index="3"></div>
      </div>`;

    expect(extractor.getMessageWatermark()).toBe(3);
  });

  it('ignores a sidebar that shares the scroller classes (issue #499)', () => {
    // Same decoy as the auto-scroll case: a first-match container lookup would
    // root the watermark in the sidebar, reading its virtual rows (or none) and
    // never the thread's.
    document.body.innerHTML = `
      <div class="dframe-nav-scroll flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden" id="sidebar">
        <div data-index="99"></div>
      </div>
      <div class="overflow-y-auto overflow-x-hidden flex-1" data-autoscroll-container="true">
        <div data-index="2"></div><div data-index="3"></div>
      </div>`;

    expect(extractor.getMessageWatermark()).toBe(3);
  });

  it('is null when no virtual row is mounted', () => {
    document.body.innerHTML = '<div class="font-claude-response">no wrapper</div>';

    expect(extractor.getMessageWatermark()).toBeNull();
  });

  it('ignores rows whose data-index is not a number', () => {
    document.body.innerHTML = '<div data-index="4"></div><div data-index="header"></div>';

    expect(extractor.getMessageWatermark()).toBe(4);
  });

  it('reports the ordinal of the newest turn the extraction covered', async () => {
    mountVirtualizedClaude(conversation, 3); // ends pinned at the top
    extractor.applySettings(settings());

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data?.messageWatermark).toBe(5);
    // ...and the DOM alone could not have told us: the pass ended at the top.
    expect(extractor.getMessageWatermark()).toBeLessThan(5);
  });

  it('falls back to the mounted window when auto-scroll is off', async () => {
    mountVirtualizedClaude(conversation, 3);
    extractor.applySettings(settings({ enableAutoScroll: false }));

    const promise = extractor.extract();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data?.messageWatermark).toBe(5);
  });
});
