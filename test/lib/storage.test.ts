import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSettings,
  saveSettings,
  migrateSettings,
  getLastSync,
  saveLastSync,
} from '../../src/lib/storage';

describe('storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset storage state
    const localStore: Record<string, unknown> = {};
    const syncStore: Record<string, unknown> = {};

    vi.mocked(chrome.storage.local.get).mockImplementation(
      (keys: string | string[] | Record<string, unknown> | null) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: localStore[keys] });
        }
        return Promise.resolve(localStore);
      }
    );

    vi.mocked(chrome.storage.local.set).mockImplementation(
      (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
        return Promise.resolve();
      }
    );

    vi.mocked(chrome.storage.sync.get).mockImplementation(
      (keys: string | string[] | Record<string, unknown> | null) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: syncStore[keys] });
        }
        return Promise.resolve(syncStore);
      }
    );

    vi.mocked(chrome.storage.sync.set).mockImplementation(
      (items: Record<string, unknown>) => {
        Object.assign(syncStore, items);
        return Promise.resolve();
      }
    );
  });

  describe('getSettings', () => {
    it('returns default settings when storage is empty', async () => {
      const settings = await getSettings();

      expect(settings.obsidianApiKey).toBe('');
      expect(settings.obsidianPort).toBe(27123);
      expect(settings.vaultPath).toBe('AI/Gemini');
      expect(settings.templateOptions.messageFormat).toBe('callout');
    });

    it('returns stored secure settings from local storage', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        secureSettings: { obsidianApiKey: 'test-api-key' },
      });

      const settings = await getSettings();
      expect(settings.obsidianApiKey).toBe('test-api-key');
    });

    it('returns stored sync settings from sync storage', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: { obsidianPort: 28000, vaultPath: 'Custom/Path' },
      });

      const settings = await getSettings();
      expect(settings.obsidianPort).toBe(28000);
      expect(settings.vaultPath).toBe('Custom/Path');
    });

    it('merges template options with defaults', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: {
          templateOptions: { messageFormat: 'blockquote' },
        },
      });

      const settings = await getSettings();
      expect(settings.templateOptions.messageFormat).toBe('blockquote');
      expect(settings.templateOptions.includeId).toBe(true); // default preserved
    });

    it('returns default settings on error', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(
        new Error('Storage error')
      );

      const settings = await getSettings();
      expect(settings.obsidianApiKey).toBe('');
      expect(settings.obsidianPort).toBe(27123);
    });
  });

  describe('saveSettings', () => {
    it('saves API key to local storage', async () => {
      await saveSettings({ obsidianApiKey: 'new-api-key' });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        secureSettings: { obsidianApiKey: 'new-api-key' },
      });
    });

    it('saves port and vaultPath to sync storage', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({ settings: {} });

      await saveSettings({ obsidianPort: 28000, vaultPath: 'New/Path' });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        settings: { obsidianPort: 28000, vaultPath: 'New/Path' },
      });
    });

    it('merges template options with current settings', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({});
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: {
          templateOptions: { includeId: true, messageFormat: 'callout' },
        },
      });

      await saveSettings({
        templateOptions: { messageFormat: 'blockquote' } as never,
      });

      expect(chrome.storage.sync.set).toHaveBeenCalled();
      const callArgs = vi.mocked(chrome.storage.sync.set).mock.calls[0][0];
      expect(callArgs.settings.templateOptions.messageFormat).toBe('blockquote');
    });

    it('does not save to sync if only API key is provided', async () => {
      await saveSettings({ obsidianApiKey: 'key' });

      expect(chrome.storage.local.set).toHaveBeenCalled();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    it('throws error on save failure', async () => {
      vi.mocked(chrome.storage.local.set).mockRejectedValue(
        new Error('Save failed')
      );

      await expect(saveSettings({ obsidianApiKey: 'key' })).rejects.toThrow(
        'Save failed'
      );
    });
  });

  describe('migrateSettings', () => {
    it('migrates API key from sync to local storage', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: { obsidianApiKey: 'old-key', obsidianPort: 27123 },
      });
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        secureSettings: { obsidianApiKey: 'old-key' },
      });

      await migrateSettings();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        secureSettings: { obsidianApiKey: 'old-key' },
      });
    });

    it('removes API key from sync after successful migration', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: { obsidianApiKey: 'old-key', obsidianPort: 27123 },
      });
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        secureSettings: { obsidianApiKey: 'old-key' },
      });

      await migrateSettings();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        settings: { obsidianPort: 27123 },
      });
    });

    it('does nothing if no API key in sync storage', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: { obsidianPort: 27123 },
      });

      await migrateSettings();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('does not throw on migration failure', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: { obsidianApiKey: 'old-key' },
      });
      vi.mocked(chrome.storage.local.set).mockRejectedValue(
        new Error('Write failed')
      );

      // Should not throw
      await expect(migrateSettings()).resolves.toBeUndefined();
    });

    it('does not remove from sync if verification fails', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        settings: { obsidianApiKey: 'old-key' },
      });
      vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        secureSettings: { obsidianApiKey: 'different-key' },
      });

      await migrateSettings();

      // Should not remove from sync if verification fails
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('getLastSync', () => {
    it('returns sync info for existing conversation', async () => {
      const syncInfo = {
        timestamp: 1704067200000,
        messageCount: 5,
        contentHash: 'abc123',
      };
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        lastSync: { 'conv-123': syncInfo },
      });

      const result = await getLastSync('conv-123');
      expect(result).toEqual(syncInfo);
    });

    it('returns null for non-existent conversation', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        lastSync: {},
      });

      const result = await getLastSync('non-existent');
      expect(result).toBeNull();
    });

    it('returns null when lastSync is not set', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({});

      const result = await getLastSync('conv-123');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(
        new Error('Storage error')
      );

      const result = await getLastSync('conv-123');
      expect(result).toBeNull();
    });
  });

  describe('saveLastSync', () => {
    it('saves sync info for new conversation', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({});

      const syncInfo = {
        timestamp: 1704067200000,
        messageCount: 5,
        contentHash: 'abc123',
      };
      await saveLastSync('conv-123', syncInfo);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        lastSync: { 'conv-123': syncInfo },
      });
    });

    it('updates sync info for existing conversation', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        lastSync: {
          'conv-123': { timestamp: 1000, messageCount: 2, contentHash: 'old' },
        },
      });

      const newSyncInfo = {
        timestamp: 2000,
        messageCount: 5,
        contentHash: 'new',
      };
      await saveLastSync('conv-123', newSyncInfo);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        lastSync: { 'conv-123': newSyncInfo },
      });
    });

    it('preserves other conversations sync info', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        lastSync: {
          'other-conv': { timestamp: 1000, messageCount: 3, contentHash: 'xyz' },
        },
      });

      const newSyncInfo = {
        timestamp: 2000,
        messageCount: 5,
        contentHash: 'abc',
      };
      await saveLastSync('conv-123', newSyncInfo);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        lastSync: {
          'other-conv': { timestamp: 1000, messageCount: 3, contentHash: 'xyz' },
          'conv-123': newSyncInfo,
        },
      });
    });

    it('throws error on save failure', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValue({});
      vi.mocked(chrome.storage.local.set).mockRejectedValue(
        new Error('Save failed')
      );

      await expect(
        saveLastSync('conv-123', {
          timestamp: 1000,
          messageCount: 1,
          contentHash: 'abc',
        })
      ).rejects.toThrow('Save failed');
    });
  });
});
