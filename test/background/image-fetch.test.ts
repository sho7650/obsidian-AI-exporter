/**
 * Background image fetch (issue #376).
 *
 * Gemini serves generated images from googleusercontent.com with no
 * `Access-Control-Allow-Origin` header. Chrome content scripts are subject to
 * CORS even when the extension holds host permissions, so the in-page fetch is
 * blocked and every generated image was silently dropped. The background worker
 * is exempt, so the fetch moves here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleFetchImage } from '../../src/background/image-fetch';
import { MAX_IMAGE_SIZE_BYTES } from '../../src/lib/image-utils';

const IMAGE_URL = 'https://lh3.googleusercontent.com/gg/AbC123=s1024-rj';

/** Build a Blob-like object (jsdom's Blob lacks a usable arrayBuffer()). */
function blobLike(bytes: Uint8Array, type: string): Blob {
  return {
    size: bytes.byteLength,
    type,
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  } as unknown as Blob;
}

function mockFetchBlob(blob: Blob): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(blob) });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('handleFetchImage', () => {
  it('fetches an allow-listed image and returns base64 data', async () => {
    mockFetchBlob(blobLike(new Uint8Array([0x50, 0x4e, 0x47]), 'image/png'));

    const result = await handleFetchImage(IMAGE_URL);

    expect(result).toEqual({ success: true, data: 'UE5H', mimeType: 'image/png' });
  });

  it('sends credentials so cookie-gated CDN URLs resolve', async () => {
    // The <img> on the page loads these URLs with cookies; an extension fetch
    // without them gets 403. Host permissions let the worker send them.
    const spy = mockFetchBlob(blobLike(new Uint8Array([1]), 'image/png'));

    await handleFetchImage(IMAGE_URL);

    expect(spy).toHaveBeenCalledWith(IMAGE_URL, expect.objectContaining({ credentials: 'include' }));
  });

  it('defaults to image/png when the response carries no type', async () => {
    mockFetchBlob(blobLike(new Uint8Array([1, 2, 3]), ''));

    const result = await handleFetchImage(IMAGE_URL);

    expect(result).toMatchObject({ success: true, mimeType: 'image/png' });
  });

  it('refuses a URL outside the allow-list without issuing a request', async () => {
    const spy = mockFetchBlob(blobLike(new Uint8Array([1]), 'image/png'));

    const result = await handleFetchImage('https://127.0.0.1:27123/vault/secret.md');

    expect(result.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a blob URL (the content script owns that path)', async () => {
    const result = await handleFetchImage('blob:https://gemini.google.com/abc');

    expect(result.success).toBe(false);
  });

  it('reports a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const result = await handleFetchImage(IMAGE_URL);

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });

  it('reports a network error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await handleFetchImage(IMAGE_URL);

    expect(result.success).toBe(false);
  });

  it('rejects an image above the size cap', async () => {
    mockFetchBlob(blobLike(new Uint8Array(1), 'image/png'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: () =>
          Promise.resolve({
            size: MAX_IMAGE_SIZE_BYTES + 1,
            type: 'image/png',
            arrayBuffer: () => Promise.resolve(new Uint8Array(0).buffer),
          } as unknown as Blob),
      })
    );

    const result = await handleFetchImage(IMAGE_URL);

    expect(result.success).toBe(false);
  });

  it('rejects a MIME type outside the image allow-list', async () => {
    mockFetchBlob(blobLike(new Uint8Array([1]), 'image/svg+xml'));

    const result = await handleFetchImage(IMAGE_URL);

    expect(result.success).toBe(false);
  });
});

describe('manifest', () => {
  it('grants host permission for the image CDN the handler fetches', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf-8')
    ) as { host_permissions: string[] };

    // Without this, the background fetch is blocked too and the move is pointless.
    expect(manifest.host_permissions).toContain('https://*.googleusercontent.com/*');
  });
});
