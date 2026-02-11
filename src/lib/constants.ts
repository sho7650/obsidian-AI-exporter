/**
 * Application-wide constants
 *
 * Centralizes magic numbers and configuration values for consistency
 * and maintainability.
 */

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

// ============================================================
// Validation Limits
// ============================================================

/** Maximum length for filename (filesystem constraint) */
export const MAX_FILENAME_LENGTH = 200;

/** Maximum length for frontmatter title field (characters) */
export const MAX_FRONTMATTER_TITLE_LENGTH = 500;

/** Maximum number of tags allowed in frontmatter */
export const MAX_TAGS_COUNT = 50;

// ============================================================
// Network Configuration
// ============================================================

/** Default Obsidian Local REST API port */
export const DEFAULT_OBSIDIAN_PORT = 27123;

/** Minimum valid port number */
export const MIN_PORT = 1024;

/** Maximum valid port number */
export const MAX_PORT = 65535;

/** Default timeout for API requests (milliseconds) */
export const DEFAULT_API_TIMEOUT = 5000;

/** Maximum content size for API requests (1MB) */
export const MAX_CONTENT_SIZE = 1024 * 1024;

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

// ============================================================
// Security Constants
// ============================================================

/**
 * Allowed origins for content script messages (M-02)
 * Only these origins can send messages to the background worker
 */
export const ALLOWED_ORIGINS = [
  'https://gemini.google.com',
  'https://claude.ai',
  'https://chatgpt.com',
  'https://www.perplexity.ai',
] as const;

/**
 * Valid message actions for background worker (M-02)
 * Whitelist of actions accepted from content scripts
 */
export const VALID_MESSAGE_ACTIONS = [
  'getSettings',
  'getExistingFile',
  'testConnection',
  'saveToObsidian',
  'saveToOutputs',
] as const;

/**
 * Valid output destinations for multi-output operations
 */
export const VALID_OUTPUT_DESTINATIONS = ['obsidian', 'file', 'clipboard'] as const;

/**
 * Valid AI platform sources
 */
export const VALID_SOURCES = ['gemini', 'claude', 'perplexity', 'chatgpt'] as const;
