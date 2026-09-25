# Perplexity User Query Bubble (2026-09 layout)

**Date:** 2026-09-25
**Trigger:** daily E2E run `perplexity: selectors with zero matches: SELECTORS:userQuery` (both variants `lost`); every other Perplexity selector unchanged
**Status:** Measured on the pinned conversation via the CDP daemon (Chrome 153, 1440×900). Fix: `userQuery` re-anchored, legacy span kept outside the contract.

## Timeline

| Run | `userQuery` matches | overallStatus |
| --- | --- | --- |
| 2026-09-24 | 2 | pass |
| 2026-09-25 | 0 | fail (`perplexity_conv`) |

The rollout landed between those two runs.

## Findings

- `select-text` is gone from the whole page: `span.select-text` = 0 and `.select-text` = 0. The only `select*` classes left are `select-none`, `selection:*` and `placeholder:select-none`. Both contract variants ended in `span.select-text`, so both were lost.
- The query bubble `div.bg-subtle.rounded-2xl` still matches (2). What changed is its content: the query is now rendered by the markdown renderer, under a `data-renderer="lm"` node — the same attribute the answers carry — and the bubble's ancestor gained a semantic `group/user-bubble` class.

```html
<div class="group/user-bubble flex min-w-0 items-center justify-end gap-2">
  <div class="min-w-0 max-w-[600px] bg-subtle px-4 py-3 whitespace-pre-wrap break-words … rounded-2xl">
    <div class="flex min-w-0 max-w-full flex-col items-start">
      <div class="min-w-0 max-w-full max-h-[144px] overflow-hidden">
        <div>
          <div data-renderer="lm">
            <p class="my-2 …">query text</p>
```

- `max-h-[144px] overflow-hidden` clips a long query visually; the DOM holds the full text.
- Answers are unchanged: `answerProse` 2, `citation` 14, `legacyCitationPill` 11.

## Impact on the extension (before the fix)

- `collectTaggedElements` reads user turns through `SELECTORS.userQuery`, so every user question vanished from the note; the save carried the "No user messages found" warning with answers only.
- The title fallback used the same selector, so without a usable `document.title` the note was "Untitled Perplexity Conversation".
- User text is read with `textContent`, so the element type (span → renderer div) needs no extraction change.

## Fix

- `SELECTORS.userQuery`: `[class*="group/user-bubble"] [data-renderer="lm"]` (primary), `div.bg-subtle.rounded-2xl [data-renderer="lm"]` (fallback).
- `span.select-text` moves to a private `LEGACY_USER_QUERY` in `perplexity.ts` — collected as a user turn for users still on the old rollout, and included in the title fallback — outside the contract, following `LEGACY_MARKDOWN_CONTENT` (#464). A span inside a renderer-backed bubble is skipped so a transitional markup is not counted twice.
- Contract consequence: the two `userQuery` strings changed, so the next live run reports `new_selector` + `removed` until `nix run .#e2e-baseline-update` is rerun.
- Readiness: `CONVERSATION_READY_SELECTORS.perplexity` derives from `userQuery[0]`, so on a not-yet-rolled-out layout the content script starts after the 10 s fallback timeout instead of immediately. Self-healing; noted, not changed.

## Not verified

- Whether the old span form is still served to any account (assumed, per the #444/#464 rollout pattern).
- Multi-paragraph and code-block queries under the new renderer (the fixture models paragraphs only).
