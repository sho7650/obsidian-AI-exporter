# ADR-040: Gemini conversation titles come from `document.title`

- Status: Accepted
- Date: 2026-09-14
- Issue: [#504](https://github.com/sho7650/obsidian-AI-exporter/issues/504)
- Related: [#47](https://github.com/sho7650/obsidian-AI-exporter/issues/47) (the decision this
  one reverses), [ADR-016](016-selector-baseline-contract.md) (why no sidebar selector was
  added), [ADR-039](039-configurable-frontmatter-tags.md) (append never rewrites user-editable
  frontmatter)

## Context

Gemini was the only platform whose note title came from the **first user query** instead of
the page title. Claude, ChatGPT and Perplexity all use `getPageTitle() ?? getFirstMessageTitle()`.
The exception dates from #47 (2026-02-21): the first fix read `document.title`, and the same-day
follow-up (8d3cf27) replaced it with a top-bar selector because, at the time, Gemini's
`document.title` was always the constant `"Google Gemini"`. That selector group never matched
again after 2026-03 and was deleted in #325, leaving the first query as the only source.

The reporter of #504 expects the note to carry Gemini's own auto-generated chat name (the one
shown in the sidebar). Live inspection on 2026-09-14 in a logged-in Chrome profile showed:

| Observation                                                                                    | Consequence                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `document.title` is `"<chat name> - Google Gemini"` on every `/app/<id>` page                  | The chat name is available without any DOM selector           |
| `document.title` is bare `"Google Gemini"` only on the `/app` landing page                     | `getPageTitle()` already returns `null` for it                |
| On SPA navigation the title switches ~1.8 s **before** `.conversation-container` re-renders    | Reading it at extract time cannot pick up the previous chat   |
| No in-page title element exists; the old `[data-test-id="conversation-title"]` still matches 0 | A selector-based source is not an option                      |
| The sidebar's `span.title-text` holds the name but renders lazily (empty on first paint)       | A sidebar selector would fail the baseline contract (ADR-016) |
| Two real conversations shared the same first query but had different chat names                | The first-query title produces identical titles and slugs     |

`BaseExtractor.TITLE_SUFFIX_PATTERN` already strips ` - Google Gemini` and
`PLATFORM_ONLY_TITLES` already contains `google gemini` (both from #47), so the base helper
needed no change.

## Decision

| Aspect          | Decision                                                                                              | Rationale                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Title source    | `GeminiExtractor.getTitle()` returns `getPageTitle() ?? getFirstMessageTitle(queryTextLine, …)`       | Same shape as the other three platforms; the chat name is what the user sees in Gemini                                                    |
| Fallback        | First `.query-text-line`, then `Untitled Gemini Conversation`                                         | A brand-new chat is unnamed until Gemini's first response; the landing page and (unverified) temporary chats carry the bare product title |
| No new selector | The sidebar `span.title-text` is documented in `selectors/gemini.ts` but **not** added to `SELECTORS` | Lazy rendering would make `e2e-baseline-update` refuse to record it, and every selector in `SELECTORS` must match live (#402)             |
| Deep Research   | Unchanged; `tryExtractDeepResearch()` uses `getDeepResearchTitle()` before `getTitle()` is reached    | The report title lives in the panel, not in `document.title`                                                                              |
| Append mode     | Unchanged; `buildAppendContent()` still rewrites only `modified` and `message_count`                  | Same principle as tags in ADR-039: a user may have renamed the note in Obsidian, and the file name cannot follow anyway                   |
| Test hygiene    | `gemini.test.ts` resets `document.title = ''` in `beforeEach`                                         | `clearFixture()` wipes only `<body>`; a `<title>` set by an earlier test lives in `<head>` and would now leak into `getTitle()`           |

### What is not changed

- Notes saved before this change keep their first-query title and file name. A later save of
  the same conversation still appends to that file because the lookup is keyed by frontmatter
  id (direct path miss → id-suffix or full scan), not by title.
- Rewriting `title:` on append when Gemini's name differs. Out of scope; open a separate issue
  if wanted.

## Consequences

- Gemini notes are titled and slugged the way Gemini names them, and two conversations that
  open with the same question no longer collide on the slug (only the id suffix differed).
- A conversation exported before Gemini names it keeps the first-query title for good, exactly
  as today. This window was not measured (it needs sending a message in a real account).
- If Gemini ever reverts `document.title` to a constant, `PLATFORM_ONLY_TITLES` sends the
  extractor back to the first query with no other change.
- Nothing in `SELECTORS` changed, so the e2e baselines are untouched.

## Files

- `src/content/extractors/gemini.ts` — `getTitle()` order and the corrected comment
- `src/content/extractors/base.ts` — `getPageTitle()` JSDoc no longer claims Gemini is unsuitable
- `src/content/extractors/selectors/gemini.ts` — note on the title source and the sidebar element
- `test/extractors/gemini.test.ts` — `document.title` preference, fallbacks, truncation, `extract()` integration
