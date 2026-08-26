# ADR-035: Perplexity's answer placeholder is gone and Deep Research is lazy-mounted

- Status: Accepted
- Date: 2026-08-26
- Extends: [ADR-016](016-e2e-baseline-contract-and-reporting.md) §1, [ADR-031](031-selector-content-metric.md)
- Follows: [#444](https://github.com/sho7650/obsidian-AI-exporter/issues/444), [#402](https://github.com/sho7650/obsidian-AI-exporter/issues/402)
- Known limitation: [#463](https://github.com/sho7650/obsidian-AI-exporter/issues/463)

## Context

`nix run .#e2e-selectors` failed on Perplexity with three zero-match selectors, and the run took
54.6s against ~6s for every other platform. Measured live through the CDP daemon against an
authenticated session (`connectOverCDP` → `PERPLEXITY_CONV_URL`), not inferred from the failure:

| selector | before (baseline 2026-08-16) | now |
| --- | --- | --- |
| `div[id^="markdown-content-"]` | 2 | **0** |
| `[id^="markdown-content"]` (prefix loosened) | — | **0** |
| `div[class~="group/query"] span.select-text` | 2 | **0** |
| `div.bg-raised.rounded-lg` | 4 | **0** |
| `.prose.max-w-none` | 1 | **0** |
| `.prose.inline` | 3 | 2 |

Three changes shipped together.

**1. The answer placeholder was removed, id and all.** #444 caught the first half of this rollout:
`#markdown-content-N` stayed in the DOM as an *empty* placeholder while the answer rendered beside
it. The second half deleted it. The answer is now a bare
`.prose.dark:prose-invert.inline` carrying a new `data-renderer="lm"` attribute, and nothing else
anchors it.

**2. The user bubble lost its `group/query` wrapper.** The bubble itself
(`div.bg-subtle.rounded-2xl`) is what now scopes the query text. The primary selector
`span.select-text` was unaffected, so this surfaced only as a `lost` fallback.

**3. Deep Research reports are lazy-mounted behind a collapsed card.** The report used to be inline
prose inside a raised card. It is now an attachment card — title, a "Deep research report" label,
and buttons — whose subtree, walked to depth 6, contains **no report body at all**. Clicking it
navigates to `?preview=1` and mounts the report into a side panel:

| | collapsed (default) | after clicking the card |
| --- | --- | --- |
| `.prose` | 2 | 4 |
| `.prose.max-w-none` | 0 | 1 |
| `[data-renderer="lm"]` bodies | 948, 756 chars | 948, 756, **3785** chars |

`#markdown-content-N` stays at 0 in both states: its removal is permanent, not a collapse artifact.

Two consequences follow that the failure output did not show. The ready selector for the live test
was `div[id^="markdown-content-"]` — the same dead selector — so every run burned three navigation
retries before validating anything; that is the 54.6s. And `markdownContent` was Perplexity's only
entry in `CONTENT_REQUIRED`, the list that refuses to record a matched-but-empty answer container
(ADR-031). Removing it would have left the platform with no content guard at all — exactly the hole
#444 fell through.

## Decision

**Selectors that cannot be proven against a freshly loaded conversation do not live in
`SELECTORS`.** The live baseline refuses to record a zero-match selector, and the refusal is per
selector *string*, so one unprovable entry blocks the whole platform (#402). Both the legacy
placeholder and the Deep Research report body are now unprovable — the first because most users no
longer receive it, the second because it requires a click. They move to private constants in
`perplexity.ts`, where they still drive extraction but are invisible to the contract.

**`answerProse` inherits the content guard.** It is now the only container an assistant message is
read out of, so it takes `markdownContent`'s place in `CONTENT_REQUIRED` for this platform. Without
that, a future layout that keeps the class list but moves the text elsewhere would extract empty
notes and stay green — the #444 failure mode, restaged.

**The report is keyed off its prose, not its card.** `.prose.max-w-none` marks report prose under
both layouts, and under both it *wraps* the report's own `inline` prose. Matching on it alone both
finds the report and excludes it from the answer set, so the card itself never needs naming — which
is why the card's `rounded-lg` → `rounded-xl` rename costs nothing. A collapsed card matches
nothing here, which is correct: there is no body to extract.

**An opened preview panel is extracted as a report.** The panel's prose already satisfied
`answerProse`, so the shipped extension was *already* capturing it — as a trailing plain answer,
by accident. Routing it through the report path keeps the content and makes the capture
deliberate. Ordering comes from the split-pane DOM rather than the thread, so a report may land at
the end rather than beside its turn; that is accepted over silently dropping 3785 characters a user
had open on screen.

**The ready selector tracks the answer container.** `perplexity_conv` becomes
`.prose[data-renderer="lm"]`.

## Consequences

- A Deep Research report that the user has **not** opened is not exported. Only the inline summary
  is. This is a real capability loss, tracked as #463 and in the same class as ChatGPT's
  cross-origin Deep Research iframe (#283).
- The pre-2026-08 layout keeps working. The placeholder is demoted, not deleted, and its
  double-count guard is intact — the legacy-layout tests all stay green.
- The live run went from 54.6s (1 failed) to 6.0s (passed); the whole suite from 1.6m to 44.8s.
- `DES-004` §4.1 still describes the original 2025 placeholder-pairing design. It is historical from
  this point on; this ADR and the selector module are the current source of truth.
