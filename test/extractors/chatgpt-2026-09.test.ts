/**
 * ChatGPTExtractor against the 2026-09 conversation DOM (issue #515).
 *
 * Each ChatGPT Turn now holds a user prompt and its answer; the extractor turns
 * it into up to two Messages (CONTEXT.md). The pre-2026-09 layout stays covered
 * by chatgpt.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatGPTExtractor } from '../../src/content/extractors/chatgpt';
import {
  loadFixture,
  clearFixture,
  resetLocation,
  setChatGPTLocation,
} from '../fixtures/dom-helpers';
import {
  createChatGPT2026Page,
  renderPairTurn,
  type PairTurn,
} from '../fixtures/chatgpt-2026-09-dom';
import type { SyncSettings } from '../../src/lib/types';

/** Plain text of a message body via the DOM. */
function plainText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}

/**
 * Mount a virtualized 2026-09 thread: a column-reverse scroller (scrollTop 0 at
 * the bottom, negative upward) that mounts `windowSize` turns around the view
 * and, like the live page, loads the next older page only after the view has
 * rested at the top for `loadDelayMs`. Turns are 500px tall.
 *
 * @param pages Page sizes, newest first; the newest page is loaded on open.
 */
function mountVirtualized2026(
  turns: readonly PairTurn[],
  opts: { windowSize: number; pages: readonly number[]; loadDelayMs: number }
): void {
  document.body.innerHTML = createChatGPT2026Page([]);
  const scroller = document.querySelector<HTMLElement>('[data-app-action-timeline-scroll]')!;
  const list = scroller.firstElementChild as HTMLElement;
  const clientHeight = 900;
  const turnHeight = 500;
  let loadedPages = 1;
  let loaded = opts.pages[0];
  let scrollTop = 0;
  let atTopSince: number | null = null;

  const maxScroll = () => Math.max(0, loaded * turnHeight - clientHeight);
  const render = () => {
    const first = turns.length - loaded;
    const distance = scrollTop + maxScroll();
    const start = Math.min(loaded - opts.windowSize, Math.max(0, Math.floor(distance / turnHeight)));
    list.innerHTML = turns
      .slice(first + Math.max(0, start), first + Math.max(0, start) + opts.windowSize)
      .map((t, i) => renderPairTurn(t, i))
      .join('');
  };
  const maybeLoad = () => {
    const atTop = maxScroll() > 0 && scrollTop <= -maxScroll();
    if (!atTop) {
      atTopSince = null;
      return;
    }
    atTopSince ??= Date.now();
    if (loadedPages < opts.pages.length && Date.now() - atTopSince >= opts.loadDelayMs) {
      loaded += opts.pages[loadedPages++];
      atTopSince = null;
      render();
    }
  };

  Object.defineProperty(scroller, 'scrollTop', {
    get: () => {
      maybeLoad();
      return scrollTop;
    },
    set: (v: number) => {
      scrollTop = Math.max(-maxScroll(), Math.min(0, v));
      maybeLoad();
      render();
    },
    configurable: true,
  });
  Object.defineProperty(scroller, 'clientHeight', { get: () => clientHeight, configurable: true });
  Object.defineProperty(scroller, 'scrollHeight', {
    get: () => maxScroll() + clientHeight,
    configurable: true,
  });
  render();
}

describe('ChatGPTExtractor — 2026-09 layout (issue #515)', () => {
  let extractor: ChatGPTExtractor;

  beforeEach(() => {
    extractor = new ChatGPTExtractor();
    setChatGPTLocation('6789abcd-ef01-2345-6789-abcdef012345');
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('extractMessages', () => {
    it('splits each turn into its user prompt and its answer, in conversation order', () => {
      loadFixture(
        createChatGPT2026Page([
          { key: 'u-1', user: 'First question', answers: ['<p>First answer</p>'] },
          { key: 'u-2', user: 'Second question', answers: ['<p>Second answer</p>'] },
        ])
      );

      const messages = extractor.extractMessages();

      expect(messages.map(m => [m.role, plainText(m.content)])).toEqual([
        ['user', 'First question'],
        ['assistant', 'First answer'],
        ['user', 'Second question'],
        ['assistant', 'Second answer'],
      ]);
      expect(messages.map(m => m.index)).toEqual([0, 1, 2, 3]);
    });

    it('keeps two turns apart when their data-turn-key is empty', () => {
      // An empty key would give both turns the keys ":user"/":assistant", and
      // de-duplication would silently drop one of them.
      loadFixture(
        createChatGPT2026Page([
          { key: '', user: 'First question', answers: ['<p>First answer</p>'] },
          { key: '', user: 'Second question', answers: ['<p>Second answer</p>'] },
        ])
      );

      const messages = extractor.extractMessages();

      expect(new Set(messages.map(m => m.id)).size).toBe(4);
      expect(messages.map(m => plainText(m.content))).toEqual([
        'First question',
        'First answer',
        'Second question',
        'Second answer',
      ]);
    });

    it('leaves the date separator that opens a turn out of both messages', () => {
      loadFixture(
        createChatGPT2026Page([
          {
            key: 'u-1',
            user: 'Question',
            answers: ['<p>Answer</p>'],
            dateSeparator: 'Thu, Jan 29 at 4:47 PM',
          },
        ])
      );

      const messages = extractor.extractMessages();

      expect(messages.map(m => plainText(m.content))).toEqual(['Question', 'Answer']);
    });

    it('joins a multi-block answer into one assistant message, in order (issue #281)', () => {
      loadFixture(
        createChatGPT2026Page([
          { key: 'u-1', user: 'Question', answers: ['<p>Part one</p>', '<p>Part two</p>'] },
        ])
      );

      const messages = extractor.extractMessages();

      expect(messages).toHaveLength(2);
      expect(plainText(messages[1].content)).toBe('Part one\n\nPart two');
    });
  });

  describe('extract with auto-scroll', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('collects every message of a column-reverse thread, including older pages that load late at the top', async () => {
      // 12 turns in pages of 4; each older page arrives 1.8s after the view
      // reaches the top. The stability window alone gives up after ~1.6s; the
      // ChatGPT settle time (2s) must keep the pass waiting. Live loads took
      // 69-138ms with the tab visible — the delay here only has to fall between
      // the two thresholds to tell them apart.
      const turns: PairTurn[] = Array.from({ length: 12 }, (_, i) => ({
        key: `u-${i}`,
        user: `Q${i}`,
        answers: [`<p>A${i}</p>`],
      }));
      mountVirtualized2026(turns, { windowSize: 3, pages: [4, 4, 4], loadDelayMs: 1800 });
      extractor.applySettings({ enableAutoScroll: true } as SyncSettings);

      const promise = extractor.extract();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.warnings ?? []).toEqual([]);
      expect(result.data!.messages.map(m => plainText(m.content))).toEqual(
        turns.flatMap(t => [t.user, `A${t.key.slice(2)}`])
      );
    });
  });

  describe('getTitle', () => {
    it('falls back to the first user prompt when the page title is bare', () => {
      document.title = 'ChatGPT';
      loadFixture(
        createChatGPT2026Page([{ key: 'u-1', user: 'Plan a trip', answers: ['<p>Sure</p>'] }])
      );

      expect(extractor.getTitle()).toBe('Plan a trip');
    });
  });

  describe('getMessageWatermark (issue #465)', () => {
    it('reports no watermark, because the layout has no conversation-wide ordinal', () => {
      // `fallback-turn-N` is renumbered per mounted window; using it would make
      // scrolling up look like a new message. null disarms the badge watcher.
      loadFixture(
        createChatGPT2026Page([
          { key: 'u-1', user: 'Question', answers: ['<p>Answer</p>'] },
          { key: 'u-2', user: 'Question 2', answers: ['<p>Answer 2</p>'] },
        ])
      );

      expect(extractor.getMessageWatermark()).toBeNull();
    });
  });

  describe('extract — generated images (ADR-041, 2026-09 update)', () => {
    const BLOB_SRC = 'blob:https://chatgpt.com/490871f7-e2a4-4b35-9d0b-6c1f7f0e2c11';

    function mockImageFetch(bytes: Uint8Array, type = 'image/png'): void {
      const blob = {
        size: bytes.byteLength,
        type,
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      } as unknown as Blob;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
      );
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('turns an image-only answer into a message whose marker is keyed by the answer message id', async () => {
      loadFixture(
        createChatGPT2026Page([
          { key: 'u-1', user: 'Draw a sunrise', answerId: 'msg-a1', images: [BLOB_SRC] },
        ])
      );
      mockImageFetch(new Uint8Array([0x50, 0x4e, 0x47]));

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      const messages = result.data!.messages;
      expect(messages.map(m => m.role)).toEqual(['user', 'assistant']);
      expect(messages[1].content).toContain('data-g2o-image="img-msg-a1-0"');
      expect(messages[1].content).not.toContain('ChatGPT said:');
      expect(result.data!.images).toHaveLength(1);
      expect(result.data!.images![0]).toMatchObject({
        id: 'img-msg-a1-0',
        mimeType: 'image/png',
        data: 'UE5H',
        alt: 'Generated image 1',
      });
    });
  });
});
