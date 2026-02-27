/**
 * Background service worker tests
 *
 * Tests the message handling, validation, and API integration of the background script.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ObsidianNote } from '../../src/lib/types';

// Mock client instance - defined at module level
const mockClient = {
  testConnection: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  listFiles: vi.fn(),
};

// Default settings
const defaultSettings = {
  obsidianApiKey: 'test-api-key',
  obsidianPort: 27123,
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
    mockClient.listFiles.mockReset();
    mockGetSettings = vi.fn(() => Promise.resolve(defaultSettings));

    // Capture message listener when addListener is called
    vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation((listener) => {
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
        listFiles = mockClient.listFiles;
      },
      isObsidianApiError: (error: unknown) => {
        return typeof error === 'object' && error !== null && 'status' in error && 'message' in error;
      },
    }));

    vi.doMock('../../src/lib/storage', () => ({
      getSettings: () => mockGetSettings(),
      migrateSettings: vi.fn(() => Promise.resolve()),
    }));

    await import('../../src/background/index');
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
        { url: `chrome-extension://${chrome.runtime.id}/popup.html` } as chrome.runtime.MessageSender,
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
      capturedListener(
        { action: 'getSettings' },
        {} as chrome.runtime.MessageSender,
        sendResponse
      );

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

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
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

    describe('saveToObsidian validation', () => {
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
          { action: 'saveToObsidian', data: { ...validNote, fileName: undefined } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects empty fileName', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToObsidian', data: { ...validNote, fileName: '' } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects fileName over 200 chars', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToObsidian', data: { ...validNote, fileName: 'a'.repeat(201) } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects body over 1MB', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToObsidian', data: { ...validNote, body: 'a'.repeat(1024 * 1024 + 1) } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects invalid source', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToObsidian',
            data: { ...validNote, frontmatter: { ...validNote.frontmatter, source: 'invalid' } },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects more than 50 tags', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToObsidian',
            data: { ...validNote, frontmatter: { ...validNote.frontmatter, tags: Array(51).fill('tag') } },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });
    });
  });

  describe('getSettings handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('returns settings', async () => {
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
          obsidianPort: 27123,
        })
      );
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

  describe('saveToObsidian handler', () => {
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

    it('saves new file successfully', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(mockClient.putFile).toHaveBeenCalledWith('AI/Gemini/test.md', expect.any(String));
      expect(sendResponse).toHaveBeenCalledWith({ success: true, isNewFile: true });
    });

    it('updates existing file', async () => {
      mockClient.getFile.mockResolvedValue('# Old Content');
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true, isNewFile: false });
    });

    it('handles save errors', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockRejectedValue({ status: 500, message: 'Server error' });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Server error' });
    });

    it('returns error when API key not configured', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
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

  describe('getExistingFile handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('returns file content when exists', async () => {
      mockClient.getFile.mockResolvedValue('# File Content');

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md', vaultPath: 'AI/Gemini' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true, content: '# File Content' });
    });

    it('returns undefined content when file not found', async () => {
      mockClient.getFile.mockResolvedValue(null);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true, content: undefined });
    });

    it('returns error when API key not configured', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'API key not configured' });
    });

    it('handles getFile errors gracefully', async () => {
      mockClient.getFile.mockRejectedValue(new Error('Network timeout'));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Network timeout' });
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
        { url: `chrome-extension://${chrome.runtime.id}/popup.html` } as chrome.runtime.MessageSender,
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
      const destinations = response.results.map((r) => r.destination);
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
      const obsidianResult = response.results.find((r) => r.destination === 'obsidian');
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
      const fileResult = response.results.find((r) => r.destination === 'file');
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
      const fileResult = response.results.find((r) => r.destination === 'file');
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
      const fileResult = response.results.find((r) => r.destination === 'file');
      expect(fileResult?.success).toBe(false);
      expect(fileResult?.error).toBe('Download failed');
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
      const clipboardResult = response.results.find((r) => r.destination === 'clipboard');
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
      const clipboardResult = response.results.find((r) => r.destination === 'clipboard');
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
      const clipboardResult = response.results.find((r) => r.destination === 'clipboard');
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
      // Use real timers with a short polling approach.
      // The OFFSCREEN_TIMEOUT_MS is 5000ms. We use waitFor with a generous timeout.
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
      await vi.waitFor(() => {
        expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
      }, { timeout: 7000 });
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
        { action: 'saveToObsidian', data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.messagesAppended).toBe(2);
      expect(response.isNewFile).toBe(false);
    });

    it('returns messagesAppended: 0 when no new messages', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      // Existing file already has 4 messages
      const fullExisting = existingContent.replace('message_count: 2', 'message_count: 4')
        + '\n\n> [!QUESTION] User\n> New question\n\n> [!NOTE] Claude\n> New answer';
      mockClient.getFile.mockResolvedValueOnce(fullExisting);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.messagesAppended).toBe(0);
    });

    it('falls back to overwrite when append mode is off', async () => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve({ ...appendSettings, enableAppendMode: false })
      );
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.isNewFile).toBe(true);
      expect(response.messagesAppended).toBeUndefined();
    });

    it('creates new file when existing file not found in append mode', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve(appendSettings));
      mockClient.getFile.mockResolvedValue(null); // no file found
      mockClient.listFiles.mockResolvedValue([]); // empty directory
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.isNewFile).toBe(true);
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
        { action: 'saveToObsidian', data: deepResearchNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.isNewFile).toBe(true);
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
        { action: 'saveToObsidian', data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.isNewFile).toBe(true);
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
        { action: 'saveToObsidian', data: appendNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.messagesAppended).toBe(2);
    });
  });
});
