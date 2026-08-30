# ADR-036: The sync-status badge clears when a newer message appears

- Status: Accepted
- Date: 2026-08-29
- Extends: [ADR-034](034-persistent-sync-status-indicator.md)
- Follows: [#465](https://github.com/sho7650/obsidian-AI-exporter/issues/465)
- Related: [ADR-017](017-autoscroll-virtualized-platforms.md), [#424](https://github.com/sho7650/obsidian-AI-exporter/issues/424)

## Context

ADR-034 shipped the badge as *the result of the last sync*, explicitly **not**
*this conversation is up to date*: adding messages after a sync left the `✓` in
place. #465 reports exactly that as a defect —

> successful syncs to part of the conversations cannot be distinguished from a
> need to resync additional conversation content

— and it is a fair reading. A `✓` that survives ten new turns is indistinguishable
from a `✓` that describes everything on screen.

## Decision

Invalidate the badge when the conversation grows past what the sync covered, on
the platforms where that can be detected without false positives. The badge's
definition is otherwise unchanged, and so is every other invalidation path
(conversation change, dismiss, a newer sync).

### The signal is a turn ordinal, never a turn count

The obvious signal — "more turns are in the DOM than there were" — is wrong on
every platform we support, in both directions:

| Platform | Why a count lies |
| --- | --- |
| Gemini | Scrolling **up** lazy-loads older turns (`infinite-scroller` fires `onScrolledTopPastThreshold`, see `selectors/gemini.ts`). The count grows with no new message. |
| Claude, ChatGPT | Virtualized (ADR-017): turns mount and unmount as the user scrolls, so the count moves in both directions for no reason at all. |

Claude and ChatGPT do expose something a count cannot give: a **conversation-wide
ordinal that is never renumbered** — Claude's virtual-row `data-index` and
ChatGPT's `data-testid="conversation-turn-N"`. Both were measured live and are
already relied on for extraction ordering (#352, #353: a mid-scroll window
reported turns 17-21 while the top window reported 1-21, with no renumbering).

The rule is therefore:

> An ordinal **strictly greater** than the one the sync covered means a new turn
> exists. Anything else — equal, lower, unreadable — does not.

The read is scoped to the thread scroller, not the document. `[data-index]` is a
bare attribute selector and both platforms virtualize their **sidebar** lists as
well; unscoped, scrolling the conversation list would raise the watermark and
clear the badge (caught by a test that returned 99 from a sidebar row).

Scrolling the thread can only ever surface ordinals at or below the synced one,
so it can never trip the rule. The cost is a false *negative* while the user is scrolled
far up when a message arrives; it resolves the moment they return to the bottom.

### The baseline comes from the extraction, not from the DOM

The number to compare against cannot be read from the page after the sync.
`accumulateWhileScrolling()` walks **upward** and returns with the container at
`scrollTop = 0` (`scroll-manager.ts`), so when the sync ends the mounted window
is the *oldest* turns: a post-sync read of a 120-turn conversation reports
something like 5. The badge would then clear itself the instant the user scrolled
back down.

So the accumulator, which sees every window including the newest one pinned by
`seedAtBottom()`, reports the highest ordinal it saw as `AccumulateResult.maxOrder`.
That travels out as `ConversationData.messageWatermark` and becomes
`SyncStatus.messageWatermark`. When auto-scroll is off, the baseline is a plain
DOM read — which is correct there, because the mounted window *is* what was
extracted.

### Platforms without an ordinal are left exactly as they were

Gemini, Perplexity and Gemini Notebook report `null`, and the watcher then arms
nothing — not even a timer. A badge that lingers is a known limitation; a badge
that clears itself because the user scrolled would be a new defect. The same
applies to a sync that failed before extracting anything: no extraction, no
trustworthy ordinal, no watcher.

Finding a safe signal for those three needs live CDP measurement of what their
DOM does on upward scroll, and is left to a follow-up.

### Why polling again

Same reasoning as ADR-034: a content script cannot observe the page's own
framework, and the alternative here is a `MutationObserver` on the thread, which
fires on **every streamed token** and would still have to re-read the ordinal
afterwards. The tick is one `querySelectorAll` over the *mounted* window (a few
dozen nodes on both virtualized platforms), it runs only while a badge is on
screen, and it stops permanently the first time it fires.

## Consequences

- On Claude and ChatGPT the badge now answers #465: it disappears as soon as the
  conversation moves past the sync it describes.
- The wording stays "Last sync …" and the detail panel still always states the
  age, because three platforms still cannot detect a new message.
- `#424` (auto-sync) can reuse `getMessageWatermark()` as its "what counts as a
  new message" signal instead of inventing a second one.
- No new setting, no new permission, no change to extraction output.

## Files

| Path | Role |
| --- | --- |
| `src/content/message-watcher.ts` | ordinal poll → new-message callback |
| `src/content/extractors/base.ts` | `getMessageWatermark()` hook (null default) + watermark plumbing |
| `src/content/extractors/claude.ts` | highest mounted `data-index` |
| `src/content/extractors/chatgpt.ts` | highest mounted `conversation-turn-N` |
| `src/lib/scroll-manager.ts` | `AccumulateResult.maxOrder` |
| `src/content/sync-status.ts` | `SyncStatus.messageWatermark` |
| `src/content/bootstrap.ts` | both watchers share one composed lifetime |
