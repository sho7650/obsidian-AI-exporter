/**
 * Tests for the shared note-identity probe (issue #365).
 *
 * Both the append-mode lookup and the filename-collision probe answer the same
 * question about a candidate file — "is this the same conversation?" — and both
 * previously collapsed every negative answer into a single indistinguishable
 * outcome. `classifyNoteProbe` names the outcomes so the save path can report
 * WHY it decided to fork a new file. Behaviour is unchanged: every state other
 * than `same-conversation` still means "not ours".
 */

import { describe, it, expect } from 'vitest';
import { classifyNoteProbe, isSameConversation } from '../../src/lib/note-identity';
import type { ProbeState } from '../../src/lib/note-identity';

const ID = 'claude_1a07d605-561d-46ba-86ea-79227969c0a1';

describe('classifyNoteProbe', () => {
  it('reports absent when the file does not exist (getFile returned null)', () => {
    expect(classifyNoteProbe(null, ID)).toEqual({ state: 'absent' });
  });

  it('reports empty for a 200 with an empty body', () => {
    // The Local REST API documents only 200 and 404 for GET /vault/{filename},
    // so a 0-byte note is a legitimate 200 with an empty body — which is NOT
    // null, and so used to land in the "occupied by another conversation" branch.
    expect(classifyNoteProbe('', ID)).toEqual({ state: 'empty' });
  });

  it('reports unparseable when the content has no frontmatter block', () => {
    expect(classifyNoteProbe('# Just a heading\n\nsome prose', ID)).toEqual({
      state: 'unparseable',
    });
  });

  it('reports unparseable when the frontmatter block is never closed', () => {
    expect(classifyNoteProbe('---\nid: claude_x\ntitle: t', ID)).toEqual({ state: 'unparseable' });
  });

  it('reports no-id when the frontmatter parses but carries no id field', () => {
    // The shape a note written with the "Include ID" option disabled would have.
    const content = '---\ntitle: Something\nsource: claude\n---\n\nBody';
    expect(classifyNoteProbe(content, ID)).toEqual({ state: 'no-id' });
  });

  it('reports different-id and surfaces the id it actually read', () => {
    const content = `---\nid: claude_ffffffff-0000-0000-0000-000000000000\n---\n\nBody`;
    expect(classifyNoteProbe(content, ID)).toEqual({
      state: 'different-id',
      foundId: 'claude_ffffffff-0000-0000-0000-000000000000',
    });
  });

  it('reports same-conversation when the ids match', () => {
    expect(classifyNoteProbe(`---\nid: ${ID}\n---\n\nBody`, ID)).toEqual({
      state: 'same-conversation',
      foundId: ID,
    });
  });

  it('accepts a quoted id, matching the frontmatter parser', () => {
    expect(classifyNoteProbe(`---\nid: '${ID}'\n---\n\nBody`, ID)).toEqual({
      state: 'same-conversation',
      foundId: ID,
    });
  });

  it('reports different-id when the id field is a list rather than a scalar', () => {
    // `id:` with no value parses to [] — malformed, but it is still "not ours".
    expect(classifyNoteProbe('---\nid:\ntitle: t\n---\n\nBody', ID)).toEqual({ state: 'no-id' });
  });
});

describe('line endings (issue #365 regression)', () => {
  // The reported failure, reduced: a note the extension itself wrote, later
  // rewritten CRLF-terminated by the reporter's own tagging tool on Windows.
  // The save path read `no-id` from a file whose first frontmatter line is the
  // matching id, decided it belonged to another conversation, and forked a
  // duplicate.
  const lines = [
    '---',
    `id: ${ID}`,
    'title: Gmail search returning irrelevant results',
    'source: claude',
    'message_count: 239',
    '---',
    '',
    '> [!QUESTION] User',
    '> Hello',
  ];

  it('recognises its own note when the file has CRLF endings', () => {
    expect(classifyNoteProbe(lines.join('\r\n'), ID)).toEqual({
      state: 'same-conversation',
      foundId: ID,
    });
  });

  it('recognises its own note when the file has lone-CR endings', () => {
    expect(classifyNoteProbe(lines.join('\r'), ID)).toEqual({
      state: 'same-conversation',
      foundId: ID,
    });
  });

  it('still reports a different conversation when the id genuinely differs', () => {
    const foreign = lines.map(l => l.replace(ID, 'claude_ffffffff')).join('\r\n');

    expect(classifyNoteProbe(foreign, ID)).toEqual({
      state: 'different-id',
      foundId: 'claude_ffffffff',
    });
  });
});

describe('isSameConversation', () => {
  const NOT_OURS: ProbeState[] = ['absent', 'empty', 'unparseable', 'no-id', 'different-id'];

  it('is true for a same-conversation probe', () => {
    expect(isSameConversation({ state: 'same-conversation', foundId: ID })).toBe(true);
  });

  it.each(NOT_OURS)('is false for %s — every negative still means "do not touch"', state => {
    expect(isSameConversation({ state })).toBe(false);
  });
});
