# ADR-018: Progress-aware scroll accumulation deadline

- Status: Proposed
- Date: 2026-07-22
- Related: [ADR-017](017-autoscroll-virtualized-platforms.md), issue #360
- Extended by: [ADR-024](024-scroll-progress-includes-movement.md) — the
  "progress" signal defined here counts only new turns, which mis-classifies the
  traversal of a single viewport-dwarfing turn as a stuck scroller (issue #365)
- Supersedes/extends: the fixed `SCROLL_TIMEOUT` wall in `src/lib/scroll-manager.ts`

## Context

Both scroll engines in `src/lib/scroll-manager.ts` bounded a single
accumulation pass with one fixed wall-clock constant, `SCROLL_TIMEOUT = 30000`:

- `ensureAllElementsLoaded` — Gemini's infinite-scroller (count-based).
- `scrollUpUntilStable` — the virtualized Claude/ChatGPT engine (ADR-017).

Issue #360 (reported against 2.2.6, Claude.ai, ~100+ turns) showed the fixed
wall does not scale with conversation length. Each accumulation iteration costs
`SCROLL_ACCUMULATE_POLL_INTERVAL = 400ms`, so 30s allows only ~75 iterations.
Claude mounts ~6 turns per window and advances ~1 turn per iteration, so any
conversation past ~75 turns times out **mid-scroll** with a partial capture and
an "unbalanced / incomplete" warning. A previously-synced conversation that has
since grown hits this reliably.

Two further facts make a fixed wall-clock budget the wrong bound:

1. **The engines already detect completion by stall, not by the clock.** Both
   stop when the turn set stops growing for `SCROLL_STABILITY_THRESHOLD = 3`
   consecutive iterations. The timeout was only ever a secondary guard against
   a scroll that never stabilizes.
2. **Background-tab timer throttling.** Chrome clamps `setTimeout` in hidden
   tabs — to ≥1s when hidden, and to ~10s once hidden >5min (MDN:
   `Window/setTimeout`, "Reasons for delays longer than specified"). A
   wall-clock budget therefore buys a wildly variable number of iterations
   depending on whether the tab is foregrounded, so it cannot reliably bound
   "enough work to finish."

## Decision

Replace the single fixed wall with a **progress-aware deadline**, applied
uniformly to both engines via a shared `withinDeadline(startTime, lastProgressTime)`
predicate. A pass stays live while:

- **no-progress (idle) < `SCROLL_IDLE_TIMEOUT` (15s)** — `lastProgressTime` is
  reset on every iteration that surfaces a new turn/element, so a genuinely long
  conversation is never cut off as long as scrolling keeps yielding turns; **and**
- **total elapsed < `SCROLL_MAX_TIMEOUT` (300s)** — an absolute safety cap that
  bounds pathological unbounded growth.

Normal completion is unchanged: `SCROLL_STABILITY_THRESHOLD` consecutive
no-growth iterations at the top returns `fullyLoaded: true` long before either
deadline. The deadline now only fires on the two failure modes it should: a
stuck/broken scroll (idle) or runaway growth (cap).

`SCROLL_TIMEOUT` is removed; `SCROLL_IDLE_TIMEOUT` and `SCROLL_MAX_TIMEOUT`
replace it in `src/lib/constants.ts`. The timeout warning strings are reworded
to drop the now-meaningless fixed "after 30s" figure.

## Consequences

- Long virtualized Claude/ChatGPT conversations (and long Gemini conversations)
  accumulate fully instead of truncating at ~75 turns — the reported #360 case.
- A very long conversation now takes proportionally longer wall-clock to sync
  (bounded by the 300s cap). A progress indicator is out of scope here.
- `SCROLL_IDLE_TIMEOUT` must exceed the worst-case throttled inter-mount delay
  so a backgrounded-but-still-progressing tab is not mis-detected as stuck; 15s
  clears the ≥10s intensive-throttling floor.
- The downstream "duplicate note instead of append on the timeout path" symptom
  from #360 is tracked separately (issue #365); this ADR covers only the
  accumulation deadline.

## Alternatives considered

- **Raise `SCROLL_TIMEOUT`.** Still a fixed wall (picks an arbitrary number),
  still defeated by background-tab throttling, still caps length. Rejected.
- **Event-driven mount detection (`MutationObserver` / `IntersectionObserver`).**
  More robust than polling but a larger refactor of the accumulation engine with
  higher regression risk. Deferred; the idle deadline is a minimal, sufficient
  fix.
