/**
 * Runtime schema validation & normalization for synced settings.
 *
 * `chrome.storage.sync` values are untrusted at load time: they may be stale,
 * cross-device, or corrupted. `normalizeSyncSettings()` coerces a raw stored
 * object into a well-typed {@link SyncSettings}, resetting only the fields that
 * fail validation to their defaults (valid fields are preserved).
 */

import type { SyncSettings, TemplateOptions, OutputOptions } from './types';
import {
  DEFAULT_OBSIDIAN_URL,
  DEFAULT_MAX_CALLOUT_LINES,
  DEFAULT_SCROLL_IDLE_TIMEOUT_SEC,
  DEFAULT_SCROLL_MAX_TIMEOUT_SEC,
  MIN_SCROLL_IDLE_TIMEOUT_SEC,
  MAX_SCROLL_IDLE_TIMEOUT_SEC,
  MIN_SCROLL_MAX_TIMEOUT_SEC,
  MAX_SCROLL_MAX_TIMEOUT_SEC,
  DEFAULT_NOTE_SIZE_MIB,
  MIN_NOTE_SIZE_MIB,
  MAX_NOTE_SIZE_MIB,
} from './constants';

const MESSAGE_FORMATS = ['callout', 'plain', 'blockquote'] as const;
const FILENAME_SCHEMES = ['title-id', 'title-date'] as const;

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  includeId: true,
  includeTitle: true,
  includeTags: true,
  includeSource: true,
  includeDates: true,
  includeMessageCount: true,
  messageFormat: 'callout',
  userCalloutType: 'QUESTION',
  assistantCalloutType: 'NOTE',
  includeQuestionHeaders: false,
  filenameScheme: 'title-id',
};

export const DEFAULT_OUTPUT_OPTIONS: OutputOptions = {
  obsidian: true, // Default true for backward compatibility
  file: false,
  clipboard: false,
};

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  obsidianUrl: DEFAULT_OBSIDIAN_URL,
  vaultPath: 'AI/{platform}',
  templateOptions: DEFAULT_TEMPLATE_OPTIONS,
  outputOptions: DEFAULT_OUTPUT_OPTIONS,
  enableAutoScroll: false,
  enableAppendMode: false,
  enableToolContent: false,
  enableImageExport: true,
  imageVaultPath: 'AI/{platform}/images',
  flattenLargeCallouts: true,
  maxCalloutLines: DEFAULT_MAX_CALLOUT_LINES,
  scrollIdleTimeoutSec: DEFAULT_SCROLL_IDLE_TIMEOUT_SEC,
  scrollMaxTimeoutSec: DEFAULT_SCROLL_MAX_TIMEOUT_SEC,
  maxNoteSizeMiB: DEFAULT_NOTE_SIZE_MIB,
};

// --- Field coercion helpers ---

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * A whole number inside [min, max], or the fallback.
 *
 * Out-of-range values are CLAMPED, not discarded: this runs at the migration
 * boundary on values that may have been written by another device or a future
 * build, and moving such a value into range preserves the user's intent where
 * dropping it would silently reset their setting (ADR-032).
 */
function asIntInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return fallback;
  return Math.min(Math.max(value, min), max);
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTemplateOptions(raw: unknown): TemplateOptions {
  const d = DEFAULT_TEMPLATE_OPTIONS;
  if (!isRecord(raw)) {
    return { ...d };
  }
  const result: TemplateOptions = {
    includeId: asBoolean(raw.includeId, d.includeId),
    includeTitle: asBoolean(raw.includeTitle, d.includeTitle),
    includeTags: asBoolean(raw.includeTags, d.includeTags),
    includeSource: asBoolean(raw.includeSource, d.includeSource),
    includeDates: asBoolean(raw.includeDates, d.includeDates),
    includeMessageCount: asBoolean(raw.includeMessageCount, d.includeMessageCount),
    messageFormat: asEnum(raw.messageFormat, MESSAGE_FORMATS, d.messageFormat),
    userCalloutType: asString(raw.userCalloutType, d.userCalloutType),
    assistantCalloutType: asString(raw.assistantCalloutType, d.assistantCalloutType),
    includeQuestionHeaders: asBoolean(
      raw.includeQuestionHeaders,
      d.includeQuestionHeaders ?? false
    ),
    filenameScheme: asEnum(raw.filenameScheme, FILENAME_SCHEMES, d.filenameScheme ?? 'title-id'),
  };
  // Optional string field: include only when a valid value is present.
  if (typeof raw.timezone === 'string') {
    result.timezone = raw.timezone;
  }
  return result;
}

function normalizeOutputOptions(raw: unknown): OutputOptions {
  const d = DEFAULT_OUTPUT_OPTIONS;
  if (!isRecord(raw)) {
    return { ...d };
  }
  return {
    obsidian: asBoolean(raw.obsidian, d.obsidian),
    file: asBoolean(raw.file, d.file),
    clipboard: asBoolean(raw.clipboard, d.clipboard),
  };
}

/**
 * Resolve `obsidianUrl`, honoring the legacy `obsidianPort` field for settings
 * saved before the URL migration. A valid stored URL wins; otherwise a legacy
 * port is expanded to a localhost URL; otherwise the default.
 */
function resolveObsidianUrl(raw: Record<string, unknown>): string {
  if (typeof raw.obsidianUrl === 'string') {
    return raw.obsidianUrl;
  }
  if (raw.obsidianPort) {
    return `http://127.0.0.1:${String(raw.obsidianPort)}`;
  }
  return DEFAULT_SYNC_SETTINGS.obsidianUrl;
}

/**
 * Coerce a raw stored sync object into a valid {@link SyncSettings}.
 * Invalid or missing fields fall back to their defaults; valid fields are kept.
 */
export function normalizeSyncSettings(raw: unknown): SyncSettings {
  const d = DEFAULT_SYNC_SETTINGS;
  if (!isRecord(raw)) {
    return {
      ...d,
      templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS },
      outputOptions: { ...DEFAULT_OUTPUT_OPTIONS },
    };
  }
  return {
    obsidianUrl: resolveObsidianUrl(raw),
    vaultPath: asString(raw.vaultPath, d.vaultPath),
    templateOptions: normalizeTemplateOptions(raw.templateOptions),
    outputOptions: normalizeOutputOptions(raw.outputOptions),
    enableAutoScroll: asBoolean(raw.enableAutoScroll, d.enableAutoScroll),
    enableAppendMode: asBoolean(raw.enableAppendMode, d.enableAppendMode),
    enableToolContent: asBoolean(raw.enableToolContent, d.enableToolContent),
    enableImageExport: asBoolean(raw.enableImageExport, d.enableImageExport),
    imageVaultPath: asString(raw.imageVaultPath, d.imageVaultPath),
    flattenLargeCallouts: asBoolean(raw.flattenLargeCallouts, d.flattenLargeCallouts),
    maxCalloutLines: asPositiveInt(raw.maxCalloutLines, d.maxCalloutLines),
    scrollIdleTimeoutSec: asIntInRange(
      raw.scrollIdleTimeoutSec,
      MIN_SCROLL_IDLE_TIMEOUT_SEC,
      MAX_SCROLL_IDLE_TIMEOUT_SEC,
      d.scrollIdleTimeoutSec
    ),
    scrollMaxTimeoutSec: asIntInRange(
      raw.scrollMaxTimeoutSec,
      MIN_SCROLL_MAX_TIMEOUT_SEC,
      MAX_SCROLL_MAX_TIMEOUT_SEC,
      d.scrollMaxTimeoutSec
    ),
    maxNoteSizeMiB: asIntInRange(
      raw.maxNoteSizeMiB,
      MIN_NOTE_SIZE_MIB,
      MAX_NOTE_SIZE_MIB,
      d.maxNoteSizeMiB
    ),
  };
}
