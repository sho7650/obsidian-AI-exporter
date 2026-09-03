# ADR-038: The note size cap is a user setting, and the save response is validated

- Status: Accepted
- Date: 2026-09-03
- Issue: [#467](https://github.com/sho7650/obsidian-AI-exporter/issues/467)
- Extends: [ADR-032](032-configurable-scroll-deadlines.md)
- Related: [#449](https://github.com/sho7650/obsidian-AI-exporter/issues/449), [ADR-008](008-image-sync-strategy.md)

## Context

A user synced a 1,077-message Claude conversation (v2.10.1) and got

```
TypeError: Cannot read properties of undefined (reading 'map')
```

in the toast and the badge. The vault note was untouched. The chain, read off the code:

| Step | Where | What happened |
| --- | --- | --- |
| 1 | `background/validation.ts` | `note.body.length > MAX_CONTENT_SIZE` (1 MiB, a constant since 2026-01-13) → `validateNoteData()` false |
| 2 | `background/service-worker.ts` | listener answers `{ success: false, error: 'Invalid message content' }` |
| 3 | `lib/messaging.ts` | that envelope is cast to `MultiOutputResponse` — the comment said the cast was safe because the worker validates messages; the worker's *rejection* was exactly what went unvalidated |
| 4 | `content/bootstrap.ts` `displaySaveResults()` | `allSuccessful` / `anySuccessful` undefined → else branch → `results.map` → the TypeError |

Two defects, one symptom. The user could not have learned the real reason from any of it.

The 1 MiB constant had no recorded rationale beyond "DoS prevention"; nothing in `docs/`
ties it to an Obsidian limit. A thousand-message conversation is a legitimate note.

## Decision

### 1. The save response is a union the caller must narrow (PR #487)

`saveToOutputs` is typed `MultiOutputResponse | ErrorResponse`. `isMultiOutputResponse()`
narrows at the one seam, `bootstrap.ts` `saveToOutputs()`, and a rejection becomes an
ordinary failure through the existing toast and `×` badge, carrying the worker's own text.
This covers every envelope the worker can send — unauthorized sender, failed validation,
unknown action, thrown handler — not only the size case.

### 2. The body size cap is a user setting, enforced where settings are readable

| Aspect | Decision | Rationale |
| --- | --- | --- |
| Setting | `maxNoteSizeMiB`, default **8**, clamped **1–16**, 1 MiB steps | An order of magnitude above the old constant; the ceiling is derived, not chosen (below) |
| Where enforced | `handleMultiOutput()` | The only place on the save path that has `settings`. `validateMessageContent()` runs before settings are loaded and stays as it is minus the size check |
| How reported | A **real `MultiOutputResponse`** with every requested destination failed | The content script renders it through the same paths as any other failure — no new UI, no envelope. As ADR-032 does for the scroll deadlines, the text names the setting: *"Note is 2.0 MiB, above the 1 MiB limit. Raise "Maximum note size" in Settings and sync again."* |
| Unit | UTF-16 code units of `body` (`body.length`), shown as MiB | The same measure the old constant used; the popup shows the same unit it stores, so nothing can drift (ADR-032 §4) |
| Schema | `asIntInRange(1, 16, 8)` — clamped, not discarded | Migration boundary: a value another device wrote is moved into range, never silently reset |
| UI | Slider with a live "N MiB" readout | Sixteen discrete values with a hard ceiling is what a slider is for; the readout is the value the user is choosing |

### Why 16 MiB

Chrome caps one runtime message at **64 MiB** ("The maximum size of a message is 64 MiB." —
developer.chrome.com › Extensions › Messaging › *Message size limits*). Images travel in the
same message and are already capped at `MAX_TOTAL_IMAGE_DATA_LENGTH` = 48 MiB (ADR-008).
48 + 16 = 64: the ceiling is the remaining budget, not a taste.

`body.length` counts code units, and the serialized message is bytes — up to 3× for CJK
text. A message that does exceed 64 MiB fails in `chrome.runtime.sendMessage` with
`lastError`, which `messaging.ts` already rejects with, so the outcome is an error report,
never the crash that started this.

### What is not changed

- The 1,164 vs 1,077 turn counts across two runs in the report are an auto-scroll matter
  (ADR-017/024), not a save matter. Deliberately out of scope here.
- Obsidian Local REST API's own request-size limit is unverified. A 16 MiB note should be
  tried against a live vault once.

## Consequences

- A rejected save now reads as what it is. The size case reads as *which setting to raise*.
- `MAX_CONTENT_SIZE` is retired; knip (ADR-037) would flag it if it lingered.
- A new sync-storage field, `maxNoteSizeMiB`; older installs get 8 via the schema default.
- One more slider style in the popup (`.range-row`), the first `type="range"` control.

## Files

| Path | Role |
| --- | --- |
| `src/lib/messaging.ts` | `isMultiOutputResponse`, `describeUnexpectedResponse`; union response type (#487) |
| `src/content/bootstrap.ts` | narrows at `saveToOutputs()` (#487) |
| `src/lib/constants.ts` | `BYTES_PER_MIB`, `DEFAULT/MIN/MAX_NOTE_SIZE_MIB`; `MAX_CONTENT_SIZE` removed |
| `src/lib/settings-schema.ts`, `src/lib/storage.ts`, `src/lib/types.ts` | the setting |
| `src/background/validation.ts` | size check removed |
| `src/background/output-handlers.ts` | `rejectOversizedNote()` gate in `handleMultiOutput()` |
| `src/popup/*`, `src/_locales/*` | slider, readout, help text |
