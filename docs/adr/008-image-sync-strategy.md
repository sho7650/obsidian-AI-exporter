# ADR-008: Image Sync Strategy

## Status

Proposed

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

## References

- GitHub Issue: #186
- Obsidian Local REST API: [coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api)
- Obsidian attachment docs: [help.obsidian.md/attachments](https://help.obsidian.md/attachments)
