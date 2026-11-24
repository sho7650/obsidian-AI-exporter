# ADR-046: Merlin crafts are read through the UI and exported as separate files

- Status: Accepted
- Date: 2026-11-24
- Related: [REQ-merlin-extractor](../requirements/REQ-merlin-extractor.md) (the DOM
  measurements this rests on), [ADR-008](008-image-sync-strategy.md) and
  [ADR-041](041-chatgpt-generated-image-capture.md) (the image pipeline this mirrors),
  [ADR-014](014-platform-registry-ssot.md) (platform registration),
  [ADR-043](043-extractors-customize-through-hooks.md) (the `finalizeExtraction` hook)

## Context

Merlin generates files in a conversation — "crafts": `.html`, `.md`, `.mmd`, … The chat shows
only a card per craft. Measured live on 2026-11-24:

- The source is **not** in the message DOM. It enters the main document only after the card is
  clicked and the panel's "Code" tab selected.
- The panel's "Preview" tab is an iframe on another origin (`crafts.getmerlin.in`), unreadable.
- No JSON API serves the content; the page requests only RSC payloads.
- `code.textContent` loses the line breaks, because each line is a block-level
  `span.block`. Joining the spans with `\n` restores the exact source.
- The tab triggers are Radix: they activate on `mousedown`, not `click`.
- The card node is replaced whenever its state changes ("Click to open craft" ↔ "Showing
  craft"), so a reference taken while reading the message goes stale.

## Decision

**The extractor reads each craft by driving the UI, and the background saves it as a file next
to the note.**

- **Gated by `enableToolContent`** (the switch that already gates Claude's tool content), so no
  new setting exists. Off means no craft is read and no reference is written.
- **UI automation** (`src/content/extractors/merlin-crafts.ts`): close any open panel, click the
  card, wait for the panel whose header names the craft, select the "Code" tab with
  `mousedown`, and rebuild the source per `code > span.block`. Afterwards the panel is put back
  as found (closed, or reopened on the same craft and tab). The Edit tab is never selected.
  Cards are located again on every read, not held as elements.
- **A parallel placeholder pipeline.** While messages are read, each card becomes a
  `<span data-g2o-craft>` marker (`ArtifactMarkerCollector`); `conversationToNote()` turns it
  into `[name](g2o-craft://{id})`; `src/lib/artifact-output.ts` resolves it per output, like
  `image-output.ts` does for images. `ConversationData.artifacts` / `ObsidianNote.artifacts`
  carry the sources as text (not base64).
- **Names and links.** The file is `{noteBaseName}-{originalName}`; a name that repeats within a
  note gets `-2`, `-3`, … before its extension. The original name is reduced to a file name
  (directory part dropped, unsafe characters `_`) both when resolved and — as a refusal of
  nonsense — when validated. The body links with a wikilink `[[file]]`, not an embed.
- **Per output.** Obsidian: written with `putFile` under `imageVaultPath`. File download: a
  separate download per craft. Clipboard and append mode: placeholders stripped, nothing
  written — the same stance as images.
- **Limits** match images: at most `MAX_IMAGES_PER_NOTE` crafts and `MAX_IMAGE_SIZE_BYTES` each
  (and the image total cap combined), enforced in the content script and again in the
  background validator.
- **A craft that cannot be read never aborts the export.** The reader returns an outcome with a
  reason instead of throwing; the collector turns it into a warning, the note is saved, and the
  unresolved placeholder is stripped.

Generated images of Merlin follow ADR-041's pipeline with one addition: they live on
`storage.googleapis.com`, which allows the page's origin by CORS, so
`captureImage(…, { fetchCrossOriginFromPage: true })` reads them from the page and no manifest
host or worker allow-list entry is needed. A failed page read still falls back to the worker.

## Consequences

- With the toggle on, a sync briefly opens and closes Merlin's side panel. The page layout
  shifts while it does; the panel is restored afterwards.
- The automation depends on Merlin's panel markup (tablist outside the article, Radix tab ids,
  `span.text-base.font-semibold` title, `lucide-x` close button, `code > span.block`). These are
  extractor-private selectors: they cannot be part of the E2E baseline contract (it would only
  be writable from a conversation that has a craft — #402), so a change is caught by the unit
  tests' fixture being re-measured, not by the live baseline.
- Only the version shown in the Code tab is exported; craft versions are not handled.
- Append mode writes no crafts. A note first saved with crafts and later appended keeps its links
  and files; new crafts after that are not added.
- The Preview and Edit tabs are untouched, so the extension never edits a craft.

## Alternatives considered

- **Read the Preview iframe.** Rejected: cross-origin, unreadable from a content script.
- **Intercept Merlin's network requests.** Rejected: no request carries the source.
- **Only export a craft that is already open** (Claude's artifact approach). Rejected by the
  requirements: it would export whichever craft the user happened to leave open.
- **A new setting for crafts.** Rejected: `enableToolContent` already means "include what the
  assistant produced besides its answer".
- **Hold the card elements from extraction.** Rejected: Merlin replaces the node on every state
  change, so the reference is detached by the second read.
