/**
 * Message validation for background service worker
 *
 * Security: Validates sender origins and message content
 * to prevent unauthorized access (M-02)
 */

import {
  MAX_CONTENT_SIZE,
  MAX_FILENAME_LENGTH,
  MAX_FRONTMATTER_TITLE_LENGTH,
  MAX_TAGS_COUNT,
  MAX_TAG_LENGTH,
  MAX_VAULT_PATH_LENGTH,
  ALLOWED_ORIGINS,
  VALID_MESSAGE_ACTIONS,
  VALID_OUTPUT_DESTINATIONS,
  VALID_SOURCES,
} from '../lib/constants';
import type { ExtensionMessage, ObsidianNote } from '../lib/types';
import { containsPathTraversal } from '../lib/path-utils';

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

  // Path traversal validation for getExistingFile action
  if (message.action === 'getExistingFile') {
    if (typeof message.fileName !== 'string') {
      return false;
    }
    if (containsPathTraversal(message.fileName)) {
      return false;
    }
    if (typeof message.vaultPath === 'string') {
      if (containsPathTraversal(message.vaultPath)) {
        return false;
      }
      if (message.vaultPath.length > MAX_VAULT_PATH_LENGTH) {
        return false;
      }
    }
  }

  // Detailed validation for saveToObsidian action
  if (message.action === 'saveToObsidian' && message.data) {
    if (!validateNoteData(message.data)) {
      return false;
    }
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

  return true;
}

/**
 * Validate note data structure
 */
function validateNoteData(note: ObsidianNote): boolean {
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

  // Content size limit (DoS prevention)
  if (note.body.length > MAX_CONTENT_SIZE) {
    return false;
  }

  // Frontmatter validation (DES-014 M-8: fail hard when missing)
  if (!note.frontmatter) {
    return false;
  }

  if (
    typeof note.frontmatter.title !== 'string' ||
    note.frontmatter.title.length > MAX_FRONTMATTER_TITLE_LENGTH
  ) {
    return false;
  }
  if (
    typeof note.frontmatter.source !== 'string' ||
    !VALID_SOURCES.includes(note.frontmatter.source as (typeof VALID_SOURCES)[number])
  ) {
    return false;
  }
  if (!Array.isArray(note.frontmatter.tags) || note.frontmatter.tags.length > MAX_TAGS_COUNT) {
    return false;
  }
  // Validate individual tag values: must be strings within length limit
  if (
    !note.frontmatter.tags.every(
      (t: unknown) => typeof t === 'string' && t.length > 0 && t.length <= MAX_TAG_LENGTH
    )
  ) {
    return false;
  }

  // Validate frontmatter URL scheme (prevent javascript: or data: injection)
  if (typeof note.frontmatter.url !== 'string') {
    return false;
  }
  if (note.frontmatter.url.length > 0) {
    try {
      const parsed = new URL(note.frontmatter.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}
