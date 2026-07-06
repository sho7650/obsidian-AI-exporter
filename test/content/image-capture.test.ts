import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchImageAsBase64 } from '../../src/content/image-capture';
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

  it('defaults to image/png when the blob type is missing or non-image', async () => {
    mockFetchBlob(blobLike(new Uint8Array([1, 2, 3]), ''));

    const img = await fetchImageAsBase64('blob:x', 'img-2', 'alt');
    expect(img?.mimeType).toBe('image/png');
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
