# ADR-022: Virtualized windows are merged by anchor insertion, not suffix overlap

## Status

Accepted (2026-07-29)

Related: [ADR-017](017-autoscroll-virtualized-platforms.md) (accumulation engine),
[ADR-018](018-progress-aware-scroll-deadline.md) (scroll deadline),
issues [#352](https://github.com/sho7650/obsidian-AI-exporter/issues/352),
[#353](https://github.com/sho7650/obsidian-AI-exporter/issues/353)

## Context

`accumulateWhileScrolling` harvests a virtualized conversation one mounted window
at a time while scrolling upward, then stitches the windows into a single
ordering. The original `mergeWindow` stitched by **suffix/prefix overlap**: find
the largest _k_ where the new window's last _k_ keys equal the accumulation's
first _k_ keys, prepend the rest, and fall back to prepending the whole window
when no such _k_ exists.

That heuristic assumes each window is a contiguous slice of the conversation.
**It is not.** On both Claude and ChatGPT the newest few turns never evict — they
stay mounted in _every_ window — while the middle evicts as you scroll up. A
window harvested near the top therefore looks like `[1…13, <persistent tail>]`,
and its suffix is that tail. The suffix can never match the accumulated head,
which holds older turns, so overlap is always 0 near the top and the whole-window
fallback fires. De-duplication keeps first occurrences, which pins the tail at the
position it occupied in the _window_ — the middle — and pushes the turns that
belong there to the end.

The exported note then contains every turn (`message_count` is correct) but ends
mid-conversation, which users report as "the last passage is missing" or
"scrambled".

Claude was patched in #352 by sorting on its `data-index` (`HarvestEntry.order`).
ChatGPT keys turns by uuid, so that patch could not be applied and #353 was
deferred.

### Measurement

Mounted-turn windows from a real, logged-in **desktop** ChatGPT conversation of
21 turns, scrolling upward from the bottom (2026-07-29). Numbers are
`data-testid="conversation-turn-N"` ordinals. The CDP daemon serves ChatGPT's
mweb layout (ADR-017), so this was captured from the user's own Chrome.

| harvest | `scrollTop` | mounted turns                |
| ------- | ----------- | ---------------------------- |
| seed    | 6333        | 17-21                        |
| up1     | 4571        | 13-21                        |
| up2     | 3690        | 11-21                        |
| up3     | 2090        | 8-21                         |
| up4     | 1209        | 2-21                         |
| up5     | 344         | **1-13**, 17-21 (14-16 gone) |
| up6     | 0           | **1-12**, 17-21 (13-16 gone) |

Replaying the shipped `mergeWindow` over this trace yields:

```
[1…12, 17, 18, 19, 20, 21, 13, 14, 15, 16]
```

— one inversion, matching the reported symptom exactly. This trace is now a
regression test (`test/lib/scroll-manager.test.ts`, `TURN_WINDOWS`).

## Decision

**Merge windows by anchor insertion.**

A window's DOM order is document order, so it is globally truthful even when the
window is non-contiguous: in `[1…13, 17…21]`, every stated relation (1 before 2,
13 before 17) is correct. The window is a valid _partial_ order; the old
algorithm simply could not read it. So: walk the window, and insert each run of
not-yet-seen keys immediately before the first already-seen key that follows it
— its **anchor**.

In the failing step the anchor is turn 2, already accumulated, so the unseen turn
1 lands ahead of it and the tail is left untouched. The trace merges to `[1…21]`,
zero inversions.

Rules for the remaining cases:

- A trailing run with no following anchor goes directly after the last anchor.
- A window sharing no key with the accumulation is prepended whole — windows are
  only ever harvested while scrolling **upward**.
- Keys are never dropped, and the result never contains duplicates.

The anchor is guaranteed to exist because consecutive windows overlap by design:
`SCROLL_ACCUMULATE_STEP_FACTOR` is 0.6, so each scroll step moves less than one
viewport.

**Secondarily**, ChatGPT now also feeds `data-testid="conversation-turn-N"` into
`HarvestEntry.order`. Measured across the trace above, N is numbered over the
whole conversation and is never renumbered per window, which makes it the
equivalent of Claude's `data-index`. `resolveOrder()` sorts by it when every turn
supplies one. This is corroboration, not repair: the merge is correct on its own,
and if OpenAI drops the attribute, ordering degrades to the merge rather than to
the old scramble.

## Alternatives considered

**Sort by captured vertical position** (`getBoundingClientRect().top + scrollTop`)
— the direction proposed in #353. **Rejected on measurement.** Across the trace
above, individual turns moved by up to **719px** between windows, in lockstep with
`scrollHeight` changing 7802 → 7083 → 7099 as the virtual list re-estimated the
height of unmounted regions. `getBoundingClientRect()` is viewport-relative and
its values "change their values every time the scrolling position changes"
([MDN][mdn-rect]); adding `scrollTop` compensates for scrolling but not for
layout being remeasured underneath. `scrollHeight` is additionally rounded while
`scrollTop` is not ([MDN][mdn-sh]). And jsdom implements no layout — it returns
zeros for `getBoundingClientRect()` and `offsetTop` ([jsdom README][jsdom]) — so
the approach would be unverifiable in the unit suite.

**Read the conversation from `/backend-api/conversation/{id}`.** Rejected:
undocumented endpoint, needs a bearer token, widens permissions, out of scope.

## Consequences

- The fix is in the shared engine, so Claude and ChatGPT are both covered by one
  change; no per-platform ordering logic was added.
- `HarvestEntry.order` is no longer load-bearing for correctness. Claude's
  `data-index` path is left in place as a second signal; removing it is possible
  but out of scope here.
- The merge is now robust to non-contiguous windows in general, not just to the
  persistent-tail shape that was measured.
- Verification of the live DOM still depends on a human running the real browser:
  the CDP daemon and the automation browser both degrade ChatGPT to mweb
  (ADR-017). The recorded trace narrows, but does not remove, that gap.

[mdn-rect]: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
[mdn-sh]: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
[jsdom]: https://github.com/jsdom/jsdom#unimplemented-parts-of-the-web-platform
