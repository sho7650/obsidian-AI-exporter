/**
 * Content-script image capture.
 *
 * Runs inside the page context, so it can resolve blob: URLs that the
 * background service worker cannot (blob URLs are origin- and context-scoped).
 * Captured bytes are base64-encoded for structured-clone message passing.
 */

import { MAX_IMAGE_SIZE_BYTES, bytesToBase64, isAllowedImageMime } from '../lib/image-utils';
import { getErrorMessage } from '../lib/error-utils';
import type { ExtractedImage, ImageFetchResponse } from '../lib/types';

/**
 * Outcome of capturing one image.
 *
 * A failure used to be an unqualified `null` that the caller dropped in
 * silence, so a lost image left nothing behind but an empty assistant message —
 * indistinguishable from image export being switched off. The reason travels
 * with the result now so it can be logged and surfaced.
 */
export interface ImageCaptureResult {
  image: ExtractedImage | null;
  /** Present only on failure. */
  reason?: string;
}

function captureFailed(reason: string): ImageCaptureResult {
  return { image: null, reason };
}

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
 * Ask the background worker to fetch a remote image the page is not allowed to.
 *
 * Gemini now serves generated images from `https://lh3.googleusercontent.com/…`,
 * which returns no `Access-Control-Allow-Origin`. Content scripts are subject
 * to CORS even when the extension holds host permissions, so fetching here
 * fails; the worker is exempt (issue #376).
 */
async function fetchRemoteImage(
  url: string,
  id: string,
  alt: string
): Promise<ExtractedImage | null> {
  return (await fetchRemoteImageDetailed(url, id, alt)).image;
}

/**
 * As {@link fetchRemoteImage}, but keeping the worker's reason for a failure
 * instead of collapsing it into `null`.
 */
async function fetchRemoteImageDetailed(
  url: string,
  id: string,
  alt: string
): Promise<ImageCaptureResult> {
  try {
    const response = (await chrome.runtime.sendMessage({
      action: 'fetchImage',
      url,
    })) as ImageFetchResponse | undefined;

    if (!response?.success) {
      return captureFailed(response?.error ?? 'background fetch returned no response');
    }
    return {
      image: { id, mimeType: response.mimeType, data: response.data, alt, sourceUrl: url },
    };
  } catch (error) {
    // Service worker asleep or message channel closed — skip this image.
    return captureFailed(`background fetch unavailable: ${getErrorMessage(error)}`);
  }
}

/**
 * Fetch an image from the page and return it as an {@link ExtractedImage} with
 * base64 data. Returns `null` on any failure (network error, non-OK response,
 * oversized image, unsupported type) so a single bad image never aborts the
 * whole extraction.
 *
 * `blob:` URLs are read here because only the page context can resolve them.
 * Everything else is delegated to the background worker, which is not bound by
 * the page's CORS rules (issue #376).
 */
export async function fetchImageAsBase64(
  url: string,
  id: string,
  alt: string
): Promise<ExtractedImage | null> {
  if (!url.startsWith('blob:')) {
    return fetchRemoteImage(url, id, alt);
  }

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

/** Data-URL prefix produced by `canvas.toDataURL('image/png')`. */
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

/** Approximate decoded byte length of a base64 payload. */
function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Read the bytes back out of an already-rendered `<img>` via a canvas.
 *
 * This is the only way left to reach a generated image whose `blob:` URL Gemini
 * has revoked: the URL no longer resolves — not even from the page's own main
 * world — while the element keeps its decoded bitmap and goes on rendering.
 *
 * Only same-origin sources can be read this way. Drawing cross-origin data
 * without CORS approval taints the canvas, and `toDataURL()` then throws a
 * SecurityError (MDN). That is why https CDN sources keep going through the
 * service worker instead — and it is measured, not assumed: the CDN serves no
 * `Access-Control-Allow-Origin`, so even `crossOrigin="anonymous"` fails to load.
 *
 * PNG is used because the original encoding is unrecoverable once the image is
 * decoded. It costs size — a 131KB JPEG measured 1.19MB as re-encoded PNG — so
 * this path runs only when the original bytes are genuinely out of reach.
 */
function captureFromElement(
  element: HTMLImageElement,
  id: string,
  alt: string,
  sourceUrl: string
): ImageCaptureResult {
  if (!element.complete || element.naturalWidth === 0) {
    // Generated images carry loading="lazy": an off-screen one may not have
    // decoded yet, and drawing it would yield a blank picture.
    return captureFailed('image had not finished loading (decode incomplete)');
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return captureFailed('2d canvas context unavailable');
    context.drawImage(element, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
      return captureFailed('canvas returned an unexpected data URL');
    }

    const data = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
    if (base64ByteLength(data) > MAX_IMAGE_SIZE_BYTES) {
      return captureFailed('re-encoded image exceeds the size limit');
    }
    return { image: { id, mimeType: 'image/png', data, alt, sourceUrl } };
  } catch (error) {
    // A tainted canvas lands here (SecurityError).
    return captureFailed(`canvas capture failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Capture one generated image, choosing the only mechanism that can work for
 * its source form.
 *
 * - `blob:` — read the URL if it is still alive (that keeps the original
 *   encoding), otherwise recover the bytes from the rendered element.
 * - anything else — delegate to the service worker, which is exempt from the
 *   CORS rules the page is bound by.
 *
 * The two forms are not interchangeable and no cross-fallback is attempted:
 * a canvas read of an https source always raises SecurityError, and the
 * worker's allow-list rejects `blob:` by design.
 */
export async function captureImage(
  element: HTMLImageElement,
  id: string,
  alt: string
): Promise<ImageCaptureResult> {
  const src = element.getAttribute('src') ?? '';
  if (!src) return captureFailed('image element has no src');

  if (!src.startsWith('blob:')) {
    const remote = await fetchRemoteImageDetailed(src, id, alt);
    return remote;
  }

  const viaUrl = await fetchImageAsBase64(src, id, alt);
  if (viaUrl) return { image: viaUrl };

  return captureFromElement(element, id, alt, src);
}
