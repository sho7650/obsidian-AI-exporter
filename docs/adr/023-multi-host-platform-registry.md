# ADR-023: Multi-host platform registry (NotebookLM → Gemini Notebook rebrand)

## Status

Accepted — 2026-07-29

## Context

Google rebranded **NotebookLM** to **Gemini Notebook** and moved it from
`notebooklm.google.com` to `notebook.google.com`.

Verified against the live product on 2026-07-29:

| Observation | Result |
| --- | --- |
| `https://notebooklm.google.com/notebook/{uuid}` | redirects to `https://notebook.google.com/notebook/{uuid}` — path shape unchanged |
| `document.title` | `"{notebook title} - Gemini Notebook"` (was `… - NotebookLM`) |
| DOM selectors (`.chat-message-pair`, `.from-user-container .message-text-content`, `.to-user-container .message-text-content`, `element-list-renderer`, `button.citation-marker`, `.cover-title`) | all still match |

Chrome injects content scripts based on the document's **final** URL, so once
the redirect lands on `notebook.google.com` — a host absent from
`content_scripts.matches` — the content script never runs. The extension was
therefore completely non-functional on this platform, not merely degraded.

Two structural assumptions in the codebase broke at once:

1. **`PlatformInfo.host: string`** (ADR-014) assumed exactly one hostname per
   platform, so there was nowhere to express "new host plus legacy host".
2. **Display labels were assumed immortal.** `PLATFORM_LABELS` fed both
   `document.title` suffix stripping (`BaseExtractor`) and append-mode message
   counting (`message-counter.ts`). The latter parses notes written by *earlier
   versions of this extension*, where the assistant callout reads
   `> [!NOTE] NotebookLM`.

## Decision

### 1. `PlatformInfo.hosts` is a non-empty list, canonical host first

```ts
notebooklm: {
  hosts: ['notebook.google.com', 'notebooklm.google.com'],
  label: 'Gemini Notebook',
  labelAliases: ['NotebookLM'],
}
```

`platformForHost()` compares each candidate with strict equality, preserving the
ADR-014 defence against `evil-notebook.google.com.attacker.com`
(CodeQL `js/incomplete-url-substring-sanitization`). `platformOrigin()` returns
the canonical origin; the new `platformOrigins()` returns all of them and feeds
`ALLOWED_ORIGINS`.

The legacy host is retained even though the redirect currently works: Google
rollouts are staggered, and one line of manifest match pattern is far cheaper
than a second broken release. Removing a host permission triggers no Chrome
permission warning, so retiring it later is a no-cost change.

### 2. `labelAliases` keeps superseded brand names readable

`ALL_PLATFORM_LABELS` (current labels + aliases, sorted **longest-first**) is
the input for every consumer that parses text the extension did not just
generate:

- `BaseExtractor.TITLE_SUFFIX_PATTERN` / `PLATFORM_ONLY_TITLES`
- `message-counter.ts` `LABEL_ALTERNATION`

`PLATFORM_LABELS` keeps returning only the current label and remains what
`formatMessage()` writes into new notes.

The longest-first ordering matters: `"Gemini"` is a strict prefix of
`"Gemini Notebook"`, and a naive alternation would let the shorter label win.

### 3. The platform id stays `notebooklm`

The id is an internal stable key, not a display name. It appears in
`source:` frontmatter, the `{platform}` vault-path token (`AI/notebooklm/`),
note id prefixes, and append-mode file matching. Renaming it would strand every
existing note: saves would silently start landing in a new folder and
`VALID_SOURCES` validation would reject the old ones.

## Consequences

**Positive**

- Extraction works on both hosts; a staggered rollout cannot break users.
- Appending to notes written before the rebrand still counts existing messages
  correctly, so conversations are not duplicated.
- Future renames need only two registry fields, not a codebase sweep.

**Negative**

- Adding `notebook.google.com` to `host_permissions` is a new permission that
  triggers a Chrome warning, which **temporarily disables the extension until
  the user accepts it**
  ([permission warnings guidelines](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings#update_permissions)).
  Unavoidable — the extension cannot run on the new host without it. Release
  notes and the store listing must say so.
- Notes now mix `> [!NOTE] NotebookLM` (old turns) with
  `> [!NOTE] Gemini Notebook` (new turns) when appending to a pre-rebrand note.
  Accepted: rewriting historical note bodies is more invasive than the
  cosmetic inconsistency it would fix.
- Two hosts map to one platform, so `lint-platforms.mjs` requires both
  hostnames and both display names to appear in the documentation set.

## Follow-up

Every extractor still hardcodes its own hostname in `canExtract()`;
`notebooklm.ts` now delegates to `platformForHost()` instead. Hoisting that
into `BaseExtractor` would delete four more host literals and is worth doing,
but was deliberately left out of this fix to keep the diff scoped.

## References

- ADR-014: platform registry as SSOT
- `test/arch/platform-ssot.test.ts` — manifest ⇄ registry fitness function
- `scripts/lint-platforms.mjs` — manifest ⇄ documentation fitness function
