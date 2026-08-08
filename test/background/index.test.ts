/**
 * Background service worker tests
 *
 * Tests the message handling, validation, and API integration of the background script.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MultiOutputResponse, ObsidianNote } from '../../src/lib/types';
import { generateHash } from '../../src/lib/hash';
import { flattenLargeCallouts } from '../../src/lib/callout-flatten';

// Mock client instance - defined at module level
const mockClient = {
  testConnection: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  putBinaryFile: vi.fn(),
  listFiles: vi.fn(),
};

// Default settings
const defaultSettings = {
  obsidianApiKey: 'test-api-key',
  obsidianUrl: 'http://127.0.0.1:27123',
  vaultPath: 'AI/Gemini',
  templateOptions: {
    includeId: true,
    includeTitle: true,
    includeTags: true,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout' as const,
    userCalloutType: 'QUESTION' as const,
    assistantCalloutType: 'NOTE' as const,
  },
  enableImageExport: true,
  imageVaultPath: 'AI/{platform}/images',
  flattenLargeCallouts: true,
  maxCalloutLines: 200,
};

let mockGetSettings = vi.fn(() => Promise.resolve(defaultSettings));

// Capture the message listener
let capturedListener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean | undefined;

// Setup mocks before any imports
vi.mock('../../src/lib/obsidian-api', () => ({
  ObsidianApiClient: class MockObsidianApiClient {
    testConnection = mockClient.testConnection;
    getFile = mockClient.getFile;
    putFile = mockClient.putFile;
    putBinaryFile = mockClient.putBinaryFile;
    listFiles = mockClient.listFiles;
  },
  isObsidianApiError: (error: unknown) => {
    return typeof error === 'object' && error !== null && 'status' in error && 'message' in error;
  },
}));

vi.mock('../../src/lib/storage', () => ({
  getSettings: () => mockGetSettings(),
  migrateSettings: vi.fn(() => Promise.resolve()),
}));

describe('background/index', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockClient.testConnection.mockReset();
    mockClient.getFile.mockReset();
    mockClient.putFile.mockReset();
    mockClient.putBinaryFile.mockReset();
    mockClient.listFiles.mockReset();
    mockGetSettings = vi.fn(() => Promise.resolve(defaultSettings));

    // Capture message listener when addListener is called
    vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation(listener => {
      capturedListener = listener;
    });

    // Import module fresh - use dynamic import
    vi.resetModules();

    // Re-register mocks after resetModules
    vi.doMock('../../src/lib/obsidian-api', () => ({
      ObsidianApiClient: class MockObsidianApiClient {
        testConnection = mockClient.testConnection;
        getFile = mockClient.getFile;
        putFile = mockClient.putFile;
        putBinaryFile = mockClient.putBinaryFile;
        listFiles = mockClient.listFiles;
      },
      isObsidianApiError: (error: unknown) => {
        return (
          typeof error === 'object' && error !== null && 'status' in error && 'message' in error
        );
      },
    }));

    vi.doMock('../../src/lib/storage', () => ({
      getSettings: () => mockGetSettings(),
      migrateSettings: vi.fn(() => Promise.resolve()),
    }));

    await import('../../src/background/service-worker');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('registers message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(capturedListener).toBeDefined();
    });
  });

  describe('sender validation', () => {
    it('accepts messages from extension popup', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        {
          url: `chrome-extension://${chrome.runtime.id}/popup.html`,
        } as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized' })
      );
    });

    it('accepts messages from gemini.google.com', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        { tab: { url: 'https://gemini.google.com/app/123' } } as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized' })
      );
    });

    it('rejects messages from unauthorized origins', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        { tab: { url: 'https://evil.com' } } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    });

    it('rejects messages with no sender info', () => {
      const sendResponse = vi.fn();
      capturedListener({ action: 'getSettings' }, {} as chrome.runtime.MessageSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    });

    it('handles invalid URLs gracefully', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        { tab: { url: 'not-a-valid-url' } } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    });
  });

  describe('message validation', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('rejects unknown actions', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'unknownAction' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message content',
      });
    });

    it('accepts valid actions', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid message content' })
      );
    });

    describe('missing data validation', () => {
      it('rejects saveToOutputs without data instead of throwing', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'] },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('responds instead of throwing when message property access throws', () => {
        const sendResponse = vi.fn();
        const poisonedMessage = {};
        Object.defineProperty(poisonedMessage, 'action', {
          enumerable: true,
          get() {
            throw new Error('poisoned getter');
          },
        });

        expect(() =>
          capturedListener(
            poisonedMessage,
            validSender as chrome.runtime.MessageSender,
            sendResponse
          )
        ).not.toThrow();
        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });
    });

    describe('note data validation', () => {
      const validNote: ObsidianNote = {
        fileName: 'test.md',
        body: '# Test',
        contentHash: 'abc123',
        frontmatter: {
          id: 'test-id',
          title: 'Test Title',
          source: 'gemini',
          url: 'https://gemini.google.com/app/123',
          created: '2024-01-01',
          modified: '2024-01-01',
          tags: ['test'],
          message_count: 2,
        },
      };

      it('rejects missing fileName', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { ...validNote, fileName: undefined },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects empty fileName', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'], data: { ...validNote, fileName: '' } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects fileName over 200 chars', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { ...validNote, fileName: 'a'.repeat(201) },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('accepts a note with well-formed images', () => {
        const sendResponse = vi.fn();
        mockClient.getFile.mockResolvedValue(null);
        mockClient.putFile.mockResolvedValue(undefined);
        mockClient.putBinaryFile.mockResolvedValue(undefined);
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              images: [{ id: 'img-1', mimeType: 'image/png', data: 'UE5H', alt: 'a' }],
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );
        // Well-formed → passes validation (async save proceeds, not rejected synchronously)
        expect(sendResponse).not.toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects more than the maximum number of images', () => {
        const sendResponse = vi.fn();
        const images = Array.from({ length: 21 }, (_, i) => ({
          id: `img-${i}`,
          mimeType: 'image/png',
          data: 'UE5H',
          alt: 'a',
        }));
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'], data: { ...validNote, images } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );
        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects a malformed image entry', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { ...validNote, images: [{ id: 'img-1', mimeType: 'image/png' }] },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );
        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects images whose combined base64 size exceeds the total cap', () => {
        const sendResponse = vi.fn();
        // One ~13 MiB base64 string reused across 4 entries: each is under the
        // per-image cap (14 MiB) but the sum (~52 MiB) exceeds the 48 MiB total.
        const big = 'A'.repeat(13 * 1024 * 1024); // valid base64 charset, length % 4 === 0
        const images = Array.from({ length: 4 }, (_, i) => ({
          id: `img-${i}`,
          mimeType: 'image/png',
          data: big,
          alt: 'a',
        }));
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'], data: { ...validNote, images } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );
        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects an image with a MIME type outside the allow-list', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              images: [{ id: 'img-1', mimeType: 'image/tiff', data: 'UE5H', alt: 'a' }],
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );
        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects an image with malformed base64 data', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            // '@@@@' is length % 4 === 0 but contains non-base64 characters.
            data: {
              ...validNote,
              images: [{ id: 'img-1', mimeType: 'image/png', data: '@@@@', alt: 'a' }],
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );
        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('accepts multiple valid images within the total cap', () => {
        const sendResponse = vi.fn();
        mockClient.getFile.mockResolvedValue(null);
        mockClient.putFile.mockResolvedValue(undefined);
        mockClient.putBinaryFile.mockResolvedValue(undefined);
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              images: [
                { id: 'img-1', mimeType: 'image/png', data: 'UE5H', alt: 'a' },
                { id: 'img-2', mimeType: 'image/jpeg', data: 'AAAA', alt: 'b' },
                { id: 'img-3', mimeType: 'image/webp', data: 'BBBB', alt: 'c' },
              ],
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );
        expect(sendResponse).not.toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects fileName with path traversal (DES-014 H-1)', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { ...validNote, fileName: '../../etc/passwd' },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects fileName with encoded path traversal (DES-014 H-1)', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { ...validNote, fileName: '%2e%2e%2fetc%2fpasswd' },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects note with missing frontmatter (DES-014 M-8)', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { fileName: 'test.md', body: 'content', contentHash: 'abc' },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects body over 1MB', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { ...validNote, body: 'a'.repeat(1024 * 1024 + 1) },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects invalid source', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: { ...validNote, frontmatter: { ...validNote.frontmatter, source: 'invalid' } },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects more than 50 tags', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              frontmatter: { ...validNote.frontmatter, tags: Array(51).fill('tag') },
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects non-string tag values', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              frontmatter: { ...validNote.frontmatter, tags: [123, null] },
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects tag strings exceeding 100 characters', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              frontmatter: { ...validNote.frontmatter, tags: ['a'.repeat(101)] },
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects empty tag strings', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              frontmatter: { ...validNote.frontmatter, tags: [''] },
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects javascript: URL scheme in frontmatter', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              frontmatter: { ...validNote.frontmatter, url: 'javascript:alert(1)' },
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('rejects data: URL scheme in frontmatter', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              frontmatter: {
                ...validNote.frontmatter,
                url: 'data:text/html,<script>alert(1)</script>',
              },
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });

      it('accepts valid https URL in frontmatter', () => {
        const sendResponse = vi.fn();
        // This should NOT be rejected - it should proceed to save
        capturedListener(
          {
            action: 'saveToOutputs',
            outputs: ['obsidian'],
            data: {
              ...validNote,
              frontmatter: { ...validNote.frontmatter, url: 'https://gemini.google.com/app/123' },
            },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        // Should not immediately reject with validation error
        // (it proceeds to async handling)
        expect(sendResponse).not.toHaveBeenCalledWith({
          success: false,
          error: 'Invalid message content',
        });
      });
    });
  });

  describe('getSettings handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('returns full settings including API key for popup sender', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          obsidianApiKey: 'test-api-key',
          obsidianUrl: 'http://127.0.0.1:27123',
        })
      );
    });

    it('redacts API key for content script (tab) senders', async () => {
      const tabSender = {
        tab: { url: 'https://gemini.google.com/app/123' },
      } as chrome.runtime.MessageSender;

      const sendResponse = vi.fn();
      capturedListener({ action: 'getSettings' }, tabSender, sendResponse);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];

      // Should NOT contain the actual API key
      expect(response).not.toHaveProperty('obsidianApiKey');
      // Should contain the boolean flag instead
      expect(response.isApiKeyConfigured).toBe(true);
      // Should still contain non-sensitive settings
      expect(response.obsidianUrl).toBe('http://127.0.0.1:27123');
      expect(response.vaultPath).toBe('AI/Gemini');
    });

    it('returns isApiKeyConfigured=false when API key is empty', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const tabSender = {
        tab: { url: 'https://claude.ai/chat/123' },
      } as chrome.runtime.MessageSender;

      const sendResponse = vi.fn();
      capturedListener({ action: 'getSettings' }, tabSender, sendResponse);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.isApiKeyConfigured).toBe(false);
      expect(response).not.toHaveProperty('obsidianApiKey');
    });
  });

  describe('obsidianUrl validation in background', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('rejects invalid obsidianUrl from poisoned storage', async () => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve({
          ...defaultSettings,
          obsidianUrl: 'javascript:alert(1)',
        })
      );

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('URL');
    });

    it('rejects ftp scheme obsidianUrl', async () => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve({
          ...defaultSettings,
          obsidianUrl: 'ftp://evil.com',
        })
      );

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error).toContain('URL');
    });
  });

  describe('testConnection handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('returns success on successful connection and authentication', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: true,
        authenticated: true,
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('returns error when server is unreachable', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: false,
        authenticated: false,
        error: 'Cannot reach Obsidian. Is it running?',
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot reach Obsidian. Is it running?',
      });
    });

    it('returns error when API key is invalid', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: true,
        authenticated: false,
        error: 'Invalid API key',
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid API key',
      });
    });

    it('returns error when API key not configured', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'API key not configured',
      });
    });
  });

  describe('obsidian save via saveToOutputs', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    describe('filename collision safeguard (issue #327)', () => {
      const suffix = generateHash('test-id');
      const collisionPath = `AI/Gemini/test-${suffix}.md`;
      const otherConversation = '---\nid: other_id\n---\nSomeone else';
      const send = (sendResponse: ReturnType<typeof vi.fn>) =>
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

      it('saves a DIFFERENT conversation under a collision-free name instead of overwriting', async () => {
        mockClient.getFile.mockImplementation((path: string) =>
          Promise.resolve(path === 'AI/Gemini/test.md' ? otherConversation : null)
        );
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        expect(mockClient.putFile).toHaveBeenCalledTimes(1);
        expect(mockClient.putFile).toHaveBeenCalledWith(collisionPath, expect.any(String));
        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({
            allSuccessful: true,
            results: [
              expect.objectContaining({
                destination: 'obsidian',
                success: true,
                savedAs: `test-${suffix}.md`,
              }),
            ],
          })
        );
      });

      it('still overwrites the SAME conversation at its original path (no savedAs)', async () => {
        mockClient.getFile.mockImplementation((path: string) =>
          Promise.resolve(path === 'AI/Gemini/test.md' ? '---\nid: test-id\n---\nMine' : null)
        );
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        expect(mockClient.putFile).toHaveBeenCalledWith('AI/Gemini/test.md', expect.any(String));
        const result = sendResponse.mock.calls[0][0].results[0];
        expect(result.savedAs).toBeUndefined();
      });

      it('re-saves land on the SAME collision-free name (deterministic)', async () => {
        mockClient.getFile.mockImplementation((path: string) => {
          if (path === 'AI/Gemini/test.md') return Promise.resolve(otherConversation);
          if (path === collisionPath) return Promise.resolve('---\nid: test-id\n---\nMine');
          return Promise.resolve(null);
        });
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        expect(mockClient.putFile).toHaveBeenCalledWith(collisionPath, expect.any(String));
      });

      it('protects existing files whose frontmatter cannot be parsed', async () => {
        mockClient.getFile.mockImplementation((path: string) =>
          Promise.resolve(path === 'AI/Gemini/test.md' ? 'Just a hand-written note' : null)
        );
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        expect(mockClient.putFile).toHaveBeenCalledWith(collisionPath, expect.any(String));
      });

      it('fails with a clear error when no collision-free name is found', async () => {
        mockClient.getFile.mockResolvedValue(otherConversation); // every candidate occupied
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        expect(mockClient.putFile).not.toHaveBeenCalled();
        const result = sendResponse.mock.calls[0][0].results[0];
        expect(result.success).toBe(false);
        expect(result.error).toContain('collision');
      });
    });

    // Forking a new file is a decision the save path used to make in complete
    // silence, which is why three rounds of correspondence on #365 could not
    // pin down WHICH negative had occurred. Behaviour is unchanged here — only
    // the reasoning becomes visible.
    describe('fork diagnostics (issue #365)', () => {
      const suffix = generateHash('test-id');
      const send = (sendResponse: ReturnType<typeof vi.fn>) =>
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

      it('warns with every probe outcome when it forks an alternative name', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockClient.getFile.mockImplementation((path: string) =>
          Promise.resolve(
            path === 'AI/Gemini/test.md' ? '---\nid: other_id\n---\nSomeone else' : null
          )
        );
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

        const call = warn.mock.calls.find(c => String(c[0]).includes('Filename collision'));
        expect(call).toBeDefined();
        const detail = call?.[1] as {
          expectedId: string;
          savedAs: string;
          probes: Array<{ attempt: number; fileName: string; state: string; foundId?: string }>;
        };
        expect(detail.expectedId).toBe('test-id');
        expect(detail.savedAs).toBe(`test-${suffix}.md`);
        expect(detail.probes[0]).toEqual({
          attempt: 0,
          fileName: 'test.md',
          state: 'different-id',
          foundId: 'other_id',
        });
        expect(detail.probes[1]).toMatchObject({ attempt: 1, state: 'absent' });
        warn.mockRestore();
      });

      it('reports an empty occupying file as empty, not as another conversation', async () => {
        // Behaviour is deliberately unchanged (it still forks) — but a 0-byte
        // note must not be reported as evidence that someone else owns the name.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockClient.getFile.mockImplementation((path: string) =>
          Promise.resolve(path === 'AI/Gemini/test.md' ? '' : null)
        );
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

        const call = warn.mock.calls.find(c => String(c[0]).includes('Filename collision'));
        const detail = call?.[1] as { probes: Array<{ attempt: number; state: string }> };
        expect(detail.probes[0]).toEqual({ attempt: 0, fileName: 'test.md', state: 'empty' });
        // Unchanged behaviour: the fork still happens.
        expect(mockClient.putFile).toHaveBeenCalledWith(
          `AI/Gemini/test-${suffix}.md`,
          expect.any(String)
        );
        warn.mockRestore();
      });

      it('does not fork when the existing note is CRLF-terminated (issue #365)', async () => {
        // The reported failure end to end: a note the extension wrote, later
        // rewritten with Windows line endings by the user's own tooling. It
        // used to read as `no-id`, so the save forked `…-<hash>.md` beside it.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ownNote = ['---', 'id: test-id', 'title: T', '---', '', 'Body'].join('\r\n');
        mockClient.getFile.mockImplementation((path: string) =>
          Promise.resolve(path === 'AI/Gemini/test.md' ? ownNote : null)
        );
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

        // Written back to its own name, not to a collision-free alternative.
        expect(mockClient.putFile).toHaveBeenCalledWith('AI/Gemini/test.md', expect.any(String));
        expect(warn.mock.calls.filter(c => String(c[0]).includes('Filename collision'))).toEqual(
          []
        );
        warn.mockRestore();
      });

      it('stays silent when the note lands on its canonical name', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockClient.getFile.mockResolvedValue(null);
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        send(sendResponse);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

        expect(warn.mock.calls.filter(c => String(c[0]).includes('Filename collision'))).toEqual(
          []
        );
        warn.mockRestore();
      });
    });

    it('saves new file successfully', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(mockClient.putFile).toHaveBeenCalledWith('AI/Gemini/test.md', expect.any(String));
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          allSuccessful: true,
          results: [expect.objectContaining({ destination: 'obsidian', success: true })],
        })
      );
    });

    it('updates existing file (same conversation id)', async () => {
      mockClient.getFile.mockResolvedValue('---\nid: test-id\n---\n# Old Content');
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          allSuccessful: true,
          results: [expect.objectContaining({ destination: 'obsidian', success: true })],
        })
      );
    });

    it('handles save errors', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockRejectedValue({ status: 500, message: 'Server error' });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          allSuccessful: false,
          results: [
            expect.objectContaining({
              destination: 'obsidian',
              success: false,
              error: 'Server error',
            }),
          ],
        })
      );
    });

    it('returns error when API key not configured', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          allSuccessful: false,
          results: [
            expect.objectContaining({
              destination: 'obsidian',
              success: false,
              error: 'API key not configured',
            }),
          ],
        })
      );
    });

    it('resolves date variables in vault path at save time (local time)', async () => {
      vi.setSystemTime(new Date(2026, 4, 4, 10, 0, 0)); // 2026-05-04 local
      try {
        mockGetSettings = vi.fn(() =>
          Promise.resolve({ ...defaultSettings, vaultPath: 'AI/{platform}/{YYYY}/{MM}' })
        );
        mockClient.getFile.mockResolvedValue(null);
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        expect(mockClient.putFile).toHaveBeenCalledWith(
          'AI/gemini/2026/05/test.md',
          expect.any(String)
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('zero-pads single-digit month and day in resolved path', async () => {
      vi.setSystemTime(new Date(2026, 0, 3, 8, 0, 0)); // 2026-01-03 local
      try {
        mockGetSettings = vi.fn(() =>
          Promise.resolve({ ...defaultSettings, vaultPath: '{platform}/{YYYY}-{MM}-{DD}' })
        );
        mockClient.getFile.mockResolvedValue(null);
        mockClient.putFile.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToOutputs', outputs: ['obsidian'], data: validNote },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        expect(mockClient.putFile).toHaveBeenCalledWith(
          'gemini/2026-01-03/test.md',
          expect.any(String)
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('testConnection additional scenarios', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('uses fallback error message when reachable is false without error', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: false,
        authenticated: false,
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot reach Obsidian. Is it running?',
      });
    });

    it('uses fallback error message when authenticated is false without error', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: true,
        authenticated: false,
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid API key. Please check your settings.',
      });
    });
  });

  // ============================================================================
  // Multi-Output Tests (saveToOutputs action)
  // ============================================================================

  describe('offscreen message handling', () => {
    it('ignores messages targeted at offscreen document', () => {
      const sendResponse = vi.fn();
      const result = capturedListener(
        { action: 'clipboardWrite', target: 'offscreen', content: 'test' },
        {
          url: `chrome-extension://${chrome.runtime.id}/popup.html`,
        } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('saveToOutputs validation', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('rejects missing outputs array', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message content',
      });
    });

    it('rejects empty outputs array', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: [] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message content',
      });
    });

    it('rejects invalid output destination', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['invalid'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message content',
      });
    });

    it('accepts valid outputs array with obsidian', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['obsidian'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ results: expect.any(Array) })
      );
    });

    it('accepts valid outputs array with file', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['file'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ results: expect.any(Array) })
      );
    });

    it('accepts valid outputs array with clipboard', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ results: expect.any(Array) })
      );
    });
  });

  describe('handleMultiOutput', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    beforeEach(() => {
      // Setup mocks for successful operations
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });
    });

    it('executes single obsidian output', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['obsidian'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean }>;
        allSuccessful: boolean;
        anySuccessful: boolean;
      };
      expect(response.results).toHaveLength(1);
      expect(response.results[0].destination).toBe('obsidian');
      expect(response.results[0].success).toBe(true);
      expect(response.allSuccessful).toBe(true);
      expect(response.anySuccessful).toBe(true);
    });

    it('executes multiple outputs in parallel', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['obsidian', 'file'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean }>;
        allSuccessful: boolean;
        anySuccessful: boolean;
      };
      expect(response.results).toHaveLength(2);
      const destinations = response.results.map(r => r.destination);
      expect(destinations).toContain('obsidian');
      expect(destinations).toContain('file');
      expect(response.allSuccessful).toBe(true);
      expect(response.anySuccessful).toBe(true);
    });

    it('handles partial failures correctly', async () => {
      // Obsidian fails, file succeeds
      mockClient.putFile.mockRejectedValue(new Error('API error'));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['obsidian', 'file'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean; error?: string }>;
        allSuccessful: boolean;
        anySuccessful: boolean;
      };
      expect(response.allSuccessful).toBe(false);
      expect(response.anySuccessful).toBe(true);
      // Find the obsidian result
      const obsidianResult = response.results.find(r => r.destination === 'obsidian');
      expect(obsidianResult?.success).toBe(false);
      expect(obsidianResult?.error).toBeDefined();
    });

    it('executes all three outputs', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['obsidian', 'file', 'clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean }>;
        allSuccessful: boolean;
        anySuccessful: boolean;
      };
      expect(response.results).toHaveLength(3);
      expect(response.allSuccessful).toBe(true);
    });
  });

  describe('handleDownloadToFile', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test-conversation.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('downloads file successfully', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['file'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(chrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('data:text/markdown'),
          filename: expect.stringContaining('.md'),
        }),
        expect.any(Function)
      );

      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean }>;
      };
      const fileResult = response.results.find(r => r.destination === 'file');
      expect(fileResult?.success).toBe(true);
    });

    it('handles download failure with lastError', async () => {
      vi.mocked(chrome.downloads.download).mockImplementation((_options, callback) => {
        // Simulate chrome.runtime.lastError
        (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError = {
          message: 'Download blocked',
        };
        if (callback) callback(undefined);
        (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError = null;
        return 0;
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['file'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean; error?: string }>;
        allSuccessful: boolean;
        anySuccessful: boolean;
      };
      const fileResult = response.results.find(r => r.destination === 'file');
      expect(fileResult?.success).toBe(false);
      expect(fileResult?.error).toBe('Download blocked');
    });

    it('handles undefined downloadId', async () => {
      vi.mocked(chrome.downloads.download).mockImplementation((_options, callback) => {
        if (callback) callback(undefined);
        return 0;
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['file'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean; error?: string }>;
      };
      const fileResult = response.results.find(r => r.destination === 'file');
      expect(fileResult?.success).toBe(false);
      expect(fileResult?.error).toBe('Download failed');
    });
  });

  describe('image export (issue #186)', () => {
    const sender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const imageNote: ObsidianNote = {
      fileName: 'img-note.md',
      body: 'Here is the image.\n\n![（AI 生成）](g2o-image://img-1)',
      contentHash: 'hash',
      images: [{ id: 'img-1', mimeType: 'image/png', data: 'UE5H', alt: '（AI 生成）' }],
      frontmatter: {
        id: 'imgconv',
        title: 'Image Note',
        source: 'gemini',
        url: 'https://gemini.google.com/app/imgconv',
        created: '2026-01-01',
        modified: '2026-01-01',
        tags: ['ai-conversation', 'gemini'],
        message_count: 2,
      },
    };

    function save(outputs: string[]): ReturnType<typeof vi.fn> {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: imageNote, outputs },
        sender as chrome.runtime.MessageSender,
        sendResponse
      );
      return sendResponse;
    }

    it('obsidian: writes image binary to the vault and embeds a wikilink', async () => {
      mockClient.getFile.mockResolvedValue(null); // fresh file
      mockClient.putFile.mockResolvedValue(undefined);
      mockClient.putBinaryFile.mockResolvedValue(undefined);

      const sendResponse = save(['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(mockClient.putBinaryFile).toHaveBeenCalledWith(
        'AI/gemini/images/img-note-img-1.png',
        expect.any(Uint8Array),
        'image/png'
      );
      const savedContent = mockClient.putFile.mock.calls[0][1] as string;
      expect(savedContent).toContain('![[img-note-img-1.png]]');
      expect(savedContent).not.toContain('g2o-image://');
    });

    it('file: downloads the markdown and each image as separate files', async () => {
      // Reset any download impl left by earlier tests (clearAllMocks keeps impl).
      vi.mocked(chrome.downloads.download).mockImplementation((_options, callback) => {
        callback?.(1);
        return 1 as unknown as ReturnType<typeof chrome.downloads.download>;
      });

      const sendResponse = save(['file']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const urls = vi
        .mocked(chrome.downloads.download)
        .mock.calls.map(call => (call[0] as chrome.downloads.DownloadOptions).url);
      const names = vi
        .mocked(chrome.downloads.download)
        .mock.calls.map(call => (call[0] as chrome.downloads.DownloadOptions).filename);

      expect(urls.some(u => u?.startsWith('data:text/markdown'))).toBe(true);
      expect(urls.some(u => u?.startsWith('data:image/png;base64,UE5H'))).toBe(true);
      expect(names).toContain('img-note-img-1.png');
    });

    it('clipboard: strips image placeholders entirely', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const sendResponse = save(['clipboard']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const clipboardCall = vi
        .mocked(chrome.runtime.sendMessage)
        .mock.calls.find(call => (call[0] as { action?: string }).action === 'clipboardWrite');
      const content = (clipboardCall?.[0] as { content: string }).content;
      expect(content).not.toContain('g2o-image://');
      expect(content).not.toContain('![[');
    });

    it('obsidian: reports a warning when an image write fails, without blocking the note (issue #376)', async () => {
      mockClient.getFile.mockResolvedValue(null); // fresh file
      mockClient.putFile.mockResolvedValue(undefined);
      mockClient.putBinaryFile.mockRejectedValue(new Error('boom'));

      const sendResponse = save(['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const response = sendResponse.mock.calls[0][0] as MultiOutputResponse;
      const obsidian = response.results.find(r => r.destination === 'obsidian');
      // The note itself must still be written (image failures are non-blocking).
      expect(obsidian?.success).toBe(true);
      expect(mockClient.putFile).toHaveBeenCalled();
      // ...but the failure must no longer be silent.
      expect(obsidian?.warning).toContain('img-note-img-1.png');
    });

    it('obsidian: reports no warning when every image write succeeds', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);
      mockClient.putBinaryFile.mockResolvedValue(undefined);

      const sendResponse = save(['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const response = sendResponse.mock.calls[0][0] as MultiOutputResponse;
      const obsidian = response.results.find(r => r.destination === 'obsidian');
      expect(obsidian?.success).toBe(true);
      expect(obsidian?.warning).toBeUndefined();
    });

    it('obsidian: image export disabled strips placeholders and writes no binary', async () => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve({ ...defaultSettings, enableImageExport: false })
      );
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = save(['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(mockClient.putBinaryFile).not.toHaveBeenCalled();
      const savedContent = mockClient.putFile.mock.calls[0][1] as string;
      expect(savedContent).not.toContain('g2o-image://');
      expect(savedContent).not.toContain('![[');
    });
  });

  describe('callout flattening (Obsidian only, issue: large-callout hang)', () => {
    const sender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const bigCalloutBody = [
      '> [!QUESTION] User',
      ...Array.from({ length: 8 }, (_, i) => `> line ${i}`),
    ].join('\n');
    const note: ObsidianNote = {
      fileName: 'big.md',
      body: bigCalloutBody,
      contentHash: 'h',
      images: [],
      frontmatter: {
        id: 'big',
        title: 'Big',
        source: 'gemini',
        url: 'https://gemini.google.com/app/big',
        created: '2026-01-01',
        modified: '2026-01-01',
        tags: ['ai-conversation', 'gemini'],
        message_count: 1,
      },
    };

    beforeEach(() => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve({ ...defaultSettings, flattenLargeCallouts: true, maxCalloutLines: 5 })
      );
    });

    function save(outputs: string[]): ReturnType<typeof vi.fn> {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: note, outputs },
        sender as chrome.runtime.MessageSender,
        sendResponse
      );
      return sendResponse;
    }

    it('flattens a callout longer than the threshold when saving to Obsidian', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);
      const sendResponse = save(['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const saved = mockClient.putFile.mock.calls[0][1] as string;
      expect(saved).toContain('**User:**');
      expect(saved).not.toContain('> [!QUESTION] User');
    });

    it('does NOT flatten for the download (file) output — callouts are kept', async () => {
      vi.mocked(chrome.downloads.download).mockImplementation((_o, cb) => {
        cb?.(1);
        return 1 as unknown as ReturnType<typeof chrome.downloads.download>;
      });
      const sendResponse = save(['file']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const url = (
        vi.mocked(chrome.downloads.download).mock.calls[0][0] as chrome.downloads.DownloadOptions
      ).url;
      const content = atob(url.split('base64,')[1]);
      expect(content).toContain('> [!QUESTION] User'); // callout preserved in download
      expect(content).not.toContain('**User:**');
    });

    it('leaves the callout intact when the toggle is off', async () => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve({ ...defaultSettings, flattenLargeCallouts: false, maxCalloutLines: 5 })
      );
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);
      const sendResponse = save(['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const saved = mockClient.putFile.mock.calls[0][1] as string;
      expect(saved).toContain('> [!QUESTION] User');
    });
  });

  describe('handleCopyToClipboard', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('copies to clipboard successfully', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'clipboardWrite',
          target: 'offscreen',
          content: expect.any(String),
        })
      );

      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean }>;
      };
      const clipboardResult = response.results.find(r => r.destination === 'clipboard');
      expect(clipboardResult?.success).toBe(true);
    });

    it('handles clipboard write failure', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: false,
        error: 'Clipboard access denied',
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean; error?: string }>;
        allSuccessful: boolean;
        anySuccessful: boolean;
      };
      const clipboardResult = response.results.find(r => r.destination === 'clipboard');
      expect(clipboardResult?.success).toBe(false);
      expect(clipboardResult?.error).toBe('Clipboard access denied');
      expect(response.allSuccessful).toBe(false);
      expect(response.anySuccessful).toBe(false);
    });

    it('creates offscreen document when needed', async () => {
      vi.mocked(chrome.runtime.getContexts).mockResolvedValue([]);
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(chrome.offscreen.createDocument).toHaveBeenCalled();
    });

    it('reuses existing offscreen document', async () => {
      vi.mocked(chrome.runtime.getContexts).mockResolvedValue([
        { contextType: 'OFFSCREEN_DOCUMENT' } as chrome.runtime.ExtensionContext,
      ]);
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
    });

    it('handles offscreen document creation failure', async () => {
      vi.mocked(chrome.runtime.getContexts).mockResolvedValue([]);
      vi.mocked(chrome.offscreen.createDocument).mockRejectedValue(
        new Error('Failed to create offscreen document')
      );

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as {
        results: Array<{ destination: string; success: boolean; error?: string }>;
      };
      const clipboardResult = response.results.find(r => r.destination === 'clipboard');
      expect(clipboardResult?.success).toBe(false);
      expect(clipboardResult?.error).toContain('Failed to create offscreen document');
    });
  });

  // ========== Coverage Gap: scheduleOffscreenClose (DES-005 3.5) ==========
  describe('scheduleOffscreenClose', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('calls closeDocument after clipboard operation completes', async () => {
      // Covers: background/index.ts lines 332-345 (scheduleOffscreenClose)
      // Uses real timers + vi.waitFor since scheduleOffscreenClose's setTimeout
      // is created after dynamic module import, making fake timers incompatible.
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      // Wait for the clipboard operation to complete
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      // Wait for the offscreen close timer (5000ms) to fire
      await vi.waitFor(
        () => {
          expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
        },
        { timeout: 7000 }
      );
    });
  });

  // ========== Coverage Gap: handleSaveToObsidian catch block (DES-005 3.5) ==========
  describe('handleSaveToObsidian error handling', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('catches generic Error in handleSaveToObsidian and returns failure', async () => {
      // Covers: background/index.ts lines 380-386 (catch block)
      mockClient.getFile.mockImplementation(() => {
        throw new Error('Unexpected getFile error');
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['obsidian'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];

      expect(response.results[0].destination).toBe('obsidian');
      expect(response.results[0].success).toBe(false);
      expect(response.results[0].error).toBeDefined();
    });
  });

  // ========== Coverage Gap: handleDownloadToFile catch block (DES-005 3.5) ==========
  describe('handleDownloadToFile error handling', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test-conversation.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('catches error in handleDownloadToFile and returns failure result', async () => {
      // Covers: background/index.ts lines 447-453 (catch block)
      vi.mocked(chrome.downloads.download).mockImplementation(() => {
        throw new Error('Download API unavailable');
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['file'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];

      expect(response.results[0].destination).toBe('file');
      expect(response.results[0].success).toBe(false);
      expect(response.results[0].error).toContain('Download API unavailable');
    });
  });

  // ========== Coverage Gap: handleMultiOutput rejected promise (DES-005 3.5) ==========
  describe('handleMultiOutput Promise.allSettled rejected branch', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('maps rejected promise reason to error string via String()', async () => {
      // Covers: background/index.ts lines 526-535 (rejected branch in allSettled)
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockRejectedValue('string rejection reason');

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', data: validNote, outputs: ['obsidian'] },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];

      expect(response.results[0].success).toBe(false);
      expect(response.results[0].error).toBeDefined();
      expect(response.allSuccessful).toBe(false);
    });
  });

  // ========== Append Mode Tests ==========

  describe('append mode', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const appendNote: ObsidianNote = {
      fileName: 'test-abc12345.md',
      body: [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] Claude',
        '> Hi there!',
        '',
        '> [!QUESTION] User',
        '> New question',
        '',
        '> [!NOTE] Claude',
        '> New answer',
      ].join('\n'),
      contentHash: 'abc123',
      frontmatter: {
        id: 'claude_abc-def',
        title: 'Test Chat',
        source: 'claude',
        url: 'https://claude.ai/chat/abc-def',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
        tags: ['ai-conversation', 'claude'],
        message_count: 4,
      },
    };

    const existingContent = [
      '---',
      'id: claude_abc-def',
      'message_count: 2',
      'modified: "2026-01-01T00:00:00.000Z"',
      '---',
      '> [!QUESTION] User',
      '> Hello',
      '',
      '> [!NOTE] Claude',
      '> Hi there!',
    ].join('\n');

    const appendSettings = {
      ...defaultSettings,
      vaultPath: 'AI/{platform}',
      enableAutoScroll: false,
      enableAppendMode: true,
      outputOptions: { obsidian: true, file: false, clipboard: false },
    };

    it('appends new messages when file exists and has fewer messages', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      mockClient.getFile.mockResolvedValueOnce(existingContent); // direct lookup
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
      expect(response.messagesAppended).toBe(2);
    });

    it('reports why append mode found no existing note (issue #365)', async () => {
      // The miss is what makes the save path fork a new file, so name it.
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      mockClient.getFile.mockResolvedValue(null); // direct path absent
      mockClient.listFiles.mockResolvedValue([]); // …and nothing to scan
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const call = info.mock.calls.find(c => String(c[0]).includes('Append lookup'));
      expect(call).toBeDefined();
      expect(call?.[1]).toMatchObject({
        id: 'claude_abc-def',
        missReason: 'empty-directory',
        directProbe: { state: 'absent' },
      });
      info.mockRestore();
    });

    it('returns messagesAppended: 0 when no new messages', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      // Existing file already has 4 messages
      const fullExisting =
        existingContent.replace('message_count: 2', 'message_count: 4') +
        '\n\n> [!QUESTION] User\n> New question\n\n> [!NOTE] Claude\n> New answer';
      mockClient.getFile.mockResolvedValueOnce(fullExisting);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
      expect(response.messagesAppended).toBe(0);
    });

    it('does not re-append the tail of a note whose callouts were flattened (issue #406)', async () => {
      // The note we saved last time had one oversized callout, so the Obsidian
      // save path wrote it as `**Claude:**` plain text. Nothing has changed in
      // the conversation since. Append mode must recognise all 4 messages as
      // already present — counting only the surviving callouts makes it append
      // the tail a second time, verbatim.
      const longAnswer = Array.from({ length: 8 }, (_, i) => `> answer line ${i}`);
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] Claude',
        ...longAnswer,
        '',
        '> [!QUESTION] User',
        '> New question',
        '',
        '> [!NOTE] Claude',
        '> New answer',
      ].join('\n');
      const note: ObsidianNote = {
        ...appendNote,
        body,
        frontmatter: { ...appendNote.frontmatter, message_count: 4 },
      };
      // Exactly what the previous save wrote to the vault.
      const onDisk = [
        '---',
        'id: claude_abc-def',
        'message_count: 4',
        'modified: "2026-01-01T00:00:00.000Z"',
        '---',
        flattenLargeCallouts(body, 5),
      ].join('\n');
      expect(onDisk).toContain('**Claude:**'); // guard: the fixture really is mixed

      mockGetSettings = vi.fn(() =>
        Promise.resolve({ ...appendSettings, flattenLargeCallouts: true, maxCalloutLines: 5 })
      );
      mockClient.getFile.mockResolvedValueOnce(onDisk);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: note },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
      expect(response.messagesAppended).toBe(0);
      expect(mockClient.putFile).not.toHaveBeenCalled();
    });

    it('falls back to overwrite when append mode is off', async () => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve({ ...appendSettings, enableAppendMode: false })
      );
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
      expect(response.messagesAppended).toBeUndefined();
    });

    it('creates new file when existing file not found in append mode', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      mockClient.getFile.mockResolvedValue(null); // no file found
      mockClient.listFiles.mockResolvedValue([]); // empty directory
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
    });

    it('skips append mode for deep-research type', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      const deepResearchNote = {
        ...appendNote,
        frontmatter: { ...appendNote.frontmatter, type: 'deep-research' },
      };
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: deepResearchNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
      // Should NOT have messagesAppended (went through overwrite path)
      expect(response.messagesAppended).toBeUndefined();
    });

    it('falls back to overwrite when append throws error', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      // First getFile call (append lookup) throws, but catch block falls through
      mockClient.getFile
        .mockRejectedValueOnce(new Error('Network error')) // append lookup fails
        .mockResolvedValueOnce(null); // overwrite path: file doesn't exist
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
    });

    it('uses ID scan when direct path has wrong ID', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      // Return different content based on path
      mockClient.getFile.mockImplementation((path: string) => {
        if (path === 'AI/claude/test-abc12345.md') {
          return Promise.resolve('---\nid: different_id\n---\nBody');
        }
        if (path === 'AI/claude/old-title-abc12345.md') {
          return Promise.resolve(existingContent);
        }
        return Promise.resolve(null);
      });
      mockClient.listFiles.mockResolvedValue(['old-title-abc12345.md']);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
      expect(response.messagesAppended).toBe(2);
    });

    it('memoizes the found path and skips re-scanning on subsequent appends', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      mockClient.getFile.mockImplementation((path: string) => {
        if (path === 'AI/claude/old-title-abc12345.md') {
          return Promise.resolve(existingContent);
        }
        return Promise.resolve(null); // direct path never exists
      });
      mockClient.listFiles.mockResolvedValue(['old-title-abc12345.md']);
      mockClient.putFile.mockResolvedValue(undefined);

      // First save: file is only findable via the ID scan
      const firstResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        firstResponse
      );
      await vi.waitFor(() => expect(firstResponse).toHaveBeenCalled());
      expect(mockClient.listFiles).toHaveBeenCalled();

      // Second save: the memoized path must be tried directly — no directory scan
      mockClient.listFiles.mockClear();
      const secondResponse = vi.fn();
      capturedListener(
        { action: 'saveToOutputs', outputs: ['obsidian'], data: appendNote },
        validSender as chrome.runtime.MessageSender,
        secondResponse
      );
      await vi.waitFor(() => expect(secondResponse).toHaveBeenCalled());
      const response = secondResponse.mock.calls[0][0];
      expect(response.allSuccessful).toBe(true);
      expect(mockClient.listFiles).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage rejection path', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('sends error response when handleMessage rejects', async () => {
      // Force getSettings (first await in handleMessage) to throw so the
      // outer promise rejects and the catch handler runs (L62-64).
      mockGetSettings = vi.fn(() => Promise.reject(new Error('storage failure')));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'storage failure',
      });
      expect(errorSpy).toHaveBeenCalledWith(
        '[G2O Background] Error handling message:',
        expect.any(Error)
      );
    });
  });
});

describe('background/index migrateSettings failure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('../../src/lib/storage');
    vi.doUnmock('../../src/lib/obsidian-api');
  });

  it('logs an error when migrateSettings rejects at startup', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.resetModules();
    vi.doMock('../../src/lib/obsidian-api', () => ({
      ObsidianApiClient: class {
        testConnection = vi.fn();
        getFile = vi.fn();
        putFile = vi.fn();
        listFiles = vi.fn();
      },
      isObsidianApiError: () => false,
    }));
    vi.doMock('../../src/lib/storage', () => ({
      getSettings: vi.fn(() => Promise.resolve({})),
      migrateSettings: vi.fn(() => Promise.reject(new Error('migration failed'))),
    }));

    await import('../../src/background/service-worker');

    // The .catch() handler schedules a microtask — flush it.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalledWith(
      '[G2O Background] Settings migration failed:',
      expect.any(Error)
    );
  });
});
