# ADR-027: Capture generated images from the rendered element when the blob URL is gone

- Status: Proposed
- Date: 2026-08-07
- Related: [ADR-008](008-image-sync-strategy.md), [ADR-021](021-remote-image-fetch-in-service-worker.md), issue #186, issue #376
- Extends: the capture half of ADR-008

## Context

Gemini-generated images stopped reaching the vault. The saved note's assistant
turn for an image prompt was **completely empty** — no embed, no placeholder, no
warning, in both the Obsidian and file-download outputs.

### What was measured

All figures below come from live probing of a real conversation through the CDP
daemon on 2026-08-06/07.

Detection was never the problem: `generated-image img[src]` and both fallbacks
matched (1 element), inside the assistant content panel, with `complete: true`
and `naturalWidth × naturalHeight = 1024 × 572`. **The image renders correctly.**

The `src` takes two forms across page loads, and each has exactly one mechanism
that can reach its bytes:

| `src` form | page (main world) fetch | isolated-world fetch | canvas on the live element | reload with `crossOrigin="anonymous"` | background fetch |
| --- | --- | --- | --- | --- | --- |
| `blob:` | ✗ `Failed to fetch` | ✗ `Failed to fetch` | **✓ `image/png`, 1,190,471 B** | — | rejected by the allow-list, by design |
| `https:` CDN | ✗ (CORS) | ✗ (CORS) | ✗ `SecurityError` (tainted) | ✗ `LOAD FAILED` (no ACAO) | **✓ 200, `image/jpeg`, 131,692 B** |

### Why the blob URL is unreadable

The blob fetch fails **from the page's own main world** while the `<img>` keeps
rendering. That can only mean the URL has been revoked: MDN describes
`URL.revokeObjectURL()` as telling the browser "not to keep the reference to the
file any longer". The element goes on displaying because it holds the decoded
bitmap, not the URL.

So the premise written into `image-capture.ts` —

> `blob:` URLs are read here because only the page context can resolve them

— no longer holds. **Nobody** can resolve them.

### Why the https form cannot use the same trick

MDN: "As soon as you draw into a canvas any data that was loaded from another
origin without CORS approval, the canvas becomes tainted", and `toDataURL()`
then throws `SecurityError`. Measured exactly that, both on the live element and
on a fresh `<img>`. Setting `crossOrigin="anonymous"` does not help because the
CDN sends no `Access-Control-Allow-Origin` — the image simply fails to load.
Chrome's own guidance is to route such fetches through the service worker, which
is what ADR-021 already does, and the same guidance warns that "a malicious web
page may abuse the message handler", which is why `isAllowedImageSourceUrl()`
stays exactly as it is. It still does:
[ADR-030](030-image-cdn-redirect-host.md) had to allow a new CDN host in 2026-08
and deliberately allowed it in the manifest only, leaving this guard untouched.

### Why nobody noticed which step failed

`collectPendingImages()` dropped failures with `if (image) images.push(image)`,
`fetchImageAsBase64()` returned a bare `null` for every cause,
`handleFetchImage()` built an error string nobody read, and once `images` came
back empty `prepareNoteImages()` called `stripImagePlaceholders()`, erasing the
marker. There was no `console.*` anywhere in `image-capture.ts`,
`image-fetch.ts` or `image-output.ts`, and `imageWarning()` only covers vault
*write* failures. The result was an empty assistant message — **identical to
what image export being switched off produces**.

## Decision

**Dispatch on the source form, and never fail silently.**

1. `blob:` — try the URL first (a live blob still yields the original encoding),
   then fall back to reading the bytes off the rendered element through a canvas.
2. anything else — delegate to the service worker, unchanged.
3. No cross-fallback. A canvas read of an https source always raises
   SecurityError and the worker's allow-list always rejects `blob:`; trying
   either would only cost time.
4. Every failure carries a reason. It is logged (`console.warn`) and folded into
   the extraction warnings, which the content script already surfaces through
   `showWarningToast()`.

Supporting details:

- **PNG for the canvas path.** The original encoding is unrecoverable once the
  image is decoded, so re-encoding picks one. It is not free: the same image
  measured 131KB as the CDN's JPEG and 1.19MB as a re-encoded PNG. That is
  precisely why the live URL is tried first.
- **Load guard.** The generated `<img>` carries `loading="lazy"` (measured), so
  `complete` and `naturalWidth` are checked before drawing; an undecoded element
  would otherwise produce a blank picture.
- **Size limit unchanged.** `MAX_IMAGE_SIZE_BYTES` (10MB) still applies to the
  re-encoded result, and exceeding it is now reported instead of swallowed.

## Consequences

- Generated images reach the vault again on the `blob:` path, which is the form
  observed on a freshly opened conversation.
- A canvas-captured image is a PNG re-encode, not the original bytes: larger,
  and any metadata the original carried is gone. Alt text is preserved.
- An image that still cannot be captured now says so — in the service-worker-
  independent page console and in the toast — instead of leaving an empty
  assistant message.
- **The core of this change cannot be proven by the unit tests.** jsdom has no
  canvas, so `getContext`/`toDataURL` are stubbed and the tests only pin the
  control flow. The evidence that a canvas read actually recovers a revoked
  blob's bytes is the live measurement above, and the manual verification
  recorded in the PR.

## Alternatives considered

- **Capture at generation time**, e.g. a MutationObserver that grabs each blob
  before it is revoked. Does nothing for conversations opened after the fact —
  which is the normal case — and adds a permanently running observer.
- **`createImageBitmap()` + `OffscreenCanvas.convertToBlob()`** instead of
  `toDataURL`. Subject to the identical tainting rules, so it changes nothing
  about which sources are reachable; it would allow choosing JPEG and skipping
  the base64 round-trip. Worth revisiting only if PNG size becomes a problem.
- **Ask the CDN for the image via `crossOrigin="anonymous"`** so the canvas
  stays clean for both forms. Measured: the load fails outright, because the CDN
  sends no CORS header.
- **Keep fetching the blob URL only.** This is the status quo, and it is
  measurably dead.
