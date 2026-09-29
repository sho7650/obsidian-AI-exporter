# ADR-043: Extractors customize extraction through hooks, never by overriding extract()

- Status: Accepted
- Date: 2026-09-29
- Related: [ADR-033](033-truncated-capture-may-not-overwrite.md) (the `truncated` flag Gemini's copy
  missed), [ADR-036](036-badge-invalidation-on-new-messages.md) (why Gemini has no watermark),
  [ADR-032](032-configurable-scroll-deadlines.md) (the same rule for `applySettings`),
  [DES-018](../design/DES-018-quality-architecture-remediation.md) (H-1, M-1)

## Context

`BaseExtractor.extract()` is the template method every platform shares. Besides assembling the
result, it carries the structured signals the background acts on: `truncated` (ADR-033) and
`messageWatermark` (ADR-036).

Gemini overrode `extract()` to run its scroll-to-top engine before reading the DOM. The override
was a near-copy of the base method, and copies do not receive later fixes. When ADR-033 made the
shared flow set `truncated` wherever it built the "earlier messages may be missing" warning,
Gemini's copy built the warning but never set the flag. A cut-short Gemini capture therefore
bypassed the truncation guard: with append mode off, it could replace a complete note and report
success (DES-018 H-1, fixed in its own change before this one).

The hooks Gemini needed already existed. ChatGPT drives the same image collector through
`onExtractStart()` and `finalizeExtraction()`, and `collectMessages()` is where a platform decides
how messages are gathered.

## Decision

**1. Only `BaseExtractor` declares `extract()`.** A platform changes extraction by overriding a hook:

| Need                                           | Hook                   |
| ---------------------------------------------- | ---------------------- |
| Reset per-extraction state                     | `onExtractStart()`     |
| Gather messages with a platform-specific engine | `collectMessages()`    |
| Accumulate a virtualized DOM window by window  | `getScrollConfig()`    |
| Post-process a successful result (e.g. images) | `finalizeExtraction()` |
| Deep Research short-circuit                    | `isDeepResearchVisible()` and the Deep Research selectors |

**2. The rule is enforced.** `test/arch/extractor-extract-hook.test.ts` fails when any file in
`src/content/extractors/` other than `base.ts` declares `extract(...)` with a return type. It
follows `extractor-settings-hook.test.ts`, which enforces the same shape for `applySettings`
(ADR-032).

**3. Gemini overrides `collectMessages()`.** It scrolls to the top with `ensureAllElementsLoaded()`,
reads the DOM once, and returns `truncated: true` together with the warning, both from the same
`stopReason`. It returns no watermark: a lazy-loading turn count is not a stable ordinal (ADR-036).
The `collectMessages()` result shape is named `CollectedMessages` so the base and the override
cannot drift.

## Consequences

- Fixes to the shared flow now reach Gemini. The arch test turns a new override into a CI failure
  instead of a silent fork.
- Two visible changes for Gemini, both matching the other platforms:
  - Warnings are ordered scroll first, then image warnings (the base appends the scroll warning
    before `finalizeExtraction()` runs). The UI joins or lists warnings; nothing reads them by
    position (`bootstrap.ts`, `ui-badge.ts`).
  - A failed extraction (no messages) returns before the scroll warning is added, as it already
    did for Claude, ChatGPT and Perplexity.

## Alternatives considered

- **Keep the override and document it.** Rejected: the base method's JSDoc already documented
  the override, and the copy drifted anyway. Only a failing test stops the next copy.
- **Merge the two scroll engines.** Rejected here: Gemini's engine counts elements in one mounted
  list, the virtualized engine accumulates by id across windows (ADR-017, ADR-024). Unifying them
  is a separate design question; the hook boundary already lets each keep its own engine.

## Files

- `src/content/extractors/base.ts` — `CollectedMessages`, template-method JSDoc
- `src/content/extractors/gemini.ts` — `onExtractStart`, `collectMessages`, `finalizeExtraction`
- `test/arch/extractor-extract-hook.test.ts` — the fitness function
