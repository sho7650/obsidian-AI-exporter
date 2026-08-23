/**
 * Content script bootstrap tests
 *
 * Drives the REAL src/content/bootstrap.ts module (initialize, handleSync,
 * getExtractor, startContentScript) with mocked ui/messaging layers and
 * fixture DOM. The index.ts entry shim stays a 3-line side effect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ContentScriptSettings, MultiOutputResponse } from '../../src/lib/types';
import {
  loadFixture,
  clearFixture,
  createGeminiConversationDOM,
  setGeminiLocation,
  setNonGeminiLocation,
  resetLocation,
} from '../fixtures/dom-helpers';

vi.mock('../../src/content/ui', () => ({
  injectSyncButton: vi.fn(),
  setButtonLoading: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  showWarningToast: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../src/lib/messaging', () => ({
  sendMessage: vi.fn(),
}));

const watcherState = vi.hoisted(() => ({ stops: [] as Array<() => void> }));

vi.mock('../../src/content/ui-badge', () => ({
  showSyncBadge: vi.fn(),
  clearSyncBadge: vi.fn(),
}));

vi.mock('../../src/content/conversation-watcher', () => ({
  startConversationWatcher: vi.fn(() => {
    const stop = vi.fn();
    watcherState.stops.push(stop);
    return stop;
  }),
}));

import {
  injectSyncButton,
  setButtonLoading,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showToast,
} from '../../src/content/ui';
import { sendMessage } from '../../src/lib/messaging';
import { showSyncBadge, clearSyncBadge } from '../../src/content/ui-badge';
import { startConversationWatcher } from '../../src/content/conversation-watcher';
import {
  initialize,
  handleSync,
  getExtractor,
  startContentScript,
} from '../../src/content/bootstrap';

const baseSettings: ContentScriptSettings = {
  obsidianUrl: 'http://127.0.0.1:27123',
  vaultPath: 'AI/{platform}',
  isApiKeyConfigured: true,
  enableAutoScroll: false,
  enableAppendMode: false,
  enableToolContent: false,
  outputOptions: { obsidian: true, file: false, clipboard: false },
  templateOptions: {
    includeId: true,
    includeTitle: true,
    includeTags: true,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
  },
};

const okSave: MultiOutputResponse = {
  results: [{ destination: 'obsidian', success: true }],
  allSuccessful: true,
  anySuccessful: true,
  messagesAppended: undefined,
};

/** Route mocked sendMessage responses by action */
function mockMessaging(overrides: {
  settings?: Partial<ContentScriptSettings>;
  connection?: { success: boolean; error?: string };
  save?: MultiOutputResponse;
}): void {
  vi.mocked(sendMessage).mockImplementation(message => {
    switch ((message as { action: string }).action) {
      case 'getSettings':
        return Promise.resolve({ ...baseSettings, ...overrides.settings });
      case 'testConnection':
        return Promise.resolve(overrides.connection ?? { success: true });
      case 'saveToOutputs':
        return Promise.resolve(overrides.save ?? okSave);
      default:
        return Promise.reject(new Error('unexpected action'));
    }
  });
}

function loadGeminiConversation(): void {
  setGeminiLocation('abc123def456');
  loadFixture(
    createGeminiConversationDOM([
      { role: 'user', content: 'Hello Gemini' },
      { role: 'assistant', content: '<p>Hi there!</p>' },
    ])
  );
}

describe('content/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watcherState.stops.length = 0;
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('getExtractor', () => {
    it('returns the Gemini extractor on gemini.google.com', () => {
      setGeminiLocation('abc123');
      expect(getExtractor()?.platform).toBe('gemini');
    });

    it('returns null on unsupported hostnames', () => {
      setNonGeminiLocation('example.com');
      expect(getExtractor()).toBeNull();
    });

    it('rejects malicious subdomains embedding a platform hostname', () => {
      setNonGeminiLocation('gemini.google.com.attacker.com');
      expect(getExtractor()).toBeNull();
    });
  });

  describe('initialize', () => {
    it('skips initialization on unsupported pages', async () => {
      setNonGeminiLocation('example.com');
      await initialize();
      expect(injectSyncButton).not.toHaveBeenCalled();
    });

    it('injects the sync button on a Gemini conversation page', async () => {
      loadGeminiConversation();
      await initialize();
      expect(injectSyncButton).toHaveBeenCalledTimes(1);
      expect(injectSyncButton).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('conversation container waiting', () => {
    it('initializes once the container appears via MutationObserver', async () => {
      setGeminiLocation('abc123def456');
      // Observation root (main) exists, but no conversation container yet
      loadFixture('<main id="root"></main>');

      const pending = initialize();
      expect(injectSyncButton).not.toHaveBeenCalled();

      // Container arrives later (lazy render)
      document.querySelector('main')!.innerHTML = createGeminiConversationDOM([
        { role: 'user', content: 'late' },
      ]);

      await pending;
      expect(injectSyncButton).toHaveBeenCalledTimes(1);
    });

    it('falls back to document.body observation without a platform root', async () => {
      setGeminiLocation('abc123def456');
      loadFixture('<div id="no-main"></div>'); // no <main>, no #app-container

      const pending = initialize();
      document.body.insertAdjacentHTML(
        'beforeend',
        createGeminiConversationDOM([{ role: 'user', content: 'late' }])
      );

      await pending;
      expect(injectSyncButton).toHaveBeenCalledTimes(1);
    });

    it('gives up waiting after the fallback timeout', async () => {
      vi.useFakeTimers();
      try {
        setGeminiLocation('abc123def456');
        loadFixture('<main></main>'); // container never appears

        const pending = initialize();
        await vi.advanceTimersByTimeAsync(10_000);
        await pending;

        // Initialization still completes (button injected on a bare page)
        expect(injectSyncButton).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('startContentScript', () => {
    it('initializes immediately when the DOM is already ready', async () => {
      loadGeminiConversation();
      startContentScript();
      await vi.waitFor(() => expect(injectSyncButton).toHaveBeenCalled());
    });

    it('waits for DOMContentLoaded while the document is loading', async () => {
      loadGeminiConversation();
      Object.defineProperty(document, 'readyState', {
        value: 'loading',
        configurable: true,
      });
      try {
        startContentScript();
        expect(injectSyncButton).not.toHaveBeenCalled();

        document.dispatchEvent(new Event('DOMContentLoaded'));
        await vi.waitFor(() => expect(injectSyncButton).toHaveBeenCalled());
      } finally {
        Object.defineProperty(document, 'readyState', {
          value: 'complete',
          configurable: true,
        });
      }
    });

    it('logs initialization failures instead of throwing', async () => {
      loadGeminiConversation();
      vi.mocked(injectSyncButton).mockImplementation(() => {
        throw new Error('inject failed');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      startContentScript();
      await vi.waitFor(() =>
        expect(errorSpy).toHaveBeenCalledWith(
          '[G2O] Content script initialization failed:',
          expect.any(Error)
        )
      );
      errorSpy.mockRestore();
    });
  });

  describe('handleSync', () => {
    it('shows an error when no output destination is enabled', async () => {
      loadGeminiConversation();
      mockMessaging({
        settings: { outputOptions: { obsidian: false, file: false, clipboard: false } },
      });

      await handleSync();

      expect(showErrorToast).toHaveBeenCalledWith(
        'Please select at least one output destination in settings'
      );
      expect(setButtonLoading).toHaveBeenLastCalledWith(false);
    });

    it('shows an error when Obsidian is enabled without an API key', async () => {
      loadGeminiConversation();
      mockMessaging({ settings: { isApiKeyConfigured: false } });

      await handleSync();

      expect(showErrorToast).toHaveBeenCalledWith(
        'Please configure your Obsidian API key in the extension settings'
      );
    });

    it('shows the connection error when the connection test fails', async () => {
      loadGeminiConversation();
      mockMessaging({ connection: { success: false, error: 'Obsidian is not running' } });

      await handleSync();

      expect(showErrorToast).toHaveBeenCalledWith('Obsidian is not running');
    });

    it('skips the connection test when Obsidian output is disabled', async () => {
      loadGeminiConversation();
      mockMessaging({
        settings: { outputOptions: { obsidian: false, file: true, clipboard: false } },
      });

      await handleSync();

      const actions = vi
        .mocked(sendMessage)
        .mock.calls.map(call => (call[0] as { action: string }).action);
      expect(actions).not.toContain('testConnection');
      expect(showSuccessToast).toHaveBeenCalled();
    });

    it('shows an error on unsupported pages', async () => {
      setNonGeminiLocation('example.com');
      mockMessaging({});

      await handleSync();

      expect(showErrorToast).toHaveBeenCalledWith('Not on a valid conversation page');
    });

    it('shows an error when the page has no extractable conversation', async () => {
      setGeminiLocation('abc123def456');
      loadFixture('<div id="empty"></div>');
      mockMessaging({});

      await handleSync();

      expect(showErrorToast).toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'saveToOutputs' })
      );
    });

    it('extracts, saves, and shows success on the happy path', async () => {
      loadGeminiConversation();
      mockMessaging({});

      await handleSync();

      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'saveToOutputs',
          outputs: ['obsidian'],
          data: expect.objectContaining({ fileName: expect.stringMatching(/\.md$/) }),
        })
      );
      expect(showSuccessToast).toHaveBeenCalledWith(expect.stringMatching(/\.md$/), true);
      expect(setButtonLoading).toHaveBeenNthCalledWith(1, true);
      expect(setButtonLoading).toHaveBeenLastCalledWith(false);
    });

    it('shows the ACTUAL file name when a collision forced a rename (issue #327)', async () => {
      loadGeminiConversation();
      mockMessaging({
        save: {
          results: [{ destination: 'obsidian', success: true, savedAs: 'hello-a1b2c3d4.md' }],
          allSuccessful: true,
          anySuccessful: true,
        },
      });

      await handleSync();

      expect(showSuccessToast).toHaveBeenCalledWith('hello-a1b2c3d4.md', true);
    });

    it('shows the appended-message toast when messages were appended', async () => {
      loadGeminiConversation();
      mockMessaging({ save: { ...okSave, messagesAppended: 2 } });

      await handleSync();

      expect(showToast).toHaveBeenCalledWith('2 new message(s) appended', 'success');
    });

    it('shows the no-new-messages toast when nothing was appended', async () => {
      loadGeminiConversation();
      mockMessaging({ save: { ...okSave, messagesAppended: 0 } });

      await handleSync();

      expect(showToast).toHaveBeenCalledWith(
        'No new messages to append',
        'info',
        expect.any(Number)
      );
    });

    it('shows a warning when only some outputs succeed', async () => {
      loadGeminiConversation();
      mockMessaging({
        save: {
          results: [
            { destination: 'obsidian', success: true },
            { destination: 'clipboard', success: false, error: 'copy failed' },
          ],
          allSuccessful: false,
          anySuccessful: true,
        },
      });

      await handleSync();

      expect(showWarningToast).toHaveBeenCalledWith(
        'Saved to: obsidian. Failed: clipboard: copy failed'
      );
    });

    it('surfaces a save warning after the success toast (issue #376)', async () => {
      vi.useFakeTimers();
      try {
        loadGeminiConversation();
        mockMessaging({
          save: {
            results: [
              {
                destination: 'obsidian',
                success: true,
                warning: '1 image could not be saved: img-note-img-1.png',
              },
            ],
            allSuccessful: true,
            anySuccessful: true,
          },
        });

        const pending = handleSync();
        await vi.advanceTimersByTimeAsync(10_000);
        await pending;

        expect(showSuccessToast).toHaveBeenCalled();
        expect(showWarningToast).toHaveBeenCalledWith(
          '1 image could not be saved: img-note-img-1.png'
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows an error when every output fails', async () => {
      loadGeminiConversation();
      mockMessaging({
        save: {
          results: [{ destination: 'obsidian', success: false, error: 'disk full' }],
          allSuccessful: false,
          anySuccessful: false,
        },
      });

      await handleSync();

      expect(showErrorToast).toHaveBeenCalledWith('disk full');
    });

    it('shows a generic error when failures carry no message', async () => {
      loadGeminiConversation();
      mockMessaging({
        save: {
          results: [{ destination: 'obsidian', success: false }],
          allSuccessful: false,
          anySuccessful: false,
        },
      });

      await handleSync();

      expect(showErrorToast).toHaveBeenCalledWith('Failed to save');
    });

    it('catches messaging errors and resets the button state', async () => {
      loadGeminiConversation();
      vi.mocked(sendMessage).mockRejectedValue(new Error('Extension context invalidated.'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await handleSync();

      expect(showErrorToast).toHaveBeenCalledWith('Extension context invalidated.');
      expect(setButtonLoading).toHaveBeenLastCalledWith(false);
      errorSpy.mockRestore();
    });
  });
});

describe('sync status badge wiring (issue #458)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watcherState.stops.length = 0;
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  it('shows a success badge for the synced conversation', async () => {
    mockMessaging({});
    loadGeminiConversation();

    await handleSync();

    expect(showSyncBadge).toHaveBeenCalledTimes(1);
    const [status] = vi.mocked(showSyncBadge).mock.calls[0];
    expect(status.kind).toBe('success');
    expect(status.conversationKey).toBe('abc123def456');
    expect(status.at).toBeInstanceOf(Date);
  });

  it('shows an error badge when the sync never reached a destination', async () => {
    // Obsidian unreachable: the six-second toast is gone long before the user
    // looks back at the tab.
    mockMessaging({ connection: { success: false, error: 'Cannot connect to Obsidian' } });
    loadGeminiConversation();

    await handleSync();

    const [status] = vi.mocked(showSyncBadge).mock.calls[0];
    expect(status.kind).toBe('error');
    expect(status.error).toBe('Cannot connect to Obsidian');
  });

  it('watches for a conversation change starting from the synced key', async () => {
    mockMessaging({});
    loadGeminiConversation();

    await handleSync();

    expect(startConversationWatcher).toHaveBeenCalledTimes(1);
    const [params] = vi.mocked(startConversationWatcher).mock.calls[0];
    expect(params.initialKey).toBe('abc123def456');
    expect(params.getKey()).toBe('abc123def456');
  });

  it('clears the badge and stops watching once the conversation changes', async () => {
    mockMessaging({});
    loadGeminiConversation();
    await handleSync();

    const [params] = vi.mocked(startConversationWatcher).mock.calls[0];
    params.onChanged(null);

    expect(clearSyncBadge).toHaveBeenCalledTimes(1);
    expect(watcherState.stops[0]).toHaveBeenCalled();
  });

  it('stops watching when the user dismisses the badge', async () => {
    mockMessaging({});
    loadGeminiConversation();
    await handleSync();

    const [, handlers] = vi.mocked(showSyncBadge).mock.calls[0];
    handlers?.onDismiss?.();

    expect(watcherState.stops[0]).toHaveBeenCalled();
  });

  it('does not leave the previous watcher running after a second sync', async () => {
    mockMessaging({});
    loadGeminiConversation();

    await handleSync();
    await handleSync();

    expect(watcherState.stops[0]).toHaveBeenCalled();
    expect(startConversationWatcher).toHaveBeenCalledTimes(2);
  });
});
