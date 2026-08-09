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

## Addendum (2026-08-09): the invariant was broken a second way

The counter was not the only thing that could break it. The invariant also fails
when the _writer_ stops emitting a recognisable label at all — and it did, on
CRLF files, because of **when** the line-ending restore ran rather than anything
in this ADR's scope.

`tryAppendMode()` flattened content that `buildAppendContent()` had already
restored to CRLF, so `flattenLargeCallouts()` saw lines ending in `\r`. Its
header pattern cannot match past a CR, so the `**Label:**` heading was dropped
and a bare `[!TYPE] Label` left as body text. With no label in either format, the
message is invisible to `countExistingMessages()` no matter how many formats it
reads — so #406 recurred on CRLF files even with the fix above in place.
Measured: LF `3 → 3`, CRLF `3 → 2`.

The fix is an ordering rule, now recorded as a first-class part of ADR-026:
**body transforms run before the line-ending restore, and the restore is the last
step before the write.** `buildAppendContent()` reports `eol` instead of applying
it.

### Correction to the coverage claim above

The seam test covers **LF only**. That is now deliberate — after the ordering fix
`flattenLargeCallouts()` is never handed CRLF, so a CRLF variant of the seam
property would assert something the design no longer permits to happen. The CRLF
path is covered where it belongs instead:

- `test/background/append-transform-ordering.test.ts` — the ordering rule itself,
  asserted as "flattening receives no CR", and verified to fail when reversed.
- `test/background/index.test.ts` — the end-to-end outcome on a CRLF note: label
  kept, no raw `[!TYPE]` in the body, file still CRLF throughout.

### What this adds to the general rule

The original rule said: anything that rewrites a saved body is part of the append
contract. The CRLF case sharpens it — **so is anything that changes the
_representation_ the body is in when a transform runs.** A transform that is
correct on LF is not automatically correct on the bytes actually written, and the
seam that matters is the one between the transform and the encoding, not only the
one between the transform and the counter.

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
