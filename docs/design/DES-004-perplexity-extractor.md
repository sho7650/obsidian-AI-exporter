# DES-004: Perplexity Extractor Design

**Status**: Draft
**Requirements**: `docs/requirements/REQ-perplexity-extractor.md`
**Precedent**: `src/content/extractors/chatgpt.ts` (closest pattern match)

---

## 1. Overview

This document specifies the design for `PerplexityExtractor`, a new extractor class supporting `www.perplexity.ai`. The design follows the established `BaseExtractor` pattern and mirrors the `ChatGPTExtractor` approach (no special Deep Research mode).

## 2. Design Decisions Summary

| Decision | Choice | Evidence |
|---|---|---|
| Hostname | `www.perplexity.ai` | All observed URLs use `www` subdomain |
| Conversation ID | Full slug from `/search/{slug}` | REQ Q2 |
| Citations | Convert to Obsidian footnotes `[^label]: [title](url)` before sanitization | Issue #291; URL read from `data-pplx-citation-url`, see §4.4 |
| Deep Research | Treat as `type: 'conversation'` | REQ Q5; no structural difference in DOM |
| Fixture directory | Rename `perplxity` → `perplexity` | REQ Q4 |

---

## 3. Architecture

### 3.1 Class Diagram

```
IConversationExtractor (interface)
        │
  BaseExtractor (abstract)
   ├── GeminiExtractor
   ├── ClaudeExtractor
   ├── ChatGPTExtractor
   └── PerplexityExtractor  ← NEW
```

### 3.2 File Map

| File | Action | Description |
|---|---|---|
| `src/content/extractors/perplexity.ts` | **CREATE** | PerplexityExtractor class |
| `src/content/index.ts` | MODIFY | Add routing + container selector |
| `src/background/index.ts` | MODIFY | Add to ALLOWED_ORIGINS |
| `src/manifest.json` | MODIFY | Add host_permissions + content_scripts |
| `src/lib/types.ts` | NO CHANGE | `'perplexity'` already in unions |
| `src/lib/sanitize.ts` | NO CHANGE | `<a href>` survives; `data-pplx-*` not needed |
| `src/content/markdown.ts` | NO CHANGE | `getAssistantLabel('perplexity')` already returns `'Perplexity'` |
| `test/fixtures/html/perplxity/` | RENAME | → `test/fixtures/html/perplexity/` |
| `test/fixtures/dom-helpers.ts` | MODIFY | Add Perplexity DOM helpers |
| `test/extractors/e2e/helpers.ts` | MODIFY | Add Perplexity to pipeline |
| `test/extractors/perplexity.test.ts` | **CREATE** | Unit tests |
| `test/extractors/e2e/perplexity.e2e.test.ts` | **CREATE** | E2E tests |

---

## 4. PerplexityExtractor Design

### 4.1 SELECTORS Constant

```typescript
const SELECTORS = {
  // User query text
  userQuery: [
    'span.select-text',                          // Semantic (HIGH)
    'div.bg-offset.rounded-2xl span.select-text', // Style (MEDIUM)
  ],

  // Assistant response content container
  markdownContent: [
    'div[id^="markdown-content-"]',               // ID pattern (HIGH)
    '.prose.dark\\:prose-invert',                  // Style (MEDIUM)
  ],

  // Prose content within response
  proseContent: [
    '.prose.dark\\:prose-invert',                  // Standard (HIGH)
    '.prose',                                      // Fallback (LOW)
  ],

  // Conversation container (for waitForConversationContainer)
  conversationContainer: [
    'div.max-w-threadContentWidth',                // Layout (HIGH)
    'div[class*="threadContentWidth"]',            // Partial match (MEDIUM)
  ],
};
```

**Evidence from HTML fixtures:**

| Selector | Found at (chat-simple.html) | Stability |
|---|---|---|
| `span.select-text` | Lines 447, 1096 | HIGH - semantic class for user query text |
| `div[id^="markdown-content-"]` | Line 516 (`id="markdown-content-0"`), Line 1165 (`id="markdown-content-1"`) | HIGH - sequential ID pattern |
| `.prose.dark\\:prose-invert` | Lines 524, 1173 | HIGH - Tailwind typography plugin class |
| `div.max-w-threadContentWidth` | Lines 339, 355, 988 | HIGH - layout class for thread content |

### 4.2 Turn Discovery Strategy

**Problem**: Unlike ChatGPT (which uses `article[data-turn-id]`), Perplexity has no explicit turn delimiter element. Turns are identified by the co-occurrence of a query (`span.select-text`) and a response (`div[id^="markdown-content-"]`).

**Strategy**: Collect all user queries and all assistant responses independently, then pair them by DOM order using sequential index correlation.

**Evidence from DOM structure** (chat-simple.html):

Turn 0:
- Query at line 447: `span.select-text` → "perplexityのhtml構造をテストするための質問です。「はい」とだけ答えて。"
- Response at line 516: `id="markdown-content-0"` → "はい。"

Turn 1:
- Query at line 1096: `span.select-text` → "次は「いいえ」だけ答えて"
- Response at line 1165: `id="markdown-content-1"` → "いいえ。"

The `markdown-content-{N}` IDs are 0-indexed and sequential, matching query order. This provides a reliable pairing mechanism.

### 4.3 Method Specifications

#### `canExtract(): boolean`

```typescript
canExtract(): boolean {
  return window.location.hostname === 'www.perplexity.ai';
}
```

**Security**: Strict `===` comparison prevents subdomain attacks (e.g., `evil-www.perplexity.ai.attacker.com`).

#### `getConversationId(): string | null`

```typescript
getConversationId(): string | null {
  const match = window.location.pathname.match(/\/search\/(.+)$/);
  return match ? match[1] : null;
}
```

**Evidence from URLs:**
- `/search/perplexitynohtmlgou-zao-wotesu-Y8vT04G0SKap6aQTA8L6hg` → full slug
- `/search/da-shou-ting-toraba-CG5SwgBvRti46_Hs1jFYAw` → full slug

The regex `\/search\/(.+)$` captures everything after `/search/`.

#### `getTitle(): string`

Priority:
1. First `span.select-text` text content, sanitized, truncated to `MAX_CONVERSATION_TITLE_LENGTH` (100 chars)
2. Fallback: `'Untitled Perplexity Conversation'`

#### `extractMessages(): ConversationMessage[]`

Algorithm:
1. Collect all `span.select-text` elements → user queries (ordered by DOM position)
2. Collect all `div[id^="markdown-content-"]` elements → assistant responses (ordered by ID index)
3. Pair queries and responses by sequential index (query[0] ↔ response[0], query[1] ↔ response[1], ...)
4. For each pair:
   - User: extract `textContent` from `span.select-text`, sanitize
   - Assistant: extract `innerHTML` from the `.prose` child inside the `markdown-content-*` div, sanitize via DOMPurify

**Edge cases:**
- More queries than responses (user asked but response pending): include query-only messages
- More responses than queries (system-generated content): skip orphan responses
- Empty content: skip and log warning

#### `extract(): Promise<ExtractionResult>`

Standard flow matching ChatGPTExtractor pattern:
1. `canExtract()` guard
2. `extractMessages()`
3. Validate message count
4. Build `ConversationData` with `source: 'perplexity'`
5. Return `ExtractionResult`

### 4.4 Citation Handling — Footnote Transformation (issue #291)

> **Revised 2026-07-02.** The original design relied on citations embedding an
> `<a href>` that survives DOMPurify. Perplexity has since switched to "pill"
> citations whose text (e.g. `biccamera.co +1`) was glued to the prose in the
> output (`sketch.facebook+1`, issue #291). Citations are now rewritten to
> Obsidian footnotes before sanitization.

**Key insight** (DOM observed 2026-07-02): every citation — both variants —
wraps in a span carrying the source URL in `data-pplx-citation-url`:

```html
<!-- Hover-trigger pill variant (no <a>, no title) -->
<span class="citation inline" data-pplx-citation=""
      data-pplx-citation-url="https://example.com/...">
  <span class="group/trigger ...">
    ... <span>example.co</span><span>+1</span> ...

<!-- Anchor variant (title in aria-label) -->
<span class="citation inline" data-pplx-citation=""
      data-pplx-citation-url="https://example.com/...">
  <span class="inline-flex" aria-label="Source Title">
    <a href="https://example.com/...">... <span>example.co</span> ...</a>
```

**Transformation** (`transformCitationsToFootnotes` in `perplexity.ts`, runs
BEFORE `sanitizeHtml()` — same pipeline as NotebookLM, shared helpers in
`extractors/footnotes.ts`):

1. Each `span.citation[data-pplx-citation-url]` is replaced with a
   `<span data-footnote-ref="m{messageIndex}-{n}">` placeholder
   (allow-listed in `sanitize.ts`, converted to `[^label]` by Turndown).
2. Citations are deduped by URL within one message; labels stay unique
   across messages via the `m{messageIndex}-` prefix.
3. Footnote definitions `[^label]: [title](url)` are appended as
   `<p data-footnote-def>` paragraphs. Title priority: `aria-label` →
   pill text with the trailing `+N` counter stripped → URL hostname.
4. Only `http(s)` URLs are accepted from the data attribute (XSS guard).
5. Legacy pills (pre-2026-07: `span.group/trigger` with **no**
   `data-pplx-citation-url` ancestor — the URL genuinely does not exist in
   the static DOM) are removed so their text is not glued to the prose.
6. `<span class="citation-nbsp">` spacer spans are removed.

**Known limitation**: a pill's `+N` counter indicates additional sources whose
URLs are not present in the static DOM (they render only inside the lazily
mounted Sources tab); only the primary URL is captured. The full source list
(including uncited sources) is tracked as a separate enhancement.

---

## 5. Integration Changes

### 5.1 `src/content/index.ts` — Routing

Add import and routing for Perplexity:

```typescript
import { PerplexityExtractor } from './extractors/perplexity';

// In getExtractor():
if (hostname === 'www.perplexity.ai') {
  return new PerplexityExtractor();
}
```

### 5.2 `src/content/index.ts` — Container Wait Selector

Add Perplexity-specific selector to `waitForConversationContainer()`:

```
Current:  '.conversation-container, [class*="conversation"], article[data-turn-id]'
Updated:  '.conversation-container, [class*="conversation"], article[data-turn-id], div[class*="threadContentWidth"]'
```

The selector `div[class*="threadContentWidth"]` matches `div.max-w-threadContentWidth`, which is the main content container on Perplexity pages.

### 5.3 `src/background/index.ts` — ALLOWED_ORIGINS

```typescript
const ALLOWED_ORIGINS = [
  'https://gemini.google.com',
  'https://claude.ai',
  'https://chatgpt.com',
  'https://www.perplexity.ai',  // NEW
] as const;
```

**Note**: No changes to `validateNoteData()` needed. The frontmatter source validation at `background/index.ts:140` already includes `'perplexity'` in the allowed list.

### 5.4 `src/manifest.json`

Add to `host_permissions`:
```json
"https://www.perplexity.ai/*"
```

Add to `content_scripts[0].matches`:
```json
"https://www.perplexity.ai/*"
```

---

## 6. Test Design

### 6.1 Fixture Rename

```
test/fixtures/html/perplxity/ → test/fixtures/html/perplexity/
```

Files retained:
- `chat-simple.html` (2-turn conversation)
- `deep-research.html` (single-turn Deep Research report)

### 6.2 DOM Helpers (`test/fixtures/dom-helpers.ts`)

New functions following existing ChatGPT helper pattern:

#### `setPerplexityLocation(slug: string): void`

```typescript
export function setPerplexityLocation(slug: string): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'www.perplexity.ai',
      pathname: `/search/${slug}`,
      href: `https://www.perplexity.ai/search/${slug}`,
      origin: 'https://www.perplexity.ai',
      protocol: 'https:',
      host: 'www.perplexity.ai',
      search: '',
      hash: '',
    },
    writable: true,
    configurable: true,
  });
}
```

#### `setNonPerplexityLocation(hostname: string, pathname?: string): void`

For security tests (subdomain attack prevention).

#### `createPerplexityConversationDOM(messages: PerplexityConversationMessage[]): string`

Creates minimal DOM matching the observed Perplexity structure:
- User queries wrapped in `div[class*="group/query"] > div.bg-offset > span.select-text`
- Assistant responses in `div[id="markdown-content-{N}"] > div.prose`

#### `createPerplexityPage(slug: string, messages: PerplexityConversationMessage[]): void`

Combines `setPerplexityLocation` + `loadFixture`.

#### `createPerplexityInlineCitation(url: string, displayText: string): string`

Creates Perplexity-style citation HTML with `data-pplx-citation-url`.

### 6.3 E2E Helper Updates (`test/extractors/e2e/helpers.ts`)

Add `'perplexity'` to:
- `loadFixtureFile()` platform parameter type
- `setLocationForPlatform()` switch
- `createExtractor()` switch
- `runE2EPipeline()` platform parameter type
- `assertSourcePlatform()` expected parameter type
- `assertCalloutFormat()` platform parameter type

### 6.4 Unit Tests (`test/extractors/perplexity.test.ts`)

Test categories (following `claude.test.ts` pattern):

**Platform Detection:**
- `canExtract()` returns true on `www.perplexity.ai`
- `canExtract()` returns false on `perplexity.ai` (without www)
- `canExtract()` returns false on subdomain attacks (`evil.www.perplexity.ai.attacker.com`)

**URL Extraction:**
- `getConversationId()` extracts full slug from `/search/{slug}` URLs
- `getConversationId()` returns null for non-search paths (e.g., `/`, `/hub`, `/pro`)

**Title Extraction:**
- `getTitle()` returns first user query text
- `getTitle()` truncates to `MAX_CONVERSATION_TITLE_LENGTH`
- `getTitle()` returns default when no queries found

**Message Extraction:**
- `extractMessages()` extracts paired user/assistant messages
- `extractMessages()` handles multi-turn conversations
- `extractMessages()` returns empty array when no content found
- `extractMessages()` preserves HTML content for assistant messages
- Citations in assistant HTML have `<a href>` preserved after sanitization

**Full Extraction:**
- `extract()` returns success with valid conversation data
- `extract()` returns `source: 'perplexity'`
- `extract()` returns failure when not on Perplexity page

### 6.5 E2E Tests (`test/extractors/e2e/perplexity.e2e.test.ts`)

**Chat - Simple Conversation:**
- Loads `chat-simple.html` fixture
- Validates extraction success, source platform, message structure
- Validates frontmatter fields
- Validates callout format (`> [!QUESTION]`, `> [!NOTE]`)
- Snapshot test for full Markdown output

**Deep Research:**
- Loads `deep-research.html` fixture
- Validates extraction as normal conversation (not `type: 'deep-research'`)
- Validates content includes headings, tables, citation links
- Snapshot test for full Markdown output

---

## 7. Sequence Diagram

```
User clicks Sync button
        │
        ▼
  handleSync()
        │
        ▼
  getExtractor()
   hostname === 'www.perplexity.ai'
        │
        ▼
  PerplexityExtractor.extract()
        │
        ├─→ canExtract()     → true
        ├─→ extractMessages()
        │     ├─→ queryAllWithFallback(SELECTORS.userQuery)
        │     │     → [span.select-text, span.select-text, ...]
        │     ├─→ querySelectorAll('div[id^="markdown-content-"]')
        │     │     → [div#markdown-content-0, div#markdown-content-1, ...]
        │     ├─→ pair by index → [{user, assistant}, ...]
        │     └─→ sanitizeHtml(response.innerHTML) for each assistant
        ├─→ getConversationId()
        │     → pathname.match(/\/search\/(.+)$/) → full slug
        ├─→ getTitle()
        │     → first span.select-text textContent
        └─→ return ExtractionResult { source: 'perplexity' }
        │
        ▼
  conversationToNote()
        │ getAssistantLabel('perplexity') → 'Perplexity'
        │ htmlToMarkdown() via Turndown
        │   └─→ <a href="url">text</a> → [text](url)
        ▼
  saveToOutputs()
```

---

## 8. Risk Analysis

| Risk | Mitigation |
|---|---|
| Perplexity DOM changes | Multiple fallback selectors; HIGH/MEDIUM stability ranking |
| `span.select-text` is too generic | Scoped within query container context, not document-wide |
| `markdown-content-{N}` ID pattern changes | Fallback to `.prose` selector |
| Hostname redirect (`perplexity.ai` → `www.perplexity.ai`) | Content script only runs on `www.perplexity.ai`; Chrome handles redirect before content script injection |
| DOMPurify strips citation context | `<a href>` survives; display text preserved; only `data-*` attrs stripped (acceptable) |
| Large Deep Research reports exceed MAX_CONTENT_SIZE | Existing 1MB limit applies; Perplexity reports observed to be well under this |

---

## 9. Implementation Steps

Ordered by dependency:

1. **Rename fixture directory**: `test/fixtures/html/perplxity/` → `test/fixtures/html/perplexity/`
2. **Create `src/content/extractors/perplexity.ts`**: PerplexityExtractor class
3. **Modify `src/content/index.ts`**: Add import, routing, container selector
4. **Modify `src/background/index.ts`**: Add to ALLOWED_ORIGINS
5. **Modify `src/manifest.json`**: Add host_permissions + content_scripts
6. **Modify `test/fixtures/dom-helpers.ts`**: Add Perplexity DOM helpers
7. **Modify `test/extractors/e2e/helpers.ts`**: Add Perplexity to pipeline
8. **Create `test/extractors/perplexity.test.ts`**: Unit tests
9. **Create `test/extractors/e2e/perplexity.e2e.test.ts`**: E2E tests
10. **Run tests**: `npm run lint && npm run build && npx vitest run`
