/**
 * Background handling of generated files ("crafts", ADR-046): Obsidian write,
 * file download, clipboard strip, append-mode strip, and input validation.
 * The counterpart of the image-export block in index.test.ts.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MultiOutputResponse, ObsidianNote } from '../../src/lib/types';

const mockClient = {
  testConnection: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  putBinaryFile: vi.fn(),
  listFiles: vi.fn(),
};

const defaultSettings = {
  obsidianApiKey: 'test-api-key',
  obsidianUrl: 'http://127.0.0.1:27123',
  vaultPath: 'AI/{platform}',
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
  enableAppendMode: false,
};

let mockGetSettings = vi.fn(() => Promise.resolve<Record<string, unknown>>(defaultSettings));

let capturedListener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean | undefined;

const sender = { url: `chrome-extension://test-extension-id/popup.html` };

const craftNote: ObsidianNote = {
  fileName: 'chat-abc12345.md',
  body: [
    '> [!NOTE] Merlin',
    '> Ecco i file.',
    '> ',
    '> [handshake-http.html](g2o-craft://craft-1)',
    '> ',
    '> [handshake-http.html](g2o-craft://craft-2)',
  ].join('\n'),
  contentHash: 'hash',
  artifacts: [
    {
      id: 'craft-1',
      name: 'handshake-http.html',
      language: 'html',
      content: '<html>\n<body>1</body>\n</html>',
    },
    { id: 'craft-2', name: 'handshake-http.html', language: 'html', content: '<html>2</html>' },
  ],
  frontmatter: {
    id: 'merlin_abc',
    title: 'Chat',
    source: 'merlin',
    url: 'https://www.getmerlin.in/chat/abc',
    created: '2026-01-01',
    modified: '2026-01-01',
    tags: ['ai-conversation', 'merlin'],
    message_count: 2,
  },
};

function save(data: ObsidianNote, outputs: string[]): ReturnType<typeof vi.fn> {
  const sendResponse = vi.fn();
  capturedListener(
    { action: 'saveToOutputs', data, outputs },
    sender as chrome.runtime.MessageSender,
    sendResponse
  );
  return sendResponse;
}

function artifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'c1', name: 'a.md', language: 'markdown', content: 'x', ...overrides };
}

describe('background: artifact export', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const fn of Object.values(mockClient)) fn.mockReset();
    mockGetSettings = vi.fn(() => Promise.resolve<Record<string, unknown>>(defaultSettings));
    vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation(listener => {
      capturedListener = listener;
    });
    vi.resetModules();
    vi.doMock('../../src/lib/obsidian-api', () => ({
      ObsidianApiClient: class MockObsidianApiClient {
        testConnection = mockClient.testConnection;
        getFile = mockClient.getFile;
        putFile = mockClient.putFile;
        putBinaryFile = mockClient.putBinaryFile;
        listFiles = mockClient.listFiles;
      },
      isObsidianApiError: (error: unknown) =>
        typeof error === 'object' && error !== null && 'status' in error && 'message' in error,
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

  describe('obsidian', () => {
    it('writes each craft next to the images and links it with a wikilink', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = save(craftNote, ['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const writes = mockClient.putFile.mock.calls.map(call => [call[0], call[1]]);
      expect(writes).toContainEqual([
        'AI/merlin/images/chat-abc12345-handshake-http.html',
        '<html>\n<body>1</body>\n</html>',
      ]);
      expect(writes).toContainEqual([
        'AI/merlin/images/chat-abc12345-handshake-http-2.html',
        '<html>2</html>',
      ]);
      const note = writes.find(([path]) => String(path).endsWith('.md'))![1] as string;
      expect(note).toContain('[[chat-abc12345-handshake-http.html]]');
      expect(note).toContain('[[chat-abc12345-handshake-http-2.html]]');
      expect(note).not.toContain('g2o-craft://');
      expect(note).not.toContain('![[');
      expect(mockClient.putBinaryFile).not.toHaveBeenCalled();
    });

    it('reports a warning when a craft write fails, without blocking the note', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockImplementation((path: string) =>
        path.endsWith('.html') ? Promise.reject(new Error('boom')) : Promise.resolve()
      );

      const sendResponse = save(craftNote, ['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const obsidian = (sendResponse.mock.calls[0][0] as MultiOutputResponse).results[0];
      expect(obsidian.success).toBe(true);
      expect(obsidian.warning).toContain('2 crafts could not be saved');
      expect(obsidian.warning).toContain('chat-abc12345-handshake-http.html');
      expect(mockClient.putFile.mock.calls.some(c => String(c[0]).endsWith('.md'))).toBe(true);
    });

    it('strips the placeholder of a craft that was not read', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);
      const partial = { ...craftNote, artifacts: [craftNote.artifacts![0]] };

      const sendResponse = save(partial, ['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const note = mockClient.putFile.mock.calls.find(c =>
        String(c[0]).endsWith('.md')
      )![1] as string;
      expect(note).toContain('[[chat-abc12345-handshake-http.html]]');
      expect(note).not.toContain('g2o-craft://');
      expect(
        mockClient.putFile.mock.calls.filter(c => String(c[0]).endsWith('.html'))
      ).toHaveLength(1);
    });

    it('writes no file and strips every placeholder when the note has no artifacts', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = save({ ...craftNote, artifacts: [] }, ['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      expect(mockClient.putFile).toHaveBeenCalledTimes(1);
      expect(String(mockClient.putFile.mock.calls[0][1])).not.toContain('g2o-craft://');
    });

    it('append mode strips craft placeholders and writes no craft file', async () => {
      mockGetSettings = vi.fn(() =>
        Promise.resolve<Record<string, unknown>>({ ...defaultSettings, enableAppendMode: true })
      );
      const existing = [
        '---',
        'id: merlin_abc',
        'message_count: 1',
        'modified: "2026-01-01T00:00:00.000Z"',
        '---',
        '> [!QUESTION] User',
        '> Hello',
      ].join('\n');
      const appendNote: ObsidianNote = {
        ...craftNote,
        body: [
          '> [!QUESTION] User',
          '> Hello',
          '',
          '> [!NOTE] Merlin',
          '> Ecco.',
          '> ',
          '> [handshake-http.html](g2o-craft://craft-1)',
        ].join('\n'),
        artifacts: [craftNote.artifacts![0]],
      };
      mockClient.getFile.mockResolvedValueOnce(existing);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = save(appendNote, ['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const response = sendResponse.mock.calls[0][0] as MultiOutputResponse;
      expect(response.messagesAppended).toBe(1);
      expect(mockClient.putFile.mock.calls.every(c => !String(c[0]).endsWith('.html'))).toBe(true);
      expect(mockClient.putFile.mock.calls.map(c => String(c[1])).join('')).not.toContain(
        'g2o-craft://'
      );
    });
  });

  describe('file download', () => {
    it('downloads the note and each craft as separate files, referencing the file name', async () => {
      vi.mocked(chrome.downloads.download).mockImplementation((_options, callback) => {
        callback?.(1);
        return 1 as unknown as ReturnType<typeof chrome.downloads.download>;
      });

      const sendResponse = save(craftNote, ['file']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const calls = vi
        .mocked(chrome.downloads.download)
        .mock.calls.map(call => call[0] as chrome.downloads.DownloadOptions);
      expect(calls.map(call => call.filename)).toEqual([
        'chat-abc12345.md',
        'chat-abc12345-handshake-http.html',
        'chat-abc12345-handshake-http-2.html',
      ]);
      const markdown = atob(calls[0].url!.split('base64,')[1]);
      expect(markdown).toContain('[[chat-abc12345-handshake-http.html]]');
      const craft = calls[1].url!;
      expect(craft.startsWith('data:text/plain;charset=utf-8;base64,')).toBe(true);
      expect(atob(craft.split('base64,')[1])).toBe('<html>\n<body>1</body>\n</html>');
    });

    it('fails the output when a craft download fails', async () => {
      const runtime = chrome.runtime as { lastError: unknown };
      vi.mocked(chrome.downloads.download).mockImplementation((options, callback) => {
        const failing = String((options as chrome.downloads.DownloadOptions).filename).endsWith(
          '.html'
        );
        runtime.lastError = failing ? { message: 'blocked' } : null;
        callback?.(failing ? (undefined as unknown as number) : 1);
        runtime.lastError = null;
        return 1 as unknown as ReturnType<typeof chrome.downloads.download>;
      });

      const sendResponse = save(craftNote, ['file']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const result = (sendResponse.mock.calls[0][0] as MultiOutputResponse).results[0];
      expect(result.success).toBe(false);
      expect(result.error).toContain('Craft download failed');
    });
  });

  describe('clipboard', () => {
    it('strips craft placeholders and copies no file', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });

      const sendResponse = save(craftNote, ['clipboard']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

      const call = vi
        .mocked(chrome.runtime.sendMessage)
        .mock.calls.find(c => (c[0] as { action?: string }).action === 'clipboardWrite');
      const content = (call?.[0] as { content: string }).content;
      expect(content).toContain('Ecco i file.');
      expect(content).not.toContain('g2o-craft://');
      expect(content).not.toContain('[[');
      expect(content).not.toContain('handshake-http');
    });
  });

  describe('validation', () => {
    async function rejected(note: ObsidianNote): Promise<boolean> {
      const sendResponse = save(note, ['obsidian']);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      const response = sendResponse.mock.calls[0][0] as { success?: boolean; results?: unknown };
      return response.success === false && response.results === undefined;
    }

    const MIB = 1024 * 1024;

    it.each([
      ['more than 20 artifacts', Array.from({ length: 21 }, (_, i) => artifact({ id: `c${i}` }))],
      ['a malformed id', [artifact({ id: 'bad id!' })]],
      ['an empty name', [artifact({ name: '' })]],
      ['a null byte in the name', [artifact({ name: 'a\0.md' })]],
      ['an over-long name', [artifact({ name: 'a'.repeat(300) })]],
      ['non-string content', [artifact({ content: 5 })]],
      ['an oversized source', [artifact({ content: 'x'.repeat(10 * MIB + 1) })]],
      ['a non-array', 'nope'],
      ['a null entry', [null]],
    ])('rejects a note with %s', async (_label, artifacts) => {
      expect(await rejected({ ...craftNote, artifacts } as unknown as ObsidianNote)).toBe(true);
    });

    it('accepts a note with well-formed artifacts', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);
      expect(await rejected(craftNote)).toBe(false);
    });

    it('rejects artifacts whose combined size exceeds the total cap', async () => {
      const big = 'x'.repeat(9 * MIB);
      const artifacts = Array.from({ length: 6 }, (_, i) =>
        artifact({ id: `c${i}`, name: `a${i}.md`, content: big })
      );
      // 6 x 9 MiB = 54 MiB > 48 MiB total cap, while each is under the 10 MiB cap
      expect(await rejected({ ...craftNote, artifacts } as unknown as ObsidianNote)).toBe(true);
    });
  });
});
