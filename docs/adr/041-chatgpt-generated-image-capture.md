# ADR-041: Capture ChatGPT generated images same-origin, keyed by the image widget id

- Status: Proposed
- Date: 2026-09-22
- Related: [ADR-008](008-image-sync-strategy.md), [ADR-021](021-remote-image-fetch-in-service-worker.md), [ADR-027](027-generated-image-capture-from-rendered-element.md), [ADR-030](030-image-cdn-redirect-host.md), issue #423
- Extends: the capture half of ADR-008 to a second platform

## Context

Image export shipped for Gemini only (ADR-008 v2.0.0). Issue #423 tracks the
other platforms. ChatGPT now generates images in the web UI ("ChatGPT Images",
DALL·E retired), and a conversation containing one exports **without the
image and without the turn**: the widget lives in its own assistant turn that
has no `.markdown.prose`, so `ChatGPTExtractor.extractAssistantContent` returns
an empty string and both `extractMessages` and `harvestWindow` drop the turn.
No placeholder, no warning.

### What was measured

Live conversation over the CDP daemon, 2026-09-22, Chrome 153, 1440×900
(`docs/investigation/chatgpt-image-dom-structure.md`):

| Property | Value |
| --- | --- |
| `<img src>` | `https://chatgpt.com/backend-api/estuary/content?id=…&ts=…&p=fs&cid=…&sig=…&v=0` — **the page's own origin** |
| Page-world `fetch` (cookies) | 200, `type: basic`, `image/png`, 2,666,927 bytes |
| Node `fetch`, no cookies | 403 |
| Browser cookies, `sig` removed | 403 |
| `Access-Control-Allow-Origin` | absent (irrelevant: same origin) |
| Canvas `toDataURL` on the live element | succeeds (untainted), 4,972,298-char PNG data URL |
| Container | `div.group/imagegen-image#image-<uuid>`, three `<img>` sharing one `src` (one visible, two `aria-hidden="true"`) |
| Turn | `section[data-turn-id][data-turn="assistant"]`, **no** `.markdown.prose`, **no** `[data-message-id]` |

This is a third source form, distinct from both Gemini forms in ADR-027:

| Source form | Where the bytes can be read |
| --- | --- |
| Gemini `blob:` (revoked after decode) | canvas on the live element only |
| Gemini `https://lh3.googleusercontent.com` (no ACAO) | service worker only |
| **ChatGPT `https://chatgpt.com/backend-api/…`** | **the page itself**: same origin, cookie sent by default, canvas also untainted |

### Why the Gemini id scheme cannot be reused

`GeminiExtractor` overrides `extract()` and runs one `extractMessages()` pass,
so a monotonic `img-${++counter}` is stable. `ChatGPTExtractor` uses the base
`extract()` with the virtualized-scroll engine (ADR-017): `harvestWindow` runs
once per scroll window over overlapping windows, and the accumulator is
last-write-wins by turn key. A counter would mint a new id for the same image
on every window, and the surviving marker would point at a pending entry from
an arbitrary pass.

## Decision

1. **Capture in the content script, same-origin.** `captureImage` treats a
   `src` whose origin equals `location.origin` like a `blob:` URL: fetch it
   from the page (cookies ride along), and on failure recover the bytes from
   the rendered element via canvas — the same ADR-027 fallback, now justified
   by an expiring signed URL instead of a revoked blob. Cross-origin `https:`
   sources keep going to the worker (ADR-021). No `host_permissions`, CSP
   `connect-src`, or `IMAGE_CONNECT_HOSTS` change: `chatgpt.com` is already a
   granted host and no extension-origin request is made.
2. **Image identity comes from the widget.** The id is derived from the
   `image-<uuid>` container id (`img-<uuid>`), so every harvest of the same
   turn produces the same marker and pending entry; when the container carries
   no id, the fallback is the turn key plus the image's index inside the turn.
   Pending images are keyed by id, so re-harvests overwrite instead of
   accumulating.
3. **The marker logic is shared, not copied.** Gemini's rewrite-on-a-clone,
   pending list, sequential capture, and "never fail silently" warning move
   into `src/content/image-markers.ts` and both extractors use it. Gemini keeps
   its counter ids (its tests pin `img-1..3`); ChatGPT supplies the widget id.
   `BaseExtractor` gains two hooks — reset before collection and finalize after
   — so ChatGPT stays on the base `extract()` instead of duplicating it.
4. **Detection stays out of the E2E contract.** The widget selector is a
   private constant in `chatgpt.ts`, like `DEEP_RESEARCH_FRAME_SELECTORS`
   (#402): adding it to `CHATGPT_SELECTORS` would block every ChatGPT baseline
   update unless the pinned conversation contains a generated image. Only the
   visible `<img>` (not `aria-hidden`) is captured, one per widget.
5. **An image-only turn is a message.** `extractAssistantContent` appends the
   markers after the prose blocks, so a turn with no prose still yields
   content and survives the empty-content filter. With image export disabled
   the widget is dropped, so such a turn is skipped — the same outcome as
   Gemini's src-less `<img>` removal.

### What is not changed

- The `![alt](g2o-image://id)` placeholder, per-destination resolution,
  validation limits, append-mode stripping, and settings (ADR-008).
- The worker path and its allow-list (ADR-021, ADR-030).
- The E2E selector contract for ChatGPT.

## Consequences

- A ChatGPT image turn exports as a vault file plus a `![[…]]` embed, a
  download, or nothing on the clipboard — identical to Gemini.
- Each image is ~2.7 MB of PNG (~3.6 MB base64). `MAX_IMAGE_SIZE_BYTES` (10 MB)
  holds; the per-note total (`MAX_TOTAL_IMAGE_DATA_LENGTH`, 48 MiB) is reached
  at roughly 13 such images, before `MAX_IMAGES_PER_NOTE` (20). The existing
  validation refuses the save with a clear message; no new limit is added.
- Signed-URL expiry is not measured. If it expires while the tab stays open,
  the canvas fallback still recovers the bitmap.
- User-facing text that says "Gemini-generated images" (README, store
  listing, privacy, locales) must say Gemini and ChatGPT
  (`test/arch/store-listing-fields.test.ts` guards the store copy).

## Alternatives considered

- **Worker fetch with `chatgpt.com` in the allow-list.** Works (cookies via
  `credentials: 'include'`), but widens the SSRF allow-list to a host that
  serves arbitrary user content and requires a CSP `connect-src` change for
  no benefit: the page can already read the bytes.
- **Global counter ids, capture at harvest time.** Ids would still collide
  across windows; capturing during harvest would fetch the same image once
  per window.
- **Put the widget selector in `CHATGPT_SELECTORS`.** Rejected for the #402
  reason above.

## Files

- `src/content/image-markers.ts` (new, extracted from `gemini.ts`)
- `src/content/image-capture.ts` (same-origin branch)
- `src/content/extractors/base.ts` (two hooks), `gemini.ts`, `chatgpt.ts`
- `docs/investigation/chatgpt-image-dom-structure.md` (measurements)
