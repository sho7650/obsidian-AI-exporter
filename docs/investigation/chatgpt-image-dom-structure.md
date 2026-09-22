# ChatGPT Generated Image DOM Structure

**Date:** 2026-09-22
**Issue:** #423 (extend image export beyond Gemini)
**Status:** Measured on a live conversation via the CDP daemon (Chrome 153, viewport 1440×900). Read-only; no extension code changed.
**Method:** Playwright `connectOverCDP` against the E2E daemon, one conversation containing one generated image (ChatGPT Images, 2026-09). Two probe scripts: DOM walk + fetch matrix from the page main world, then `context.request` (browser cookies) and Node `fetch` (no cookies).

## Findings

### 1. The image is served same-origin from a signed, cookie-gated endpoint

```text
https://chatgpt.com/backend-api/estuary/content?id=<37ch>&ts=<n>&p=fs&cid=<1ch>&sig=<64ch>&v=0
```

| Request | Result |
| --- | --- |
| Page main world, `fetch(src, {mode:'cors', credentials:'include'})` | 200, `type: basic`, `image/png`, 2,666,927 bytes, no redirect |
| Page main world, `credentials: 'omit'` | 200 (indistinguishable from an HTTP-cache hit; the `<img>` had already loaded) |
| `context.request.get(src)` (browser cookies, outside page CSP) | 200, `image/png`, `content-disposition: inline; filename="<uuid>.png"` |
| Node `fetch(src)` (no cookies) | **403** `application/json` |
| `context.request.get(src minus sig)` (cookies, no signature) | **403** `application/json` |

Both the session cookie and the `sig` parameter are required. No `Access-Control-Allow-Origin`, `cache-control` or `expires` header was returned. `ts` is a small integer whose unit and expiry semantics are not documented; whether the signed URL expires was **not measured** (a later re-fetch of a stored URL would answer it).

Contrast with Gemini (`docs/investigation/gemini-image-dom-structure.md`): Gemini serves `blob:` (page-only, revoked after decode) or a cross-origin CDN (`lh3.googleusercontent.com`, tainted canvas, worker-only). ChatGPT is neither: it is the page's own origin.

Consequences:

- A content-script `fetch` of this URL is a same-origin request. It needs no `host_permissions` beyond the existing `https://chatgpt.com/*`, no CSP `connect-src` change in the manifest, and no worker round-trip. The page CSP allows it (`connect-src` includes `https://chatgpt.com/backend-api`; `img-src * blob: data:`).
- The existing worker path (`src/background/image-fetch.ts`) would need `chatgpt.com` added to the source allow-list **and** to the manifest CSP `connect-src` (`test/arch/csp-connect-src.test.ts`), and it would send cookies via `credentials: 'include'`. It is not needed for this host.
- The canvas fallback also works (same-origin, untainted: `toDataURL` returned a 4,972,298-char PNG data URL), but it re-encodes; the fetch returns the original 2.67 MB PNG and is preferable.
- At 2.67 MB per image, the per-image cap (10 MB, `MAX_IMAGE_SIZE_BYTES`) holds, but the per-note total (`MAX_TOTAL_IMAGE_DATA_LENGTH` = 48 MiB of base64) is reached at roughly 13 such images, below `MAX_IMAGES_PER_NOTE` = 20. Base64 inflates 2.67 MB to about 3.56 MB.

### 2. DOM: the image turn has no prose block and no message id

The conversation had four turns:

| `data-testid` | `data-turn` | `[data-message-id]` | `[data-message-author-role]` | `.markdown.prose` | imagegen containers |
| --- | --- | --- | --- | --- | --- |
| conversation-turn-1 | user | yes | user | 0 | 0 |
| conversation-turn-2 | assistant | **no** | **none** | **0** | 1 |
| conversation-turn-3 | user | yes | user | 0 | 0 |
| conversation-turn-4 | assistant | yes | assistant | 1 | 0 |

The image turn is `section[data-turn-id][data-turn="assistant"]` whose only content is the image widget. Its text content is 17 characters (the "Edit" button label).

Container markup (srcs redacted; three `<img>` elements share one `src`):

```html
<div class="group/imagegen-image relative w-full overflow-hidden max-w-[30rem] rounded-[36px]"
     id="image-f5bf8dc7-0591-45fa-a3de-9a4e13104fcf" style="aspect-ratio: 1.77683 / 1;">
  <div role="button" tabindex="0" aria-labelledby="_r_lt_" class="relative z-0 h-full w-full rounded-[inherit] …">
    <div class="relative z-0 cursor-pointer overflow-hidden rounded-[inherit] max-w-[30rem]">
      <div class="absolute start-0 end-0 top-0 z-2 w-full overflow-hidden …" style="height: 100%;">
        <img id="_r_lt_" loading="lazy" decoding="async" width="1672" height="941"
             alt="Generated image: Architect of Tomorrow’s Sunrise" class="absolute top-0 z-1 w-full" src="…">
      </div>
      <div class="relative z-1 w-full overflow-hidden rounded-[inherit]" style="filter: blur(0px);">
        <img width="1672" height="941" alt="" aria-hidden="true" loading="lazy" decoding="async" src="…">
      </div>
      <div class="absolute inset-0 z-0 scale-110 overflow-hidden rounded-[inherit] blur-2xl">
        <img loading="lazy" decoding="async" alt="" aria-hidden="true" class="absolute top-0 w-full" src="…">
      </div>
    </div>
  </div>
  <!-- buttons: aria-label="Edit image" (text "Edit"), aria-label="Share this image" -->
</div>
```

Observations:

- The stable identity is the container id `image-<uuid>`. The `<img>` ids (`_r_lt_`) are React-generated and differ between mounts (`_r_ld_` on the first probe, `_r_lt_` on the second).
- The visible image is the one whose `alt` starts with `Generated image:`; the other two are `aria-hidden="true"` duplicates (crossfade and blurred backdrop) with the same `src`.
- Natural size 1672×941; rendered 480×270. No `srcset`, no `crossorigin` attribute.
- The widget sits under `[class*="group/turn-messages"]` as a sibling of where `.markdown.prose` would be, not inside it.

### 3. What the extractor does with this turn today

`ChatGPTExtractor.extractAssistantContent` (`src/content/extractors/chatgpt.ts:359-380`) collects `SELECTORS.markdownContent` (`.markdown.prose`), then falls back to `SELECTORS.assistantResponse`, whose three variants all end in `.markdown.prose`. Neither matches inside the image turn, so the method returns `''` and both `extractMessages` and `harvestWindow` drop the turn. **The generated image is silently omitted from the note** — no placeholder, no raw URL, no warning. (An earlier reading in `chatgpt-image-export-prerequisites.md` assumed the `<img>` sat inside the prose and would surface as a raw link; it does not.)

Other effects of the missing `[data-message-id]` / `[data-message-author-role]` on this turn:

- `harvestWindow` keys on `data-turn-id` first (`chatgpt.ts:290-293`), which the section has, so accumulation is unaffected.
- `turnRole` (`chatgpt.ts:214-220`) reads `data-turn` first, so the role resolves to `assistant`.
- `turnOrdinal` reads `data-testid="conversation-turn-N"`, present.

### 4. Hook point and identity for a future extractor change

- Detection: `[class*="imagegen-image"]` (or `[id^="image-"]` inside an assistant turn) as an extractor-private constant, following the `DEEP_RESEARCH_FRAME_SELECTORS` precedent so the E2E baseline contract is unaffected (#402).
- Image id: derive from the container's `image-<uuid>`, which is stable across `harvestWindow` re-runs — the deterministic key the prerequisites report called for.
- Capture: same-origin `fetch` in the content script at extraction time (the URL is signed; do not persist it).
- The image turn must produce non-empty content (the placeholder) so it is not dropped.

## Not verified

- Expiry of the signed URL (`ts`/`sig`); behaviour of a stored URL hours later.
- Whether every generated image uses the `estuary/content` path and `p=fs`, or whether older conversations still reference `files.oaiusercontent.com`.
- Multi-image turns (several containers in one turn) and edited-image turns.
- Whether the image `<img>` is evicted with its turn under scroll virtualization (only four turns were present; nothing was evicted).
- Whether `credentials: 'omit'` truly succeeds or merely hit the cache.
