/**
 * `maxNoteSizeMiB` is enforced on what is actually sent: the body after the
 * HTML gate (DES-019 §4.0, ADR-044 Decision 5). The gate may add one backslash
 * per `<`, so a body under the cap before the gate can be over it after.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ObsidianNote } from '../../src/lib/types';

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
  maxNoteSizeMiB: 1,
};

let capturedListener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean | undefined;

const MIB = 1024 * 1024;
const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

/** An HTML block of `<`: the gate escapes every one, doubling the body. */
function htmlBlockOfLessThan(length: number): string {
  return `<pre>\n${'<'.repeat(length - 6)}`;
}

function noteWithBody(body: string): ObsidianNote {
  return {
    fileName: 'test.md',
    body,
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
}

interface SaveResponse {
  results: Array<{ destination: string; success: boolean; error?: string }>;
  allSuccessful: boolean;
}

async function save(note: ObsidianNote, outputs: string[]): Promise<SaveResponse> {
  const sendResponse = vi.fn();
  capturedListener(
    { action: 'saveToOutputs', data: note, outputs },
    validSender as chrome.runtime.MessageSender,
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  return sendResponse.mock.calls[0][0] as SaveResponse;
}

function clipboardWrites(): unknown[] {
  return vi
    .mocked(chrome.runtime.sendMessage)
    .mock.calls.filter(([message]) => (message as { action?: string }).action === 'clipboardWrite');
}

beforeEach(async () => {
  vi.clearAllMocks();
  for (const fn of Object.values(mockClient)) fn.mockReset();
  mockClient.getFile.mockResolvedValue(null);
  mockClient.putFile.mockResolvedValue(undefined);
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation(listener => {
    capturedListener = listener;
  });

  vi.resetModules();
  vi.doMock('../../src/lib/obsidian-api', () => ({
    ObsidianApiClient: class {
      testConnection = mockClient.testConnection;
      getFile = mockClient.getFile;
      putFile = mockClient.putFile;
      putBinaryFile = mockClient.putBinaryFile;
      listFiles = mockClient.listFiles;
    },
    isObsidianApiError: () => false,
  }));
  vi.doMock('../../src/lib/storage', () => ({
    getSettings: () => Promise.resolve(defaultSettings),
    migrateSettings: vi.fn(() => Promise.resolve()),
  }));
  await import('../../src/background/service-worker');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('post-gate size cap', () => {
  const overAfterGate = noteWithBody(htmlBlockOfLessThan(0.75 * MIB));

  it('fails the clipboard output and copies nothing when the gated body is over the cap', async () => {
    const response = await save(overAfterGate, ['clipboard']);

    expect(response.results[0]).toMatchObject({ destination: 'clipboard', success: false });
    expect(response.results[0].error).toMatch(/above the 1 MiB limit/);
    expect(response.results[0].error).toMatch(/Maximum note size/);
    expect(clipboardWrites()).toHaveLength(0);
  });

  it('fails the file output and downloads nothing, images included, when over the cap', async () => {
    const note: ObsidianNote = {
      ...noteWithBody(`![pic](g2o-image://img-1)\n\n${htmlBlockOfLessThan(0.75 * MIB)}`),
      images: [{ id: 'img-1', mimeType: 'image/png', data: 'iVBORw0KGgo=', alt: 'pic' }],
    };

    const response = await save(note, ['file']);

    expect(response.results[0]).toMatchObject({ destination: 'file', success: false });
    expect(response.results[0].error).toMatch(/above the 1 MiB limit/);
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  describe('Obsidian fresh save', () => {
    const image = { id: 'img-1', mimeType: 'image/png', data: 'iVBORw0KGgo=', alt: 'pic' };

    it('writes neither the note nor its images when the gated body is over the cap', async () => {
      const note: ObsidianNote = {
        ...noteWithBody(`![pic](g2o-image://img-1)\n\n${htmlBlockOfLessThan(0.75 * MIB)}`),
        images: [image],
      };

      const response = await save(note, ['obsidian']);

      expect(response.results[0]).toMatchObject({ destination: 'obsidian', success: false });
      expect(response.results[0].error).toMatch(/above the 1 MiB limit/);
      expect(mockClient.putBinaryFile).not.toHaveBeenCalled();
      expect(mockClient.putFile).not.toHaveBeenCalled();
    });

    it('still writes images before the note, with embeds, when under the cap', async () => {
      const calls: string[] = [];
      mockClient.putBinaryFile.mockImplementation(async (path: string) => {
        calls.push(`image:${path}`);
      });
      mockClient.putFile.mockImplementation(async (path: string) => {
        calls.push(`note:${path}`);
      });
      const note: ObsidianNote = { ...noteWithBody('![pic](g2o-image://img-1)'), images: [image] };

      const response = await save(note, ['obsidian']);

      expect(response.allSuccessful).toBe(true);
      expect(calls).toEqual(['image:AI/gemini/images/test-img-1.png', 'note:AI/Gemini/test.md']);
      expect(mockClient.putFile.mock.calls[0][1]).toContain('![[test-img-1.png]]');
    });
  });
});
