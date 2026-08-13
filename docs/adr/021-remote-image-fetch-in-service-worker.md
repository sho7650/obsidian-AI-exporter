# ADR-021: Remote generated images are fetched by the service worker

## Status

Accepted (2026-07-27). **Amended by
[ADR-030](030-image-cdn-redirect-host.md) (2026-08-13)**: the Decision below
observes that the request "redirects from `/gg/` to `/rd-gg/` on the same host".
Google later moved that redirect target to `lh3.google.com`, which no wildcard
over the source domain can cover, so the redirect target is now allow-listed as
a host of its own — connectable, but still not an accepted image source.

## Context

Image export ([ADR-008](008-image-sync-strategy.md), issue #186) captures Gemini's
generated images in the **content script**, on the stated premise that only the
page context can read a `blob:` URL. That premise held when the feature shipped.

It no longer describes the page. Gemini now serves generated images from the
image CDN:

```html
<single-image class="generated-image large luminous-layout">
  <button class="image-button">
    <img class="image animate loaded" alt="（AI 生成）"
         src="https://lh3.googleusercontent.com/gg/ACRwjau…=s1024-rj">
```

The selectors in `SELECTORS.generatedImage` still match this markup — the
regression is not selector drift. The `fetch()` in `image-capture.ts` is what
fails, and the page console names our own call stack:

```
Access to fetch at 'https://lh3.googleusercontent.com/rd-gg/…'
(redirected from 'https://lh3.googleusercontent.com/gg/…')
from origin 'https://gemini.google.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.

GET https://lh3.googleusercontent.com/rd-gg/… net::ERR_FAILED 403 (Forbidden)
  I                    @ index.ts:3
  collectPendingImages @ index.ts:4
  attachImages         @ index.ts:4
  extract              @ index.ts:3
```

Host permissions do not help a content script. Chrome's network-request
documentation is explicit:

> Content scripts initiate requests on behalf of the web origin that the content
> script has been injected into and therefore content scripts are also subject
> to the same origin policy. […] Cross-origin requests are always treated as
> such in content scripts, even if the extension has host permissions.

> A script executing in an extension service worker or foreground tab can talk
> to remote servers outside of its origin, as long as the extension requests
> host permissions.

The failure was invisible because `fetchImageAsBase64` returns `null` on any
error. Zero images captured means `note.images` is empty, which sends
`prepareNoteImages` down its early-return branch: placeholders are stripped, so
the note gains no `![[…]]` embed, and `failedImages` stays empty, so no warning
is raised either. Users saw a note that looked entirely successful with the
images simply absent — the symptom reported in issue #376.

## Decision

Split the capture path by URL scheme:

- `blob:` — still read in the content script. Only the page can resolve it.
- everything else — delegated to the background service worker via
  `{ action: 'fetchImage', url }`, matching Chrome's documented remedy
  ("communicate with the service worker via message passing to access
  cross-origin resources").

`https://*.googleusercontent.com/*` is added to `host_permissions`. The
subdomain is wildcarded because the CDN rotates across `lh3`/`lh4`/`lh5`/…, and
the observed request redirects from `/gg/` to `/rd-gg/` on the same host.

The worker fetches with `credentials: 'include'`. The page's `<img>` loads these
URLs with cookies; an uncredentialed request answers 403, which is the second
error in the console trace above.

**The URL is validated against an allow-list, twice.** `isAllowedImageSourceUrl()`
requires `https:` and a hostname equal to or ending in `.googleusercontent.com`,
checked on the parsed `URL.hostname` so that credentials (`…@evil.test`), ports,
and suffix look-alikes (`evilgoogleusercontent.com`) cannot pass. It is enforced
at the message boundary in `validateMessageContent()` and again inside
`handleFetchImage()`.

This double check is the point of the design, not ceremony. The whole reason the
fetch moved is that the worker can reach hosts the page cannot — including
`http://127.0.0.1`, where the user's vault and API key live. An unvalidated
`fetchImage` URL would turn the worker into an SSRF proxy for any script able to
post it a message. The handler-side check stands on its own so the guarantee does
not depend on the router staying wired to the validator.

Size and MIME caps (`MAX_IMAGE_SIZE_BYTES`, `isAllowedImageMime`) are applied on
the worker path too, so both paths enforce the same limits.

## Consequences

- Gemini generated images export again. Both symptoms in #376 — no embed and no
  warning — resolve, because images now arrive and any that fail arrive as
  `failedImages` and surface through the warning added in [ADR-020](020-vault-path-segment-encoding.md).
- **Existing users will have the extension temporarily disabled on update.** Per
  Chrome's permission-warnings documentation: "When an extension adds a new
  permission that triggers a warning it may temporarily disable it. The
  extension will be re-enabled only after the user agrees to accept the new
  permission." Adding a `host_permissions` match pattern triggers exactly this
  warning. The release notes must say so; this is not a silent update.
- The Chrome Web Store listing needs a justification for the new host
  permission: it is used solely to download images the user asked to export.
- `ADR-008`'s rationale ("blob URLs that only the page context can read") is now
  only half the story. It stays accurate for the `blob:` branch; this ADR
  supersedes it for remote URLs.
- The content script no longer touches the network for remote images, so a
  future platform serving images from another CDN needs only an allow-list entry
  plus a host permission — not a new capture mechanism.
- Fetching with credentials means Google cookies are sent to
  `googleusercontent.com` from the worker. This mirrors exactly what the page
  already does when it renders the `<img>`, and the allow-list bounds the hosts
  those cookies can reach.
