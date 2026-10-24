/**
 * The append path gates the existing body and the new tail together, so the
 * tail is read in its real context, but only ever changes tail lines: the
 * user's existing note is never rewritten (DES-019 §4.0, ADR-044 Decision 3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_SYNC_SETTINGS } from '../../src/lib/settings-schema';
import type { ExtensionSettings, ObsidianNote } from '../../src/lib/types';
import { flattenLargeCallouts } from '../../src/lib/callout-flatten';

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

const { handleSave } = await import('../../src/background/obsidian-handlers');

const settings: ExtensionSettings = {
  ...DEFAULT_SYNC_SETTINGS,
  obsidianApiKey: 'test-key',
  vaultPath: 'AI/{platform}',
  enableAppendMode: true,
  flattenLargeCallouts: true,
  maxCalloutLines: 5,
};

const FRONTMATTER = ['---', 'id: claude_abc-def', 'message_count: 2', 'modified: "x"', '---'];

/** A saved note whose body is `existing` (two messages). */
function existingFile(existing: string[], eol = '\n'): string {
  return [...FRONTMATTER, ...existing].join(eol);
}

/** The full conversation: the existing two messages plus two new ones. */
function noteWith(existing: string[], tail: string[]): ObsidianNote {
  return {
    fileName: 'chat-abc12345.md',
    body: [...existing, '', ...tail].join('\n'),
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
}

function written(): string {
  return mockClient.putFile.mock.calls[0][1] as string;
}

/** The written body, frontmatter removed. */
function writtenBody(): string {
  return written().split('\n---\n').slice(1).join('\n---\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.putFile.mockResolvedValue(undefined);
  mockClient.listFiles.mockResolvedValue([]);
  mockClient.listEntries.mockResolvedValue([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('append: HTML gate', () => {
  it("keeps the user's existing HTML byte-identical and escapes the tail", async () => {
    const existing = [
      '> [!QUESTION] User',
      '> hi',
      '',
      '<details><summary>my note</summary>kept</details>',
      '',
      '> [!NOTE] Claude',
      '> hello <b>there</b>',
    ];
    const tail = ['> [!QUESTION] User', '> next', '', '> [!NOTE] Claude', '> see <img src=x>'];
    mockClient.getFile.mockResolvedValue(existingFile(existing));

    const result = await handleSave(settings, noteWith(existing, tail));

    expect(result.success).toBe(true);
    expect(writtenBody()).toBe(
      [...existing, '', ...tail.slice(0, 4), '> see \\<img src=x>'].join('\n')
    );
  });

  it('finds HTML on the line markdown-it puts it when the new messages hold lone CRs', async () => {
    // The existing file is read with its line endings normalised (ADR-026), so
    // only the new messages can still carry a lone CR, which markdown-it counts
    // as a line break.
    const existing = [
      '> [!QUESTION] User',
      '> hi',
      '',
      '> [!NOTE] Claude',
      '<b>mine</b>',
    ];
    const tail = ['> [!QUESTION] User', '> next', '', '> [!NOTE] Claude', '~~~\r<i>x</i>\r~~~\r<img src=x>'];
    mockClient.getFile.mockResolvedValue(existingFile(existing));

    const result = await handleSave(settings, noteWith(existing, tail));

    expect(result.success).toBe(true);
    expect(writtenBody()).toBe(
      [...existing, '', ...tail.slice(0, 4), '~~~\r<i>x</i>\r~~~\r\\<img src=x>'].join('\n')
    );
  });

  const base = ['> [!QUESTION] User', '> hi', '', '> [!NOTE] Claude', '> ok'];

  it.each([
    // What the user added to the saved note by hand, after the two messages.
    ['a plain open fence', [...base, '', '```', 'unclosed']],
    [
      'an open fence in a callout long enough to be flattened',
      [...base, '> a', '> b', '> c', '> d', '> ```', '> unclosed'],
    ],
  ])('reads the tail after %s, where its fenced <iframe> is live', async (_name, existing) => {
    const tail = [
      '> [!QUESTION] User',
      '> next',
      '',
      '> [!NOTE] Claude',
      '```',
      '<iframe src=x>',
      '```',
    ];
    mockClient.getFile.mockResolvedValue(existingFile(existing));

    const result = await handleSave(settings, noteWith(base, tail));

    expect(result.success).toBe(true);
    const lines = writtenBody().split('\n');
    expect(lines).toContain('\\<iframe src=x>');
    expect(lines).not.toContain('<iframe src=x>');
  });

  it('refuses, writing nothing, when the existing note ends inside an unclosed HTML block', async () => {
    const warn = vi.mocked(console.warn);
    const existing = [...base, '', '<pre>', 'mine'];
    const tail = ['> [!QUESTION] User', '> next', '', '> [!NOTE] Claude', '> answer'];
    mockClient.getFile.mockResolvedValue(existingFile(existing));

    const result = await handleSave(settings, noteWith(base, tail));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unclosed HTML block/);
    expect(result.error).toMatch(/append mode/);
    expect(mockClient.putFile).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('append refused'), {
      id: 'claude_abc-def',
    });
  });

  it('refuses with an error that also covers the new messages, when they cannot be placed', async () => {
    // A nested inline footnote loses content in the parser, so the gate cannot
    // place it and refuses; closing a block in the existing note would not help.
    const tail = ['> [!QUESTION] User', '> next', '', '> [!NOTE] Claude', '> a ^[x ^[<b>y</b>]] b'];
    mockClient.getFile.mockResolvedValue(existingFile(base));

    const result = await handleSave(settings, noteWith(base, tail));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/new messages/);
    expect(result.error).toMatch(/append mode/);
    expect(mockClient.putFile).not.toHaveBeenCalled();
  });

  describe('size cap on the written body', () => {
    const capped = { ...settings, maxNoteSizeMiB: 1 };
    const MIB = 1024 * 1024;
    const head = ['> [!QUESTION] User', '> hi', '', '> [!NOTE] Claude'];
    const tail = ['> [!QUESTION] User', '> next', '', '> [!NOTE] Claude', '> answer'];

    it('refuses when the existing body alone is over the cap', async () => {
      const existing = [...head, `> ${'a'.repeat(1.1 * MIB)}`];
      mockClient.getFile.mockResolvedValue(existingFile(existing));

      const result = await handleSave(capped, noteWith(existing, tail));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/above the 1 MiB limit/);
      expect(result.error).toMatch(/append mode/);
      expect(mockClient.putFile).not.toHaveBeenCalled();
    });

    it('refuses when the gated tail pushes the body over the cap', async () => {
      const existing = [...head, `> ${'a'.repeat(0.6 * MIB)}`];
      const bigTail = [...tail.slice(0, 4), `> ${'<i>'.repeat(0.15 * MIB)}`];
      mockClient.getFile.mockResolvedValue(existingFile(existing));

      const result = await handleSave(capped, noteWith(existing, bigTail));

      expect(result.success).toBe(false);
      expect(mockClient.putFile).not.toHaveBeenCalled();
    });

    it('writes when the joined body stays under the cap', async () => {
      const existing = [...head, `> ${'a'.repeat(0.5 * MIB)}`];
      mockClient.getFile.mockResolvedValue(existingFile(existing));

      const result = await handleSave(capped, noteWith(existing, tail));

      expect(result.success).toBe(true);
      expect(mockClient.putFile).toHaveBeenCalled();
    });

    it('measures a CRLF note after its line endings are restored', async () => {
      // About 0.95 MiB as LF; each of its 100k lines gains a CR on write.
      const filler = Array.from({ length: 100_000 }, () => '> abcdefg');
      const existing = [...head, ...filler];
      const lfLength = existing.join('\n').length;
      expect(lfLength).toBeLessThan(MIB);
      expect(lfLength + existing.length).toBeGreaterThan(MIB);

      mockClient.getFile.mockResolvedValue(existingFile(existing, '\r\n'));
      const crlf = await handleSave(
        { ...capped, flattenLargeCallouts: false },
        noteWith(existing, tail)
      );
      expect(crlf.success).toBe(false);
      expect(mockClient.putFile).not.toHaveBeenCalled();

      mockClient.getFile.mockResolvedValue(existingFile(existing, '\n'));
      const lf = await handleSave(
        { ...capped, flattenLargeCallouts: false },
        noteWith(existing, tail)
      );
      expect(lf.success).toBe(true);
    });
  });
});

describe('flattening the two parts apart', () => {
  const callout = (label: string, n: number): string[] => [
    `> [!NOTE] ${label}`,
    ...Array.from({ length: n }, (_, i) => `> line ${i}`),
  ];

  it.each([
    ['short callouts on both sides', callout('A', 2), callout('B', 2)],
    ['callouts at the threshold', callout('A', 4), callout('B', 4)],
    ['long callouts on both sides', callout('A', 9), callout('B', 9)],
    ['a long callout ending the existing body', ['intro', '', ...callout('A', 9)], callout('B', 1)],
    ['a long callout starting the tail', callout('A', 1), [...callout('B', 9), '', 'outro']],
  ])('matches flattening the joined text (%s)', (_name, existing, tail) => {
    const max = 5;
    const apart = `${flattenLargeCallouts(existing.join('\n'), max)}\n\n${flattenLargeCallouts(tail.join('\n'), max)}`;
    expect(apart).toBe(flattenLargeCallouts(`${existing.join('\n')}\n\n${tail.join('\n')}`, max));
  });
});
