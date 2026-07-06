/**
 * Shared, environment-agnostic image helpers.
 *
 * These run in both the content script and the background service worker,
 * so they rely only on universally-available primitives (`atob`, strings).
 * Blob/FileReader-based capture lives in the content layer (image-capture.ts).
 */

/** Maximum accepted image size in bytes (10MB safety guard). */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** MIME type → file extension. Unknown types fall back to `png`. */
const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

/**
 * Map an image MIME type to a file extension.
 * Case-insensitive; ignores parameters (e.g. `; charset=binary`).
 * Falls back to `png` for empty or unrecognized types.
 */
export function mimeToExtension(mimeType: string): string {
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  return MIME_TO_EXT[normalized] ?? 'png';
}

/** Chunk size for base64 encoding — bounds the String.fromCharCode arg count. */
const BASE64_CHUNK_SIZE = 8192;

/**
 * Encode raw bytes to a base64 string (no `data:` prefix).
 * Chunked to avoid call-stack overflow on multi-MB images.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE)));
  }
  return btoa(parts.join(''));
}

/**
 * Decode a base64 string (no `data:` prefix) into raw bytes.
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (base64.length === 0) {
    return new Uint8Array(0);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
