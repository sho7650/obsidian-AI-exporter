# ADR-024: Upward scroll movement counts as accumulation progress

- Status: Proposed
- Date: 2026-08-02
- Related: [ADR-017](017-autoscroll-virtualized-platforms.md), [ADR-018](018-progress-aware-scroll-deadline.md), issue #365
- Extends: the progress-aware deadline introduced by ADR-018

## Context

ADR-018 replaced the fixed 30s accumulation wall with a progress-aware deadline:
a pass stays live while it keeps making progress, where **progress was defined
as "an iteration surfaced a new turn"**. That definition rests on an assumption
stated in ADR-018's own Context — "Claude mounts ~6 turns per window and
advances ~1 turn per iteration" — i.e. that turn heights are roughly uniform.

A single turn taller than the viewport breaks the assumption. The virtualized
engine keys turns by the platform's own row identity (Claude's `data-index`,
ChatGPT's `conversation-turn-N`), so while the engine crawls upward *through*
one tall turn, every harvest returns the same key. By construction such a turn
surfaces no progress, and the idle deadline mis-classifies "traversing a tall
turn" as "the scroller is stuck".

That makes the failure a distance problem with a computable threshold:

```
step                        = max(400, floor(clientHeight × 0.6))
iterations in the idle window = SCROLL_IDLE_TIMEOUT / SCROLL_ACCUMULATE_POLL_INTERVAL
max traversable without a new turn = iterations × step
```

Measured against live Claude through the CDP daemon (2026-08-02, 1440×900
viewport, `.overflow-y-auto.overflow-x-hidden.flex-1`):

| Quantity | Measured |
| --- | --- |
| `clientHeight` | 852px |
| `step` | 511px |
| Idle window | 15000 / 400 = 37 iterations |
| **Max traversal without a new turn** | **18,907px** |
| Code block rendering | 14px font, 22.75px line-height, **22.16px per line** measured |
| **Single-turn limit** | **≈ 853 lines of code** |

A ~1000-line code block therefore renders ~22,160px tall and exceeds the limit
by ~3,250px, aborting the pass deterministically at the same place on every
retry — exactly what was reported in #365 (Claude 2.3.0 and 2.4.1, "sync stops
when long code blocs/answers are in the chat", repeated runs producing the
identical 39-turn partial capture).

Two further facts from the same measurement session:

1. **Scroll anchoring is not involved.** Every replayed iteration moved exactly
   the requested 511px (`scrollTop` after settle equalled the written value), so
   the container does not push back when tall rows mount. The engine's existing
   `scrollTop -= step` stepping is sound; only the deadline was wrong.
2. **Background-tab throttling compounds it.** Chrome checks throttled timers
   "once per second", and once per minute under intensive throttling for pages
   hidden > 5 minutes (MDN, `Window/setTimeout`). A backgrounded sync therefore
   gets far fewer than 37 iterations inside the same 15s, shrinking the
   traversal limit to a few thousand pixels — a few hundred lines of code.

## Decision

Widen the progress signal in `scrollUpUntilStable()` to
**a new turn OR a decrease in `container.scrollTop`**. Either resets
`lastProgressTime`; the stability counter (`SCROLL_STABILITY_THRESHOLD`
consecutive no-growth iterations while pinned at the top) continues to decide
normal completion, unchanged.

`SCROLL_IDLE_TIMEOUT` (15s) and `SCROLL_MAX_TIMEOUT` (300s) are unchanged, and
no new constants are introduced.

Additionally, `scrollUpUntilStable()` now emits one `console.debug` per
iteration (`scrollTop`, distance moved, whether the window grew), mirroring the
per-iteration log `ensureAllElementsLoaded()` has always had. A partial-capture
report is otherwise undiagnosable: #365 consumed three rounds of correspondence
because the only evidence available was the single summary line.

### Why the widened signal is still bounded

Upward travel is monotonically decreasing and bounded by the initial
`scrollTop`, so "movement" cannot sustain a pass indefinitely: once the top is
reached — or the scroller stops responding — movement ceases and the idle
deadline resumes its ADR-018 job of detecting a genuinely stuck scroller. The
absolute `SCROLL_MAX_TIMEOUT` still bounds the pathological case where a
container oscillates. For the reported conversation (`scrollHeight` ≈ 121,155px)
a full pass costs ≈ 121155 / 511 ≈ 237 iterations ≈ 95s, inside the 300s cap.

### Why this is NOT applied to the Gemini engine

`ensureAllElementsLoaded()` (Gemini's infinite-scroller) re-arms every iteration
by jumping to `scrollHeight` and back to 0, so its scroll position always
changes. Treating movement as progress there would make the predicate
permanently true and disable the idle deadline outright, forcing every stuck
Gemini pass to grind to the 300s cap. Gemini also does not evict turns, so the
tall-turn failure mode cannot arise: one turn's height never gates discovery of
the next. The change is therefore scoped to the virtualized engine only.

## Consequences

- Claude/ChatGPT conversations containing very tall turns (long code blocks,
  long single answers) accumulate fully instead of truncating at the tall turn.
- The idle deadline now measures "nothing is happening" rather than "no new
  turn", which is what ADR-018 intended; a stuck scroller is still detected
  within ~15s of motion stopping.
- One test changed meaning: `stops via the idle deadline ... when stuck below
  the top` models a scroller that travels 10,900 → 3,000 before pinning. Those
  ~15 iterations of real movement are now progress, so the pass runs ~53
  iterations instead of ~38. The bound was raised from `< 50` to `< 80`; the
  assertion's purpose (idle path, not the absolute ~750-iteration cap) is
  unchanged, and a new test pins the complementary case where the container
  never moves at all.
- Per-iteration `console.debug` adds ~2.5 lines/second to the page console
  during a sync. `debug` is below Chrome DevTools' default log level, so it is
  opt-in for users while being available in any future report.

## Alternatives considered

- **Adaptive step escalation** — grow `step` when an iteration yields no new
  turn. Traverses tall turns faster, but a step larger than the overlap window
  risks skipping short turns between two harvests, which is the exact failure
  ADR-017's `SCROLL_ACCUMULATE_STEP_FACTOR < 1` exists to prevent. Rejected as
  strictly riskier than fixing the deadline.
- **Anchor-based jumping** — scroll so the topmost currently-mounted row's top
  edge reaches the viewport bottom. Cannot skip a turn (everything below the
  anchor is already harvested) and crosses a tall turn in one step, but it
  requires the accumulation engine to reach into the DOM for the anchor element,
  widening `ScrollConfig` and the extractor contract. Deferred: the deadline fix
  is a ~15-line change that resolves the reported failure, and the measurement
  above shows stepping itself is not the problem.
- **Raise `SCROLL_IDLE_TIMEOUT`** — any fixed value still yields a fixed
  traversal distance and so merely moves the breaking point to a taller turn,
  while making every genuinely stuck scroll slower to detect. Rejected for the
  same reason ADR-018 rejected raising `SCROLL_TIMEOUT`.
