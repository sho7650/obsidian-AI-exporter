# ADR-008: Image Sync Strategy

## Status

Accepted (v2.0.0) — implemented for Gemini generated images. See
"Implementation Notes (v2.0.0)" below for where the shipped design deviates
from the original proposal.

## Context

Issue #186 requests image sync support: when exporting AI conversations to Obsidian, images (user-uploaded, AI-generated, inline) should be saved alongside the text.

Currently, images are **completely stripped** during HTML sanitization (DOMPurify `USE_PROFILES: { html: true }` removes `<img>` tags). No image-related types, extraction logic, or storage methods exist.

### Constraints

- AI platform image URLs are **authentication-gated and ephemeral** (signed URLs with expiration)
- Chrome Extension Manifest V3 restricts background service worker capabilities
- Content scripts cannot directly fetch cross-origin images; background SW must proxy
- Obsidian Local REST API `PUT /vault/{path}` supports `*/*` Content-Type (binary upload confirmed via `bodyParser.raw()` → `vault.adapter.writeBinary()`)
- Users configure Obsidian attachment folders differently (vault root, centralized folder, co-located, subfolder)

## Decision

**Use Method A: Save images as binary files to the Obsidian vault via the Local REST API.**

Images are fetched as binary data in the background service worker, uploaded to the vault via `PUT /vault/{path}` with `Content-Type: application/octet-stream`, and referenced in markdown using standard `![alt](relative/path)` syntax.

### Alternatives Considered

| Method | Approach | Rejected Because |
|--------|----------|-----------------|
| B - External URL reference | `![alt](https://platform.com/image/xxx)` | URLs are auth-gated and expire; notes become broken after session ends |
| C - Base64 Data URI | `![alt](data:image/png;base64,...)` | Bloats markdown files (100KB+ per image); poor Git/sync performance; Obsidian preview issues |
| D - External object storage | Upload to S3/GCS, reference public URL | Requires user to configure cloud credentials; adds external dependency; complex UX |

### Key Design Decisions

1. **Standard Markdown links** (`![alt](path)`) over Obsidian wiki-links (`![[file]]`) for portability
2. **Relative paths** from the note file for maximum compatibility
3. **Configurable attachment subfolder** (default: `assets/`) under the note's directory
4. **Opt-in setting** (`enableImageSync: false` by default) to avoid unexpected bandwidth/storage usage
5. **Background SW fetches images** to bypass CORS restrictions in content scripts
6. **Preserve original format** (PNG, JPG, WebP, GIF) without conversion
7. **Size limit** (configurable, default 10MB per image) as a safety guard

## Consequences

### Positive

- Images persist in the vault indefinitely; no link rot
- Works offline after initial sync
- Integrates naturally with Obsidian's image preview
- No external service dependencies
- Respects existing Obsidian attachment conventions

### Negative

- Increases vault disk usage (mitigated by opt-in + size limit)
- Adds network overhead during export (mitigated by parallel fetching with concurrency limit)
- Background SW must handle binary data and upload failures
- Image fetch may fail for expired/auth-gated URLs if user delays export

### Risks

- **Image URL expiration**: If a user opens a conversation but delays export, image URLs may expire. Mitigation: extract image data at extraction time, not save time.
- **Large conversations with many images**: Could cause timeout or memory pressure. Mitigation: concurrency limit + per-image size cap.
- **CORS/CSP blocking image fetch**: Some platforms may restrict image downloads. Mitigation: fetch from background SW using host_permissions.

## Implementation Notes (v2.0.0)

The investigation in `docs/investigation/gemini-image-dom-structure.md` found
that Gemini's generated images use **blob: URLs** that are origin- and
context-scoped: the background service worker cannot fetch them (Method A's
"background SW fetches images" step is impossible for blob URLs). The shipped
implementation therefore adopts **Option 4** from that investigation and
deviates from this ADR's original proposal as follows:

1. **Capture location** — images are fetched as base64 **in the content script**
   (same origin as the page), before DOMPurify strips the blob `src`. The bytes
   travel to the background as base64 over `chrome.runtime.sendMessage`.
2. **Placeholder** — the content script emits a destination-agnostic
   `![alt](g2o-image://{id})` placeholder; the background resolves it per
   destination.
3. **Three output destinations** (not Obsidian-only):
   - **Obsidian** — image written to the vault via `putBinaryFile`; body uses
     an Obsidian **wikilink embed `![[filename]]`** (chosen over `![](path)`
     because Obsidian resolves attachments by name, independent of the folder).
   - **File download** — markdown plus each image as **separate files**; body
     references the image filename only.
   - **Clipboard** — image placeholders are stripped; no image is copied.
4. **Opt-in default** — `enableImageExport` defaults to **true** (the feature
   was explicitly requested); a per-image 10MB cap and a ≤20 images/note bound
   guard against abuse.
5. **Scope** — Gemini generated images only in v1. Append mode strips
   placeholders (image handling deferred); other platforms and ZIP packaging
   are future work.

The `putBinaryFile` Content-Type is the image's own MIME type (e.g. `image/png`)
rather than `application/octet-stream`.

## References

- GitHub Issue: #186
- Investigation: `docs/investigation/gemini-image-dom-structure.md`
- Design: `docs/design/DES-017-image-sync.md`
- Obsidian Local REST API: [coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api)
- Obsidian attachment docs: [help.obsidian.md/attachments](https://help.obsidian.md/attachments)
