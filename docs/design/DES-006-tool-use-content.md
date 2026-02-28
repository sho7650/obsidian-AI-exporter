# DES-006: Tool-Use / Intermediate Content Opt-in

## Requirements

- REQ-084: Tool-Use / Intermediate Content Opt-in
- GitHub: #84

## 1. Overview

Claude's tool-use responses (Web Search results, Code Interpreter output, file analysis) are currently skipped during extraction because they lack the `.font-claude-response` class. This design adds a global opt-in toggle `enableToolContent` to include these intermediate responses alongside normal assistant messages.

### Scope (Phase 1 — Claude only)

| In Scope | Out of Scope |
|----------|-------------|
| Settings toggle + storage | ChatGPT/Gemini/Perplexity intermediate content |
| Claude tool-use DOM extraction | Folding summary text extraction |
| i18n (en/ja) | New extractor interfaces or message role types |
| Tests | Separate formatting for tool-use vs normal responses |

### Design Principles

1. **Zero impact when OFF** — No code path changes when `enableToolContent=false`
2. **Follow existing patterns** — Same property pattern as `GeminiExtractor.enableAutoScroll`
3. **No base class changes** — `BaseExtractor` and `queryAllWithFallback` remain untouched
4. **Additive only** — Tool-use elements are collected in a separate pass and merged

## 2. Claude Tool-Use DOM Structure

Based on live DOM investigation, tool-use responses have the following structure:

```html
<!-- Normal assistant response (EXISTING — has .font-claude-response) -->
<div data-test-render-count="2" class="group" style="height: auto;">
  <div class="font-claude-response" data-is-streaming="false">
    <div class="standard-markdown">
      <p>Response content</p>
    </div>
  </div>
</div>

<!-- Tool-use response (NEW — NO .font-claude-response) -->
<div data-test-render-count="2" class="group" style="height: auto;">
  <div class="grid grid-rows-[auto_auto]">
    <button>
      <span>Gathered API documentation for...</span>  <!-- summary text -->
    </button>
    <div class="font-claude-response-body">
      <div class="standard-markdown">
        <p>Tool result content</p>
      </div>
    </div>
  </div>
</div>
```

Key distinguishing features:
- Parent div has **no** `.font-claude-response` class
- Uses `grid grid-rows-[auto_auto]` layout
- Contains `.font-claude-response-body` (note: **-body** suffix)
- Has a collapsible `<button>` with summary text (to be excluded per REQ-084 Open Question #1)

### 2.1 CSS Class Relationship (Critical for Deduplication)

```
.font-claude-response       — normal assistant response wrapper
.font-claude-response-body  — tool-use response content area

These are DISTINCT classes (not parent-child). However:
  [class*="font-claude-response"]  ← substring match catches BOTH
  .font-claude-response            ← exact match catches only normal
```

This distinction is critical for deduplication logic. See Section 3.7.3.

## 3. Component Design

### 3.1 Type Changes (`src/lib/types.ts`)

```typescript
// Add to SyncSettings interface (line ~166)
export interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
  outputOptions: OutputOptions;
  enableAutoScroll: boolean;
  enableAppendMode: boolean;
  /** Include tool-use / intermediate content (e.g., web search results) */
  enableToolContent: boolean;  // NEW
}
```

**Rationale**: Follows the existing flat boolean pattern (`enableAutoScroll`, `enableAppendMode`). No nesting needed since this is a single global toggle.

### 3.2 Storage Changes (`src/lib/storage.ts`)

```typescript
// DEFAULT_SYNC_SETTINGS (line ~40)
const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  // ... existing fields ...
  enableToolContent: false,  // NEW — OFF by default (preserves existing behavior)
};
```

Add to `getSettings()` return object:
```typescript
enableToolContent:
  syncResult.settings?.enableToolContent ?? DEFAULT_SYNC_SETTINGS.enableToolContent,
```

Add to `saveSettings()` sync data:
```typescript
if (settings.enableToolContent !== undefined) {
  syncData.enableToolContent = settings.enableToolContent;
}
```

### 3.3 Popup UI Changes (`src/popup/index.html`)

Add a new toggle in the **Extraction** section, after the Append Mode toggle (line ~88):

```html
<label class="toggle-row">
  <span class="toggle-icon">🔍</span>
  <span class="toggle-label">
    <span data-i18n="settings_enableToolContent">Include tool/search results</span>
    <span class="toggle-sublabel" data-i18n="settings_toolContentHelp">
      Save web search and tool results from Claude
    </span>
  </span>
  <span class="toggle-switch">
    <input type="checkbox" id="enableToolContent" role="switch" aria-checked="false" />
    <span class="slider" aria-hidden="true"></span>
  </span>
</label>
```

### 3.4 Popup Script Changes (`src/popup/index.ts`)

```typescript
// elements object: add
enableToolContent: getElement<HTMLInputElement>('enableToolContent'),

// populateForm(): add
elements.enableToolContent.checked = settings.enableToolContent ?? false;

// collectSettings(): add to return object
enableToolContent: elements.enableToolContent.checked,
```

### 3.5 i18n Changes

**`src/_locales/en/messages.json`**:
```json
"settings_enableToolContent": {
  "message": "Include tool/search results",
  "description": "Label for tool content toggle"
},
"settings_toolContentHelp": {
  "message": "Save web search and tool results from Claude",
  "description": "Help text for tool content toggle"
}
```

**`src/_locales/ja/messages.json`**:
```json
"settings_enableToolContent": {
  "message": "ツール/検索結果を含める"
},
"settings_toolContentHelp": {
  "message": "Claude の Web 検索やツール結果も保存する"
}
```

### 3.6 Content Script Changes (`src/content/index.ts`)

Extend `applyExtractorSettings()` to pass the new setting to the Claude extractor:

```typescript
function applyExtractorSettings(
  extractor: IConversationExtractor,
  settings: ExtensionSettings
): void {
  if (extractor instanceof GeminiExtractor) {
    extractor.enableAutoScroll = settings.enableAutoScroll ?? false;
  }
  if (extractor instanceof ClaudeExtractor) {
    extractor.enableToolContent = settings.enableToolContent ?? false;
  }
}
```

### 3.7 Claude Extractor Changes (`src/content/extractors/claude.ts`)

#### 3.7.1 New Selectors

```typescript
const SELECTORS = {
  // ... existing selectors ...

  // Tool-use response selectors (opt-in via enableToolContent)
  toolUseResponse: [
    '.font-claude-response-body',           // Semantic (HIGH)
    '[class*="font-claude-response-body"]',  // Partial match (HIGH)
  ],
};
```

#### 3.7.2 Public Property

```typescript
export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude';

  /** Include tool-use / intermediate content in extraction */
  enableToolContent = false;  // NEW

  // ... rest of class
}
```

#### 3.7.3 Modified `extractMessages()`

The key change is to **also collect tool-use response elements** when `enableToolContent` is true, then merge all elements by DOM position.

**CRITICAL: Deduplication selector must use exact class match `.font-claude-response`, NOT substring match `[class*="font-claude-response"]`.**

The substring selector `[class*="font-claude-response"]` matches both `.font-claude-response` AND `.font-claude-response-body` (because the former is a substring of the latter). Since `Element.closest()` starts from the element itself, a tool-use element with class `font-claude-response-body` would match itself and be incorrectly filtered out.

```typescript
extractMessages(): ConversationMessage[] {
  const allElements: Array<{ element: Element; type: 'user' | 'assistant' }> = [];

  // Find user messages (skip nested content inside assistant responses)
  // NOTE: [class*="font-claude-response"] substring match is intentional here —
  // user-like elements inside BOTH normal responses and tool-use responses
  // should be excluded (font-claude-response-body also matches, which is correct)
  const userMessages = this.queryAllWithFallback<HTMLElement>(SELECTORS.userMessage);
  userMessages.forEach(el => {
    const assistantParent = el.closest(
      '.font-claude-response, [class*="font-claude-response"]'
    );
    if (!assistantParent) {
      allElements.push({ element: el, type: 'user' });
    }
  });

  // Find normal assistant responses
  const assistantResponses = this.queryAllWithFallback<HTMLElement>(
    SELECTORS.assistantResponse
  );
  assistantResponses.forEach(el => {
    allElements.push({ element: el, type: 'assistant' });
  });

  // NEW: Find tool-use responses when enabled
  if (this.enableToolContent) {
    const toolResponses = this.queryAllWithFallback<HTMLElement>(
      SELECTORS.toolUseResponse
    );
    toolResponses.forEach(el => {
      // Deduplicate: skip if inside a normal .font-claude-response
      // MUST use exact class match — NOT [class*="font-claude-response"]
      // because substring match would catch .font-claude-response-body itself
      const normalParent = el.closest('.font-claude-response');
      if (!normalParent) {
        allElements.push({ element: el, type: 'assistant' });
      }
    });
  }

  this.sortByDomPosition(allElements);

  return this.buildMessagesFromElements(
    allElements,
    el => this.extractUserContent(el),
    el => this.extractAssistantContent(el)
  );
}
```

#### 3.7.4 `extractAssistantContent` — No Changes Needed

The existing method already handles the general case:
1. Looks for `.row-start-2` (Extended Thinking) → extracts markdown
2. Looks for `.standard-markdown` → extracts markdown
3. Falls back to `element.innerHTML`

For tool-use responses, `.font-claude-response-body` contains `.standard-markdown`, so step 2 will naturally extract the content. No special-casing needed.

#### 3.7.5 User Message Filtering — No Changes Needed

The existing user message filter uses `[class*="font-claude-response"]` (substring match):
```typescript
el.closest('.font-claude-response, [class*="font-claude-response"]')
```

This **intentionally catches both** `.font-claude-response` and `.font-claude-response-body`, correctly excluding any user-like elements that appear inside tool-use responses. No change needed.

## 4. Data Flow

```
┌─────────────────────────────────────────────────────┐
│  Popup UI                                           │
│  ┌──────────────────────────────────────────────┐   │
│  │ [Toggle] Include tool/search results: [OFF]  │   │
│  └──────────────────────────────────────────────┘   │
│  collectSettings() → { enableToolContent: true }    │
└──────────────────────┬──────────────────────────────┘
                       │ saveSettings()
                       ▼
┌─────────────────────────────────────────────────────┐
│  chrome.storage.sync                                │
│  { settings: { ..., enableToolContent: true } }     │
└──────────────────────┬──────────────────────────────┘
                       │ getSettings() message
                       ▼
┌─────────────────────────────────────────────────────┐
│  Content Script (index.ts)                          │
│  applyExtractorSettings(extractor, settings)        │
│  → extractor.enableToolContent = true               │
└──────────────────────┬──────────────────────────────┘
                       │ extractor.extract()
                       ▼
┌─────────────────────────────────────────────────────┐
│  ClaudeExtractor.extractMessages()                  │
│                                                     │
│  1. Collect user messages    (existing)              │
│  2. Collect assistant msgs   (existing)              │
│  3. Collect tool-use msgs    (NEW — if enabled)      │
│  4. Sort all by DOM position (existing)              │
│  5. Build ConversationMessage[] (existing)           │
└─────────────────────────────────────────────────────┘
```

## 5. queryAllWithFallback — No Modification Needed

After analysis, `queryAllWithFallback` does **not** need modification:

- Tool-use selectors (`toolUseResponse`) are a **separate selector group** from `assistantResponse`
- We call `queryAllWithFallback` **twice** (once per group) and merge results
- This avoids changing the core utility's behavior, which would affect all 4 extractors
- Deduplication is handled via `el.closest()` ancestry check, not by modifying the query utility

This is simpler and safer than the union-based approach initially considered in the requirements doc.

## 6. Affected Files

| File | Change | Lines |
|------|--------|-------|
| `src/lib/types.ts` | Add `enableToolContent: boolean` to `SyncSettings` | ~1 line |
| `src/lib/storage.ts` | Add default, getSettings field, saveSettings handler | ~5 lines |
| `src/popup/index.html` | Add toggle UI in Extraction section | ~14 lines |
| `src/popup/index.ts` | Add element ref, populate, collect | ~3 lines |
| `src/_locales/en/messages.json` | Add 2 i18n keys | ~8 lines |
| `src/_locales/ja/messages.json` | Add 2 i18n keys | ~6 lines |
| `src/content/index.ts` | Extend `applyExtractorSettings` for Claude | ~3 lines |
| `src/content/extractors/claude.ts` | Add selectors, property, extraction logic | ~15 lines |
| `test/fixtures/dom-helpers.ts` | Add `createClaudeToolUsePage` helper | ~30 lines |
| `test/extractors/claude.test.ts` | Add tool-use test cases | ~80 lines |

**Total**: ~165 lines of changes across 10 files

## 7. Impact Analysis

### 7.1 Validation Warning (Acceptable)

`BaseExtractor.validate()` checks `Math.abs(userCount - assistantCount) > 1` and emits an "Unbalanced message count" warning. With tool-use content enabled, `assistantCount` will exceed `userCount`, triggering this warning.

**Decision: Accept for Phase 1.** Rationale:
- Validation warnings are **console-only** (`console.warn`), never shown to the user as toasts
- `isValid` remains `true` — warnings don't block extraction or saving
- Fixing this would require either modifying the base class (affects all extractors) or overriding `validate()` in ClaudeExtractor (adds complexity)
- Can revisit if user feedback indicates confusion

### 7.2 Metadata Impact

`buildMetadata()` counts all messages by role. Tool-use messages counted as `role: 'assistant'` will inflate `assistantMessageCount`. This is **correct behavior** — tool-use content is assistant-generated output.

### 7.3 Markdown Formatting Impact

`formatMessage()` in `src/content/markdown.ts` only checks `role: 'user' | 'assistant'`. Tool-use content (as `role: 'assistant'`) receives identical formatting to normal responses:
- Same callout type (e.g., `> [!NOTE] Claude`)
- Same `htmlToMarkdown()` conversion
- Same label from `getAssistantLabel(source)`

**No changes needed.** Users who enable this toggle expect tool-use content to appear as regular assistant messages in the note.

### 7.4 User Message Filter Correctness

The existing user message filter (`el.closest('[class*="font-claude-response"]')`) uses a **substring match** that catches both `.font-claude-response` AND `.font-claude-response-body`. This correctly excludes user-like elements inside both normal and tool-use responses. **No change needed.**

## 8. Test Strategy

### 8.1 DOM Helper Addition (`test/fixtures/dom-helpers.ts`)

Add helpers to create tool-use response DOM:

```typescript
/**
 * Create Claude tool-use response DOM element
 * Simulates web search, code interpreter, etc.
 */
export function createClaudeToolUseResponse(
  summaryText: string,
  content: string
): string {
  return `
    <div data-test-render-count="2" class="group" style="height: auto;">
      <div class="grid grid-rows-[auto_auto]">
        <button>
          <span>${escapeHtmlForClaude(summaryText)}</span>
        </button>
        <div class="font-claude-response-body">
          <div class="standard-markdown">
            ${content}
          </div>
        </div>
      </div>
    </div>
  `;
}
```

Also add a composite page helper (`createClaudePageWithToolUse`) that interleaves tool-use blocks between normal messages in the DOM, using `loadFixture()` to assemble them.

### 8.2 Extractor Test Cases (`test/extractors/claude.test.ts`)

```
describe('Tool-use content extraction', () => {
  TC-1: enableToolContent=false (default) → tool-use responses are skipped
  TC-2: enableToolContent=true  → tool-use responses included as assistant messages
  TC-3: enableToolContent=true  → mixed normal + tool-use responses maintain DOM order
  TC-4: enableToolContent=true  → dedup: .font-claude-response-body inside
        .font-claude-response is not double-counted (exact class match)
  TC-5: enableToolContent=true  → tool-use content is sanitized via DOMPurify
  TC-6: enableToolContent=true  → .standard-markdown inside tool-use is extracted
  TC-7: enableToolContent=true  → summary button text is NOT included in output
  TC-8: enableToolContent=false → normal responses unaffected (regression)
  TC-9: enableToolContent=true  → user messages inside tool-use responses are excluded
        (substring match [class*="font-claude-response"] catches -body)
})
```

### 8.3 Storage Tests (`test/lib/storage.test.ts`)

Add 2 tests (following existing patterns):

```
TC-S1: getSettings() returns enableToolContent default (false) when storage empty
TC-S2: saveSettings({ enableToolContent: true }) persists and round-trips
```

### 8.4 Popup Tests (`test/popup/index.test.ts`)

Add 2 tests (following existing patterns):

```
TC-P1: populateForm() sets enableToolContent checkbox from settings
TC-P2: collectSettings() includes enableToolContent from checkbox state
```

### 8.5 Test Coverage Summary

| Component | Existing Tests | New Tests | Total |
|-----------|---------------|-----------|-------|
| Claude extractor | 64 | 9 | 73 |
| Storage | 17 | 2 | 19 |
| Popup | ~37 | 2 | ~39 |
| **Total** | **~118** | **13** | **~131** |

## 9. Non-Functional Requirements

| Requirement | How Met |
|-------------|---------|
| Toggle OFF preserves existing behavior | `if (this.enableToolContent)` guard; all existing code paths untouched |
| No page reload needed | Setting is read fresh per sync click via `getSettings()` |
| No perf impact when OFF | Zero additional DOM queries when `enableToolContent=false` |
| Security (XSS) | Tool-use content passes through `sanitizeHtml()` (DOMPurify) |

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Claude DOM changes break tool-use selectors | Medium | Low | Fallback chain (`[class*="font-claude-response-body"]`); toggle OFF restores behavior |
| Validation warning confuses developers | Low | Low | Console-only; documented in this design |
| Tool-use content overwhelms note with noise | Low | Low | User-controlled opt-in; OFF by default |
| Substring selector `[class*=...]` matches unexpected future classes | Low | Low | Dedup uses exact `.font-claude-response` match; edge case handled |

## 11. Open Questions (Resolved)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Include fold summary text? | **No** | Summary text (`<button>` content) is excluded. Only `.standard-markdown` content inside `.font-claude-response-body` is extracted. |
| 2 | Modify `queryAllWithFallback`? | **No** | Separate calls + merge is simpler, safer, and avoids touching the base class shared by all 4 extractors. |
| 3 | Fix "Unbalanced message count" validation warning? | **No (Phase 1)** | Warning is console-only, doesn't affect users. Fixing requires base class changes or per-extractor override. |
| 4 | Add a new message role (e.g., `'tool'`)? | **No** | Introduces breaking changes across types, markdown, tests. Tool-use content is assistant-generated, so `'assistant'` role is semantically correct. |

## 12. Implementation Order

Recommended implementation sequence (each step independently testable):

1. **Types + Storage** — `types.ts`, `storage.ts` (+ storage tests)
2. **Popup UI** — `index.html`, `index.ts`, i18n files (+ popup tests)
3. **Content Script** — `content/index.ts` (wiring only)
4. **Claude Extractor** — `claude.ts` selectors + extraction (+ extractor tests)
5. **Verify** — `npm run build && npm run lint && npm test`

## 13. Future Work (Phase 2)

- ChatGPT: Web Browsing, DALL-E, Code Interpreter, Canvas
- Gemini: Google Search integration, Extensions
- Perplexity: Source search/citation panels
- Each platform requires DOM investigation + separate implementation issue
