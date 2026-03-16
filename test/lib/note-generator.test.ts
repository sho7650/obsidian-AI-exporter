/**
 * Note Generator Tests
 *
 * Tests the generateNoteContent function's templateOptions conditional branches.
 * DES-005 Section 3.1 — covers branch 57.14% → 100%
 */
import { describe, it, expect } from 'vitest';
import { generateNoteContent } from '../../src/lib/note-generator';
import type { ObsidianNote, ExtensionSettings } from '../../src/lib/types';

// Factory: creates a minimal valid ObsidianNote
function createTestNote(overrides?: Partial<ObsidianNote>): ObsidianNote {
  return {
    fileName: 'test.md',
    body: '> [!QUESTION] User\n> Hello\n\n> [!NOTE] Gemini\n> Hi there',
    contentHash: 'abc123',
    frontmatter: {
      id: 'gemini_test123',
      title: 'Test Conversation',
      source: 'gemini',
      url: 'https://gemini.google.com/app/test123',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
      tags: ['ai', 'gemini'],
      message_count: 2,
    },
    ...overrides,
  };
}

// Factory: creates ExtensionSettings with all template options enabled (baseline)
function createTestSettings(
  templateOverrides?: Partial<ExtensionSettings['templateOptions']>
): ExtensionSettings {
  return {
    obsidianApiKey: 'test-key',
    obsidianUrl: 'http://127.0.0.1:27123',
    vaultPath: 'AI/Gemini',
    templateOptions: {
      includeId: true,
      includeTitle: true,
      includeSource: true,
      includeDates: true,
      includeTags: true,
      includeMessageCount: true,
      messageFormat: 'callout',
      userCalloutType: 'QUESTION',
      assistantCalloutType: 'NOTE',
      ...templateOverrides,
    },
    outputOptions: {
      obsidian: true,
      file: false,
      clipboard: false,
    },
  };
}

describe('generateNoteContent', () => {
  const note = createTestNote();

  // ========== 3.1.1 Template Option Branches (7 tests) ==========
  describe('templateOptions conditional branches', () => {
    it('omits id from frontmatter when includeId is false', () => {
      // Covers: line 22 false-branch
      const settings = createTestSettings({ includeId: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^id:/m);
      // Other fields still present
      expect(content).toMatch(/^title:/m);
    });

    it('omits title from frontmatter when includeTitle is false', () => {
      // Covers: line 26 false-branch
      const settings = createTestSettings({ includeTitle: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^title:/m);
      expect(content).toMatch(/^id:/m);
    });

    it('omits source and url from frontmatter when includeSource is false', () => {
      // Covers: line 30 false-branch
      const settings = createTestSettings({ includeSource: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^source:/m);
      expect(content).not.toMatch(/^url:/m);
    });

    it('omits created and modified from frontmatter when includeDates is false', () => {
      // Covers: line 35 false-branch
      const settings = createTestSettings({ includeDates: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^created:/m);
      expect(content).not.toMatch(/^modified:/m);
    });

    it('omits tags from frontmatter when includeTags is false', () => {
      // Covers: line 40 false-branch (includeTags === false)
      const settings = createTestSettings({ includeTags: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^tags:/m);
      expect(content).not.toContain('  - ai');
    });

    it('omits tags when includeTags is true but tags array is empty', () => {
      // Covers: line 40 compound condition second branch
      //   (includeTags === true && tags.length === 0 → whole condition false)
      const emptyTagNote = createTestNote({
        frontmatter: { ...note.frontmatter, tags: [] },
      });
      const settings = createTestSettings({ includeTags: true });
      const content = generateNoteContent(emptyTagNote, settings);

      expect(content).not.toMatch(/^tags:/m);
    });

    it('omits message_count from frontmatter when includeMessageCount is false', () => {
      // Covers: line 47 false-branch
      const settings = createTestSettings({ includeMessageCount: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^message_count:/m);
    });
  });
});
