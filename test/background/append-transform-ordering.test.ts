/**
 * Architectural guard for ADR-026's ordering constraint.
 *
 * ADR-026 decided that line endings are normalised on read and the file's own
 * ending is restored on write, so "everything downstream sees LF". It did not
 * say *when* the restore happens, and the append path restored it early — before
 * callout flattening — which handed `flattenLargeCallouts()` lines ending in
 * '\r'. Its header pattern ends `(.*)$` with no `m` flag and cannot match past a
 * CR, so the run fell through to the plain-blockquote branch: the `**Label:**`
 * heading was dropped and a bare `[!TYPE] Label` left as body text. A message
 * with no label is invisible to `countExistingMessages()`, so #406 recurred on
 * CRLF files even after the counter was fixed.
 *
 * The tests below assert the RULE (flattening is handed LF), not just the
 * symptom, so reversing the two steps fails here regardless of how the symptom
 * happens to surface. Verified to fail when the ordering is reversed.
 *
 * @see docs/adr/026-line-ending-handling.md — Ordering constraint
 * @see docs/adr/028-message-count-survives-callout-flattening.md
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flattenLargeCallouts } from '../../src/lib/callout-flatten';
import { DEFAULT_SYNC_SETTINGS } from '../../src/lib/settings-schema';
import type { ExtensionSettings, ObsidianNote } from '../../src/lib/types';

const mockClient = {
  testConnection: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  putBinaryFile: vi.fn(),
  listFiles: vi.fn(),
  listEntries: vi.fn(),
};

vi.mock('../../src/lib/obsidian-api', () => ({
  ObsidianApiClient: class MockObsidianApiClient {
    testConnection = mockClient.testConnection;
    getFile = mockClient.getFile;
    putFile = mockClient.putFile;
    putBinaryFile = mockClient.putBinaryFile;
    listFiles = mockClient.listFiles;
    listEntries = mockClient.listEntries;
  },
  isObsidianApiError: () => false,
}));

// Real implementation, recorded invocations — we need both: the written file is
// asserted for real, and the argument handed to flattening is inspected.
vi.mock(import('../../src/lib/callout-flatten'), { spy: true });

const { handleSave } = await import('../../src/background/obsidian-handlers');

const settings: ExtensionSettings = {
  ...DEFAULT_SYNC_SETTINGS,
  obsidianApiKey: 'test-key',
  vaultPath: 'AI/{platform}',
  enableAppendMode: true,
  flattenLargeCallouts: true,
  maxCalloutLines: 5,
};

/** Four messages, the second one long enough to be flattened. */
const BODY_LINES = [
  '> [!QUESTION] User',
  '> Hello',
  '',
  '> [!NOTE] Claude',
  ...Array.from({ length: 8 }, (_, i) => `> answer line ${i}`),
  '',
  '> [!QUESTION] User',
  '> Second question',
  '',
  '> [!NOTE] Claude',
  '> Second answer',
];

const note: ObsidianNote = {
  fileName: 'chat-abc12345.md',
  body: BODY_LINES.join('\n'),
  contentHash: 'hash',
  images: [],
  frontmatter: {
    id: 'claude_abc-def',
    title: 'Chat',
    source: 'claude',
    url: 'https://claude.ai/chat/abc-def',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    tags: ['ai-conversation', 'claude'],
    message_count: 4,
  },
};

/** The note as it already exists on disk, with the given line ending. */
function existingFile(eol: string): string {
  return [
    '---',
    'id: claude_abc-def',
    'message_count: 2',
    'modified: "2026-01-01T00:00:00.000Z"',
    '---',
    ...BODY_LINES.slice(0, 12),
  ].join(eol);
}

describe('append: body transforms run before the line-ending restore (ADR-026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.putFile.mockResolvedValue(undefined);
    mockClient.listFiles.mockResolvedValue([]);
    mockClient.listEntries.mockResolvedValue([]);
  });

  it('hands flattening LF content even when the file on disk is CRLF', async () => {
    mockClient.getFile.mockResolvedValue(existingFile('\r\n'));

    const result = await handleSave(settings, note);

    expect(result.success).toBe(true);
    expect(flattenLargeCallouts).toHaveBeenCalled();
    // The rule itself: no transform is ever handed a CR.
    for (const [content] of vi.mocked(flattenLargeCallouts).mock.calls) {
      expect(content).not.toContain('\r');
    }
  });

  it('still writes the file back with its own CRLF endings', async () => {
    mockClient.getFile.mockResolvedValue(existingFile('\r\n'));

    await handleSave(settings, note);

    const written = mockClient.putFile.mock.calls[0][1] as string;
    expect(written).not.toMatch(/(?<!\r)\n/);
  });

  it('keeps the callout label through flattening on a CRLF file', async () => {
    // The user-visible consequence of the ordering: with the restore first, the
    // label vanished and `[!NOTE] Claude` was left in the note text.
    mockClient.getFile.mockResolvedValue(existingFile('\r\n'));

    await handleSave(settings, note);

    const written = mockClient.putFile.mock.calls[0][1] as string;
    expect(written).toContain('**Claude:**');
    expect(written).not.toMatch(/^\[!\w+\]/m);
  });

  it('behaves identically on an LF file', async () => {
    mockClient.getFile.mockResolvedValue(existingFile('\n'));

    await handleSave(settings, note);

    const written = mockClient.putFile.mock.calls[0][1] as string;
    expect(written).toContain('**Claude:**');
    expect(written).not.toContain('\r');
  });
});
