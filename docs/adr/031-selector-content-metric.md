# ADR-031: Live selector validation measures content, not only presence

- Status: Accepted
- Date: 2026-08-15
- Issue: [#445](https://github.com/sho7650/obsidian-AI-exporter/issues/445); motivated by [#444](https://github.com/sho7650/obsidian-AI-exporter/issues/444)
- Extends: [ADR-016](016-e2e-baseline-contract-and-reporting.md) §1 and §1a

## Context

A user reported that a Perplexity export saved only their prompt. Measured live through CDP
against an authenticated session:

| | reported thread | maintainer's pinned thread |
| --- | --- | --- |
| `div[id^="markdown-content-"]` matches | 3 | 2 |
| `innerHTML.length` of each | 0 / 0 / 0 | 12987 / 9822 |
| answer `.prose` inside the placeholder | no | yes |

Perplexity now renders answers **beside** those containers and leaves them behind as empty
placeholders. Still empty after 30 seconds, so not a render race. Both layouts are served
concurrently.

`extractAssistantContent()` finds no `.prose` inside, falls back to `contentElement.innerHTML`
(`''`), and `extractMessages()` drops the message on `if (content)`. The user message comes from a
different subtree and survives, so the export succeeds with zero assistant messages (#444).

**The live selector validation stayed green through all of it**, and structurally had to:
`validateSelectors()` measured `document.querySelectorAll(sel).length` and nothing else, and the
selector still matched three times. ADR-016 §1 already established the principle this was missing —
a baseline "may never record a selector that cannot be found", because zero entries made `lost`
undetectable. The same reasoning applies one axis over: **a contract that cannot see emptiness
cannot detect content loss.**

## Decision

**1. A second axis on the contract.** Every selector now records `nonEmptyCount` — matches whose
`textContent.trim()` is non-empty — beside `matchCount`. Baseline version 2 → **3**. The verdict is
a separate `contentStatus` field rather than an overload of `status`, because the axes are
independent: this failure is `status: match` with `contentStatus: content_lost`, and collapsing
them would force a precedence rule that discards half the diagnosis. `content_lost` (>0 → 0) blocks
the run; `content_degraded` (a drop that is still >0) is advisory.

**2. No per-selector exception list, except where silence would be fatal.** The baseline records
the *observed* value, so genuinely empty matches self-calibrate: Perplexity's `citationSpacer` (an
intentionally empty span) and Gemini's `generatedImage` (an `<img>`) record `0` and can never drop.
Only a `>0 → 0` transition is a violation, so no allow-list is needed for them.

That self-calibration has exactly one hole: a baseline **first captured on a machine that already
received the broken layout** would record `0` for the response container and be blind for good —
the failure ADR-016 §1 removed for zero-match entries, reappearing on the new axis. `CONTENT_REQUIRED`
closes it: for the containers the assistant message is read out of, an empty match is **refused at
update time**, with the selector named, mirroring the zero-match refusal. The refusal is scoped to
that list and must never be widened to every entry — that would make the Perplexity and Gemini
baselines unwritable.

**3. The content metric joins the settle signature.** Content arrives *after* presence — an empty
placeholder is literally the presence-before-content state — so sampling it before the page settles
reproduces the random failures §1a was written to remove. `observe()` joins whatever array it is
given, so `sampleCounts()` now returns `[count₀, nonEmpty₀, count₁, nonEmpty₁, …]` and `settle.ts`
is unchanged.

The feared cost did not materialise. Measured on the daemon, all seven targets, count-only vs
count+content:

| target | before (ms) | after (ms) |
| --- | --- | --- |
| gemini_conv | 2748 | 2760 |
| gemini_dr | 2745 | 2752 |
| claude_conv | 2749 | 2755 |
| claude_dr | 2741 | 2744 |
| chatgpt_conv | 2743 | 2753 |
| perplexity_conv | 2746 | 2750 |
| notebooklm_conv | 2751 | 2749 |

Every target settled in both runs, at 10 observations each; suite wall clock 47.9 s → 45.4 s. The
content half tracks the count half closely enough on these pinned conversations that it costs
nothing, so the signature keeps the exact counts rather than booleanising them.

**4. Blocking is decided by consulting the blocking lists.** `classifyResults()` previously derived
blocking by *excluding* one known-advisory status (`status !== 'degraded'`), which silently promoted
every status added later — `content_degraded` would have blocked runs. It now consults
`BLOCKING_STATUSES` / `BLOCKING_CONTENT_STATUSES`. Two related reporting gaps were fixed with it:
the notifier's baseline tables print the content transition (`3 -> 0 (content_lost)`), without which
a content violation reads as `match | 3 | 3`; and `notify-policy`'s advisory fingerprint omitted
`status`, so with more than one advisory verdict a swap between them would not have notified.

**5. Outcome validation is a separate layer, deliberately deferred.** Running the real extractor
against the live page and asserting `assistantMessageCount > 0` would catch causes that leave the
DOM looking healthy. It is feasible — the extractors touch no `chrome.*` API, only `window.location`
— but it needs a probe bundle, a build step in the e2e path, and an answer to whether page CSP
permits injection over a `connectOverCDP` session (`bypassCSP` is a `newContext()` option and is
unavailable there). Not attempted here; recorded so the next person does not rediscover the
constraint.

## Verified on the live daemon

The maintainer's pinned Perplexity conversation still serves the **old** layout, so the detector
cannot be proven by waiting for the rollout. It was proven by making the live page misbehave on
purpose: measure the untouched page, empty the `markdown-content` placeholders in-page, measure
again, and run both samples through the real baseline file and the real comparison/classification
code.

```
BEFORE (untouched live page)
  blocking: []   advisory: []

AFTER (placeholders emptied — imitates the reported layout)
  blocking: [ markdownContent [match/content_lost] 2->0 ]
  advisory: [ proseContent [degraded/content_degraded] 4->2, citation … , citationSpacer [degraded/content_ok] 0->0, … ]
```

Three things this shows that the unit tests cannot:

- `status` stayed **`match`** while `contentStatus` was `content_lost` — the count axis alone would
  have reported nothing, which is precisely #444.
- The advisory rows are honest collateral: the prose and citations that lived *inside* those
  placeholders went with them.
- `citationSpacer` shows `degraded/content_ok` — its count dropped, but the content axis stayed
  quiet for a selector that was legitimately empty to begin with. That is the self-calibration of
  Decision 2, observed on live data rather than in a fixture.

The baseline regeneration also exercised Decision 2's refusal path in the other direction: the
update **refused the Claude conversation group** because `SELECTORS:conversationBlock`
(`.group[style*="height: auto"]`) matched zero elements — a dead selector that predates this change
and that the count axis had already been failing on. Since a v2 file is replaced wholesale, that
platform's baseline now holds only its Deep Research group and its conversation test reports
`missing_groups` until the selector is fixed. Tracked separately.

## Consequences

- **One `e2e:baseline:update` per machine.** v2 files load as `legacy`, and the run already fails
  with the update-command hint. Baselines are gitignored per-machine artifacts, so this is the whole
  migration.
- **A rolled-out machine now fails loudly instead of recording zero.** That is the intended trade:
  an operator sees `refusing to record matched-but-empty selectors` and investigates, rather than
  silently enshrining blindness.
- **Settle timing measured, no regression.** See the table above; if a future platform does churn,
  booleanise the content half in the *signature* while still recording the exact count in the
  baseline.
- **Neither this nor the deferred probe sees a rollout the validating machine has not received.**
  The maintainer's pinned thread still serves the old layout, so both stay green on his machine
  until the rollout reaches him. The only rollout-independent detector is a fixture pair in CI,
  which belongs with the #444 fix. `CONTENT_REQUIRED` is the closest available hedge.
- **What this still does not catch**: a placeholder left holding a spinner label or a stray
  character (non-empty, still broken); a brand-new container no selector names; and anything
  downstream of selection — footnote transformation, ordering, markdown conversion, append.
