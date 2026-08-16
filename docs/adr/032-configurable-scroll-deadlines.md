# ADR-032: Auto-scroll deadlines are user settings, and a stop says which one fired

- Status: Accepted
- Date: 2026-08-16
- Issue: [#449](https://github.com/sho7650/obsidian-AI-exporter/issues/449)
- Extends: [ADR-018](018-progress-aware-scroll-deadline.md), [ADR-024](024-scroll-progress-includes-movement.md)

## Context

A user synced a 446-message Claude conversation and got 27 messages:

```
[G2O] Virtualized conversation — scrollTop=257486, 7 turns mounted, accumulating by scrolling up
[G2O] Auto-scroll accumulation timed out (no new turns for 15s) with 27 turns
```

They reasonably concluded, from that sentence, that the stop was idle-based rather than the 300s
ceiling. **They could not have known.** `withinDeadline()` ended a pass on either the 15s idle
deadline or the 300s absolute cap, and both engines printed one sentence naming only the idle one.

The arithmetic does not settle it either. At the measured live step of 511px (1440×900), reaching
the top from scrollTop 257,486 needs ~504 iterations; the 300s cap affords ~500 at 0.6s per
iteration and ~714 at 0.42s. Idle and ceiling are genuinely indistinguishable from the shipped log.

Two further duplications made this worse than it needed to be: the stop was logged in two places
(one per engine) and the user-facing warning existed as **byte-identical literals** in
`base.ts` and `gemini.ts`.

The maintainer's decision was deliberate: **do not chase the root cause of the stall on very long
conversations. Give the user the controls instead**, and make the message tell them which control
to reach for.

## Decision

**1. The deadline predicate returns which threshold was crossed first.** `crossedDeadline()`
replaces `withinDeadline()` and compares the two absolute instants (`lastProgress + idleMs` versus
`start + maxMs`) rather than checking idle and then the cap. Order-of-checks would be wrong the
moment the values become user-set: `idleMs > maxMs` is reachable, and the naive form would then
blame idleness for a ceiling stop — reproducing the exact confusion this ADR exists to remove.

**2. `ScrollStopReason` on both result shapes**, with `fullyLoaded === (stopReason === 'complete')`
pinned by a test so the two can never drift.

**3. One log and one warning builder, shared by both engines.** `logScrollStop()` and
`describeScrollStop()` collapse the two duplicated log sites and the two duplicated literals. The
log now carries elapsed time and iteration count as well as the reason: the next report will not
need the arithmetic this one did.

**4. Two user settings, in seconds.** `scrollIdleTimeoutSec` (15) and `scrollMaxTimeoutSec` (300),
clamped to 5–600s and 30–3600s **in both the popup and the schema** — the popup for immediate
feedback, the schema because sync storage is cross-device and untrusted at load. Values are
**clamped, not rejected**: this is the migration boundary, and a value written by another device
should be moved into range rather than silently reset to the default.

Stored in seconds, the unit the popup displays, so no conversion can go stale; the single `×1000`
lives in `resolveScrollDeadlines()`. One pair covers both engines: the auto-scroll toggle is
already a single control for all five platforms, and the per-engine meaning of "progress"
(ADR-018/024) is not something a user can act on.

**5. The warning names the setting to raise** — "Auto-scroll hit its 300s time limit … Raise the
auto-scroll timeouts in Settings and sync again." Settability is pointless if the message that
tells you the limit was hit does not say what to change.

**6. `applySettings` becomes a template method.** All three virtualized extractors overrode it and
each repeated `this.enableAutoScroll = …`, so assigning the deadlines in `BaseExtractor` would have
been dropped by every one of them — silently, because extraction keeps working and merely ignores
the configuration. `BaseExtractor.applySettings` now owns the shared assignment and calls
`applyPlatformSettings()`; `test/arch/extractor-settings-hook.test.ts` makes that structural rather
than remembered.

## Why a one-hour ceiling is safe

Per Chrome's documentation the service worker terminates after 30s idle or >5 minutes of
processing. The scroll runs in the **content script**, whose lifetime is the tab's; the worker is
only woken by the `saveToOutputs` message afterwards. A 3600s cap therefore cannot outlive anything
except the user's patience — and the idle deadline still fires independently, so a genuinely stuck
scroll is still bounded regardless of how high the ceiling is set.

Sync-storage cost is negligible: two numbers against an 8 KB per-item and 100 KB total quota.

## Consequences

- Every install gets the same defaults as before; nothing changes until a user opts to change it.
- A user can now hold their own tab busy for up to an hour. The help text states the trade-off.
- The `no-useless-assignment` and dead-predicate cleanups came with the reason plumbing; two engine
  helpers (`createAccumulator`, `seedAtBottom`, `partialElementResult`) were extracted so the lint
  warning count stayed at the three that predate this change.
- Existing tests that asserted the old wording were rewritten to assert the **stronger** property:
  a pass that never stops progressing reports the ceiling and specifically does not say "no
  progress".
- **What this does not do**: it does not explain why the reported conversation stopped moving at 27
  turns. That remains unknown, and the new log is the instrument for the next report — it names the
  deadline, the elapsed time and the iteration count.
