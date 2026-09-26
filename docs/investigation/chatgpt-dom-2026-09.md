# ChatGPT 2026-09 DOM — live measurements (#515)

Measured 2026-09-26 on chatgpt.com, Chrome 153, desktop (2880px) and the E2E CDP daemon
(800px). Both layouts showed the same structure. Conversation text is not recorded here.
Requirements: [REQ-515](../requirements/REQ-515-chatgpt-2026-09-dom.md).

## Structure

| Role | Selector | Notes |
|---|---|---|
| Turn | `div[data-turn-key=<uuid>]` | One user prompt **and** its answer. The key equals the user message id and was stable across every remount observed |
| User text | `[data-user-message-bubble] .whitespace-pre-wrap` | |
| Assistant marker | `h4.sr-only[data-conversation-role="assistant"]` | Text is "ChatGPT said:"; present on image-only answers too. No `="user"` counterpart |
| Assistant body | `div[data-markdown-text-style="assistant-message"]` | No `.markdown.prose` anywhere |
| Scroller | `div[data-app-action-timeline-scroll]` | `display:flex; flex-direction:column-reverse`. The sidebar decoy `[data-app-action-sidebar-scroll]` still exists and holds no turns |
| Observation root | `main` | Present and contains the turns |

Gone: `section[data-turn-id]`, `[data-testid^="conversation-turn"]`, `[data-turn]`,
`[data-message-author-role]`, `[data-message-id]`, `[data-scroll-root]`.

`data-content-search-turn-key="fallback-turn-N"` is numbered **per mounted window**: the same
turn was observed as `4` and later as `9`. It is not an order index.
`data-chatgpt-search-unit-key="fallback-turn-N:i:role"` is absent on image-only answer units.

## Scrolling

- **Document order is chronological.** The column-reverse scroller has a single child,
  `div.flex.flex-col` (computed `flex-direction: column`), which holds the turns. The first
  `[data-turn-key]` in document order was the visually highest one (`top -22294` while pinned
  at the bottom, `top 124` once scrolled to the top, where it held the conversation's first
  prompt). Only the scroll origin is reversed, not the order of the turns.

- `scrollTop` is `0` at the **bottom** and negative upward, down to `-(scrollHeight - clientHeight)`.
- 3–6 turns are mounted at once; the rest are evicted.
- Reaching the top loads older turns above (`scrollHeight` grows, the view keeps its bottom
  anchor, so the distance from the top becomes positive again).
- **Latency, tab visible**: 69, 79, 94, 138 ms from reaching the top to `scrollHeight` growth.
- **Tab hidden**: no load within 15 s of reaching the top. The earlier "several seconds"
  observation was a hidden-tab artefact.
- At the start of the conversation no further load happens (no growth within 5 s). A full
  top→bottom walk of the test conversation collected 25 turns.

## Generated images

- `[data-testid="generated-image-preview"] img`, `alt="Generated image N"`, `src="blob:https://chatgpt.com/…"`.
- The nearest `[data-chatgpt-search-message-ids]` ancestor names the message.
- No `image-<uuid>` widget id; `[class*="imagegen-image"]` matches nothing.
- After an SPA navigation to another conversation the held `<img>` elements were detached
  (`isConnected === false`) but still `complete`; `fetch(src)` returned the PNG (1,432,617 and
  2,164,249 bytes) and a canvas `drawImage` + `toDataURL` succeeded. Measured from the page's
  main world.

## Not verified

- Multi-block and "Thought for …" answers in the new layout: none were mounted during the
  structure walk (one 3-id multi-block pair was seen earlier from the daemon, but its markdown
  roots were not counted).
- Reading the page's `blob:` URL from the extension's isolated world (the Gemini path already
  relies on it; not re-measured for ChatGPT).

## Spec references (checked 2026-09-26)

- Negative `scrollTop` for content overflowing toward the top (flex `column-reverse`): scroll origin
  is the main-start corner — css-overflow-3 <https://drafts.csswg.org/css-overflow-3/#scroll-container>;
  MDN `Element.scrollTop` <https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop>;
  shipped in Chrome 85 <https://chromestatus.com/feature/5759578031521792>. Out-of-range
  assignments clamp (CSSOM View "scroll an element").
- `scroll` events are queued as pending scroll events and fired during "update the rendering"
  <https://drafts.csswg.org/cssom-view/#scrolling-events>. A hidden tab does not run rendering
  updates, which is consistent with no older turns loading while the tab was hidden.
- A detached `<img>` re-runs "update the image data" on removal; it normally reuses the entry in the
  document's list of available images, but user agents may evict that entry at any time
  <https://html.spec.whatwg.org/multipage/images.html#list-of-available-images>. The live test
  above succeeded; the residual risk is covered by the existing canvas fallback and the
  per-image failure warning.
- jsdom (27.4) reflects inline `style.flexDirection` in `getComputedStyle`, but does no layout and
  stores `scrollTop` unclamped — tests must model the scroll range themselves.
