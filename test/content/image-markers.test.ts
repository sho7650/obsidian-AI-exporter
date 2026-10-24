import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageMarkerCollector } from '../../src/content/image-markers';
import { captureImage } from '../../src/content/image-capture';
import type { ExtractionResult } from '../../src/lib/types';

vi.mock('../../src/content/image-capture', () => ({ captureImage: vi.fn() }));

const mockedCapture = vi.mocked(captureImage);

function host(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

function okResult(): ExtractionResult {
  return {
    success: true,
    data: {
      id: 'c1',
      title: 't',
      url: 'https://example.test/c1',
      source: 'chatgpt',
      messages: [],
      extractedAt: new Date(0),
      metadata: { messageCount: 0, userMessageCount: 0, assistantMessageCount: 0 },
    },
  };
}

/**
 * Shared marker pipeline (ADR-041 §3): extracted from GeminiExtractor so a
 * second platform does not copy the rewrite / pending / capture / warning
 * logic. The id scheme is the caller's — Gemini counts, ChatGPT keys on the
 * widget id — and pending entries de-duplicate by id because ChatGPT harvests
 * the same turn once per scroll window.
 */
describe('ImageMarkerCollector', () => {
  let collector: ImageMarkerCollector;

  beforeEach(() => {
    collector = new ImageMarkerCollector();
    mockedCapture.mockReset();
  });

  describe('rewrite', () => {
    it('replaces each matching <img> with a data-g2o-image marker on a clone', () => {
      const el = host('<p>text</p><img class="gen" src="blob:x" alt="A picture">');

      const html = collector.rewrite(el, {
        selector: 'img.gen',
        enabled: true,
        idFor: () => 'img-a',
      });

      expect(html).toContain('<p>text</p>');
      expect(html).toContain('data-g2o-image="img-a"');
      expect(html).toContain('alt="A picture"');
      expect(html).not.toContain('src=');
      // The live DOM is untouched: capture needs the rendered element.
      expect(el.querySelector('img.gen')?.getAttribute('src')).toBe('blob:x');
      expect(collector.pendingCount).toBe(1);
    });

    it('hands idFor the live image and its index', () => {
      const el = host('<img class="gen" src="a"><img class="gen" src="b">');
      const idFor = vi.fn((_img: HTMLImageElement, index: number) => `img-${index}`);

      const html = collector.rewrite(el, { selector: 'img.gen', enabled: true, idFor });

      expect(idFor).toHaveBeenCalledTimes(2);
      expect(idFor.mock.calls[0][0]).toBe(el.querySelectorAll('img.gen')[0]);
      expect(idFor.mock.calls[1][1]).toBe(1);
      expect(html).toContain('data-g2o-image="img-0"');
      expect(html).toContain('data-g2o-image="img-1"');
    });

    it('returns the innerHTML unchanged when nothing matches', () => {
      const el = host('<p>no images</p>');

      expect(collector.rewrite(el, { selector: 'img.gen', enabled: true, idFor: () => 'x' })).toBe(
        '<p>no images</p>'
      );
      expect(collector.pendingCount).toBe(0);
    });

    it('drops the image entirely when export is disabled (no empty ![]() leaks)', () => {
      const el = host('<p>t</p><img class="gen" src="blob:x" alt="A">');

      const html = collector.rewrite(el, { selector: 'img.gen', enabled: false, idFor: () => 'x' });

      expect(html).toBe('<p>t</p>');
      expect(collector.pendingCount).toBe(0);
    });

    it('skips an <img> without src', () => {
      const el = host('<img class="gen" alt="no src">');

      const html = collector.rewrite(el, { selector: 'img.gen', enabled: true, idFor: () => 'x' });

      expect(html).not.toContain('data-g2o-image');
      expect(collector.pendingCount).toBe(0);
    });

    it('de-duplicates pending entries by id, keeping the latest element', () => {
      const first = host('<img class="gen" src="a">');
      const second = host('<img class="gen" src="a">');

      collector.rewrite(first, { selector: 'img.gen', enabled: true, idFor: () => 'img-same' });
      collector.rewrite(second, { selector: 'img.gen', enabled: true, idFor: () => 'img-same' });

      expect(collector.pendingCount).toBe(1);
      expect(collector.pendingElements()).toEqual([second.querySelector('img.gen')]);
    });
  });

  describe('attach', () => {
    it('captures pending images sequentially and attaches them immutably', async () => {
      const el = host('<img class="gen" src="a" alt="A"><img class="gen" src="b" alt="B">');
      collector.rewrite(el, {
        selector: 'img.gen',
        enabled: true,
        idFor: (_i, n) => `img-${n + 1}`,
      });
      mockedCapture.mockImplementation(async (_el, id, alt) => ({
        image: { id, alt, mimeType: 'image/png', data: 'UE5H' },
      }));
      const input = okResult();

      const result = await collector.attach(input);

      expect(result).not.toBe(input);
      expect(input.data?.images).toBeUndefined();
      expect(result.data?.images?.map(i => i.id)).toEqual(['img-1', 'img-2']);
      expect(result.warnings).toBeUndefined();
      expect(mockedCapture).toHaveBeenCalledWith(el.querySelectorAll('img.gen')[0], 'img-1', 'A');
    });

    it('never drops a failed capture in silence: keeps the marker and warns', async () => {
      const el = host('<img class="gen" src="a"><img class="gen" src="b">');
      collector.rewrite(el, { selector: 'img.gen', enabled: true, idFor: (_i, n) => `img-${n}` });
      mockedCapture
        .mockResolvedValueOnce({ image: null, reason: 'HTTP 403' })
        .mockResolvedValueOnce({
          image: { id: 'img-1', alt: '', mimeType: 'image/png', data: 'UE5H' },
        });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await collector.attach({ ...okResult(), warnings: ['existing'] });

      expect(result.data?.images?.map(i => i.id)).toEqual(['img-1']);
      expect(result.warnings).toEqual(['existing', '1 image(s) could not be captured: HTTP 403']);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('img-0'));
    });

    it('passes a failed extraction through untouched', async () => {
      const failed: ExtractionResult = { success: false, error: 'nope' };

      expect(await collector.attach(failed)).toBe(failed);
      expect(mockedCapture).not.toHaveBeenCalled();
    });
  });

  describe('marker ids are normalised to the set the rule accepts (DES-019 §4.8)', () => {
    const A119 = 'a'.repeat(119);
    const markerId = (html: string): string | null =>
      host(html).querySelector('img')?.getAttribute('data-g2o-image') ?? null;
    const mark = (id: string): string =>
      markerId(
        collector.rewrite(host('<img class="gen" src="a">'), {
          selector: 'img.gen',
          enabled: true,
          idFor: () => id,
        })
      ) ?? '';

    it.each([
      ['a valid id, unchanged', 'img-1', 'img-1'],
      ['characters outside the set, replaced and hashed', 'img-a:b-0', 'img-a-b-0-5a2fb79e'],
      ['a different original with the same shape', 'img-a/b-0', 'img-a-b-0-5a34b7b3'],
      ['an id over 128 characters, cut and hashed', `${'a'.repeat(130)}x`, `${A119}-57907058`],
      ['another that differs past the cut', `${'a'.repeat(130)}y`, `${A119}-57907059`],
    ])('%s', (_name, original, expected) => {
      expect(mark(original)).toBe(expected);
    });

    it('keeps the marker and its pending capture on one id', async () => {
      mark('img-a:b-0');
      mark('img-a/b-0');
      mockedCapture.mockImplementation(async (_el, id, alt) => ({
        image: { id, alt, mimeType: 'image/png', data: 'UE5H' },
      }));

      const result = await collector.attach(okResult());

      expect(result.data?.images?.map(i => i.id)).toEqual([
        'img-a-b-0-5a2fb79e',
        'img-a-b-0-5a34b7b3',
      ]);
    });

    it('gives the same original the same id in every harvest window', () => {
      expect(mark('turn:1')).toBe(mark('turn:1'));
      expect(collector.pendingCount).toBe(1);
    });

    it('appends a counter when a different original already took the id', () => {
      const taken = mark('img-a:b-0');
      expect(mark(taken)).toBe(`${taken}-2`);
      // The same original again keeps its counted id.
      expect(mark(taken)).toBe(`${taken}-2`);
      expect(collector.pendingCount).toBe(2);
    });

    it('cuts the base so a counted id stays within 128 characters', () => {
      const taken = mark('c'.repeat(130));
      expect(taken).toHaveLength(128);

      expect(mark(taken)).toBe(`${taken.slice(0, 126)}-2`);
    });

    it('reset() forgets the mapping', () => {
      const taken = mark('img-a:b-0');
      collector.reset();
      expect(mark(taken)).toBe(taken);
    });
  });

  it('reset clears pending images and failures', async () => {
    const el = host('<img class="gen" src="a">');
    collector.rewrite(el, { selector: 'img.gen', enabled: true, idFor: () => 'img-x' });
    mockedCapture.mockResolvedValue({ image: null, reason: 'boom' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await collector.attach(okResult());

    collector.reset();

    expect(collector.pendingCount).toBe(0);
    const clean = await collector.attach(okResult());
    expect(clean.warnings).toBeUndefined();
    expect(clean.data?.images).toEqual([]);
  });
});
