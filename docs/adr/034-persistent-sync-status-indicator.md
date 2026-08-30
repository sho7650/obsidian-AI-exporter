# ADR-034: Persistent sync-status indicator

Date: 2026-08-23
Status: Accepted
Issue: [#458](https://github.com/sho7650/obsidian-AI-exporter/issues/458)
Related: [#422](https://github.com/sho7650/obsidian-AI-exporter/issues/422), [#424](https://github.com/sho7650/obsidian-AI-exporter/issues/424), [ADR-017](017-autoscroll-virtualized-platforms.md)

## Context

Syncing a long Claude or ChatGPT conversation runs a full virtualized scroll
pass (ADR-017) and can take minutes. Users start a sync and look away. By the
time they look back, the only report the extension ever produced — a toast that
auto-dismisses after 5 seconds on success, 6 on failure — is gone. A sync that
succeeded and a sync that never ran look identical.

#458 asked for the completion message to stay until ticked off, optionally
behind a setting.

## Decision

Add a small **status badge** anchored to the sync button, and **no setting**.

- The badge shows `✓` (success), `!` (partial), or `×` (failure), and stays
  until it is invalidated.
- Clicking it opens a detail panel: when the sync ran, the file it was saved
  as, each destination's outcome, warnings, and a `Dismiss` button.
- Existing toasts are unchanged. The badge is additive, so the immediate
  feedback path stays exactly as it was.

### The badge reports the last sync, not "up to date"

> **Superseded in part by [ADR-036](036-badge-invalidation-on-new-messages.md)
> (2026-08-29, issue #465):** Claude and ChatGPT now clear the badge when a turn
> newer than the sync appears. The rest of this section still holds for Gemini,
> Perplexity and Gemini Notebook, which expose no conversation-wide ordinal.

Invalidating the badge when new messages arrive was **deliberately not
implemented** (tracked in #424, which needs the same "what counts as a new
message" machinery for auto-sync). So the badge can outlive the state it
describes: a `✓` may sit next to a conversation that has grown since.

The badge is therefore defined as *the result of the last sync*, never *this
conversation is current*:

- the detail panel always states when the sync ran, in absolute and relative
  form ("Synced at 14:32 (5 min ago)")
- the wording is "Last sync …", never "Synced" / "Up to date"

When #424 lands, the definition can be strengthened; nothing here has to be
unwound.

### It is dropped when the conversation changes

Showing another conversation's result is not merely unhelpful — it is wrong.
So a conversation change clears the badge, which requires detecting a change
that involves **no page load**.

Measured on all five platforms on 2026-08-23 via CDP (a marker planted on
`window` plus a node appended to `document.body`, then a real click on the
platform's own control):

| Platform | new chat | conversation A → B | document survived |
| --- | --- | --- | --- |
| Gemini | `/app/{id}` → `/app` | `/app/A` → `/app/B` | yes |
| Claude | `/chat/{uuid}` → `/new` | A → B | yes |
| ChatGPT | `/c/{uuid}` → `/` | A → B | yes |
| Perplexity | `/search/{id}` → `/` | A → B | yes |
| Gemini Notebook | — | `/` → `/notebook/{id}` | yes |

Every transition is a same-document navigation, and every one of them changes
what `getConversationId()` returns (to `null` for a new chat). The content
script — and anything it appended to the page — keeps running throughout.

### Why polling, and not an event

| Option | Verdict |
| --- | --- |
| Patch the page's `history.pushState` | Impossible. Content scripts run in an isolated world and cannot see the page's JS environment. |
| `popstate` | Covers back/forward only. |
| Navigation API (`navigation` `navigate` event) | Fires for all same-document navigations, but it is Baseline 2026 while the extension declares `minimum_chrome_version: 96`, and its availability in an extension's isolated world is unverified. |
| `chrome.webNavigation.onHistoryStateUpdated` | Precise, but requires the `webNavigation` permission — a new install-time permission warning and re-consent from every existing user, for one badge. |
| **Poll `location.href`** | **Chosen.** No permission, no world dependency. |

The tick compares one string; `getConversationId()` is only consulted when the
href actually changed, so a href change that keeps the same conversation (a
query parameter) costs nothing. The watcher runs **only while a badge is on
screen** — it starts with the badge and stops when the badge is cleared or
dismissed, so a user who never syncs never pays for it.

### Placement: the button's corner, not the screen corner

The issue suggested the top-right of the viewport. All five platforms put their
own account, share, or menu controls there, so a fixed top-right badge would
collide with platform UI and need re-verification on every redesign.

The badge is instead absolutely positioned against a new `#g2o-sync-anchor`
wrapper that also holds the sync button — space the extension already owns. The
badge is a **sibling** of the button, not a child: a second click target inside
a `<button>` is invalid HTML, and its clicks would fire a sync.

### Pre-save failures raise the badge too

"Cannot connect to Obsidian" happens before any destination runs, so it carries
no `MultiOutputResponse`. Those failures produce a status through
`buildFailedSyncStatus()` and show `×` with the error text. They are precisely
the failures an absent user needs to still see.

## Consequences

- No new setting, no new permission, no change to extraction or output.
- `#g2o-sync-button` keeps its id and behaviour; only its `position: fixed`
  moved to the wrapper.
- Badge state is in memory: a page reload clears it, which is correct — "just
  synced" is not a property that should survive a reload.
- The three-way success/partial/error split lives once, in
  `buildSyncStatus()`, and both the toast and the badge read it, so the two
  cannot disagree.
- A stale `✓` after new messages is a known, documented limitation until #424
  — narrowed to the three platforms without a turn ordinal by ADR-036.

## Files

| Path | Role |
| --- | --- |
| `src/content/sync-status.ts` | DOM-free status model and age formatting |
| `src/content/conversation-watcher.ts` | href poll → conversation-change callback |
| `src/content/ui-badge.ts` | Badge and detail panel rendering |
| `src/content/ui.ts` | `#g2o-sync-anchor`, shared styles |
| `src/content/bootstrap.ts` | Wiring: badge lifetime and watcher lifetime |
