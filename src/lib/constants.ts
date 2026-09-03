/**
 * Application-wide constants
 *
 * Centralizes magic numbers and configuration values for consistency
 * and maintainability.
 */

import type { AIPlatform } from './types';
import {
  PLATFORM_REGISTRY,
  ALL_PLATFORMS,
  platformOrigins,
  platformLabels,
} from './platform-registry';

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

/**
 * Upper bound on Obsidian REST API requests spent by a single append-mode
 * existing-file lookup (directory listings + candidate reads combined).
 *
 * The scan is bounded in depth but not in breadth, so a deeply-foldered vault
 * could otherwise issue an unbounded number of sequential requests on every
 * save. 200 comfortably covers realistic layouts — five years of
 * `{YYYY}/{MM}` folders costs 66 listings — while capping the pathological
 * case. Requests go to 127.0.0.1, so even the worst case stays sub-second, and
 * the caller-side path memo short-circuits repeat saves entirely.
 *
 * Exhausting the budget is treated as "not found", which falls through to a
 * normal (non-append) save.
 */
export const SCAN_MAX_REQUESTS = 200;

/**
 * Default line threshold for the Obsidian-only "flatten large callouts"
 * setting. Obsidian decorates every blockquote line, so a very long message
 * (e.g. a pasted document) rendered as one giant callout makes the note render
 * pathologically slowly and can hang the app; flattening such callouts to plain
 * text renders in linear time. 200 keeps normal messages and long AI answers as
 * callouts, while document-sized pastes fall back to plain text. Downloaded
 * markdown is unaffected (this is an Obsidian-rendering issue only).
 */
export const DEFAULT_MAX_CALLOUT_LINES = 200;

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

/** Maximum number of images accepted per note (DoS guard). */
export const MAX_IMAGES_PER_NOTE = 20;

/** Maximum base64 length for a single image's data (~10MB binary + overhead). */
export const MAX_IMAGE_DATA_LENGTH = 14 * 1024 * 1024;

/**
 * Maximum combined base64 length across all images in one note (DoS guard).
 * Independent of the per-image and per-count caps: 20 × 14 MiB would otherwise
 * let a single message reach ~280 MiB. 48 MiB (~36 MB binary) comfortably fits
 * a realistic Gemini image set while bounding worker memory.
 */
export const MAX_TOTAL_IMAGE_DATA_LENGTH = 48 * 1024 * 1024;

/**
 * Maximum length of a single LaTeX formula rendered into `$…$` / `$$…$$`.
 * Page-derived `data-math` values above this fall back to plain text so a
 * malicious or malformed formula cannot degrade Obsidian's math rendering.
 * Real KaTeX expressions are well under 1000 characters.
 */
export const MAX_MATH_LENGTH = 1000;

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

/**
 * How often the sync-status badge checks whether the conversation changed
 * (milliseconds).
 *
 * Polling rather than an event: all five platforms navigate between
 * conversations without reloading the document (measured 2026-08-23 — the
 * marker planted on the page survived every "new chat" and conversation
 * switch), so the badge would otherwise keep showing another conversation's
 * result. A content script cannot see the page's `history.pushState` because
 * it runs in an isolated world, `popstate` covers only back/forward, and
 * `chrome.webNavigation` would add an install-time permission warning for one
 * badge. The tick only compares `location.href`, and only runs while a badge
 * is on screen (ADR-034).
 */
export const CONVERSATION_POLL_INTERVAL = 1000;

/**
 * How often the sync-status badge checks whether the conversation grew past the
 * sync it reports (milliseconds).
 *
 * One `querySelectorAll` over the *mounted* window per tick — a few dozen nodes
 * on Claude and ChatGPT, which virtualize — and only while a badge is on screen
 * (ADR-036). A MutationObserver would fire on every streamed token instead, and
 * would still have to re-read the ordinal afterwards.
 */
export const NEW_MESSAGE_POLL_INTERVAL = 1000;

// ============================================================
// Security Constants
// ============================================================

/**
 * Allowed origins for content script messages (M-02)
 * Only these origins can send messages to the background worker.
 * Derived from PLATFORM_REGISTRY (ADR-014).
 */
export const ALLOWED_ORIGINS: readonly string[] = ALL_PLATFORMS.flatMap(platformOrigins);

/**
 * Valid message actions for background worker (M-02)
 * Whitelist of actions accepted from content scripts
 */
export const VALID_MESSAGE_ACTIONS = [
  'getSettings',
  'testConnection',
  'saveToOutputs',
  'fetchImage',
] as const;

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

/**
 * Every display label across all platforms — current names plus superseded
 * ones (e.g. "NotebookLM" before the Gemini Notebook rebrand), sorted
 * longest-first (ADR-023).
 *
 * Consumers that parse *previously written* notes must use this rather than
 * PLATFORM_LABELS: append-mode message counting sees old labels, and
 * document.title still carries whichever suffix the page renders. The
 * longest-first order keeps regex alternations from matching a short label
 * ("Gemini") inside a longer one ("Gemini Notebook").
 */
export const ALL_PLATFORM_LABELS: readonly string[] = ALL_PLATFORMS.flatMap(platformLabels).sort(
  (a, b) => b.length - a.length
);

// ============================================================
// Auto-Scroll Configuration (Gemini)
// ============================================================

/** Interval between scroll-to-top attempts (milliseconds) */
export const SCROLL_POLL_INTERVAL = 1000;

// Progress-aware accumulation deadlines (issue #360, ADR-018).
//
// A single fixed wall-clock timeout did not scale with conversation length: at
// ~400ms per iteration it capped accumulation at ~75 turns, so any longer (or
// previously-synced-and-since-grown) conversation timed out mid-scroll with a
// partial capture. A fixed wall is also unreliable under Chrome's background-tab
// timer throttling — setTimeout is clamped to ≥1s when the tab is hidden and to
// ~10s once it has been hidden >5min (MDN: Window/setTimeout, "Timeouts in
// inactive tabs") — which shrinks how many iterations a wall-clock budget buys.
//
// The engines already stop on their own when accumulation stalls
// (SCROLL_STABILITY_THRESHOLD consecutive no-growth iterations), so the deadline
// only needs to bound the two failure modes below. The idle deadline resets on
// every iteration that surfaces a new turn, so genuine progress is never cut off
// regardless of total length; the absolute cap bounds pathological growth.

/** Give up if no new turns appear for this long — a stuck/broken scroll (ms). */
export const SCROLL_IDLE_TIMEOUT = 15000;

/** Absolute safety cap on a single accumulation pass (ms). */
export const SCROLL_MAX_TIMEOUT = 300000;

// Both deadlines are user-settable (issue #449, ADR-032): rather than guess why
// a 446-message conversation stalled, the user can raise them. Stored and shown
// in SECONDS - the unit the popup displays - so no conversion can go stale; the
// single x1000 happens at resolveScrollDeadlines().

/** Default idle deadline in seconds, matching {@link SCROLL_IDLE_TIMEOUT}. */
export const DEFAULT_SCROLL_IDLE_TIMEOUT_SEC = 15;
/** Default absolute cap in seconds, matching {@link SCROLL_MAX_TIMEOUT}. */
export const DEFAULT_SCROLL_MAX_TIMEOUT_SEC = 300;
/** Floor for the idle deadline: below one stability window it can never settle. */
export const MIN_SCROLL_IDLE_TIMEOUT_SEC = 5;
export const MAX_SCROLL_IDLE_TIMEOUT_SEC = 600;
/** Floor for the cap; anything shorter cannot finish a virtualized pass. */
export const MIN_SCROLL_MAX_TIMEOUT_SEC = 30;
/** One hour: a bound a human can be held to, and far beyond any real need. */
export const MAX_SCROLL_MAX_TIMEOUT_SEC = 3600;

// The note body size cap is a user setting (issue #467, ADR-038). It replaced a
// fixed 1 MiB constant that a 1,077-message Claude conversation exceeded; the
// rejection was then mis-read by the content script and surfaced as a
// TypeError. Enforced in handleMultiOutput(), the only place that can read
// settings, and measured in UTF-16 code units of the body (`body.length`).

export const BYTES_PER_MIB = 1024 * 1024;
/** 8 MiB: an order of magnitude above the old limit, well inside the ceiling. */
export const DEFAULT_NOTE_SIZE_MIB = 8;
export const MIN_NOTE_SIZE_MIB = 1;
/**
 * 16 MiB. Chrome caps one runtime message at 64 MiB (developer.chrome.com,
 * "Message size limits"); images in the same message are already capped at
 * MAX_TOTAL_IMAGE_DATA_LENGTH (48 MiB), and 48 + 16 = 64.
 */
export const MAX_NOTE_SIZE_MIB = 16;

/** Number of consecutive unchanged element counts to consider loading complete */
export const SCROLL_STABILITY_THRESHOLD = 3;

/** Brief pause after re-arm scroll to bottom before scrolling back to top (milliseconds) */
export const SCROLL_REARM_DELAY = 200;

// ============================================================
// Auto-Scroll Configuration (virtualized platforms — Claude, ChatGPT)
// ============================================================
//
// Claude and ChatGPT virtualize the conversation (windowing): only a small
// moving window of turns is ever mounted and off-screen turns are evicted
// (ADR-017). Unlike Gemini's accumulate-and-stay infinite-scroller, we cannot
// scroll to the top once and read everything — we must scroll up in steps and
// harvest each window, accumulating turns by a stable key.

/** Pause after each upward scroll step before harvesting the newly-mounted window (ms) */
export const SCROLL_ACCUMULATE_POLL_INTERVAL = 400;

/** Fraction of the container's clientHeight to scroll up per step; <1 keeps
 *  windows overlapping so no virtualized turn slips between two harvests. */
export const SCROLL_ACCUMULATE_STEP_FACTOR = 0.6;

/** Floor for the per-step scroll distance (px). Guards environments where
 *  clientHeight reads 0 (e.g. jsdom, which has no layout engine). */
export const SCROLL_ACCUMULATE_MIN_STEP = 400;
