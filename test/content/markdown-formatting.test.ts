import { describe, it, expect } from 'vitest';
import { buildQuestionHeader } from '../../src/content/markdown-formatting';

/**
 * Unit tests for buildQuestionHeader (issue #187).
 *
 * QUESTION_HEADER_MAX_LENGTH is 60 and includes the trailing ellipsis when
 * truncation occurs. Truncation prefers a word boundary past the halfway
 * mark of the 59-character slice (i.e. lastSpace > 29.5), otherwise it
 * falls back to a hard cut.
 */
describe('buildQuestionHeader', () => {
  describe('empty-input guard', () => {
    it('returns empty string for an empty input', () => {
      expect(buildQuestionHeader('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(buildQuestionHeader('   \n\t  ')).toBe('');
    });
  });

  describe('under the length limit', () => {
    it('prepends "## " to a short question', () => {
      expect(buildQuestionHeader('What is 2+2?')).toBe('## What is 2+2?');
    });

    it('trims leading and trailing whitespace', () => {
      expect(buildQuestionHeader('  hi  ')).toBe('## hi');
    });

    it('normalizes newlines, tabs, and runs of spaces to single spaces', () => {
      expect(buildQuestionHeader('one\ntwo\t\tthree    four')).toBe('## one two three four');
    });

    it('keeps content exactly at the 60-character limit without truncation', () => {
      const sixty = 'a'.repeat(60);
      expect(buildQuestionHeader(sixty)).toBe(`## ${sixty}`);
    });
  });

  describe('over the length limit — word-boundary truncation', () => {
    it('breaks at the last space past the halfway mark and appends an ellipsis', () => {
      // 61 chars: 30 a's, one space, 30 b's. The space sits at position 30,
      // which is > 29.5 so the truncator snaps to the word boundary.
      const input = `${'a'.repeat(30)} ${'b'.repeat(30)}`;
      expect(buildQuestionHeader(input)).toBe(`## ${'a'.repeat(30)}…`);
    });

    it('truncates a natural sentence at the nearest prior space', () => {
      const input = 'The quick brown fox jumps over the lazy dog and runs through the forest';
      expect(buildQuestionHeader(input)).toBe(
        '## The quick brown fox jumps over the lazy dog and runs…'
      );
    });
  });

  describe('over the length limit — hard-cut fallback', () => {
    it('hard-cuts a single unbroken token at 59 characters and appends an ellipsis', () => {
      const input = 'a'.repeat(70);
      expect(buildQuestionHeader(input)).toBe(`## ${'a'.repeat(59)}…`);
    });

    it('hard-cuts when the only space is before the halfway mark', () => {
      // Space at position 2 (< 29.5), so the word-break branch is skipped
      // and the full 59-char slice is preserved.
      const input = `ab ${'c'.repeat(65)}`;
      const expectedSlice = `ab ${'c'.repeat(56)}`; // 3 + 56 = 59
      expect(buildQuestionHeader(input)).toBe(`## ${expectedSlice}…`);
    });
  });
});
