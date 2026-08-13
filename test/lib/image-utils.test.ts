import { describe, it, expect } from 'vitest';
import {
  mimeToExtension,
  base64ToBytes,
  bytesToBase64,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  isAllowedImageMime,
  isLikelyBase64,
  isAllowedImageSourceUrl,
  IMAGE_CDN_REDIRECT_HOSTS,
} from '../../src/lib/image-utils';

describe('mimeToExtension', () => {
  it('maps common image MIME types to extensions', () => {
    expect(mimeToExtension('image/png')).toBe('png');
    expect(mimeToExtension('image/jpeg')).toBe('jpg');
    expect(mimeToExtension('image/gif')).toBe('gif');
    expect(mimeToExtension('image/webp')).toBe('webp');
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
    // SVG is deliberately absent: image bytes are written to the vault without
    // passing through DOMPurify, and SVG is the one raster-adjacent format that
    // can carry script. Obsidian accepts .svg embeds, so excluding it here is
    // the only gate.
    expect(ALLOWED_IMAGE_MIME_TYPES.has('image/svg+xml')).toBe(false);
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

/**
 * Gemini serves generated images from googleusercontent.com, which sends no
 * `Access-Control-Allow-Origin` header — so the content script cannot fetch
 * them (Chrome: content scripts are subject to CORS even with host
 * permissions). The background worker fetches them instead, and this allow-list
 * is what stops that worker from being usable as an open SSRF proxy (issue #376).
 */
describe('isAllowedImageSourceUrl', () => {
  it('allows the googleusercontent image CDN over https', () => {
    expect(isAllowedImageSourceUrl('https://lh3.googleusercontent.com/gg/AbC123=s1024-rj')).toBe(
      true
    );
  });

  it('allows other googleusercontent subdomains (lh4/lh5/lh6 rotate)', () => {
    expect(isAllowedImageSourceUrl('https://lh6.googleusercontent.com/rd-gg/x')).toBe(true);
  });

  it('allows the apex domain', () => {
    expect(isAllowedImageSourceUrl('https://googleusercontent.com/x')).toBe(true);
  });

  it('rejects http (downgrade)', () => {
    expect(isAllowedImageSourceUrl('http://lh3.googleusercontent.com/gg/x')).toBe(false);
  });

  it('rejects a look-alike suffix host', () => {
    expect(isAllowedImageSourceUrl('https://evilgoogleusercontent.com/x')).toBe(false);
  });

  it('rejects a host that merely contains the domain', () => {
    expect(isAllowedImageSourceUrl('https://googleusercontent.com.evil.test/x')).toBe(false);
  });

  it('rejects the domain placed in userinfo', () => {
    expect(isAllowedImageSourceUrl('https://googleusercontent.com@evil.test/x')).toBe(false);
  });

  it('rejects unrelated hosts', () => {
    expect(isAllowedImageSourceUrl('https://127.0.0.1:27123/vault/secret.md')).toBe(false);
  });

  it.each(IMAGE_CDN_REDIRECT_HOSTS)('rejects the redirect target %s', host => {
    // Deliberately connectable (manifest CSP + host_permissions) and
    // deliberately not a source: the browser may take us there by following a
    // 30x, but nothing may send us there by naming it (ADR-030). The reachable
    // half is asserted in test/arch/csp-connect-src.test.ts.
    expect(isAllowedImageSourceUrl(`https://${host}/rd-gg/ACRwjas`)).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isAllowedImageSourceUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedImageSourceUrl('blob:https://gemini.google.com/abc')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isAllowedImageSourceUrl('not a url')).toBe(false);
    expect(isAllowedImageSourceUrl('')).toBe(false);
  });
});
