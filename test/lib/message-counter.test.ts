import { describe, it, expect } from 'vitest';
import { countExistingMessages, extractTailMessages } from '../../src/lib/message-counter';

describe('message-counter', () => {
  // ========== countExistingMessages ==========

  describe('countExistingMessages', () => {
    it('counts callout format messages', () => {
      const body = ['> [!QUESTION] User', '> Hello', '', '> [!NOTE] Claude', '> Hi there!'].join(
        '\n'
      );

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts blockquote format messages', () => {
      const body = ['**User:**', '> Hello', '', '**Claude:**', '> Hi there!'].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts plain format messages', () => {
      const body = ['**User:**', '', 'Hello', '', '**Gemini:**', '', 'Hi there!'].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts all platform labels', () => {
      const body = [
        '> [!QUESTION] User',
        '> Q1',
        '',
        '> [!NOTE] Gemini',
        '> A1',
        '',
        '> [!QUESTION] User',
        '> Q2',
        '',
        '> [!NOTE] Gemini',
        '> A2',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(4);
    });

    it('returns 0 for empty body', () => {
      expect(countExistingMessages('')).toBe(0);
    });

    it('returns 0 for body with no messages', () => {
      expect(countExistingMessages('Just some text\nwithout messages')).toBe(0);
    });

    it('excludes patterns inside code blocks', () => {
      const body = [
        '> [!QUESTION] User',
        '> How do I format messages?',
        '',
        '> [!NOTE] Claude',
        '> Here is an example:',
        '> ```markdown',
        '> > [!QUESTION] User',
        '> > This is inside code block',
        '> ```',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('strips fenced code blocks at column 0 before counting', () => {
      // Real fenced code block (unlike blockquote-nested) exercises the
      // code-fence toggle — only ``` at column 0 opens/closes a block.
      const body = [
        '**User:**',
        '',
        'Show me markdown example',
        '',
        '**Claude:**',
        '',
        'Here you go:',
        '```markdown',
        '**User:**',
        'This is example text, not a real message',
        '**Assistant:**',
        'Neither is this',
        '```',
        '',
        '**User:**',
        '',
        'Thanks',
      ].join('\n');

      // Only 3 real messages: User, Claude, User. The ones inside ``` must be stripped.
      expect(countExistingMessages(body)).toBe(3);
    });

    // Issue #433: the length-blind toggle counted an inner fence as a
    // delimiter, so a note holding a Markdown-about-Markdown answer desynced
    // and append mode wrote from the wrong offset (the #406 class, ADR-029).
    describe('code blocks that contain other code blocks (issue #433)', () => {
      const F3 = '`'.repeat(3);
      const F4 = '`'.repeat(4);

      /** A 4-message note whose second message holds `codeLines` as a block. */
      function bodyWith(codeLines: readonly string[]): string {
        return [
          '**User:**',
          '',
          'q1',
          '',
          '**Claude:**',
          '',
          ...codeLines,
          '',
          '**User:**',
          '',
          'q2',
          '',
          '**Claude:**',
          '',
          'a2',
        ].join('\n');
      }

      it('counts across a properly nested block', () => {
        const body = bodyWith([`${F4}markdown`, '# Title', `${F3}python`, 'print(1)', F3, F4]);
        expect(countExistingMessages(body)).toBe(4);
        expect(countExistingMessages(extractTailMessages(body, 2))).toBe(2);
      });

      it('counts across a block that shows an opening fence only', () => {
        // "Put this at the top of the file" — the snippet is an opener with no
        // closer, so the note holds an odd number of column-0 fence lines.
        const body = bodyWith([`${F4}markdown`, 'Put this at the top:', `${F3}md`, F4]);
        expect(countExistingMessages(body)).toBe(4);
        expect(extractTailMessages(body, 2)).not.toBe('');
        expect(countExistingMessages(extractTailMessages(body, 2))).toBe(2);
      });

      it('still hides message-shaped lines inside the inner block', () => {
        const body = bodyWith([`${F4}markdown`, `${F3}md`, '**User:**', '**Claude:**', F3, F4]);
        expect(countExistingMessages(body)).toBe(4);
      });

      it('does not let a tilde fence open a block and hide messages', () => {
        // The writer never emits tildes; a stray column-0 `~~~` in a note must
        // stay inert rather than swallowing every message after it (ADR-029).
        const body = bodyWith(['~~~']);
        expect(countExistingMessages(body)).toBe(4);
      });
    });

    it('handles ChatGPT and Perplexity labels', () => {
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] ChatGPT',
        '> Hi',
        '',
        '> [!QUESTION] User',
        '> Bye',
        '',
        '> [!NOTE] Perplexity',
        '> See ya',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(4);
    });

    it('handles the current Gemini Notebook label', () => {
      const body = ['> [!QUESTION] User', '> Hello', '', '> [!NOTE] Gemini Notebook', '> Hi'].join(
        '\n'
      );

      expect(countExistingMessages(body)).toBe(2);
    });

    it('still counts notes written under the legacy NotebookLM label (ADR-023)', () => {
      // Regression guard: dropping the old label makes append-mode see 0
      // existing messages and re-append the entire conversation.
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] NotebookLM',
        '> Hi',
        '',
        '> [!QUESTION] User',
        '> Bye',
        '',
        '> [!NOTE] NotebookLM',
        '> See ya',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(4);
    });

    it('counts legacy NotebookLM labels in **Label:** format', () => {
      const body = ['**User:**', '> Hello', '', '**NotebookLM:**', '> Hi there!'].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('handles Assistant label', () => {
      const body = ['**User:**', '> Hello', '', '**Assistant:**', '> Hi there!'].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts BOTH forms in a note that mixes them (issue #406)', () => {
      // The Obsidian save path flattens oversized callouts to `**Label:**`
      // (callout-flatten.ts), so a saved note legitimately holds both forms.
      // Returning only the callout tally undercounts, and append mode then
      // re-appends that many already-present tail messages.
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '**Claude:**',
        '',
        'A flattened, oversized answer',
        '',
        '> [!QUESTION] User',
        '> Second question',
        '',
        '> [!NOTE] Claude',
        '> Short answer',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(4);
    });

    it('counts messages with multi-line content', () => {
      const body = [
        '> [!QUESTION] User',
        '> Line 1',
        '> Line 2',
        '> Line 3',
        '',
        '> [!NOTE] Claude',
        '> Response line 1',
        '> Response line 2',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });
  });

  // ========== extractTailMessages ==========

  describe('extractTailMessages', () => {
    it('extracts tail messages after skip count', () => {
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] Claude',
        '> Hi there!',
        '',
        '> [!QUESTION] User',
        '> How are you?',
        '',
        '> [!NOTE] Claude',
        '> I am good!',
      ].join('\n');

      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('> [!QUESTION] User');
      expect(tail).toContain('How are you?');
      expect(tail).toContain('I am good!');
      expect(tail).not.toContain('Hello');
      expect(tail).not.toContain('Hi there!');
    });

    it('returns full body when skipCount is 0', () => {
      const body = '> [!QUESTION] User\n> Hello';
      expect(extractTailMessages(body, 0)).toBe(body);
    });

    it('returns empty string when skipCount exceeds message count', () => {
      const body = ['> [!QUESTION] User', '> Hello', '', '> [!NOTE] Claude', '> Hi'].join('\n');

      expect(extractTailMessages(body, 5)).toBe('');
    });

    it('handles blockquote format', () => {
      const body = [
        '**User:**',
        '> Hello',
        '',
        '**Claude:**',
        '> Hi',
        '',
        '**User:**',
        '> New message',
      ].join('\n');

      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('**User:**');
      expect(tail).toContain('New message');
      expect(tail).not.toContain('Hello');
    });

    it('handles plain format', () => {
      const body = [
        '**User:**',
        '',
        'Hello',
        '',
        '**Gemini:**',
        '',
        'Hi',
        '',
        '**User:**',
        '',
        'New question',
      ].join('\n');

      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('**User:**');
      expect(tail).toContain('New question');
      expect(tail).not.toContain('Hello');
    });

    it('skips message patterns inside code blocks', () => {
      const body = [
        '> [!QUESTION] User',
        '> How to format?',
        '',
        '> [!NOTE] Claude',
        '> Example:',
        '> ```',
        '> > [!QUESTION] User',
        '> > Fake message',
        '> ```',
        '',
        '> [!QUESTION] User',
        '> Real new message',
      ].join('\n');

      // Skip 2 real messages, get the 3rd
      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('Real new message');
      expect(tail).not.toContain('How to format?');
    });

    it('toggles inCodeBlock flag on column-0 fenced markers', () => {
      // Uses real fenced code blocks at column 0 (not blockquote-wrapped) so that
      // line.startsWith('```') triggers the inCodeBlock toggle in extractTailMessages.
      const body = [
        '**User:**',
        '',
        'Question 1',
        '',
        '**Claude:**',
        '',
        'See example:',
        '```',
        '**User:**',
        'fake message in code',
        '```',
        '',
        '**User:**',
        '',
        'Question 2',
      ].join('\n');

      const tail = extractTailMessages(body, 2);
      // Should start at the 3rd real User message (Question 2), not the fake one in code.
      expect(tail).toContain('Question 2');
      expect(tail).not.toContain('Question 1');
      expect(tail).not.toContain('fake message in code');
    });
  });
});
