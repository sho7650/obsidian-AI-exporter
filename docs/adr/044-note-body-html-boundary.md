# ADR-044: A final HTML gate is the note-body boundary; per-path escaping is the fidelity layer

- Status: Accepted
- Date: 2026-10-18
- Related: [DES-019](../design/DES-019-note-body-html-boundary.md) (the design this records),
  [DES-011](../design/DES-011-angle-bracket-escape.md) (the escaping it reframes),
  [ADR-026](026-line-ending-handling.md) (append line-ending order),
  [ADR-028](028-message-count-survives-callout-flattening.md) (append message counting),
  [ADR-038](038-note-size-setting-and-validated-save-response.md) (`maxNoteSizeMiB`)

## Context

DES-011 added angle-bracket escaping so that `<module>` or `<div>` in a conversation would not
vanish in Obsidian's Reading mode. It treated the escaping as a rendering fix, applied by one
post-processing pass over the final Markdown.

A security scan (2026-10-17) found two places where page-derived text still reached the note
body as live HTML: Deep Research reference titles were never escaped, and the post-pass could
be fooled by an escaped backtick. Reviewing the fix plan found the same class of hole again and
again (P5–P16 in DES-019): image alt and title, link destinations, footnote placeholders, table
cells, user prompts, headers. Each per-path fix was correct in isolation, but nine review rounds
kept finding new compositions of escapers and new paths. Enumerating every path was not
converging.

Obsidian renders raw HTML in notes, so page text that becomes live HTML can load remote
resources or forge content inside a user's vault.

## Decision

**1. Keeping page-derived text from becoming live HTML is a security boundary.** The contract
covers the note body; frontmatter and filenames have their own escaping and are out of scope.

**2. The boundary is one final gate.** `neutralizeLiveHtml()` (`src/lib/html-gate.ts`) parses
every note body the extension produces with `markdown-it` (`html: true`) plus
`markdown-it-footnote`, immediately before the body is written, downloaded or copied. Wherever it
finds raw HTML, it escapes `<` on those lines by parity repair. It never touches `>`, which is
also the blockquote and callout marker. It re-parses up to 3 times and fails closed. It logs
counts only, never body text. It is the last body transform on every path.

**3. Append mode never rewrites the user's existing text.** The gate parses the existing body and
the new tail together, so the tail is read in its real context, but it repairs only tail lines.
When safety cannot be guaranteed without changing existing lines, the append is refused and the
file is left unchanged. That happens when an unclosed HTML block from the existing body runs into
the tail, when parsing fails, or when some HTML cannot be located. Falling back to a full save
was rejected because it would discard what the user wrote in the note.

**4. Per-path escaping stays, as the fidelity layer.** It escapes precisely (code stays code),
so the gate normally has nothing to do. A per-path bug is now a fidelity bug, not a
vulnerability, and CI still catches it: the seam test asserts the gate is a no-op on every
payload.

**5. `maxNoteSizeMiB` is enforced on what is actually sent.** That means after the gate and
after line-ending restoration, and before any file, including images, is written.

**6. `markdown-it` and `markdown-it-footnote` become runtime dependencies** of the background
service worker only. The footnote plugin is required: without it, HTML inside footnote
definitions is invisible to the parser while Obsidian renders it.

## Consequences

- A per-path escaping mistake can no longer produce live HTML in a note, provided `markdown-it`
  and Obsidian agree on what is raw HTML. That agreement is the remaining assumption (DES-019
  O4), checked by a manual Obsidian smoke test. Where they disagree, the design resolves it only
  in the over-escaping direction.
- Lines the gate acts on lose precision. A `<` inside inline code on such a line shows a
  backslash. This only happens on lines that already contained live HTML.
- Append can now be refused with an error in rare cases:
  - the user's note ends inside an unclosed HTML block they wrote;
  - the resulting file would exceed `maxNoteSizeMiB`, which can happen for a note grown by hand.
- Existing notes are not migrated. A full save that overwrites the same file fixes a note. The
  release notes explain the cases where a save creates a new file instead.
- The service-worker bundle grows by the two packages. The content-script and popup bundles are
  unchanged.

## Alternatives considered

- **Per-path escaping only (the original plan).** Rejected: nine review rounds kept finding new
  paths and new compositions, and nothing would stop the next new path.
- **Strip HTML with a sanitizer at the end.** Rejected: the body is Markdown, not HTML.
  Sanitizing the Markdown text would mangle code and prose that legitimately contain `<`.
  Rendering to HTML and back would lose the Markdown structure.
- **Escape every `<` outside code with a hand-written scanner.** Rejected as the boundary: this is
  what DES-011's post-pass did, and an escaped backtick fooled its idea of what counts as code.
  Matching CommonMark precedence by hand is the problem the parser solves.

## Files

- `src/lib/html-gate.ts` — `neutralizeLiveHtml()`
- `src/lib/note-generator.ts` — `renderNote()`; `generateNoteContent()` delegates to it
- `src/lib/append-utils.ts` — `buildAppendContent()` returns its parts
- `src/background/obsidian-handlers.ts` — append gate and refusal; image writes after the size check
- `src/background/output-handlers.ts`, `src/background/note-size.ts` — post-gate size cap
- The fidelity-layer files are listed in DES-019 §6
