# ADR-033: A truncated capture may not overwrite a longer note

- Status: Accepted
- Date: 2026-08-16
- Issue: [#449](https://github.com/sho7650/obsidian-AI-exporter/issues/449)
- Related: [ADR-028](028-message-count-survives-callout-flattening.md) (structured signals, not prose), [#327](https://github.com/sho7650/obsidian-AI-exporter/issues/327) / [#365](https://github.com/sho7650/obsidian-AI-exporter/issues/365) (never manufacture a duplicate)

## Context

The reporter of #449 captured 27 of a conversation's 446 messages because auto-scroll stopped
early, and asked what happened to the generated note. Their existing note was untouched — because
**append mode was on**, and `buildAppendContent()` returns null at `newTotal <= existingCount`.

Append mode is **off by default** (`settings-schema.ts`). On that path:

1. `handleSave` → `saveFreshNote` → `resolveCollisionFreePath`,
2. `classifyNoteProbe` reports `same-conversation` because the frontmatter id matches,
3. the note is written to that path.

446 messages replaced by 27, reported as success, with only a toast that vanishes in seconds. The
guard that saved the reporter was a side effect of a setting they happened to have enabled.

The truncation signal existed — but only as **prose** in `ExtractionResult.warnings`. Nothing
downstream could act on it without parsing an English sentence, which is precisely the
writer/reader seam ADR-028 was written about.

## Decision

**1. The signal becomes structured.** `ConversationData.truncated` is set where the human warning
is built, from the same `stopReason`, and `conversationToNote()` copies it to
`ObsidianNote.truncated` — the only object that crosses to the background. It is never written to
frontmatter: it describes *this capture*, not the conversation. `validateNoteData()` accepts it
only as a boolean.

`ConversationMetadata` was the wrong home: it rides on `ConversationData`, which never reaches the
background, so it would have had to be copied onto the note anyway.

**2. The probe reports, the save path decides.** `NoteProbe.messageCount` exposes the existing
note's `message_count`; `classifyNoteProbe` stays a classifier. The policy is a pure function,
`evaluateTruncationGuard()` in `src/lib/truncation-guard.ts`, so it can be read and argued about on
its own.

**3. Block only on affirmative evidence.** All four must hold: the capture was truncated, the
target is the same conversation, the existing note has a usable `message_count`, and that count is
strictly greater than the incoming one.

**Every unknown fails open.** A user with `includeMessageCount` turned off has no count in their
notes; refusing to save for them would be policing uncertainty rather than preventing a proven
regression. This is a named, accepted gap: those users are unprotected.

**4. A count that dropped without truncation is logged, not blocked.** Deleting messages, or
forking a thread on an edited message, legitimately shortens a conversation. Blocking it would
leave the extension permanently unable to reflect the new state, with no override in the UI.

**5. Refuse and explain.** Nothing is written; the error names both counts and the two ways
forward:

> Save cancelled: this sync captured 27 messages but the existing note has 446. Auto-scroll stopped
> before reaching the top. Raise the auto-scroll timeouts in Settings, or scroll to the top of the
> conversation manually, then sync again.

Rejected alternatives: **writing under an alternative name** manufactures exactly the duplicate
note #327 and #365 exist to prevent, and hands the user a reconciliation job; **keeping a backup
copy** doubles vault writes and invents a retention policy the extension has no business owning;
**warning and overwriting anyway** is what already happens, minus the data.

**6. Append mode gets the same refusal.** It is not the destructive path, but its silent
`messagesAppended: 0` is what left the reporter unable to explain what had happened. A truncated
capture against a longer note now says so there too.

## Why clipboard and file download are out of scope

Not an arbitrary limit — a consequence of which destination can destroy prior data. The clipboard
leaves no artifact the user cannot simply discard. `chrome.downloads.download` is called with
`conflictAction: 'uniquify'`, so Chrome appends " (1)" rather than overwriting. Neither has a
destructive path to guard. The truncation *warning* still reaches users of all three destinations.

## Consequences

- A new refusal users can hit. It is loud by design: the alternative was silent data loss.
- Users with `includeMessageCount: false` remain unprotected — stated here so the gap is a decision
  rather than an oversight.
- The reported scenario is now covered by `test/background/truncation-guard.test.ts`, which failed
  against `main` by overwriting.
- This does not fix the underlying stall (ADR-032 covers what was done about that instead); it
  bounds the damage when a stall happens.
