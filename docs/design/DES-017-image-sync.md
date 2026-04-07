# DES-017: Image Sync

**Issue:** #186-1
**ADR:** [008-image-sync-strategy.md](../adr/008-image-sync-strategy.md)
**Status:** Draft

---

## 1. Overview

Add opt-in image sync to the export pipeline. When enabled, images in AI conversations are extracted, downloaded as binary, saved to the Obsidian vault, and referenced in the markdown note with relative paths.

### Data Flow

```
Content Script                    Background Service Worker              Obsidian Vault
─────────────                    ───────────────────────                ──────────────
DOM <img> elements
    │
    ▼
extractImages()
  - collect src, alt, index
  - filter: skip data URIs,
    skip tiny icons (<24px)
    │
    ▼
ConversationMessage.images[]
  (ImageReference[])
    │
    ▼
chrome.runtime.sendMessage
  { action: 'saveToObsidian',
    data: { ...conversation,
            images: ImageReference[] }}
                                     │
                                     ▼
                                 fetchImageBinary(src)
                                   - fetch() with credentials
                                   - validate Content-Type
                                   - enforce size limit
                                   - returns ArrayBuffer + mime
                                     │
                                     ▼
                                 putBinaryFile(path, data)          ──▶  /vault/AI/gemini/assets/
                                   - PUT /vault/{path}                    img_001.png
                                   - Content-Type: application/           img_002.jpg
                                     octet-stream
                                   - body: ArrayBuffer
                                     │
                                     ▼
                                 rewriteImagePaths(markdown)
                                   - replace placeholder refs
                                     with relative paths
                                     │
                                     ▼
                                 putFile(notePath, markdown)        ──▶  /vault/AI/gemini/
                                   - existing text save                   My-Conversation.md
```

---

## 2. Type Definitions

### New Types (`src/lib/types.ts`)

```typescript
/** Reference to an image found in a conversation message */
export interface ImageReference {
  /** Unique ID within the conversation: `img_{messageIndex}_{imageIndex}` */
  readonly id: string;
  /** Original image URL from the DOM */
  readonly src: string;
  /** Alt text from the DOM (sanitized) */
  readonly alt: string;
  /** Zero-based index of the parent message */
  readonly messageIndex: number;
  /** Zero-based index within the message's images */
  readonly imageIndex: number;
}

/** Downloaded image ready for upload */
export interface ImageData {
  /** Corresponding ImageReference */
  readonly ref: ImageReference;
  /** Binary content */
  readonly data: ArrayBuffer;
  /** MIME type from response Content-Type header */
  readonly mimeType: string;
  /** File extension derived from mimeType (e.g., 'png', 'jpg') */
  readonly extension: string;
  /** File size in bytes */
  readonly size: number;
}

/** Result of uploading a single image */
export interface ImageUploadResult {
  /** Corresponding ImageReference.id */
  readonly id: string;
  /** Whether upload succeeded */
  readonly success: boolean;
  /** Vault-relative path where the image was saved */
  readonly vaultPath?: string;
  /** Relative path from the note file (for markdown reference) */
  readonly relativePath?: string;
  /** Error message if failed */
  readonly error?: string;
}
```

### Extended Existing Types

```typescript
// ConversationMessage — add optional images field
export interface ConversationMessage {
  // ... existing fields ...
  /** Image references extracted from this message */
  readonly images?: readonly ImageReference[];
}

// ConversationMetadata — add image count
export interface ConversationMetadata {
  // ... existing fields ...
  /** Total number of images across all messages */
  readonly imageCount: number;
}

// SyncSettings — add image sync options
export interface SyncSettings {
  // ... existing fields ...
  /** Enable image download and vault upload (default: false) */
  readonly enableImageSync: boolean;
  /** Subfolder name for images relative to note (default: 'assets') */
  readonly imageSubfolder: string;
  /** Max image file size in bytes (default: 10485760 = 10MB) */
  readonly maxImageSize: number;
}

// SaveResponse — add image results
export interface SaveResponse {
  // ... existing fields ...
  /** Per-image upload results (only when enableImageSync) */
  readonly imageResults?: readonly ImageUploadResult[];
}
```

---

## 3. Component Design

### 3.1 Image Extraction (Content Script)

**File:** `src/content/extractors/base.ts` — add shared `extractImages()` method

```typescript
// BaseExtractor additions

/** CSS selectors for image elements per platform */
protected readonly IMAGE_SELECTORS: readonly string[] = ['img'];

/** Minimum image dimension (px) to filter out icons/spacers */
private static readonly MIN_IMAGE_DIMENSION = 24;

/**
 * Extract image references from a container element.
 * Filters out: data URIs, tiny icons (<24px), duplicate srcs.
 */
protected extractImages(
  container: Element,
  messageIndex: number
): readonly ImageReference[] {
  const imgs = container.querySelectorAll<HTMLImageElement>(
    this.IMAGE_SELECTORS.join(', ')
  );
  const seen = new Set<string>();
  const result: ImageReference[] = [];

  for (const img of imgs) {
    const src = img.src || img.getAttribute('data-src') || '';

    // Skip: no src, data URIs, blob URIs, already seen
    if (!src || src.startsWith('data:') || src.startsWith('blob:') || seen.has(src)) {
      continue;
    }
    // Skip: tiny images (icons, spacers)
    if (img.naturalWidth > 0 && img.naturalWidth < BaseExtractor.MIN_IMAGE_DIMENSION &&
        img.naturalHeight > 0 && img.naturalHeight < BaseExtractor.MIN_IMAGE_DIMENSION) {
      continue;
    }

    seen.add(src);
    result.push({
      id: `img_${messageIndex}_${result.length}`,
      src,
      alt: this.sanitizeText(img.alt || ''),
      messageIndex,
      imageIndex: result.length,
    });
  }

  return result;
}
```

**Platform-specific overrides:**
- **Gemini:** Override `IMAGE_SELECTORS` to target `model-response img`
- **Claude:** Filter out `img[alt="favicon"]` (tool-use icons)
- **ChatGPT:** Standard `img` within markdown content
- **Perplexity:** Standard `img` within `.prose` content

### 3.2 DOMPurify Configuration Change

**File:** `src/lib/sanitize.ts`

Allow `<img>` tags with safe attributes only:

```typescript
DOMPurify.sanitize(preprocessed, {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style'],
  ADD_TAGS: ['img'],                    // NEW: allow <img>
  ADD_ATTR: ['src', 'alt', 'data-src'], // NEW: safe img attributes
});
```

Security note: DOMPurify's `USE_PROFILES: { html: true }` already strips event handlers (`onerror`, `onload`, etc.) and `javascript:` URIs. Adding `<img>` with only `src`/`alt` is safe.

### 3.3 Markdown Conversion — Image Placeholder Rule

**File:** `src/content/markdown-rules.ts`

{% raw %}
```typescript
// Image placeholder rule — converts <img> to a placeholder
// that will be replaced with the final vault path after upload
{
  name: 'imagePlaceholder',
  filter: 'img',
  replacement: (_content: string, node: TurndownNode): string => {
    const el = node as unknown as HTMLImageElement;
    const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
    const alt = el.getAttribute('alt') || '';

    if (!src || src.startsWith('data:')) return '';

    // Placeholder format: {{G2O_IMG:src|alt}}
    // Background SW replaces these with ![alt](relative/path) after upload
    return `{{G2O_IMG:${src}|${alt}}}`;
  },
}
```
{% endraw %}

### 3.4 ObsidianApiClient — Binary Upload

**File:** `src/lib/obsidian-api.ts`

```typescript
/**
 * Upload a binary file to the vault.
 * Uses Content-Type: application/octet-stream to trigger
 * the REST API's writeBinary() path.
 */
async putBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
  const url = this.buildUrl(path);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...this.getHeaders(),
      'Content-Type': 'application/octet-stream',
    },
    body: data,
    signal: AbortSignal.timeout(DEFAULT_API_TIMEOUT * 3), // 15s for large images
  });

  if (!response.ok) {
    throw new ObsidianApiError(
      `Failed to upload binary file: ${response.status} ${response.statusText}`,
      response.status
    );
  }
}
```

### 3.5 Image Download Service

**File:** `src/background/image-service.ts` (NEW)

{% raw %}
```typescript
import type { ImageReference, ImageData, ImageUploadResult } from '../lib/types';

/** MIME type → file extension mapping */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

/** Max concurrent image downloads */
const MAX_CONCURRENCY = 3;

/**
 * Download a single image from its source URL.
 * Runs in the background service worker (bypasses CORS).
 */
export async function fetchImageBinary(
  ref: ImageReference,
  maxSize: number
): Promise<ImageData> {
  const response = await fetch(ref.src, {
    credentials: 'include',   // send cookies for auth-gated URLs
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${ref.src}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  const extension = MIME_TO_EXT[mimeType];

  if (!extension) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  const data = await response.arrayBuffer();

  if (data.byteLength > maxSize) {
    throw new Error(
      `Image too large: ${(data.byteLength / 1024 / 1024).toFixed(1)}MB ` +
      `exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB limit`
    );
  }

  return { ref, data, mimeType, extension, size: data.byteLength };
}

/**
 * Download multiple images with concurrency control.
 * Returns results for all images (success or failure per image).
 */
export async function fetchAllImages(
  images: readonly ImageReference[],
  maxSize: number
): Promise<readonly ImageData[]> {
  const results: ImageData[] = [];
  const queue = [...images];

  // Process in batches of MAX_CONCURRENCY
  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(ref => fetchImageBinary(ref, maxSize))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
      // Failed images are logged but don't block the save
    }
  }

  return results;
}

/**
 * Generate the vault path for an image file.
 *
 * @param notePath - vault-relative path to the note (e.g., 'AI/gemini/My-Conv.md')
 * @param imageSubfolder - subfolder name (e.g., 'assets')
 * @param imageData - downloaded image data
 * @returns vault-relative path (e.g., 'AI/gemini/assets/img_0_0.png')
 */
export function buildImageVaultPath(
  notePath: string,
  imageSubfolder: string,
  imageData: ImageData
): string {
  const noteDir = notePath.substring(0, notePath.lastIndexOf('/'));
  return `${noteDir}/${imageSubfolder}/${imageData.ref.id}.${imageData.extension}`;
}

/**
 * Build the relative path from note to image (for markdown reference).
 *
 * @returns relative path (e.g., './assets/img_0_0.png')
 */
export function buildImageRelativePath(
  imageSubfolder: string,
  imageData: ImageData
): string {
  return `./${imageSubfolder}/${imageData.ref.id}.${imageData.extension}`;
}

/**
 * Replace image placeholders in markdown with actual relative paths.
 *
 * Placeholder format: {{G2O_IMG:src|alt}}
 * Output format:      ![alt](./assets/img_0_0.png)
 */
export function rewriteImagePlaceholders(
  markdown: string,
  uploadResults: readonly ImageUploadResult[],
  images: readonly ImageReference[]
): string {
  let result = markdown;

  for (const img of images) {
    // Escape special regex chars in the src URL
    const escapedSrc = img.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const placeholder = new RegExp(
      `\\{\\{G2O_IMG:${escapedSrc}\\|[^}]*\\}\\}`,
      'g'
    );

    const uploadResult = uploadResults.find(r => r.id === img.id);

    if (uploadResult?.success && uploadResult.relativePath) {
      result = result.replace(
        placeholder,
        `![${img.alt}](${uploadResult.relativePath})`
      );
    } else {
      // Upload failed — remove placeholder, leave nothing
      result = result.replace(placeholder, '');
    }
  }

  return result;
}
```
{% endraw %}

### 3.6 Save Pipeline Integration

**File:** `src/background/obsidian-handlers.ts` — modify `handleSave()`

{% raw %}
```
handleSave() flow with image sync:

1. Receive ConversationData + ImageReference[] from content script
2. Convert to markdown (with {{G2O_IMG:...}} placeholders)
3. If enableImageSync AND images exist:
   a. fetchAllImages() — download all images in parallel (max 3)
   b. For each successful download:
      - buildImageVaultPath() → compute vault path
      - client.putBinaryFile() → upload to Obsidian
      - Record ImageUploadResult (success/failure)
   c. rewriteImagePlaceholders() — replace placeholders with relative paths
4. putFile() — save the final markdown note
5. Return SaveResponse with imageResults
```
{% endraw %}

### 3.7 Settings UI

**File:** `src/popup/index.html` + `src/popup/index.ts`

New settings under "Advanced" panel:

```
[toggle] Sync images
         Download and save images from conversations to your vault.

  [text]  Image subfolder: [assets          ]
          Subfolder name relative to the note file.

  [text]  Max image size:  [10   ] MB
          Skip images larger than this.
```

**Storage keys added to `SyncSettings`:**
- `enableImageSync: boolean` (default: `false`)
- `imageSubfolder: string` (default: `'assets'`)
- `maxImageSize: number` (default: `10485760`)

---

## 4. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| XSS via `<img onerror>` | DOMPurify strips all event handlers even with `ADD_TAGS: ['img']` |
| SSRF via image fetch | Background SW only fetches from `host_permissions` origins |
| Path traversal in image paths | `containsPathTraversal()` validates all generated paths |
| Malicious image content | Images are opaque binary; Obsidian renders them safely |
| Excessive disk usage | Opt-in + configurable size limit + per-image cap |
| Memory pressure (large images) | Process images sequentially in batches of 3 |

---

## 5. Error Handling

| Scenario | Behavior |
|----------|----------|
| Single image fetch fails | Log warning, skip image, continue with remaining |
| All image fetches fail | Save note without images (placeholders removed) |
| Obsidian binary upload fails | Log error per image, save note with broken references removed |
| Image exceeds size limit | Skip with warning in imageResults |
| Unsupported MIME type | Skip with warning in imageResults |
| Network timeout | 15s per image; skip on timeout |
| Note save succeeds but images fail | Note saved, partial imageResults returned |

**Principle:** Image sync failure must never prevent the text note from being saved.

---

## 6. Implementation Phases

### Phase 1: Core Infrastructure
1. Add types (`ImageReference`, `ImageData`, `ImageUploadResult`)
2. Add `putBinaryFile()` to `ObsidianApiClient`
3. Add `enableImageSync` / `imageSubfolder` / `maxImageSize` to settings + storage
4. Add settings UI controls in popup

### Phase 2: Extraction Pipeline
5. Modify DOMPurify config to allow `<img>` with `src`/`alt`
6. Add `extractImages()` to `BaseExtractor`
7. Add image placeholder Turndown rule
8. Platform-specific image selector overrides (Gemini, Claude, ChatGPT, Perplexity)

### Phase 3: Save Pipeline
9. Create `image-service.ts` (fetch, path generation, placeholder rewrite)
10. Integrate image download + upload into `handleSave()`
11. Add `imageResults` to `SaveResponse`

### Phase 4: Testing
12. Unit tests for all new functions
13. Integration tests for the full pipeline (mock fetch + mock Obsidian API)
14. E2E selector tests for image elements per platform

---

## 7. File Change Summary

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `ImageReference`, `ImageData`, `ImageUploadResult`; extend `ConversationMessage`, `ConversationMetadata`, `SyncSettings`, `SaveResponse` |
| `src/lib/sanitize.ts` | Add `ADD_TAGS: ['img']`, `ADD_ATTR: ['src', 'alt', 'data-src']` |
| `src/lib/obsidian-api.ts` | Add `putBinaryFile(path, data)` method |
| `src/lib/storage.ts` | Add default values for image settings |
| `src/content/extractors/base.ts` | Add `extractImages()` method |
| `src/content/extractors/gemini.ts` | Override `IMAGE_SELECTORS` |
| `src/content/extractors/claude.ts` | Override `IMAGE_SELECTORS`, filter favicons |
| `src/content/extractors/chatgpt.ts` | Override `IMAGE_SELECTORS` if needed |
| `src/content/extractors/perplexity.ts` | Override `IMAGE_SELECTORS` if needed |
| `src/content/markdown-rules.ts` | Add `imagePlaceholder` rule |
| `src/background/image-service.ts` | **NEW** — fetch, upload, path, rewrite logic |
| `src/background/obsidian-handlers.ts` | Integrate image pipeline into `handleSave()` |
| `src/popup/index.html` | Add image sync UI controls |
| `src/popup/index.ts` | Add image sync settings handling |
| `src/manifest.json` | No changes needed (existing permissions sufficient) |

---

## 8. Out of Scope

- Image format conversion (WebP → PNG etc.)
- Image compression/resizing
- Inline data URI images (already embedded, no need to download)
- SVG sanitization (complex; defer to Obsidian's renderer)
- Auto-sync (Issue #186-2, separate feature)
- Image deduplication across conversations
