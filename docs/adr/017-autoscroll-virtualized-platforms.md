# ADR-017: Auto-scroll for virtualized platforms (Claude & ChatGPT)

- Status: Proposed
- Date: 2026-07-06
- Related: [ADR-016](016-e2e-baseline-contract-and-reporting.md), issue TBD
- Supersedes/extends: Gemini auto-scroll (`src/lib/scroll-manager.ts`)

## Context

Claude and ChatGPT extract only the most-recently-rendered subset of a long
conversation (reported: ChatGPT 5/13 messages, Claude 6/12). Gemini already has
an auto-scroll pass (`ensureAllElementsLoaded`) that scrolls its
`infinite-scroller` to the top and re-arms an edge-trigger until the turn **count**
stabilizes — it assumes turns **accumulate and stay** in the DOM.

Before designing a fix we verified the actual DOM behavior of both platforms
against live, authenticated sessions via the CDP daemon (`e2e-daemon`), because
the claude-in-chrome automation browser degraded both apps (ChatGPT → mobile-web
fallback `?mweb_fallback=1`; Claude → a `chat-stale-nav-*` state) and produced
false negatives.

## Findings (Phase 1 spike, 2026-07-06)

Measured on the daemon's real logged-in Chrome (`Chrome/150`):

**Both platforms use true DOM virtualization (windowing).** Only a small moving
window of turns is ever mounted; off-screen turns are **evicted**.

|                       | Claude                                                                                                                                        | ChatGPT (mweb proxy)                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Initial mounted       | 3 turns (at bottom)                                                                                                                           | 6 messages (at bottom)                                                    |
| After scrolling up    | grows to 5→7; `scrollHeight` 27310→30616                                                                                                      | 14 mounted at top                                                         |
| Scroll back to bottom | back to 3; earlier turns **evicted**                                                                                                          | back to 6; earlier 8 **evicted**                                          |
| Verdict               | **VIRTUALIZE**                                                                                                                                | **VIRTUALIZE**                                                            |
| Scroll container      | `div.overflow-y-auto.overflow-x-hidden.[scrollbar-gutter:stable].flex-1`                                                                      | `div[class*="scroll-gutter"]` (desktop selector TBD — see Open questions) |
| Stable per-turn id    | **`data-index`** on the row wrapper (monotonic; user=20, asst=21), alongside `data-test-render-count` / `data-sizer-excess` windowing markers | **`data-message-id`** / **`data-turn-id`** (uuid)                         |

Key consequence: **you can never hold all turns in the DOM at once.** Gemini's
count-based "scroll to top, then `extractMessages()` once" approach cannot work
here — by the time the top is loaded, the bottom turns are gone.

Scrolling **does** load earlier turns in a real authenticated session (the
earlier automation-browser "nothing loads" result was an artifact of the
degraded stale-nav state). Claude loads earlier turns via incremental
window-sized upward scroll; `scrollHeight` grows as history is measured in.

## Decision

Extract **incrementally while scrolling**, accumulating turns keyed by a stable
per-turn id, rather than scrolling first and extracting once.

1. Add an **accumulation loader** to `scroll-manager.ts` (dual-mode: keep the
   existing count-based path for Gemini; add an id-keyed accumulation path).
   Loop: scroll the container upward by ~one window, let the virtual list mount
   the newly-visible turns, extract + dedupe them into a `Map<id, Message>`,
   repeat until `scrollTop === 0` and no new ids appear for N stable iterations
   (or `SCROLL_TIMEOUT`).
2. Dedupe/order:
   - **Claude** — key by `data-index` (monotonic → also gives ordering and a
     completeness signal: contiguous from 0).
   - **ChatGPT** — key by `data-message-id`/`data-turn-id`; order by capture/DOM
     order; stop on stable-no-new-ids.
     _Superseded in part by [ADR-022](022-anchor-insertion-window-merge.md):_
     DOM-order stitching alone scrambles when the newest turns never evict
     (issue #353). Windows are now merged by anchor insertion, and ChatGPT also
     supplies the `conversation-turn-N` ordinal as `HarvestEntry.order`.
3. Expose the mechanism through a `getScrollConfig(): ScrollConfig | null` hook on
   `BaseExtractor` (default `null`). `BaseExtractor.extract()` runs the
   accumulation pass when a config is present. Gemini keeps its own `extract()`
   override (image capture) unchanged — no scope creep.
4. Gate behind the existing `enableAutoScroll` setting for both platforms; emit
   the existing "auto-scroll timed out / N loaded" warning on incomplete loads.

The dual-mode-defaulting-to-accumulation choice was confirmed with the user; the
spike proves accumulation is not merely safer but **required** for both
platforms.

## Consequences

- More invasive than Gemini's pre-pass: extraction interleaves with scrolling and
  must reconstruct full message content per window, then stitch. Assistant
  content on Claude (Extended Thinking, artifacts, tool blocks) must be captured
  correctly at each window.
- Robust to virtualization and future window-size changes.
- Testable with jsdom fixtures that simulate a windowed list (mount/evict rows by
  `data-index` on scroll), mirroring `createGeminiScrollableDOM`.

## ChatGPT scroll-container selector (resolved 2026-07-07)

First shipped as `.flex-1.flex-col[class*="overflow-y-auto"]`, which was wrong:
ChatGPT's **sidebar `<nav>`** also carries `flex-1 flex-col overflow-y-auto` and
sits earlier in the DOM, so `queryWithFallback` returned the nav (scrollTop 0) →
`accumulateWhileScrolling` saw scrollTop 0 and **skipped**, extracting only the
initially-mounted window (user-reported: no scrolling, no history). Confirmed
via a DevTools snippet in the user's real (non-mweb) Chrome:

- Sidebar `<nav>`: `overflow-y-auto`, scrollTop 0 — **decoy**.
- Thread scroller: `div[data-scroll-root]` with `not-print:overflow-y-auto`,
  scrollTop 4341/scrollHeight 10605, all 13 turns inside.

Fix: anchor on the semantic `[data-scroll-root]`; secondary
`[class*="not-print:overflow-y-auto"]` (the `not-print:` token is unique to the
thread scroller — the nav uses plain `overflow-y-auto`). Regression covered by a
decoy-nav fixture in `test/extractors/chatgpt-autoscroll.test.ts`.

## Open questions

- **Live desktop ChatGPT end-to-end**: both automated Chromes force the mweb
  layout, so accumulation on desktop ChatGPT is verified only by unit tests + the
  desktop fixture, not a live automated run. Claude's live run (daemon) captured
  all 26 turns; ChatGPT relies on the user's manual smoke test.
  Partially narrowed by [ADR-022](022-anchor-insertion-window-merge.md): the
  mounted-window sequence of a real desktop session was recorded and is replayed
  as a unit test, which confirmed that desktop ChatGPT does evict mid-conversation
  turns while keeping the newest ones mounted.
- Exact stop-condition tuning (stable-iteration threshold, per-window scroll
  delta) per platform.
