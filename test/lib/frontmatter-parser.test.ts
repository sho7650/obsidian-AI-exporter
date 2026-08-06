import { describe, it, expect } from 'vitest';
import { parseFrontmatter, updateFrontmatter } from '../../src/lib/frontmatter-parser';

describe('frontmatter-parser', () => {
  // ========== parseFrontmatter ==========

  describe('parseFrontmatter', () => {
    it('parses basic frontmatter with key-value pairs', () => {
      const content = '---\nid: gemini_abc\ntitle: My Chat\n---\nBody text';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.id).toBe('gemini_abc');
      expect(result!.fields.title).toBe('My Chat');
      expect(result!.body).toBe('Body text');
    });

    it('parses frontmatter with tags list', () => {
      const content = '---\ntags:\n  - ai-conversation\n  - gemini\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.tags).toEqual(['ai-conversation', 'gemini']);
    });

    it('parses quoted values', () => {
      const content = '---\ntitle: "My: Special Title"\nid: \'quoted_id\'\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.title).toBe('My: Special Title');
      expect(result!.fields.id).toBe('quoted_id');
    });

    it('returns null for content without frontmatter', () => {
      expect(parseFrontmatter('No frontmatter here')).toBeNull();
      expect(parseFrontmatter('')).toBeNull();
    });

    it('returns null for content with only opening delimiter', () => {
      expect(parseFrontmatter('---\ntitle: foo')).toBeNull();
    });

    it('preserves raw frontmatter including delimiters', () => {
      const content = '---\nid: abc\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.raw).toBe('---\nid: abc\n---');
    });

    it('handles empty body', () => {
      const content = '---\nid: abc\n---\n';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.body).toBe('');
    });

    it('handles numeric values', () => {
      const content = '---\nmessage_count: 42\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.message_count).toBe('42');
    });

    it('parses full note with all standard fields', () => {
      const content = [
        '---',
        'id: claude_abc-def',
        'title: "Test Conversation"',
        'source: claude',
        'url: "https://claude.ai/chat/abc-def"',
        'created: "2026-01-01T00:00:00.000Z"',
        'modified: "2026-01-01T12:00:00.000Z"',
        'tags:',
        '  - ai-conversation',
        '  - claude',
        'message_count: 4',
        '---',
        '',
        '> [!QUESTION] User',
        '> Hello',
      ].join('\n');

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.fields.id).toBe('claude_abc-def');
      expect(result!.fields.source).toBe('claude');
      expect(result!.fields.tags).toEqual(['ai-conversation', 'claude']);
      expect(result!.fields.message_count).toBe('4');
      expect(result!.body).toContain('> [!QUESTION] User');
    });

    it('handles key with empty value followed by non-list content', () => {
      const content = '---\ntitle:\nsource: gemini\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.title).toEqual([]);
      expect(result!.fields.source).toBe('gemini');
    });

    it('handles body with multiple paragraphs', () => {
      const content = '---\nid: abc\n---\nParagraph 1\n\nParagraph 2\n\nParagraph 3';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.body).toBe('Paragraph 1\n\nParagraph 2\n\nParagraph 3');
    });
  });

  // ========== updateFrontmatter ==========

  // ========== line endings (issue #365) ==========
  //
  // A note rewritten by an external tool on Windows comes back CRLF-terminated.
  // `split('\n')` then leaves a trailing `\r` on every line, and the key-value
  // pattern cannot match it: MDN states a wildcard "matches all characters
  // except line terminators", U+000D CR is a line terminator, and `$` without
  // the `m` flag "asserts that the character to the right is out of bounds of
  // the string". So every field was silently dropped, `fields.id` came back
  // undefined, and the save path forked a duplicate note for a file that was
  // its own (#365).

  describe('line endings', () => {
    /** The reporter's own note (#365, 2026-08-05), field-for-field. */
    const REPORTED_LINES = [
      '---',
      'id: claude_5acb9457-ae97-4744-a048-46d716e674ed',
      'title: Gmail search returning irrelevant results',
      'source: claude',
      'url: "https://claude.ai/chat/5acb9457-ae97-4744-a048-46d716e674ed"',
      'created: "2026-08-01T10:35:27+03:00"',
      'modified: "2026-08-01T13:04:00+03:00"',
      'tags: ["gmail", "semantic-search", "hebrew"]',
      'message_count: 239',
      '---',
      '',
      '> [!QUESTION] User',
      '> Hello',
    ];
    const withEol = (eol: string): string => REPORTED_LINES.join(eol);
    const EXPECTED_ID = 'claude_5acb9457-ae97-4744-a048-46d716e674ed';

    it('reads every field from a CRLF file (issue #365)', () => {
      const result = parseFrontmatter(withEol('\r\n'));

      expect(result).not.toBeNull();
      expect(result!.fields.id).toBe(EXPECTED_ID);
      expect(result!.fields.title).toBe('Gmail search returning irrelevant results');
      expect(result!.fields.message_count).toBe('239');
    });

    it('reads every field from a lone-CR file', () => {
      const result = parseFrontmatter(withEol('\r'));

      expect(result).not.toBeNull();
      expect(result!.fields.id).toBe(EXPECTED_ID);
    });

    it('reports the file’s line ending so writers can preserve it', () => {
      expect(parseFrontmatter(withEol('\r\n'))!.eol).toBe('\r\n');
      expect(parseFrontmatter(withEol('\r'))!.eol).toBe('\r');
      expect(parseFrontmatter(withEol('\n'))!.eol).toBe('\n');
    });

    it('takes the first line ending it sees when a file is mixed', () => {
      // Decided rule: first occurrence wins — simple and deterministic.
      const mixed = `---\r\nid: ${EXPECTED_ID}\ntitle: T\r\n---\r\n\r\nBody`;
      const result = parseFrontmatter(mixed);

      expect(result!.eol).toBe('\r\n');
      expect(result!.fields.id).toBe(EXPECTED_ID);
    });

    it('normalises raw and body to LF regardless of the source endings', () => {
      const crlf = parseFrontmatter(withEol('\r\n'))!;
      const lf = parseFrontmatter(withEol('\n'))!;

      expect(crlf.raw).not.toContain('\r');
      expect(crlf.body).not.toContain('\r');
      // The strongest statement of intent: the source endings must make no
      // difference to anything downstream except the recorded `eol`.
      expect(crlf.raw).toBe(lf.raw);
      expect(crlf.body).toBe(lf.body);
      expect(crlf.fields).toEqual(lf.fields);
    });

    it('parses a CRLF tag list into the same array as an LF one', () => {
      const lines = ['---', 'tags:', '  - ai-conversation', '  - claude', '---', 'Body'];

      expect(parseFrontmatter(lines.join('\r\n'))!.fields.tags).toEqual([
        'ai-conversation',
        'claude',
      ]);
      expect(parseFrontmatter(lines.join('\n'))!.fields.tags).toEqual([
        'ai-conversation',
        'claude',
      ]);
    });

    it('still rejects content that does not open with a delimiter', () => {
      // A UTF-8 BOM is a different failure and stays a failure: the caller
      // reports it as `unparseable`, not as another conversation.
      expect(parseFrontmatter('﻿' + withEol('\r\n'))).toBeNull();
    });
  });

  describe('updateFrontmatter', () => {
    it('updates existing field values', () => {
      const raw = '---\nid: abc\nmodified: "2026-01-01"\nmessage_count: 2\n---';
      const result = updateFrontmatter(raw, {
        modified: '2026-02-01T00:00:00.000Z',
        message_count: 4,
      });

      expect(result).toContain('modified: "2026-02-01T00:00:00.000Z"');
      expect(result).toContain('message_count: 4');
      expect(result).toContain('id: abc');
    });

    it('preserves fields not in updates', () => {
      const raw = '---\nid: abc\ntitle: My Chat\nsource: gemini\n---';
      const result = updateFrontmatter(raw, { title: 'New Title' });

      expect(result).toContain('id: abc');
      expect(result).toContain('source: gemini');
      expect(result).toContain('title: New Title');
    });

    it('ignores update keys not present in frontmatter', () => {
      const raw = '---\nid: abc\n---';
      const result = updateFrontmatter(raw, { nonexistent: 'value' });

      expect(result).toBe('---\nid: abc\n---');
    });

    it('preserves delimiter lines', () => {
      const raw = '---\nid: abc\n---';
      const result = updateFrontmatter(raw, { id: 'xyz' });

      expect(result.startsWith('---\n')).toBe(true);
      expect(result.endsWith('\n---')).toBe(true);
    });

    it('escapes special YAML characters in values', () => {
      const raw = '---\ntitle: old\n---';
      const result = updateFrontmatter(raw, { title: 'Has: special chars' });

      expect(result).toContain('title: "Has: special chars"');
    });
  });
});
