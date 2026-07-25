/**
 * Content-script image capture.
 *
 * Runs inside the page context, so it can resolve blob: URLs that the
 * background service worker cannot (blob URLs are origin- and context-scoped).
 * Captured bytes are base64-encoded for structured-clone message passing.
 */

import { MAX_IMAGE_SIZE_BYTES, bytesToBase64, isAllowedImageMime } from '../lib/image-utils';
import type { ExtractedImage } from '../lib/types';

/**
 * Resolve the MIME type to record for a captured blob, or null when the blob
 * must not be exported.
 *
 * An empty `blob.type` is common for blob: URLs backing an `<img>`, so it keeps
 * the historical `image/png` assumption. A type that IS declared must be on the
 * shared allow-list: unsupported types would otherwise be rejected downstream by
 * `validateImages()`, which fails the ENTIRE note rather than the one image.
 */
function resolveCapturedMime(blobType: string): string | null {
  if (!blobType) return 'image/png';
  return isAllowedImageMime(blobType) ? blobType : null;
}

/**
 * Fetch an image (typically a blob: URL) from the page and return it as an
 * {@link ExtractedImage} with base64 data. Returns `null` on any failure
 * (network error, non-OK response, oversized image, unsupported type) so a
 * single bad image never aborts the whole extraction.
 */
export async function fetchImageAsBase64(
  url: string,
  id: string,
  alt: string
): Promise<ExtractedImage | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      return null;
    }

    const mimeType = resolveCapturedMime(blob.type);
    if (mimeType === null) {
      return null;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const data = bytesToBase64(bytes);

    return { id, mimeType, data, alt, sourceUrl: url };
  } catch {
    // Revoked/expired blob URL, CORS, or read failure — skip this image.
    return null;
  }
}
