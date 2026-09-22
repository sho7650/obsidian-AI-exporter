# ChatGPT Generated-Image Export — Prerequisites

**Date:** 2026-09-22
**Issue:** #423 (extend image export beyond Gemini)
**Status:** Investigation — code and official-docs facts only; live ChatGPT DOM not yet measured

## Current state in the codebase

- `src/content/extractors/chatgpt.ts` has no image handling; `src/content/extractors/selectors/chatgpt.ts:20-55` defines five groups (conversationTurn, userMessage, assistantResponse, markdownContent, scrollContainer) and no image selector.
- `src/manifest.json:20-34`: `host_permissions` and CSP `connect-src` list only Google image hosts (`*.googleusercontent.com`, `lh3.google.com`). No OpenAI content host.
- `test/fixtures/html/chatgpt/` contains no generated image (two 32 px favicon `<img>` only).
- The image pipeline has exactly one consumer, `GeminiExtractor`. Claude, Perplexity and NotebookLM extractors neither import `image-capture.ts` nor emit `data-g2o-image`.
- Behaviour today for an `https:` image inside a ChatGPT answer (read from code, not executed): DOMPurify keeps `https:` `src` (`test/lib/sanitize.test.ts:97-100`), no `g2oImage` rule matches (`src/content/markdown-rules.ts:208-219`), so Turndown's built-in rule emits a raw `![alt](https://…)` link into the note. A `blob:` `src` is stripped by DOMPurify's default URI regexp.

## Gemini pipeline: what is reusable vs Gemini-specific

Reusable unchanged:

- `src/lib/image-utils.ts` (limits, MIME allow-list, base64 helpers), `src/lib/image-output.ts` (placeholder resolution per destination), `src/background/image-fetch.ts` (except its host allow-list), `src/background/validation.ts` (`validateImages`), the `data-g2o-image` sanitize allowance (`src/lib/sanitize.ts:111,124-136`), the Turndown rule, `conversationToNote` (`src/content/markdown.ts:83,141`), all three output handlers, the `enableImageExport` / `imageVaultPath` settings.

Gemini-specific:

- `SELECTORS.generatedImage` (`selectors/gemini.ts:42`), `replaceGeneratedImages` (`gemini.ts:342-375`), `pendingImages` / `imageIdCounter` / `imageFailures` (`gemini.ts:28-39`), `attachImages` / `collectPendingImages` (`gemini.ts:382-414`), the `enableImageExport` field on the extractor (`gemini.ts:41-44`), `IMAGE_CDN_DOMAIN` / `IMAGE_CDN_REDIRECT_HOSTS` and the two manifest hosts, the canvas fallback rationale (revoked `blob:` URLs, ADR-027).

## Structural difference that blocks a straight port

`GeminiExtractor` overrides `extract()` wholesale (`gemini.ts:60-106`): reset state, one `extractMessages()` pass, attach images. A monotonic `img-${++counter}` is safe there.

`ChatGPTExtractor` uses the base `extract()` (`base.ts:104-141`) plus `getScrollConfig` (`chatgpt.ts:225-230`). `extractAssistantContent` (`chatgpt.ts:359-380`, the hook point) is therefore invoked from two paths: `extractMessages` (`:99-139`) and `harvestWindow` (`:276-307`). `harvestWindow` re-runs once per scroll iteration over overlapping windows (`src/lib/scroll-manager.ts:471-543`), and the accumulator is last-write-wins keyed by turn id (`:535`).

Consequence: a global counter would mint a new id for the same image on every window, and the marker that survives in the accumulator would reference a `pendingImages` entry from an arbitrary pass. Image ids must derive from the stable turn key plus intra-turn index, and capture must be deferred until after accumulation (or de-duplicated by key). `BaseExtractor` has no image hooks (`base.ts:240-256`, `:486-523`).

Also: `extractAssistantContent` reads `innerHTML` directly without cloning, whereas Gemini clones before rewriting (`gemini.ts:347`).

## Constraints enforced by fitness functions

- `enableImageExport` must arrive via `applyPlatformSettings`; overriding `applySettings` fails `test/arch/extractor-settings-hook.test.ts`.
- A new image host must be added to `IMAGE_CONNECT_HOSTS` and to both manifest lists (`test/arch/csp-connect-src.test.ts:78-95`); redirect targets are reachable but not accepted sources (`:106-113`).
- `test/arch/layering.test.ts:66-74`: extractors may import `src/content/image-capture.ts` (same layer).
- An image selector added to the shared `CHATGPT_SELECTORS` blocks every ChatGPT baseline update unless the pinned conversation contains a generated image (`e2e/selectors/baseline.ts:194-203`, issue #402). Precedent for a private, detection-only selector: `DEEP_RESEARCH_FRAME_SELECTORS` (`chatgpt.ts:26-45`).
- User-facing text currently says "Gemini" for image export: `README.md:18,95,269-279,329`, `docs/store/description_en.md:18`, `docs/store/listing.md:111-123`, `docs/privacy.html:58,84-85`, `src/_locales/en/messages.json:376-378` (guarded by `test/arch/store-listing-fields.test.ts:103-186`).

## Official documentation (retrieved 2026-09-22)

OpenAI Help Center:

- [Images in ChatGPT](https://help.openai.com/en/articles/11084440-images-in-chatgpt): "ChatGPT Images is available on all tiers"; "we've retired the official DALL·E GPT"; "All images you create with ChatGPT are automatically saved under **Images**" (`https://chatgpt.com/images`); download via "Select **Save** to download the image to your device". No file format stated.
- [Network recommendations](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps): domains to allow include `*.oaistatic.com`, `*.oaiusercontent.com`, `*.openai.com`, `*.chatgpt.com`. The `files.oaiusercontent.com` example is an upload path.
- [IP allowlisting](https://help.openai.com/en/articles/12111596-ip-allowlisting-for-chatgpt): "applies across all major ChatGPT endpoints and features, including authenticated file downloads" — the only official hint that content fetches carry credentials.
- [Chat and file retention](https://help.openai.com/en/articles/8983778-chat-and-file-retention-policies-in-chatgpt): "deleting a chat does not delete files saved to Library".

Chrome Extensions (developer.chrome.com):

- [Network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions." Service workers may fetch external URLs with `host_permissions`. Adding `connect-src` to `content_security_policy` requires listing every host.
- [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): isolated-world scripts run under the extension CSP; `MAIN`-world scripts under the page CSP.

DOMPurify: default URI regexp allows neither `blob:` nor `data:`; `data:` on `<img>` survives via `DEFAULT_DATA_URI_TAGS`; `data-*` attributes allowed by default (`ALLOW_DATA_ATTR`).

MDN: drawing a cross-origin image without CORS approval taints the canvas; `toDataURL` / `toBlob` / `getImageData` then throw `SecurityError`. A cross-origin CDN image is therefore worker-fetch-only.

## Not documented anywhere — must be measured on a live conversation

- DOM structure of a generated image inside an answer (wrapper element, attributes, alt text).
- Whether `src` is `blob:` or `https:`, and on which host (`*.oaiusercontent.com` is only an allow-list entry).
- Whether the host sends `Access-Control-Allow-Origin`, and whether the fetch needs cookies or a token.
- URL expiry, redirect chains, byte size and format of the served image.
- Whether generated images survive scroll virtualization (evicted rows) the same way text does.

Template for the measurement: `docs/investigation/gemini-image-dom-structure.md`. It requires the CDP daemon and a pinned ChatGPT conversation that contains a generated image; the current `CHATGPT_CONV_URL` is dead as of 2026-09-22 (`test_data_missing`).
