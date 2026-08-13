# ADR-026: Normalise line endings on read, restore them on write

- Status: Accepted — shipped in 2.7.3 (#407); ordering constraint added in 2.7.10 (#421)
- Date: 2026-08-05 (amended 2026-08-09)
- Related: issue #365, issue #406, [ADR-025](025-note-identity-probe-and-fork-diagnostics.md),
  [ADR-028](028-message-count-survives-callout-flattening.md), issue #327

## Context

Issue #365 reported duplicate notes: a conversation with an existing note in the
vault got a second file under the deterministic collision-fallback name, even
though both files carried the same frontmatter `id`. Three rounds of
correspondence could not identify the trigger, so 2.7.0 shipped diagnostics
(ADR-025) instead of a fix.

The first field report after that shipped identified the cause immediately:

```
[G2O Background] Append lookup found no existing note
{id: 'claude_5acb9457-…', missReason: 'no-candidate-file',
 directProbe: {state: 'no-id'}, …}

[G2O Background] Filename collision: saved under an alternative name
{expectedId: 'claude_5acb9457-…', probes: [
  {attempt: 0, fileName: '…-5acb9457.md',          state: 'no-id'},
  {attempt: 1, fileName: '…-5acb9457-418ea102.md', state: 'same-conversation', …}]}
```

`no-id` on a file whose first frontmatter line is `id: claude_5acb9457-…`.

### The mechanism

`parseFrontmatter()` split on `'\n'` and matched each line against

```js
/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/
```

On a CRLF file every line retains a trailing `\r`, and this pattern cannot match
it. Per MDN:

- Wildcard: "A wildcard matches all characters **except line terminators**."
- Lexical grammar: the line terminators are `U+000A <LF>`, **`U+000D <CR>`**,
  `U+2028 <LS>` and `U+2029 <PS>`.
- Input boundary assertion: without the `m` flag, `$` "asserts that the
  character to the right is **out of bounds of the string**".

So `(.*)` stops before the `\r`, `$` cannot be reached, and the match fails.
Verified directly:

```
node -e "console.log('id: abc\r'.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/))"
→ null
```

Every field of a CRLF file was therefore silently dropped. The block still
looked like valid frontmatter, so the parser returned an object with **zero
fields** rather than null — `fields.id` was `undefined`, which ADR-025's probe
correctly reports as `no-id`, and the save path did what it is designed to do
with a file it cannot identify: refuse to overwrite it and fork a new name.

The reporter's own note explains where the CRLF came from. They are on Windows
and post-process frontmatter with their own tagging tool; the rewritten file's
`tags` are an inline array (`tags: ["gmail", …]`), the signature of a YAML
dumper writing the file back. The extension's own file — attempt 1 in the log
above, never touched by that tool — parsed as `same-conversation` in the very
same save. LF readable, CRLF not, in one vault.

This also explains every earlier observation: a scan of the maintainer's own
vault (macOS, no external tooling, all LF) found 0 failures in 186 notes, and
the affected files always looked correct on inspection afterwards — the content
was never damaged, only unreadable.

### Measured blast radius

| Function                       | LF  | CRLF                                                         | lone CR              |
| ------------------------------ | --- | ------------------------------------------------------------ | -------------------- |
| `parseFrontmatter().fields.id` | ok  | **undefined**                                                | `null` (unparseable) |
| `countExistingMessages()`      | 4   | 4                                                            | **0**                |
| `extractTailMessages()`        | ok  | ok (CRLF retained)                                           | **empty**            |
| `updateFrontmatter()`          | ok  | **mixed endings**: `"---\r\nid: x\r\nmessage_count: 4\n---"` | —                    |
| `flattenLargeCallouts()`       | ok  | endings retained, but **callout header degraded** ¹          | —                    |

¹ **Corrected 2026-08-09 (#406).** This row originally read `ok (CRLF retained)`.
The line endings _are_ retained — that much was measured correctly (15 CRLF
breaks, 0 bare LF) — but retaining endings is not the same as being unaffected,
and reading the row as "no CRLF problem here" is what allowed the following to
ship. On CRLF input `CALLOUT_HEADER_PATTERN` (`/^> \[![^\]]+\][+-]? *(.*)$/`,
no `m` flag) cannot match past the CR, exactly as `parseFrontmatter()` could not
in row 1. The run therefore falls through to the plain-blockquote branch: the
`**Label:**` heading is **dropped** and a bare `[!TYPE] Label` is left as body
text. Measured on a CRLF body: 3 messages in, 2 countable out; on LF, 3 → 3.

Because a message with no label is invisible to `countExistingMessages()`, this
made the duplicate append of #406 recur on CRLF files even after the counter
itself was fixed (ADR-028).

Two functional breaks, then, not one: the field extraction above, and this. Note
also that **`flattenLargeCallouts()` was never hardened** — it still degrades if
handed CRLF. What protects it is the ordering constraint below, nothing else.

Fixing the field extraction alone would additionally expose the
`updateFrontmatter()` row: it rewrites matched lines with `\n` while their
neighbours keep `\r\n`, so every append to a CRLF file would leave it mixed.

## Decision

**Normalise line endings on read; restore the file's own ending on write.**

1. `parseFrontmatter()` normalises `\r\n` and `\r` to `\n` before matching, and
   returns `raw` and `body` in that normalised form. Everything downstream —
   field matching, `updateFrontmatter()`, `countExistingMessages()`,
   `extractTailMessages()` — sees LF and needs no line-ending awareness of its
   own.
2. It also returns `eol`, the ending the source used.
3. `buildAppendContent()` returns LF content plus `eol`; the **caller** applies
   `eol` immediately before writing. See the ordering constraint below.

A fresh save is unaffected: it creates the file, so it defines the convention
(LF).

### Ordering constraint: restore last

**The restore is the final step before the write. Every body transform runs while
the content is still LF.**

This was implied by "everything downstream sees LF" in point 1 but never written
down, and the append path violated it: `buildAppendContent()` used to apply `eol`
itself, and `tryAppendMode()` then flattened the restored — CRLF — content. That
is the defect recorded in footnote ¹ above.

Point 3 is therefore a load-bearing part of this decision, not an implementation
detail. `buildAppendContent()` reports `eol` rather than applying it precisely so
that a transform cannot be inserted between the restore and the write.

The constraint generalises past flattening: it binds any body transform added
later. Since no transform is line-ending aware — deliberately, per point 1 — the
ordering is the only thing keeping them correct.

Guarded by `test/background/append-transform-ordering.test.ts`, which asserts the
rule (flattening is handed content containing no CR) rather than any single
symptom, and was verified to fail when the two steps are reversed.

### Why restore rather than normalise the file

The alternative — normalise once in `ObsidianApiClient.getFile()` and always
write LF — is a smaller change, and was rejected. The notes belong to the user,
not to this extension. An append is a request to add messages to a file, not a
licence to rewrite every line of it. For the reporter specifically, whose
tooling writes CRLF, converting on each sync would produce a rewrite war
visible in every diff of a version-controlled vault.

### Mixed files: first occurrence wins

`detectLineEnding()` takes the first `\r\n | \r | \n` it finds. Deterministic
and cheap, and a mixed file converges on whichever style it opens with instead
of staying mixed.

### Lone CR yes, U+2028 / U+2029 no

Lone CR costs nothing — it falls out of the same split — and without it a
classic-Mac file is not merely misread but unparseable. `U+2028` / `U+2029` are
deliberately **not** treated as line breaks: neither Markdown nor YAML uses them
as such, and rewriting them would alter body text rather than repair it. They
remain ordinary characters inside a value.

## Consequences

- A note maintained as CRLF by external tooling is recognised as its own, so the
  duplicate-note fork of #365 stops for that cause.
- Appends preserve the file's line ending; no mixed-ending output.
- `ParsedFrontmatter.raw` and `.body` are now always LF regardless of input.
  All three call sites (`append-utils.ts` ×2, `note-identity.ts`) were checked.
- Existing behaviour on LF files is unchanged: the 1461 tests that predate this
  change pass without a single edit.
- **Duplicates already written are not merged.** This stops new ones; existing
  pairs need manual consolidation.
- A BOM-prefixed file still fails `content.startsWith('---')` and is reported as
  `unparseable`. That is a different defect and is left alone deliberately —
  ADR-025's states exist precisely so the next report can name it.
- The LF precondition this ADR establishes is what the code-fence tracker of
  [ADR-029](029-code-fence-sizing-and-tracking.md) is written against. Its closing
  rule — "only spaces or tabs after the fence run" — is the exact shape an unmatched
  CR breaks, which is the failure this ADR's addendum in ADR-028 already cost once,
  so that tracker tolerates a trailing `\r` as defence in depth rather than relying
  on the ordering alone.

## Alternatives considered

- **Make the regexes CR-tolerant** (`\r?$`, or trim each line). The smallest
  possible diff, but it leaves `updateFrontmatter()`'s mixed output in place,
  does nothing for lone CR, and spreads line-ending awareness across every
  pattern anyone adds later. Rejected.
- **Normalise in `getFile()`, always write LF.** See above — rewrites the user's
  file as a side effect of appending to it.
- **Parse YAML with a real library.** Would fix this and the BOM case, and the
  Local REST API can even return parsed frontmatter itself via
  `Accept: application/vnd.olrapi.note+json`. But it is a large change to the
  read path of every save, made while a targeted cause is already identified and
  reproduced. Recorded here as the option to revisit if the hand-rolled parser
  produces a third class of failure.
