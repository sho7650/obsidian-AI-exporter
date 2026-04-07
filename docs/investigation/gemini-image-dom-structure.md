# Gemini Generated Image DOM Structure

**Date:** 2026-04-03
**Issue:** #186-1 (Image Sync)
**Status:** Investigation — not yet actionable

## Findings

Gemini's AI-generated images use two different URL schemes:

### 1. HTTPS URL (Google User Content CDN)

Some generated images use a permanent-looking HTTPS URL:

```html
<img loading="lazy" class="image animate loaded"
     alt="（AI 生成）"
     src="https://lh3.googleusercontent.com/gg/AMW1TPp...=s1024-rj">
```

- Domain: `lh3.googleusercontent.com`
- Path: `/gg/` prefix
- Suffix: `=s1024-rj` (size/format parameter)
- These URLs may be auth-gated or time-limited (needs verification)

### 2. Blob URL (local browser object)

Other generated images use a `blob:` URL:

```html
<img loading="lazy" class="image animate loaded"
     alt="（AI 生成）"
     src="blob:https://gemini.google.com/5aab58b3-704c-462c-a3d3-42cfbfbecb63">
```

- `blob:` URLs are page-specific and cannot be fetched from the background service worker
- They are invalidated when the page is closed or navigated away
- Cannot be used for image sync (not downloadable cross-context)

### DOM Structure

Generated images are wrapped in a custom Angular component hierarchy:

```
model-response
  └── .markdown.markdown-main-panel
      └── .attachment-container.generated-images
          └── response-element
              └── generated-image
                  └── single-image
                      └── .image-container
                          └── .overlay-container
                              └── button.image-button
                                  └── <img src="..." alt="（AI 生成）">
```

Key selectors:
- `generated-image img.image` — the actual image element
- `single-image` — container with jslog metadata
- `.generated-image-controls` — overlay with share/copy/download buttons
- `download-generated-image-button` — download button (may provide HTTPS URL)

### Download Button

Each generated image has a download button that triggers a full-size download:

```html
<download-generated-image-button>
  <button mat-button="" aria-label="フルサイズの画像をダウンロード"
          data-test-id="download-generated-image-button"
          jslog="185865;track:generic_click;BardVeMetadataKey:[[...]]">
```

This button likely fetches the image via a different mechanism (possibly an API call that returns the HTTPS URL). Investigating this could provide a reliable download path for blob-URL images.

## Challenges for Image Sync

1. **Blob URLs cannot be fetched from background SW** — The `blob:` scheme is page-specific; `fetch()` in the service worker cannot access it
2. **Mixed URL schemes** — Same conversation can have both HTTPS and blob URLs for different images
3. **Alt text is generic** — All generated images have `alt="（AI 生成）"`, no descriptive text
4. **Auth/expiration unknown** — Whether HTTPS URLs expire or require authentication is not yet verified

## Potential Solutions (Future)

1. **Canvas-based extraction in content script**: Draw the image to a canvas element, export as blob/data URL, then send binary to background SW via message passing
2. **Intercept download button URL**: The download button may use a different API endpoint; intercepting or replicating that call could provide stable HTTPS URLs
3. **Use `chrome.tabs.captureVisibleTab`**: Screenshot-based approach (lossy, complex)
4. **Content script fetch with credentials**: Fetch the HTTPS URLs from the content script (same origin) and convert to ArrayBuffer before sending to background SW

Option 4 is the most promising for HTTPS-URL images. Option 1 is a fallback for blob-URL images.
