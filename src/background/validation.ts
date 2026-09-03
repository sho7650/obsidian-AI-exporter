/**
 * Message validation for background service worker
 *
 * Security: Validates sender origins and message content
 * to prevent unauthorized access (M-02)
 */

import {
  MAX_FILENAME_LENGTH,
  MAX_FRONTMATTER_TITLE_LENGTH,
  MAX_TAGS_COUNT,
  MAX_TAG_LENGTH,
  MAX_IMAGES_PER_NOTE,
  MAX_IMAGE_DATA_LENGTH,
  MAX_TOTAL_IMAGE_DATA_LENGTH,
  ALLOWED_ORIGINS,
  VALID_MESSAGE_ACTIONS,
  VALID_OUTPUT_DESTINATIONS,
  VALID_SOURCES,
} from '../lib/constants';
import type { ExtensionMessage, ExtractedImage, ObsidianNote } from '../lib/types';
import { containsPathTraversal } from '../lib/path-utils';
import { isHttpUrl } from '../lib/validation';
import { isAllowedImageMime, isLikelyBase64, isAllowedImageSourceUrl } from '../lib/image-utils';

/**
 * Validate message sender (M-02)
 *
 * Security: Only accept messages from:
 * - Popup (same extension)
 * - Content scripts from allowed origins
 */
export function validateSender(sender: chrome.runtime.MessageSender): boolean {
  // Allow messages from popup (same extension)
  if (sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    return true;
  }

  // Validate content script origin
  if (sender.tab?.url) {
    try {
      const url = new URL(sender.tab.url);
      return ALLOWED_ORIGINS.some(origin => url.origin === origin);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Validate message content (M-02)
 *
 * Security: Content scripts are less trustworthy.
 * Validate and sanitize all input per Chrome extension best practices.
 */
export function validateMessageContent(message: ExtensionMessage): boolean {
  // Validate action against whitelist (using centralized constants)
  if (!VALID_MESSAGE_ACTIONS.includes(message.action as (typeof VALID_MESSAGE_ACTIONS)[number])) {
    return false;
  }

  // Detailed validation for saveToOutputs action
  if (message.action === 'saveToOutputs') {
    if (!validateNoteData(message.data)) {
      return false;
    }
    // Validate outputs array (using centralized constants)
    if (!Array.isArray(message.outputs) || message.outputs.length === 0) {
      return false;
    }
    if (
      !message.outputs.every(o =>
        VALID_OUTPUT_DESTINATIONS.includes(o as (typeof VALID_OUTPUT_DESTINATIONS)[number])
      )
    ) {
      return false;
    }
  }

  // The worker can reach hosts the page cannot, so a fetchImage URL is only
  // accepted for the image CDN allow-list (issue #376). Re-checked in the
  // handler; rejecting here keeps a bad URL from ever reaching it.
  if (message.action === 'fetchImage') {
    if (typeof message.url !== 'string' || !isAllowedImageSourceUrl(message.url)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate note data structure
 */
/**
 * The truncation flag is the one optional field the content script may add to
 * a note (issue #449); anything else in its place is a malformed message.
 */
function hasValidTruncatedFlag(note: unknown): boolean {
  if (typeof note !== 'object' || note === null) return true;
  const flag = (note as { truncated?: unknown }).truncated;
  return flag === undefined || typeof flag === 'boolean';
}

function validateNoteData(note: ObsidianNote | undefined): boolean {
  if (!hasValidTruncatedFlag(note)) return false;
  // Messages arrive as unvalidated JSON: data may be absent despite the type
  if (!note || typeof note !== 'object') {
    return false;
  }

  // Required field validation
  if (typeof note.fileName !== 'string' || typeof note.body !== 'string') {
    return false;
  }

  // File name length limits (filesystem constraints)
  if (note.fileName.length === 0 || note.fileName.length > MAX_FILENAME_LENGTH) {
    return false;
  }

  // Path traversal prevention (DES-014 H-1)
  if (containsPathTraversal(note.fileName)) {
    return false;
  }

  // The body size cap is a user setting and is applied in handleMultiOutput(),
  // the only place that can read settings (issue #467, ADR-038).

  // Frontmatter validation (DES-014 M-8: fail hard when missing)
  if (!validateFrontmatter(note.frontmatter)) {
    return false;
  }

  // Validate attached images (content scripts are semi-trusted; cap count/size)
  if (note.images !== undefined && !validateImages(note.images)) {
    return false;
  }

  return true;
}

/**
 * Validate note frontmatter: title/source/tags/url within limits and schemes.
 */
function validateFrontmatter(frontmatter: ObsidianNote['frontmatter'] | undefined): boolean {
  if (!frontmatter) {
    return false;
  }
  if (
    typeof frontmatter.title !== 'string' ||
    frontmatter.title.length > MAX_FRONTMATTER_TITLE_LENGTH
  ) {
    return false;
  }
  if (
    typeof frontmatter.source !== 'string' ||
    !VALID_SOURCES.includes(frontmatter.source as (typeof VALID_SOURCES)[number])
  ) {
    return false;
  }
  if (!Array.isArray(frontmatter.tags) || frontmatter.tags.length > MAX_TAGS_COUNT) {
    return false;
  }
  if (
    !frontmatter.tags.every(
      (t: unknown) => typeof t === 'string' && t.length > 0 && t.length <= MAX_TAG_LENGTH
    )
  ) {
    return false;
  }
  // Validate URL scheme (prevent javascript: or data: injection)
  if (typeof frontmatter.url !== 'string') {
    return false;
  }
  return frontmatter.url.length === 0 || isHttpUrl(frontmatter.url);
}

/**
 * Validate attached image data (DoS guard). Content scripts are semi-trusted,
 * so bound the image count, per-image base64 size, and combined base64 size,
 * restrict MIME types to a shared allow-list, and require each entry to carry
 * well-formed base64 data.
 */
function validateImages(images: unknown): boolean {
  if (!Array.isArray(images) || images.length > MAX_IMAGES_PER_NOTE) {
    return false;
  }
  let totalDataLength = 0;
  for (const image of images as Array<Partial<ExtractedImage> | null | undefined>) {
    const wellFormed =
      !!image &&
      typeof image === 'object' &&
      typeof image.id === 'string' &&
      typeof image.mimeType === 'string' &&
      typeof image.alt === 'string' &&
      typeof image.data === 'string' &&
      image.data.length <= MAX_IMAGE_DATA_LENGTH &&
      isAllowedImageMime(image.mimeType) &&
      isLikelyBase64(image.data);
    if (!wellFormed) {
      return false;
    }
    totalDataLength += image.data.length;
    if (totalDataLength > MAX_TOTAL_IMAGE_DATA_LENGTH) {
      return false;
    }
  }
  return true;
}
