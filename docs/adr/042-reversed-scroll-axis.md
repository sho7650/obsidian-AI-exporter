# ADR-042: Measure virtualized scrolling as distance from the top

- Status: Accepted
- Date: 2026-09-26
- Issue: [#515](https://github.com/sho7650/obsidian-AI-exporter/issues/515)
- Related: [ADR-017](017-autoscroll-virtualized-platforms.md) (the accumulation engine),
  [ADR-018](018-progress-aware-scroll-deadline.md) / [ADR-024](024-scroll-progress-includes-movement.md)
  (what counts as progress), [ADR-033](033-truncated-capture-may-not-overwrite.md) (#449, partial passes
  never overwrite), [REQ-515](../requirements/REQ-515-chatgpt-2026-09-dom.md) (D5, D9)

## Context

The accumulation engine (ADR-017) walks a virtualized conversation upward, harvesting each
mounted window. It read position straight from `scrollTop`: `0` meant "at the top", and a
conversation whose `scrollTop` was still `0` after jumping to `scrollHeight` "fits without
scrolling".

ChatGPT's 2026-09 thread scroller is `display:flex; flex-direction: column-reverse`
(docs/investigation/chatgpt-dom-2026-09.md). Its scroll origin is the **bottom**:
`scrollTop` is `0` at the newest message and negative toward the oldest, down to
`-(scrollHeight - clientHeight)` — standard behaviour since Chrome 85 (css-overflow-3 "scroll
origin"; MDN `Element.scrollTop`). The engine therefore pinned the bottom, read `0`, declared
the conversation to fit, and returned only the newest 3–6 turns as a **complete** pass. A
complete pass is exactly what the #449 guard trusts, so such a note would overwrite a full one.

The same page also loads older turns only after the view reaches the top. Live, with the tab
visible, the older page arrived 69–138 ms after arrival; with the tab hidden nothing arrived
within 15 s — `scroll` events fire during "update the rendering", which a hidden tab does not
run (CSSOM View, scrolling events).

## Decision

1. **A scroll axis measures distance from the top** (`src/lib/scroll-axis.ts`). `0` is the
   oldest content on either kind of scroller; `scrollToDistance()` and `pinBottom()` move in
   that measure. A scroller is reversed when its computed `flex-direction` is
   `column-reverse`, or once it has reported a negative `scrollTop` (a latch that still works
   if the style moves to a wrapper). The accumulation engine uses only the axis.
2. **`topSettleMs`**: a platform may require the view to rest at the top for a while before a
   pass completes (`ScrollConfig.topSettleMs` → `AccumulateOptions`). Leaving the top — as
   happens when an older page is prepended and the bottom-anchored view is pushed down —
   restarts the wait. ChatGPT uses 2000 ms (~15× the measured load time); the default is 0, so
   Claude is unchanged.
3. **A hidden tab never settles at the top.** While `document.visibilityState` is `hidden` the
   top does not count toward stability or the settle time, for every platform. If the tab
   stays hidden the idle deadline ends the pass as `idle-timeout`: a partial result with the
   usual warning, never a false `complete`.
4. **Gemini's engine is not changed.** `ensureAllElementsLoaded` re-arms an edge trigger by
   jumping to `scrollHeight` and back to `0` on a normal-direction scroller; nothing there
   reads a reversed scroller.

### A rule that turned out to be unnecessary

REQ-515 D9 asked that `scrollHeight` growth at the top count as progress. It needs no code:
when an older page is prepended the view is pushed off the top, and the next upward step is
movement, which ADR-024 already counts. A test with pages that each take 4 s of a 5 s idle
window completes without any growth rule, so none was added (it would also re-open the
ADR-024 hazard on Claude, whose estimated row heights make `scrollHeight` fluctuate).

## Consequences

- A ChatGPT sync ends with one extra ~2 s pause at the top.
- Syncing with the tab in the background, or switching away mid-sync, now ends as a partial
  pass (warning, #449 guard) instead of a silent truncation — on Claude as well.
- If a user lowers the idle deadline below `topSettleMs`, ChatGPT passes always end as
  `idle-timeout`. Safe, and pinned by a test.
- The engine no longer assumes a scroll direction; a future reversed platform needs no engine
  change.

## Alternatives considered

- **ChatGPT-only handling in the extractor.** Would leave the engine's `scrollTop === 0`
  assumption in place for the next platform to trip over, and the extractor cannot drive the
  engine's loop.
- **Rely on the idle deadline alone at the top** (REQ-515 D9 as first written). Every pass
  would end as `idle-timeout`, so every ChatGPT note would carry a warning and the #449 guard
  would refuse every overwrite.
- **Scale settle time with network conditions.** Loads were local-speed (≤138 ms); a fixed
  margin is simpler and the idle deadline still bounds the worst case.

## Files

- `src/lib/scroll-axis.ts` (new), `src/lib/scroll-manager.ts`
- `src/content/extractors/base.ts` (`ScrollConfig.topSettleMs`), `chatgpt.ts`
- `test/lib/scroll-axis.test.ts`, `test/lib/scroll-manager.test.ts`,
  `test/extractors/chatgpt-2026-09.test.ts`
