import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractIdSuffix,
  lookupExistingFile,
  buildAppendContent,
} from '../../src/lib/append-utils';
import type { ObsidianNote, ExtensionSettings, NoteFrontmatter } from '../../src/lib/types';

// ========== extractIdSuffix ==========

describe('extractIdSuffix', () => {
  it('extracts ID suffix from standard filename', () => {
    expect(extractIdSuffix('my-chat-abc12345.md')).toBe('abc12345');
  });

  it('extracts suffix from filename with multiple hyphens', () => {
    expect(extractIdSuffix('this-is-a-long-title-xyz99.md')).toBe('xyz99');
  });

  it('returns empty string for filename without hyphens', () => {
    expect(extractIdSuffix('conversation.md')).toBe('');
  });

  it('handles filename without .md extension', () => {
    expect(extractIdSuffix('test-abc')).toBe('abc');
  });

  it('extracts from simple two-part filename', () => {
    expect(extractIdSuffix('hello-world.md')).toBe('world');
  });
});

// ========== lookupExistingFile ==========

describe('lookupExistingFile', () => {
  let mockClient: {
    getFile: ReturnType<typeof vi.fn>;
    listFiles: ReturnType<typeof vi.fn>;
  };
  let testNote: ObsidianNote;

  beforeEach(() => {
    mockClient = {
      getFile: vi.fn(),
      listFiles: vi.fn(),
    };

    testNote = createTestNote({
      fileName: 'my-chat-abc12345.md',
      frontmatter: createTestFrontmatter({ id: 'claude_abc-def-123' }),
    });
  });

  it('returns direct match when file exists at exact path with matching ID', async () => {
    const existingContent = '---\nid: claude_abc-def-123\n---\nBody';
    mockClient.getFile.mockResolvedValue(existingContent);

    const result = await lookupExistingFile(
      mockClient as never,
      'AI/claude/my-chat-abc12345.md',
      'AI/claude',
      testNote
    );

    expect(result.found).toBe(true);
    expect(result.matchType).toBe('direct');
    expect(result.content).toBe(existingContent);
  });

  it('returns not found when direct path has different ID', async () => {
    mockClient.getFile.mockResolvedValueOnce('---\nid: different_id\n---\nBody');
    mockClient.listFiles.mockResolvedValue([]);

    const result = await lookupExistingFile(
      mockClient as never,
      'AI/claude/my-chat-abc12345.md',
      'AI/claude',
      testNote
    );

    expect(result.found).toBe(false);
    expect(result.matchType).toBe('none');
  });

  it('falls back to ID scan when direct path does not exist', async () => {
    const existingContent = '---\nid: claude_abc-def-123\n---\nBody';
    mockClient.getFile.mockResolvedValueOnce(null); // direct miss
    mockClient.listFiles.mockResolvedValue(['old-title-abc12345.md', 'other-file.md']);
    mockClient.getFile.mockResolvedValueOnce(existingContent); // ID scan match

    const result = await lookupExistingFile(
      mockClient as never,
      'AI/claude/my-chat-abc12345.md',
      'AI/claude',
      testNote
    );

    expect(result.found).toBe(true);
    expect(result.matchType).toBe('id-scan');
    expect(result.path).toBe('AI/claude/old-title-abc12345.md');
  });

  it('returns not found when no files match ID suffix', async () => {
    mockClient.getFile.mockResolvedValue(null);
    mockClient.listFiles.mockResolvedValue(['unrelated-file.md']);

    const result = await lookupExistingFile(
      mockClient as never,
      'AI/claude/my-chat-abc12345.md',
      'AI/claude',
      testNote
    );

    expect(result.found).toBe(false);
    expect(result.matchType).toBe('none');
  });

  it('returns not found when directory listing is empty', async () => {
    mockClient.getFile.mockResolvedValue(null);
    mockClient.listFiles.mockResolvedValue([]);

    const result = await lookupExistingFile(
      mockClient as never,
      'AI/claude/my-chat-abc12345.md',
      'AI/claude',
      testNote
    );

    expect(result.found).toBe(false);
  });

  it('skips direct path in ID scan to avoid double check', async () => {
    mockClient.getFile.mockResolvedValueOnce(null); // direct miss
    mockClient.listFiles.mockResolvedValue(['my-chat-abc12345.md']); // same filename

    const result = await lookupExistingFile(
      mockClient as never,
      'AI/claude/my-chat-abc12345.md',
      'AI/claude',
      testNote
    );

    // Should not call getFile again for the same path
    expect(mockClient.getFile).toHaveBeenCalledTimes(1);
    expect(result.found).toBe(false);
  });

  it('handles ID scan with multiple suffix matches, uses first valid', async () => {
    mockClient.getFile.mockResolvedValueOnce(null); // direct miss
    mockClient.listFiles.mockResolvedValue(['wrong-id-abc12345.md', 'correct-abc12345.md']);
    mockClient.getFile
      .mockResolvedValueOnce('---\nid: wrong_id\n---\nBody') // first scan miss
      .mockResolvedValueOnce('---\nid: claude_abc-def-123\n---\nBody'); // second scan hit

    const result = await lookupExistingFile(
      mockClient as never,
      'AI/claude/my-chat-abc12345.md',
      'AI/claude',
      testNote
    );

    expect(result.found).toBe(true);
    expect(result.path).toBe('AI/claude/correct-abc12345.md');
  });
});

// ========== buildAppendContent ==========

describe('buildAppendContent', () => {
  let testSettings: ExtensionSettings;
  let testNote: ObsidianNote;

  beforeEach(() => {
    testSettings = createTestSettings();
    testNote = createTestNote({
      frontmatter: createTestFrontmatter({ message_count: 4 }),
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
    });
  });

  it('returns null when existing content has no frontmatter', () => {
    const result = buildAppendContent('No frontmatter here', testNote, testSettings);
    expect(result).toBeNull();
  });

  it('returns null when existing body has no detectable messages', () => {
    const existing = '---\nid: test\nmessage_count: 2\n---\nJust some text';
    const result = buildAppendContent(existing, testNote, testSettings);
    expect(result).toBeNull();
  });

  it('returns null when new message count is not greater than existing', () => {
    const existing = [
      '---',
      'id: claude_test',
      'message_count: 4',
      'modified: "2026-01-01"',
      '---',
      '> [!QUESTION] User',
      '> Q1',
      '',
      '> [!NOTE] Claude',
      '> A1',
      '',
      '> [!QUESTION] User',
      '> Q2',
      '',
      '> [!NOTE] Claude',
      '> A2',
    ].join('\n');

    // Note has 4 messages, existing has 4 → no new messages
    const result = buildAppendContent(existing, testNote, testSettings);
    expect(result).toBeNull();
  });

  it('appends new messages and updates frontmatter', () => {
    const existing = [
      '---',
      'id: claude_test',
      'message_count: 2',
      'modified: "2026-01-01"',
      '---',
      '> [!QUESTION] User',
      '> Hello',
      '',
      '> [!NOTE] Claude',
      '> Hi there!',
    ].join('\n');

    const result = buildAppendContent(existing, testNote, testSettings);

    expect(result).not.toBeNull();
    expect(result!.messagesAppended).toBe(2);
    expect(result!.content).toContain('message_count: 4');
    expect(result!.content).toContain('New question');
    expect(result!.content).toContain('New answer');
    // Preserves existing content
    expect(result!.content).toContain('> Hello');
    expect(result!.content).toContain('> Hi there!');
  });

  it('updates modified timestamp in frontmatter', () => {
    const existing = [
      '---',
      'id: claude_test',
      'message_count: 2',
      'modified: "2026-01-01T00:00:00.000Z"',
      '---',
      '> [!QUESTION] User',
      '> Hello',
      '',
      '> [!NOTE] Claude',
      '> Hi there!',
    ].join('\n');

    const result = buildAppendContent(existing, testNote, testSettings);
    expect(result).not.toBeNull();
    // Should have a new modified date (not the old one)
    expect(result!.content).not.toContain('2026-01-01T00:00:00.000Z');
  });

  it('uses timezone setting for modified timestamp in frontmatter', () => {
    const settingsWithTz = {
      ...testSettings,
      templateOptions: { ...testSettings.templateOptions, timezone: 'Asia/Tokyo' },
    };
    const existing = [
      '---',
      'id: claude_test',
      'message_count: 2',
      'modified: "2026-01-01T00:00:00.000Z"',
      '---',
      '> [!QUESTION] User',
      '> Hello',
      '',
      '> [!NOTE] Claude',
      '> Hi there!',
    ].join('\n');

    const result = buildAppendContent(existing, testNote, settingsWithTz);
    expect(result).not.toBeNull();
    // Modified timestamp should have JST offset
    expect(result!.content).toMatch(/modified: .*\+09:00/);
  });

  // ========== Issue #187: Question headers in append mode ==========
  it('preserves `## ` question headers when appending new messages', () => {
    const settingsWithHeaders: ExtensionSettings = {
      ...testSettings,
      templateOptions: {
        ...testSettings.templateOptions,
        includeQuestionHeaders: true,
      },
    };

    // Existing file: 2 messages with their `##` header from a prior sync
    const existing = [
      '---',
      'id: claude_test-id',
      'message_count: 2',
      'modified: "2026-01-01"',
      '---',
      '## Hello',
      '',
      '> [!QUESTION] User',
      '> Hello',
      '',
      '> [!NOTE] Claude',
      '> Hi there!',
    ].join('\n');

    // New note has 4 messages; rebuilt body should also include headers
    const noteWithHeaders: ObsidianNote = {
      ...testNote,
      body: [
        '## Hello',
        '',
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] Claude',
        '> Hi there!',
        '',
        '## New question',
        '',
        '> [!QUESTION] User',
        '> New question',
        '',
        '> [!NOTE] Claude',
        '> New answer',
      ].join('\n'),
    };

    const result = buildAppendContent(existing, noteWithHeaders, settingsWithHeaders);

    expect(result).not.toBeNull();
    expect(result!.messagesAppended).toBe(2);
    // Header for the new question must be carried into the appended tail
    expect(result!.content).toContain('## New question');
    // Existing header should not be duplicated
    const headerCount = (result!.content.match(/^## Hello$/gm) ?? []).length;
    expect(headerCount).toBe(1);
    // Existing content preserved
    expect(result!.content).toContain('> Hello');
    expect(result!.content).toContain('> Hi there!');
    expect(result!.content).toContain('New answer');
  });

  it('preserves user-added notes in existing body', () => {
    const existing = [
      '---',
      'id: claude_test',
      'message_count: 2',
      'modified: "2026-01-01"',
      '---',
      '> [!QUESTION] User',
      '> Hello',
      '',
      'My personal note about this conversation',
      '',
      '> [!NOTE] Claude',
      '> Hi there!',
    ].join('\n');

    const result = buildAppendContent(existing, testNote, testSettings);
    expect(result).not.toBeNull();
    expect(result!.content).toContain('My personal note about this conversation');
  });
});

// ========== Test Helpers ==========

function createTestFrontmatter(overrides?: Partial<NoteFrontmatter>): NoteFrontmatter {
  return {
    id: 'claude_test-id',
    title: 'Test Conversation',
    source: 'claude',
    url: 'https://claude.ai/chat/test-id',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    tags: ['ai-conversation', 'claude'],
    message_count: 2,
    ...overrides,
  };
}

function createTestNote(overrides?: Partial<ObsidianNote>): ObsidianNote {
  return {
    fileName: 'test-chat-abc12345.md',
    frontmatter: createTestFrontmatter(),
    body: ['> [!QUESTION] User', '> Hello', '', '> [!NOTE] Claude', '> Hi there!'].join('\n'),
    contentHash: 'testhash',
    ...overrides,
  };
}

function createTestSettings(): ExtensionSettings {
  return {
    obsidianApiKey: 'test-key',
    obsidianUrl: 'http://127.0.0.1:27123',
    vaultPath: 'AI/{platform}',
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
    outputOptions: {
      obsidian: true,
      file: false,
      clipboard: false,
    },
    enableAutoScroll: false,
    enableAppendMode: true,
  };
}
