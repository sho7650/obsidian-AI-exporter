import { describe, it, expect } from 'vitest';
import {
  mimeToExtension,
  base64ToBytes,
  bytesToBase64,
  MAX_IMAGE_SIZE_BYTES,
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
