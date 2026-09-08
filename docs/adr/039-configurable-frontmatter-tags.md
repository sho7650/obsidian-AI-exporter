# ADR-039: Frontmatter tags are a user setting with a `{platform}` token

- Status: Accepted
- Date: 2026-09-06
- Issue: [#493](https://github.com/sho7650/obsidian-AI-exporter/issues/493)
- Related: [#328](https://github.com/sho7650/obsidian-AI-exporter/issues/328) (filename scheme, the
  previous `TemplateOptions` addition), [ADR-032](032-configurable-scroll-deadlines.md) (settings
  that name themselves in their own messages)

## Context

Every note carried a fixed tag list: `ai-conversation` + platform id for conversations,
`ai-research`, `deep-research` + platform id for Deep Research. The only control was the
**Tags** checkbox, which removes all of them. A user with an established tag scheme (reported
by email after #444) was renaming the tags in every clipping by hand and asked to edit the
names instead; they also pointed out that non-English users may want tags in their own
language.

The pieces were already in place: `TemplateOptions` round-trips new fields through
`storage.ts` and `settings-schema.ts` without further wiring (#328), the popup already takes
free text for the callout keywords through `validateCalloutType()`, and the background
validator already bounds the list (≤ 50 tags, 1–100 chars each). What was missing was a
place for the user's names and a rule for what a name may contain.

## Decision

| Aspect           | Decision                                                                                                                        | Rationale                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape            | Two lists in `TemplateOptions`: `conversationTags`, `deepResearchTags`, stored as `string[]`                                    | Two note types write two different lists today; one field per list is what the user sees, and an array is what the note builder consumes without re-parsing                                        |
| Token            | `{platform}` expands to the source id at save time (`lib/tag-template.ts`)                                                      | The same token users already know from the vault path; dropping it removes the platform tag, which the old code could not do                                                                       |
| Defaults         | `ai-conversation, {platform}` and `ai-research, deep-research, {platform}`, pre-filled                                          | Output is byte-identical for anyone who does not touch the fields                                                                                                                                  |
| Character rule   | Letters, digits, `_`, `-`, `/`, Unicode letters; not digits-only; a leading `#` is stripped and internal whitespace becomes `-` | Obsidian's own tag rules (obsidian.md/help/tags). A tag the extension writes must be one Obsidian will index                                                                                       |
| Invalid entry    | The **whole field** falls back to its default, with a `[G2O]` warning                                                           | Same policy as `validateCalloutType()`. Dropping only the bad entry would silently write fewer tags than the user believes they configured                                                         |
| Empty field      | Falls back to the default list                                                                                                  | "No tags at all" already has a control (the Tags checkbox); an empty field is far more often a cleared input than an intent, and a stale value from another device must not produce a tagless note |
| Storage boundary | `normalizeTemplateOptions()` re-runs the same `parseTagList()` on load                                                          | `chrome.storage.sync` is untrusted at load time; a value written by another build or by hand gets the popup's rules, not a looser set                                                              |
| Duplicates       | Removed after expansion, case-insensitively, first spelling kept                                                                | `claude, {platform}` on Claude would otherwise write `claude` twice; Obsidian treats tags case-insensitively, so `Claude` after `claude` is the same tag                                           |
| Existing notes   | Untouched. Append rewrites only `modified` and `message_count` (`append-utils.ts`)                                              | Changing the setting must not undo a user's manual clean-up, and append must add to a file, not rewrite it (#365)                                                                                  |

### What is not changed

- Renaming the platform tag itself per platform (`gemini` → `google-gemini`). `{platform}` can
  be dropped and a literal used; a per-platform map can follow if asked for.
- Tags derived from conversation content.
- The background validator's count and length limits.

## Consequences

- A user can match the extension's tags to their vault from the popup, in any language
  Obsidian accepts, without touching a note by hand.
- Pre-#493 settings and any code path that passes `TemplateOptions` without the new fields
  (tests, older stored settings) still produce the historical tags, because the note builder
  falls back to the defaults when a list is absent.
- The `SELECTORS`-style coupling warning does not apply: nothing here touches extraction or
  the e2e baselines.

## Files

- `src/lib/tag-template.ts` — defaults, `parseTagList()`, `formatTagList()`, `resolveTags()`
- `src/lib/types.ts`, `src/lib/settings-schema.ts` — fields, defaults, load-time normalisation
- `src/content/markdown.ts` — `conversationToNote()` resolves the list per note type
- `src/popup/index.html`, `src/popup/app.ts`, `src/_locales/{en,ja}/messages.json` — two fields
- `test/lib/tag-template.test.ts`, `test/lib/settings-schema.test.ts`,
  `test/content/markdown.test.ts`, `test/popup/index.test.ts`, `test/lib/append-utils.test.ts`
