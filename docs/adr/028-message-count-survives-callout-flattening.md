# ADR-028: Message counting must survive callout flattening

- Status: Accepted
- Date: 2026-08-08
- Issue: [#406](https://github.com/sho7650/obsidian-AI-exporter/issues/406)
- Supersedes nothing. Related: ADR-023 (label history), ADR-025 (fork diagnostics)

## Context

Append mode decides how much of a conversation is already on disk with a single
number: `countExistingMessages(body)`. Everything else follows from it — the
guard `newTotal <= existingCount`, and the offset `extractTailMessages(body,
existingCount)` writes from.

That counter was written against the assumption that a saved note uses exactly
one of the three formats `formatMessage()` emits, so it tried the callout
pattern (`> [!TYPE] Label`), returned on the first non-zero tally, and only fell
back to `**Label:**` when there were no callouts at all.

The assumption was true at generation time and false on disk. The Obsidian save
path runs `flattenLargeCallouts()` (`maybeFlatten()` in
`background/obsidian-handlers.ts`), which rewrites any callout longer than
`maxCalloutLines` — **default 200, enabled by default** — into the `**Label:**`
plain form and leaves shorter ones untouched. A note with some long messages is
therefore _legitimately mixed_, and the counter silently ignored every flattened
message.

### Consequence observed in the field (#406)

A 135-message Claude conversation with 8 oversized messages was counted as 127.
`buildAppendContent()` saw `135 > 127`, extracted the last 8 messages and
appended them to a file that already contained them — a verbatim duplicate
block, from a sync where nothing had changed. The popup honestly reported
"8 new messages appended".

Reproduced against the real modules: 135 messages, 7 over the threshold →
`countExistingMessages` returns 128, `messagesAppended: 7`, tail already
present.

Two properties made this hard to see:

- **It self-limits.** After the bad write the file holds 135 countable markers,
  so the next sync no-ops. One duplicate, then silence.
- **It logs nothing.** The append _success_ path has no logging; only a lookup
  miss (ADR-025) or a filename collision does. The empty service-worker console
  in the report was positive evidence that the correct file was found, which
  ruled out the #365 fork path rather than pointing anywhere.

## Decision

**1. One scanner, two callers.** `scanMessageStarts(lines)` is the single source
of truth for where messages begin. `countExistingMessages()` returns its length;
`extractTailMessages()` slices from `starts[skipCount]`. A count and the offset
it is used at can no longer disagree, because they are the same array.

**2. The scanner reads every format the writer can emit** — one combined
pattern, never "first match wins". Formats are additive: a note may hold any
mixture of them.

**3. Invariant, enforced by a seam test.** Any transform applied to a saved body
must leave `countExistingMessages()` unchanged:

```
countExistingMessages(transform(body)) === countExistingMessages(body)
```

`test/lib/message-count-flatten-seam.test.ts` asserts this for
`flattenLargeCallouts` across thresholds that flatten everything, some, and
nothing, plus the agreement property between counting and tail extraction.

## Consequences

- Fenced-code handling is now uniform: a single column-0 toggle, shared by both
  functions. The previous regex strip required a closing fence to take effect;
  the toggle treats an unterminated fence as opening a block, matching what
  `extractTailMessages()` already did. All pre-existing tests hold.
- Notes already corrupted are not repaired. The duplicated block must be deleted
  once by hand; the corrected count keeps the file stable afterwards.
- **The general rule this encodes:** anything that rewrites a note body after
  generation — present or future — is part of the append contract. Adding such a
  transform without extending the counter reintroduces this class of bug. The
  seam test, not the individual counter test, is what catches it: both modules
  were already well covered in isolation, and their _seam_ had no coverage at
  all. That gap is why #406 shipped.
