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
 * Allow-list of accepted image MIME types (SSOT: derived from {@link MIME_TO_EXT}).
 * Used at the background input boundary to reject unexpected types.
 */
export const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set(Object.keys(MIME_TO_EXT));

/** Normalize a MIME type the same way {@link mimeToExtension} does. */
function normalizeMime(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/**
 * Map an image MIME type to a file extension.
 * Case-insensitive; ignores parameters (e.g. `; charset=binary`).
 * Falls back to `png` for empty or unrecognized types.
 */
export function mimeToExtension(mimeType: string): string {
  return MIME_TO_EXT[normalizeMime(mimeType)] ?? 'png';
}

/**
 * True when `mimeType` (after case/parameter normalization) is on the image
 * allow-list. Empty or unknown types return false.
 */
export function isAllowedImageMime(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(normalizeMime(mimeType));
}

/** Base64 character set with optional `=` padding (0–2 chars). */
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Cheap structural check that a string is well-formed standard base64
 * (no `data:` prefix): valid charset and a length that is a multiple of 4.
 * The empty string is treated as a valid zero-length payload.
 */
export function isLikelyBase64(data: string): boolean {
  return data.length % 4 === 0 && BASE64_PATTERN.test(data);
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
