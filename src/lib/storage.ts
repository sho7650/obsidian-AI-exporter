/**
 * Chrome storage wrapper for extension settings
 *
 * Storage separation strategy (C-01):
 * - storage.local: Secure settings (API Key) - no cloud sync
 * - storage.sync: Non-sensitive settings - synced across devices
 */

import type {
  ExtensionSettings,
  SecureSettings,
  SyncSettings,
  TemplateOptions,
  OutputOptions,
} from './types';
import { DEFAULT_OBSIDIAN_PORT } from './constants';

const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  includeId: true,
  includeTitle: true,
  includeTags: true,
  includeSource: true,
  includeDates: true,
  includeMessageCount: true,
  messageFormat: 'callout',
  userCalloutType: 'QUESTION',
  assistantCalloutType: 'NOTE',
};

const DEFAULT_OUTPUT_OPTIONS: OutputOptions = {
  obsidian: true, // Default true for backward compatibility
  file: false,
  clipboard: false,
};

const DEFAULT_SECURE_SETTINGS: SecureSettings = {
  obsidianApiKey: '',
};

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  obsidianPort: DEFAULT_OBSIDIAN_PORT,
  vaultPath: 'AI/{platform}',
  templateOptions: DEFAULT_TEMPLATE_OPTIONS,
  outputOptions: DEFAULT_OUTPUT_OPTIONS,
  enableAutoScroll: false,
  enableAppendMode: false,
  enableToolContent: false,
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

    return {
      obsidianApiKey:
        localResult.secureSettings?.obsidianApiKey ?? DEFAULT_SECURE_SETTINGS.obsidianApiKey,
      obsidianPort: syncResult.settings?.obsidianPort ?? DEFAULT_SYNC_SETTINGS.obsidianPort,
      vaultPath: syncResult.settings?.vaultPath ?? DEFAULT_SYNC_SETTINGS.vaultPath,
      templateOptions: {
        ...DEFAULT_TEMPLATE_OPTIONS,
        ...syncResult.settings?.templateOptions,
      },
      outputOptions: {
        ...DEFAULT_OUTPUT_OPTIONS,
        ...syncResult.settings?.outputOptions,
      },
      enableAutoScroll:
        syncResult.settings?.enableAutoScroll ?? DEFAULT_SYNC_SETTINGS.enableAutoScroll,
      enableAppendMode:
        syncResult.settings?.enableAppendMode ?? DEFAULT_SYNC_SETTINGS.enableAppendMode,
      enableToolContent:
        syncResult.settings?.enableToolContent ?? DEFAULT_SYNC_SETTINGS.enableToolContent,
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

    // Save non-sensitive data to sync storage
    const syncData: Partial<SyncSettings> = {};
    if (settings.obsidianPort !== undefined) {
      syncData.obsidianPort = settings.obsidianPort;
    }
    if (settings.vaultPath !== undefined) {
      syncData.vaultPath = settings.vaultPath;
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
    if (settings.enableAutoScroll !== undefined) {
      syncData.enableAutoScroll = settings.enableAutoScroll;
    }
    if (settings.enableAppendMode !== undefined) {
      syncData.enableAppendMode = settings.enableAppendMode;
    }
    if (settings.enableToolContent !== undefined) {
      syncData.enableToolContent = settings.enableToolContent;
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
