import { describe, it, expect } from 'vitest';
import {
  mimeToExtension,
  base64ToBytes,
  bytesToBase64,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  isAllowedImageMime,
  isLikelyBase64,
} from '../../src/lib/image-utils';

describe('mimeToExtension', () => {
  it('maps common image MIME types to extensions', () => {
    expect(mimeToExtension('image/png')).toBe('png');
    expect(mimeToExtension('image/jpeg')).toBe('jpg');
    expect(mimeToExtension('image/gif')).toBe('gif');
    expect(mimeToExtension('image/webp')).toBe('webp');
    expect(mimeToExtension('image/svg+xml')).toBe('svg');
    expect(mimeToExtension('image/avif')).toBe('avif');
    expect(mimeToExtension('image/bmp')).toBe('bmp');
  });

  it('is case-insensitive and ignores parameters', () => {
    expect(mimeToExtension('IMAGE/PNG')).toBe('png');
    expect(mimeToExtension('image/jpeg; charset=binary')).toBe('jpg');
  });

  it('falls back to png for unknown or empty MIME types', () => {
    expect(mimeToExtension('application/octet-stream')).toBe('png');
    expect(mimeToExtension('')).toBe('png');
  });
});

describe('base64ToBytes', () => {
  it('decodes base64 into the original bytes', () => {
    // "PNG" -> base64 "UE5H"
    const bytes = base64ToBytes('UE5H');
    expect(Array.from(bytes)).toEqual([0x50, 0x4e, 0x47]);
  });

  it('round-trips arbitrary binary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const b64 = btoa(String.fromCharCode(...original));
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(original));
  });

  it('returns an empty array for empty input', () => {
    expect(base64ToBytes('').length).toBe(0);
  });
});

describe('bytesToBase64', () => {
  it('encodes bytes to base64', () => {
    expect(bytesToBase64(new Uint8Array([0x50, 0x4e, 0x47]))).toBe('UE5H');
  });

  it('round-trips with base64ToBytes across a chunk boundary', () => {
    const original = new Uint8Array(9000).map((_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(original)))).toEqual(Array.from(original));
  });

  it('returns empty string for empty input', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });
});

describe('MAX_IMAGE_SIZE_BYTES', () => {
  it('is a positive limit (10MB)', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('ALLOWED_IMAGE_MIME_TYPES', () => {
  it('is the SSOT allow-list derived from the MIME→extension map', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES.has('image/png')).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPES.has('image/jpeg')).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPES.has('image/webp')).toBe(true);
    expect(ALLOWED_IMAGE_MIME_TYPES.has('image/svg+xml')).toBe(true);
    // Every allowed type maps to a non-empty extension (SSOT parity)
    for (const mime of ALLOWED_IMAGE_MIME_TYPES) {
      expect(mimeToExtension(mime).length).toBeGreaterThan(0);
    }
  });
});

describe('isAllowedImageMime', () => {
  it('accepts allow-listed types', () => {
    expect(isAllowedImageMime('image/png')).toBe(true);
    expect(isAllowedImageMime('image/jpeg')).toBe(true);
  });

  it('normalizes case and strips parameters', () => {
    expect(isAllowedImageMime('IMAGE/PNG')).toBe(true);
    expect(isAllowedImageMime('image/jpeg; charset=binary')).toBe(true);
    expect(isAllowedImageMime('  image/webp  ')).toBe(true);
  });

  it('rejects types outside the allow-list', () => {
    expect(isAllowedImageMime('image/tiff')).toBe(false);
    expect(isAllowedImageMime('application/pdf')).toBe(false);
    expect(isAllowedImageMime('')).toBe(false);
    expect(isAllowedImageMime('text/html')).toBe(false);
  });
});

describe('isLikelyBase64', () => {
  it('accepts well-formed base64 strings', () => {
    expect(isLikelyBase64('UE5H')).toBe(true); // "PNG"
    expect(isLikelyBase64('AAAA')).toBe(true);
    expect(isLikelyBase64('aGVsbG8=')).toBe(true); // "hello"
    expect(isLikelyBase64('YWI=')).toBe(true);
    expect(isLikelyBase64('')).toBe(true); // empty is a valid (0-length) payload
  });

  it('rejects strings with non-base64 characters', () => {
    expect(isLikelyBase64('@@@@')).toBe(false);
    expect(isLikelyBase64('not valid!!')).toBe(false);
    expect(isLikelyBase64('AA AA')).toBe(false);
  });

  it('rejects strings whose length is not a multiple of 4', () => {
    expect(isLikelyBase64('ABC')).toBe(false);
    expect(isLikelyBase64('AAAAA')).toBe(false);
  });
});
