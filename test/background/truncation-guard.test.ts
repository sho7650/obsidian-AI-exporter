/**
 * The reported #449 scenario, end to end through the save path (ADR-033).
 *
 * Append mode is OFF by default. On that path the truncated capture carries the
 * same conversation id as the note on disk, `resolveCollisionFreePath` accepts
 * the canonical name as "same conversation", and the file is written — 446
 * messages replaced by 27, with only a toast that vanishes in seconds.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSave } from '../../src/background/obsidian-handlers';
import type { ExtensionSettings, ObsidianNote } from '../../src/lib/types';
import { DEFAULT_SYNC_SETTINGS } from '../../src/lib/settings-schema';

const mockClient = {
  testConnection: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  putBinaryFile: vi.fn(),
  listFiles: vi.fn(),
};

vi.mock('../../src/lib/obsidian-api', () => ({
  ObsidianApiClient: class {
    testConnection = (...a: unknown[]) => mockClient.testConnection(...a);
    getFile = (...a: unknown[]) => mockClient.getFile(...a);
    putFile = (...a: unknown[]) => mockClient.putFile(...a);
    putBinaryFile = (...a: unknown[]) => mockClient.putBinaryFile(...a);
    listFiles = (...a: unknown[]) => mockClient.listFiles(...a);
  },
  isApiError: (e: unknown) => typeof e === 'object' && e !== null && 'status' in e,
}));

const CONVERSATION_ID = 'claude_1a07d605';

function settings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    ...DEFAULT_SYNC_SETTINGS,
    obsidianApiKey: 'key',
    vaultPath: 'AI/Claude',
    ...overrides,
  } as ExtensionSettings;
}

function note(overrides: Partial<ObsidianNote> = {}): ObsidianNote {
  return {
    fileName: 'long-thread-ae8a398b.md',
    frontmatter: {
      id: CONVERSATION_ID,
      title: 'Long thread',
      source: 'claude',
      url: 'https://claude.ai/chat/x',
      created: '2026-08-01T00:00:00+09:00',
      modified: '2026-08-15T00:00:00+09:00',
      tags: ['ai-conversation', 'claude'],
      message_count: 27,
    },
    body: '**User:**\n\nq\n',
    contentHash: 'abcd1234',
    ...overrides,
  } as ObsidianNote;
}

/** The note already in the vault: the same conversation, complete. */
function existingNote(messageCount = 446): string {
  return [
    '---',
    `id: ${CONVERSATION_ID}`,
    'title: Long thread',
    `message_count: ${messageCount}`,
    '---',
    '',
    '**User:**',
    '',
    'q1',
  ].join('\n');
}

describe('truncated capture vs a longer note on disk (issue #449)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.putFile.mockResolvedValue(undefined);
  });

  it('refuses to overwrite, and writes nothing', async () => {
    mockClient.getFile.mockResolvedValue(existingNote());

    const result = await handleSave(settings(), note({ truncated: true }));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/27/);
    expect(result.error).toMatch(/446/);
    expect(mockClient.putFile).not.toHaveBeenCalled();
  });

  it('writes normally when the capture was complete, even if the count dropped', async () => {
    mockClient.getFile.mockResolvedValue(existingNote());

    const result = await handleSave(settings(), note({ truncated: false }));

    expect(result.success).toBe(true);
    expect(mockClient.putFile).toHaveBeenCalled();
  });

  it('writes when the existing note carries no message count', async () => {
    // includeMessageCount is a user setting; its absence must not block a save.
    mockClient.getFile.mockResolvedValue(
      ['---', `id: ${CONVERSATION_ID}`, 'title: Long thread', '---', '', 'body'].join('\n')
    );

    const result = await handleSave(settings(), note({ truncated: true }));

    expect(result.success).toBe(true);
    expect(mockClient.putFile).toHaveBeenCalled();
  });

  it('writes a truncated capture when there is no existing note to lose', async () => {
    mockClient.getFile.mockResolvedValue(null);

    const result = await handleSave(settings(), note({ truncated: true }));

    expect(result.success).toBe(true);
    expect(mockClient.putFile).toHaveBeenCalled();
  });

  it('refuses in append mode too, instead of the silent no-op', async () => {
    // Today append returns { success: true, messagesAppended: 0 } and says
    // nothing — which is exactly what the reporter could not explain.
    mockClient.getFile.mockResolvedValue(existingNote());

    const result = await handleSave(
      settings({ enableAppendMode: true }),
      note({ truncated: true })
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/446/);
    expect(mockClient.putFile).not.toHaveBeenCalled();
  });
});
