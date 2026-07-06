/**
 * Content-script image capture.
 *
 * Runs inside the page context, so it can resolve blob: URLs that the
 * background service worker cannot (blob URLs are origin- and context-scoped).
 * Captured bytes are base64-encoded for structured-clone message passing.
 */

import { MAX_IMAGE_SIZE_BYTES, bytesToBase64 } from '../lib/image-utils';
import type { ExtractedImage } from '../lib/types';

/**
 * Fetch an image (typically a blob: URL) from the page and return it as an
 * {@link ExtractedImage} with base64 data. Returns `null` on any failure
 * (network error, non-OK response, oversized image) so a single bad image
 * never aborts the whole extraction.
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

    const mimeType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const data = bytesToBase64(bytes);

    return { id, mimeType, data, alt, sourceUrl: url };
  } catch {
    // Revoked/expired blob URL, CORS, or read failure — skip this image.
    return null;
  }
}
