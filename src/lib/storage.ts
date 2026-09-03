/**
 * Chrome storage wrapper for extension settings
 *
 * Storage separation strategy (C-01):
 * - storage.local: Secure settings (API Key) - no cloud sync
 * - storage.sync: Non-sensitive settings - synced across devices
 */

import type { ExtensionSettings, SecureSettings, SyncSettings } from './types';
import {
  DEFAULT_TEMPLATE_OPTIONS,
  DEFAULT_OUTPUT_OPTIONS,
  DEFAULT_SYNC_SETTINGS,
  normalizeSyncSettings,
} from './settings-schema';

const DEFAULT_SECURE_SETTINGS: SecureSettings = {
  obsidianApiKey: '',
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  ...DEFAULT_SECURE_SETTINGS,
  ...DEFAULT_SYNC_SETTINGS,
};

/**
 * Get extension settings from chrome.storage (local + sync)
 *
 * Retrieves secure settings from local storage and non-sensitive
 * settings from sync storage, combining them into a unified object.
 */
export async function getSettings(): Promise<ExtensionSettings> {
  try {
    const [localResult, syncResult] = await Promise.all([
      chrome.storage.local.get('secureSettings'),
      chrome.storage.sync.get('settings'),
    ]);

    const stored = syncResult.settings ?? {};

    // Schema-validate/normalize untrusted sync values (L-1): corrupted fields
    // fall back to defaults; valid fields are preserved. Also resolves the
    // legacy obsidianPort → obsidianUrl migration.
    const sync = normalizeSyncSettings(stored);

    // API key lives in local storage after migration. Before migration
    // completes (fire-and-forget on worker startup), fall back to the legacy
    // sync location so an early request is not misread as "key not set" (L-2).
    const obsidianApiKey =
      localResult.secureSettings?.obsidianApiKey ||
      (typeof stored.obsidianApiKey === 'string' ? stored.obsidianApiKey : '') ||
      DEFAULT_SECURE_SETTINGS.obsidianApiKey;

    return {
      obsidianApiKey,
      ...sync,
    };
  } catch (error) {
    console.error('[G2O] Failed to get settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save extension settings to chrome.storage
 *
 * Separates secure settings (API Key) to local storage
 * and non-sensitive settings to sync storage.
 */
/** Scalar settings copied to sync storage verbatim (the structured ones merge). */
const PASS_THROUGH_KEYS = [
  'obsidianUrl',
  'vaultPath',
  'imageVaultPath',
  'enableAutoScroll',
  'enableAppendMode',
  'enableToolContent',
  'enableImageExport',
  'flattenLargeCallouts',
  'scrollIdleTimeoutSec',
  'scrollMaxTimeoutSec',
  'maxCalloutLines',
  'maxNoteSizeMiB',
] as const;

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  try {
    // Read sync storage once upfront (replaces separate getSettings() + sync.get calls)
    const syncResult = await chrome.storage.sync.get('settings');
    const currentSync = syncResult.settings ?? {};

    // Save secure data to local storage
    if (settings.obsidianApiKey !== undefined) {
      await chrome.storage.local.set({
        secureSettings: { obsidianApiKey: settings.obsidianApiKey },
      });
    }

    // Save non-sensitive data to sync storage. Simple scalar fields pass
    // through directly; templateOptions/outputOptions merge with defaults.
    const syncData: Partial<SyncSettings> = {};
    for (const key of PASS_THROUGH_KEYS) {
      if (settings[key] !== undefined) {
        (syncData[key] as SyncSettings[typeof key]) = settings[key] as SyncSettings[typeof key];
      }
    }
    if (settings.templateOptions !== undefined) {
      syncData.templateOptions = {
        ...DEFAULT_TEMPLATE_OPTIONS,
        ...currentSync.templateOptions,
        ...settings.templateOptions,
      };
    }
    if (settings.outputOptions !== undefined) {
      syncData.outputOptions = {
        ...DEFAULT_OUTPUT_OPTIONS,
        ...currentSync.outputOptions,
        ...settings.outputOptions,
      };
    }

    if (Object.keys(syncData).length > 0) {
      await chrome.storage.sync.set({
        settings: { ...currentSync, ...syncData },
      });
    }
  } catch (error) {
    console.error('[G2O] Failed to save settings:', error);
    throw error;
  }
}

/**
 * Migrate settings from old format (sync only) to new format (local + sync)
 *
 * Transaction-safe migration:
 * 1. Write to local storage first
 * 2. Verify write success
 * 3. Remove from sync only after verification
 * 4. On failure, keep sync intact (no data loss)
 *
 * Should be called on service worker startup.
 */
export async function migrateSettings(): Promise<void> {
  try {
    const syncResult = await chrome.storage.sync.get('settings');
    if (syncResult.settings?.obsidianApiKey) {
      const apiKey = syncResult.settings.obsidianApiKey;

      // Step 1: Write to local storage
      await chrome.storage.local.set({
        secureSettings: { obsidianApiKey: apiKey },
      });

      // Step 2: Verify write success
      const verifyResult = await chrome.storage.local.get('secureSettings');
      if (verifyResult.secureSettings?.obsidianApiKey !== apiKey) {
        throw new Error('Migration verification failed');
      }

      // Step 3: Remove from sync (only after verified write)
      const { obsidianApiKey: _removed, ...rest } = syncResult.settings;
      void _removed; // Intentionally unused - extracted to exclude from rest
      await chrome.storage.sync.set({ settings: rest });

      console.info('[G2O] Settings migrated to secure storage');
    }
  } catch (error) {
    // On migration failure, keep sync intact and retry on next startup
    console.error('[G2O] Migration failed, will retry on next startup:', error);
    // Don't throw - existing functionality should continue working
  }
}
