import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchImageAsBase64, captureImage } from '../../src/content/image-capture';
import { MAX_IMAGE_SIZE_BYTES } from '../../src/lib/image-utils';

/** Build a Blob-like object (jsdom's Blob lacks a usable arrayBuffer()). */
function blobLike(bytes: Uint8Array, type: string): Blob {
  return {
    size: bytes.byteLength,
    type,
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  } as unknown as Blob;
}

/** Stub fetch to resolve with the given blob. */
function mockFetchBlob(blob: Blob): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchImageAsBase64', () => {
  it('fetches a blob URL and returns an ExtractedImage with base64 data', async () => {
    const bytes = new Uint8Array([0x50, 0x4e, 0x47]); // "PNG"
    mockFetchBlob(blobLike(bytes, 'image/png'));

    const img = await fetchImageAsBase64(
      'blob:https://gemini.google.com/abc',
      'img-1',
      '（AI 生成）'
    );

    expect(img).not.toBeNull();
    expect(img).toMatchObject({
      id: 'img-1',
      mimeType: 'image/png',
      alt: '（AI 生成）',
      sourceUrl: 'blob:https://gemini.google.com/abc',
    });
    expect(img?.data).toBe('UE5H');
  });

  it('defaults to image/png when the blob type is missing', async () => {
    mockFetchBlob(blobLike(new Uint8Array([1, 2, 3]), ''));

    const img = await fetchImageAsBase64('blob:x', 'img-2', 'alt');
    expect(img?.mimeType).toBe('image/png');
  });

  // The captured bytes are written to the vault verbatim — this is the only
  // content path that never passes through DOMPurify. Anything the shared
  // allow-list does not cover is skipped here rather than forwarded.

  it('returns null for an SVG image (not on the allow-list)', async () => {
    mockFetchBlob(blobLike(new Uint8Array([0x3c, 0x73]), 'image/svg+xml'));

    const img = await fetchImageAsBase64('blob:x', 'img-svg', 'alt');
    expect(img).toBeNull();
  });

  it('returns null for a non-image blob type', async () => {
    mockFetchBlob(blobLike(new Uint8Array([1, 2, 3]), 'text/html'));

    const img = await fetchImageAsBase64('blob:x', 'img-html', 'alt');
    expect(img).toBeNull();
  });

  it('returns null for an image type outside the allow-list', async () => {
    // Would otherwise reach the background, where validateImages() rejects the
    // WHOLE note — one unsupported image must not cost the conversation.
    mockFetchBlob(blobLike(new Uint8Array([1, 2, 3]), 'image/heic'));

    const img = await fetchImageAsBase64('blob:x', 'img-heic', 'alt');
    expect(img).toBeNull();
  });

  it('accepts an allow-listed type carrying parameters', async () => {
    mockFetchBlob(blobLike(new Uint8Array([0x50, 0x4e, 0x47]), 'image/PNG; charset=binary'));

    const img = await fetchImageAsBase64('blob:x', 'img-param', 'alt');
    expect(img?.mimeType).toBe('image/PNG; charset=binary');
  });

  it('returns null when the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const img = await fetchImageAsBase64('blob:x', 'img-3', 'alt');
    expect(img).toBeNull();
  });

  it('returns null when fetch throws (revoked/expired blob URL)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const img = await fetchImageAsBase64('blob:x', 'img-4', 'alt');
    expect(img).toBeNull();
  });

  it('returns null when the image exceeds the size limit', async () => {
    const bigBlob = { size: MAX_IMAGE_SIZE_BYTES + 1, type: 'image/png' } as Blob;
    mockFetchBlob(bigBlob);

    const img = await fetchImageAsBase64('blob:x', 'img-5', 'alt');
    expect(img).toBeNull();
  });
});

/**
 * Gemini switched generated images from `blob:` to
 * `https://lh3.googleusercontent.com/...`, which the page cannot fetch (CORS —
 * content scripts get no host-permission exemption). Those URLs are delegated
 * to the background worker; `blob:` still has to be read in the page, because
 * only the page can resolve it (issue #376).
 */
describe('fetchImageAsBase64 — remote (https) sources', () => {
  function mockSendMessage(response: unknown): ReturnType<typeof vi.fn> {
    const spy = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('chrome', { runtime: { sendMessage: spy } });
    return spy;
  }

  it('delegates an https URL to the background worker', async () => {
    const spy = mockSendMessage({ success: true, data: 'UE5H', mimeType: 'image/png' });
    const pageFetch = vi.fn();
    vi.stubGlobal('fetch', pageFetch);

    const img = await fetchImageAsBase64(
      'https://lh3.googleusercontent.com/gg/AbC=s1024-rj',
      'img-1',
      '（AI 生成）'
    );

    expect(spy).toHaveBeenCalledWith({
      action: 'fetchImage',
      url: 'https://lh3.googleusercontent.com/gg/AbC=s1024-rj',
    });
    // The page must NOT attempt the blocked cross-origin fetch.
    expect(pageFetch).not.toHaveBeenCalled();
    expect(img).toMatchObject({
      id: 'img-1',
      mimeType: 'image/png',
      data: 'UE5H',
      alt: '（AI 生成）',
      sourceUrl: 'https://lh3.googleusercontent.com/gg/AbC=s1024-rj',
    });
  });

  it('returns null when the worker reports failure', async () => {
    mockSendMessage({ success: false, error: 'HTTP 403' });

    const img = await fetchImageAsBase64('https://lh3.googleusercontent.com/gg/x', 'img-1', '');

    expect(img).toBeNull();
  });

  it('returns null when the message channel throws', async () => {
    const spy = vi.fn().mockRejectedValue(new Error('disconnected'));
    vi.stubGlobal('chrome', { runtime: { sendMessage: spy } });

    const img = await fetchImageAsBase64('https://lh3.googleusercontent.com/gg/x', 'img-1', '');

    expect(img).toBeNull();
  });

  it('still reads blob URLs in the page, without messaging', async () => {
    const spy = mockSendMessage({ success: true, data: 'AAAA', mimeType: 'image/png' });
    mockFetchBlob(blobLike(new Uint8Array([0x50, 0x4e, 0x47]), 'image/png'));

    const img = await fetchImageAsBase64('blob:https://gemini.google.com/abc', 'img-1', '');

    expect(spy).not.toHaveBeenCalled();
    expect(img?.data).toBe('UE5H');
  });
});

// ===== capture from the rendered element (issue: Gemini revokes blob URLs) =====
//
// Measured live on 2026-08-06/07 against gemini.google.com:
//
//   src form   page fetch   isolated fetch   canvas(in place)   background fetch
//   blob:      FAILS        FAILS            OK (image/png)     n/a (allow-list)
//   https:     FAILS(CORS)  FAILS(CORS)      SecurityError      200 image/jpeg
//
// The blob URL fails even from the page's own main world while the <img> still
// renders, which means Gemini revokes it once the image has decoded (MDN: the
// browser is told "not to keep the reference to the file any longer"). The
// element keeps the decoded bitmap, so canvas is the only way left to reach the
// bytes. For https the canvas is tainted — MDN: drawing cross-origin data
// without CORS approval taints the canvas and toDataURL throws SecurityError —
// so that form must keep going through the service worker.
//
// jsdom has no canvas implementation, so these tests stub it. The real proof is
// the live verification recorded in the ADR.

/** An <img> that reports itself as fully decoded at the given size. */
function loadedImage(src: string, width = 4, height = 2): HTMLImageElement {
  const img = document.createElement('img');
  img.setAttribute('src', src);
  Object.defineProperty(img, 'complete', { value: true, configurable: true });
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  return img;
}

/** Stub canvas so drawImage/toDataURL behave like a browser's. */
function mockCanvas(dataUrl: string | (() => never)): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() =>
    typeof dataUrl === 'function' ? dataUrl() : dataUrl
  );
}

describe('captureImage', () => {
  it('falls back to the canvas when the blob URL has been revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mockCanvas('data:image/png;base64,UE5H');

    const result = await captureImage(loadedImage('blob:https://gemini.google.com/x'), 'img-1', 'a');

    expect(result.image).toMatchObject({ id: 'img-1', mimeType: 'image/png', data: 'UE5H', alt: 'a' });
    expect(result.reason).toBeUndefined();
  });

  it('prefers the original bytes while the blob URL is still alive', async () => {
    // A live blob keeps the source encoding; re-encoding through the canvas
    // would inflate a 131KB JPEG to a ~1.19MB PNG (both measured live).
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () =>
          Promise.resolve({
            size: bytes.byteLength,
            type: 'image/jpeg',
            arrayBuffer: () => Promise.resolve(bytes.buffer),
          } as unknown as Blob),
      })
    );
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');

    const result = await captureImage(loadedImage('blob:https://gemini.google.com/y'), 'img-2', '');

    expect(result.image?.mimeType).toBe('image/jpeg');
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('reports a reason when the canvas is tainted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mockCanvas(() => {
      throw new Error('SecurityError: Tainted canvases may not be exported.');
    });

    const result = await captureImage(loadedImage('blob:https://gemini.google.com/z'), 'img-3', '');

    expect(result.image).toBeNull();
    expect(result.reason).toMatch(/tainted|SecurityError/i);
  });

  it('does not capture from an element that has not finished loading', async () => {
    // The generated <img> carries loading="lazy" (measured), so an off-screen
    // image can still be undecoded — drawing it would yield a blank picture.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    mockCanvas('data:image/png;base64,UE5H');
    const img = document.createElement('img');
    img.setAttribute('src', 'blob:https://gemini.google.com/w');
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { value: 0, configurable: true });

    const result = await captureImage(img, 'img-4', '');

    expect(result.image).toBeNull();
    expect(result.reason).toMatch(/load|decode/i);
  });

  it('routes an https source to the service worker and never touches the canvas', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      success: true,
      data: '/9j/',
      mimeType: 'image/jpeg',
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');

    const result = await captureImage(
      loadedImage('https://lh3.googleusercontent.com/gg/abc'),
      'img-5',
      'alt'
    );

    expect(result.image).toMatchObject({ id: 'img-5', mimeType: 'image/jpeg', data: '/9j/' });
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'fetchImage',
      url: 'https://lh3.googleusercontent.com/gg/abc',
    });
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('reports the worker’s reason when the remote fetch fails', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ success: false, error: 'HTTP 403' }),
      },
    });

    const result = await captureImage(
      loadedImage('https://lh3.googleusercontent.com/gg/def'),
      'img-6',
      ''
    );

    expect(result.image).toBeNull();
    expect(result.reason).toContain('403');
  });

  it('rejects a canvas capture that exceeds the size limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const oversized = 'A'.repeat(Math.ceil((MAX_IMAGE_SIZE_BYTES + 1024) / 3) * 4);
    mockCanvas(`data:image/png;base64,${oversized}`);

    const result = await captureImage(loadedImage('blob:https://gemini.google.com/big'), 'img-7', '');

    expect(result.image).toBeNull();
    expect(result.reason).toMatch(/size|limit/i);
  });
});
