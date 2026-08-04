# ADR-025: Name the note-identity probe outcomes and report why a save forks

- Status: Proposed
- Date: 2026-08-04
- Related: issue #365, issue #327 (the collision safeguard being diagnosed), [ADR-024](024-scroll-progress-includes-movement.md)

## Context

Issue #365 reports duplicate notes: a conversation that already has a note in
the vault gets a second (and third) file under the deterministic
collision-fallback name, even though every file carries the same frontmatter
`id`. Three rounds of correspondence with the reporter failed to identify the
trigger, and the reason is structural rather than a lack of effort.

### What the reported evidence proves

The reporter supplied three clusters of duplicates with full ids and file
names. Recomputing `collisionSuffix()` — `generateHash(note.frontmatter.id)`,
`src/lib/filename-collision.ts:19` — against those ids matches all three
observed suffixes exactly:

| Conversation id | Observed suffix | `generateHash('claude_<uuid>')` |
| --- | --- | --- |
| `claude_1a07d605-…` | `45fd74fa` | `45fd74fa` |
| `claude_ad00d6b9-…` | `4ff2dde8` | `4ff2dde8` |
| `claude_a4c3b5f7-…` | `595294a2` | `595294a2` |

(The bare UUIDs hash to `5b9cf0fb` / `3a5361e7` / `43b318a1`, so the input was
the prefixed id, not the UUID.)

Two facts follow. First, the extra files were produced by
`resolveCollisionFreePath()` at attempt ≥ 1 — nothing else in the codebase
generates that name. Second, **the `id` the extension held at that moment was
correct**, because it is the hash's own input. The failure is therefore on the
read side: the existing file's `id` did not come back as a match. For the
`-<hash>-2` files, that happened for *two* candidate files in the same save.

### Why the cause could not be narrowed further

Every read-side negative collapses into one silent outcome:

- `src/background/obsidian-handlers.ts` — `resolveCollisionFreePath()` compared
  `parseFrontmatter(existing)?.fields.id === note.frontmatter.id` and, on
  anything but a match, moved to the next candidate. Its own comment
  acknowledged two different situations ("a different conversation (or an
  unparseable/foreign file)") that the code neither separated nor recorded. The
  function contained no logging at all.
- `src/lib/append-utils.ts` — `readCandidate()` returned `null` for a budget
  miss, a missing file and a different conversation alike; `notFound()` carried
  no reason; and `FileLookupResult.matchType` existed but no caller read it.
- `src/lib/obsidian-api.ts` — `getFile()` returns `null` only for a 404, so a
  200 with an empty body yields `''`, which is not `null` and so reached the
  "occupied by another conversation" branch. The Local REST API's OpenAPI
  specification documents exactly two responses for `GET /vault/{filename}`
  (200 Success, 404 File does not exist), so a 0-byte note is a legitimate 200
  with an empty body.
- `src/lib/obsidian-api.ts` — `listEntries()` maps a 404 to `[]`. The same
  specification documents 404 as "Directory does not exist" and notes that
  "empty directories will not be returned", so a missing folder, an empty
  folder and a swallowed error are indistinguishable to the append scan, and
  all three silently produce a lookup miss.

A duplicate note is a data-integrity event, and the code that decides to create
one records nothing about why. No amount of further correspondence can close
that gap.

## Decision

Make the reasoning observable, and change nothing about the behaviour.

1. **A shared probe primitive.** `src/lib/note-identity.ts` exports
   `classifyNoteProbe(content, expectedId)` returning one of `absent`, `empty`,
   `unparseable`, `no-id`, `different-id`, `same-conversation`, plus the id it
   actually read. Both the append lookup and the collision probe use it, so the
   duplicated `parseFrontmatter(...)?.fields.id === id` idiom exists once.
2. **Named lookup misses.** `lookupExistingFile()` returns a `missReason`
   (`no-candidate-suffix`, `empty-directory`, `no-candidate-file`,
   `candidate-id-mismatch`, `budget-exhausted`) and the `directProbe` it saw.
   The directory scans report entry/candidate counts so the reason is derived,
   not guessed.
3. **Recorded probes.** `resolveCollisionFreePath()` accumulates a
   `ProbeOutcome[]` — attempt number, candidate file name, state, id found —
   and returns it with the chosen target.
4. **Two log points, at levels the reporter will actually see.**
   - `console.info` when append mode finds no existing note (this precedes
     every fork, and also makes ordinary lookup health visible).
   - `console.warn` when a save lands on an alternative name, or when all ten
     candidates are exhausted, carrying the full probe list.

   Chrome DevTools hides `console.debug` unless the Verbose level is selected,
   so a low-frequency, decision-grade event must not use it. This is the
   opposite trade-off from ADR-024's per-iteration scroll log, which is high
   frequency and correctly `debug`.

Expected and found ids are logged **in full**. A truncated id would show *that*
two ids differ but not *how*, which is the entire question. The ids are already
present in the note's own frontmatter and in the conversation URL, and the
output goes only to the user's own service-worker console.

## Consequences

- The next report of a duplicate note carries its own cause: which candidate
  names were probed, what each held, and which id was read versus expected.
- The `empty` and `no-id` states are now distinguishable from
  `different-id`. Both still fork, exactly as before — but if the field data
  shows a fork was caused by an empty or id-less file, that is a different bug
  with a different fix, and the log will say so.
- One extra `console.info` per save that falls through append mode. This is at
  most one line per sync.
- `FileLookupResult` gains optional fields; existing callers and all 28
  pre-existing `lookupExistingFile` tests are unaffected.

## Alternatives considered

- **Also change the forking behaviour** — e.g. treat an `empty` or
  `unparseable` occupant as free and overwrite it. Rejected for now: issue #327
  exists precisely because overwriting a file we cannot identify destroys data,
  and a note with no frontmatter may simply be one the user wrote by hand.
  Changing behaviour before the field data says which state actually occurs
  would be speculation. This ADR deliberately ships diagnosis first.
- **Read identity through the API's own parser** — `GET /vault/{filename}` with
  `Accept: application/vnd.olrapi.note+json` returns a parsed `frontmatter`
  object, so the extension's regex parser (`src/lib/frontmatter-parser.ts`)
  would no longer sit between the file and the id. That would structurally
  remove one candidate cause. Rejected for this change: swapping the read path
  for every save is a large behavioural change made on a hypothesis, and the
  JSON response shape would have to be validated at the boundary. Recorded here
  as the natural follow-up should the logs implicate the parser.
- **Log at `debug`** — quieter, but hidden at DevTools' default level, which
  defeats the entire purpose of the change.
- **Do nothing and keep asking the reporter for detail** — three rounds have
  already shown the vault-side artefacts cannot distinguish the cases, because
  the files look correct after the fact.
