/**
 * Application-wide constants
 *
 * Centralizes magic numbers and configuration values for consistency
 * and maintainability.
 */

import type { AIPlatform } from './types';
import { PLATFORM_REGISTRY, ALL_PLATFORMS, platformOrigin } from './platform-registry';

// ============================================================
// String Length Limits
// ============================================================

/** Maximum length for Deep Research report title (characters) */
export const MAX_DEEP_RESEARCH_TITLE_LENGTH = 200;

/** Maximum length for conversation title (characters) */
export const MAX_CONVERSATION_TITLE_LENGTH = 100;

/** Maximum length for filename base (characters) */
export const MAX_FILENAME_BASE_LENGTH = 50;

/** Length of conversation ID suffix in filenames */
export const FILENAME_ID_SUFFIX_LENGTH = 8;

/** Maximum length for a code block language hint (characters) */
export const MAX_LANG_HINT_LENGTH = 30;

// ============================================================
// Validation Limits
// ============================================================

/** Maximum length for filename (filesystem constraint) */
export const MAX_FILENAME_LENGTH = 200;

/** Maximum length for frontmatter title field (characters) */
export const MAX_FRONTMATTER_TITLE_LENGTH = 500;

/** Maximum number of tags allowed in frontmatter */
export const MAX_TAGS_COUNT = 50;

/** Maximum length for a single tag string (characters) */
export const MAX_TAG_LENGTH = 100;

/** Maximum length for vault path (filesystem constraint) */
export const MAX_VAULT_PATH_LENGTH = 200;

/** Minimum length for API key (security constraint) */
export const MIN_API_KEY_LENGTH = 16;

// ============================================================
// Network Configuration
// ============================================================

/** Default Obsidian Local REST API URL */
export const DEFAULT_OBSIDIAN_URL = 'http://127.0.0.1:27123';

/** Minimum valid port number */
export const MIN_PORT = 1024;

/** Maximum valid port number */
export const MAX_PORT = 65535;

/** Default timeout for API requests (milliseconds) */
export const DEFAULT_API_TIMEOUT = 5000;

/** Maximum content size for API requests (1MB) */
export const MAX_CONTENT_SIZE = 1024 * 1024;

/** Maximum number of images accepted per note (DoS guard). */
export const MAX_IMAGES_PER_NOTE = 20;

/** Maximum base64 length for a single image's data (~10MB binary + overhead). */
export const MAX_IMAGE_DATA_LENGTH = 14 * 1024 * 1024;

// ============================================================
// UI Timing
// ============================================================

/** Default toast notification duration (milliseconds) */
export const DEFAULT_TOAST_DURATION = 4000;

/** Success toast duration (milliseconds) */
export const SUCCESS_TOAST_DURATION = 5000;

/** Error toast duration (milliseconds) */
export const ERROR_TOAST_DURATION = 6000;

/** Warning toast duration (milliseconds) */
export const WARNING_TOAST_DURATION = 5000;

/** Info toast duration (milliseconds) */
export const INFO_TOAST_DURATION = 2000;

/** Auto-save check interval (milliseconds) */
export const AUTO_SAVE_CHECK_INTERVAL = 10000;

/** Event throttle delay (milliseconds) */
export const EVENT_THROTTLE_DELAY = 1000;

/** Debounce delay for MutationObserver callback (milliseconds) */
export const MUTATION_DEBOUNCE_DELAY = 100;

// ============================================================
// Security Constants
// ============================================================

/**
 * Allowed origins for content script messages (M-02)
 * Only these origins can send messages to the background worker.
 * Derived from PLATFORM_REGISTRY (ADR-014).
 */
export const ALLOWED_ORIGINS: readonly string[] = ALL_PLATFORMS.map(platformOrigin);

/**
 * Valid message actions for background worker (M-02)
 * Whitelist of actions accepted from content scripts
 */
export const VALID_MESSAGE_ACTIONS = ['getSettings', 'testConnection', 'saveToOutputs'] as const;

/**
 * Valid output destinations for multi-output operations
 */
export const VALID_OUTPUT_DESTINATIONS = ['obsidian', 'file', 'clipboard'] as const;

/**
 * Valid AI platform sources. Derived from PLATFORM_REGISTRY (ADR-014).
 */
export const VALID_SOURCES: readonly AIPlatform[] = ALL_PLATFORMS;

/**
 * Valid message format options for template rendering
 */
export const VALID_MESSAGE_FORMATS = ['callout', 'plain', 'blockquote'] as const;

/**
 * Human-readable display labels for AI platforms.
 * Derived from PLATFORM_REGISTRY (ADR-014).
 */
export const PLATFORM_LABELS: Record<AIPlatform, string> = Object.fromEntries(
  ALL_PLATFORMS.map(platform => [platform, PLATFORM_REGISTRY[platform].label])
) as Record<AIPlatform, string>;

// ============================================================
// Auto-Scroll Configuration (Gemini)
// ============================================================

/** Interval between scroll-to-top attempts (milliseconds) */
export const SCROLL_POLL_INTERVAL = 1000;

/** Maximum time to wait for all messages to load (milliseconds) */
export const SCROLL_TIMEOUT = 30000;

/** Number of consecutive unchanged element counts to consider loading complete */
export const SCROLL_STABILITY_THRESHOLD = 3;

/** Brief pause after re-arm scroll to bottom before scrolling back to top (milliseconds) */
export const SCROLL_REARM_DELAY = 200;
