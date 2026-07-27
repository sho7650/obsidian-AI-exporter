/**
 * Remote image fetching for the background service worker.
 *
 * Gemini serves generated images from googleusercontent.com, which sends no
 * `Access-Control-Allow-Origin` header. Per Chrome's network-request docs,
 * "cross-origin requests are always treated as such in content scripts, even if
 * the extension has host permissions" — so the in-page fetch was blocked and
 * every generated image was silently dropped (issue #376). The service worker
 * IS granted the exemption, so remote images are fetched here instead.
 */

import {
  MAX_IMAGE_SIZE_BYTES,
  bytesToBase64,
  isAllowedImageMime,
  isAllowedImageSourceUrl,
} from '../lib/image-utils';
import { extractErrorMessage } from '../lib/error-utils';
import type { ImageFetchResponse } from '../lib/types';

/** Blobs from the CDN often omit a type; `<img>` renders them as PNG. */
const DEFAULT_IMAGE_MIME = 'image/png';

function failure(error: string): ImageFetchResponse {
  return { success: false, error };
}

/**
 * Fetch a remote image and return it as base64.
 *
 * The URL is re-validated here rather than trusting the message boundary
 * alone: this worker can reach hosts the page cannot, so an unchecked URL
 * would turn it into an SSRF proxy.
 *
 * @param url - Absolute https URL on the image CDN allow-list
 */
export async function handleFetchImage(url: string): Promise<ImageFetchResponse> {
  if (!isAllowedImageSourceUrl(url)) {
    return failure('Image URL is not allowed');
  }

  try {
    // credentials: 'include' — the page's <img> loads these URLs with cookies;
    // without them the CDN answers 403. Host permissions make this legal.
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      return failure(`Image fetch failed: HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      return failure('Image exceeds the size limit');
    }

    const mimeType = blob.type || DEFAULT_IMAGE_MIME;
    if (!isAllowedImageMime(mimeType)) {
      return failure(`Unsupported image type: ${mimeType}`);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { success: true, data: bytesToBase64(bytes), mimeType };
  } catch (error) {
    return failure(extractErrorMessage(error));
  }
}
