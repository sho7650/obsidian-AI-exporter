# WF-084: Tool-Use Content Implementation Workflow

**Design Reference**: `docs/design/DES-006-tool-use-content.md`
**Requirements**: REQ-084 / GitHub #84
**Estimated Scope**: ~165 lines across 10 files, 13 new tests

---

## Phase 0: Branch Setup

### Step 0.1 — Create feature branch

```bash
git checkout main && git pull
git checkout -b feat/tool-use-content-opt-in
```

**Checkpoint**: On `feat/tool-use-content-opt-in` branch, clean working tree.

---

## Phase 1: Types + Storage Layer

> Foundation layer. All subsequent phases depend on this.

### Step 1.1 — Add `enableToolContent` to `SyncSettings`

**File**: `src/lib/types.ts`
**Action**: Add field to `SyncSettings` interface (after `enableAppendMode`).

```typescript
/** Include tool-use / intermediate content (e.g., web search results) */
enableToolContent: boolean;
```

**Verify**: `npx tsc --noEmit` — expect errors in `storage.ts` (missing field in defaults).

### Step 1.2 — Add default value and storage handlers

**File**: `src/lib/storage.ts`
**Actions** (3 locations):

1. `DEFAULT_SYNC_SETTINGS` — add `enableToolContent: false`
2. `getSettings()` return object — add retrieval line
3. `saveSettings()` — add persistence conditional

**Verify**: `npx tsc --noEmit` — 0 errors.

### Step 1.3 — Add storage tests

**File**: `test/lib/storage.test.ts`
**Actions**: Add 2 tests inside existing describe blocks:

- `getSettings()` returns `enableToolContent: false` when storage empty
- `saveSettings({ enableToolContent: true })` round-trips correctly

**Verify**: `npx vitest run test/lib/storage.test.ts` — all pass.

**Phase 1 Checkpoint**: `npm run build` succeeds. Storage tests pass.

---

## Phase 2: Popup UI

> Settings UI. Depends on Phase 1 types.

### Step 2.1 — Add i18n keys

**Files**: `src/_locales/en/messages.json`, `src/_locales/ja/messages.json`
**Action**: Add 2 keys each (`settings_enableToolContent`, `settings_toolContentHelp`).

### Step 2.2 — Add toggle HTML

**File**: `src/popup/index.html`
**Action**: Insert toggle row after the Append Mode toggle (after line ~88), before `</div>` closing the toggle-list in the Extraction section.

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

### Step 2.3 — Wire popup script

**File**: `src/popup/index.ts`
**Actions** (3 locations):

1. `elements` object — add `enableToolContent: getElement<HTMLInputElement>('enableToolContent')`
2. `populateForm()` — add `elements.enableToolContent.checked = settings.enableToolContent ?? false;`
3. `collectSettings()` return object — add `enableToolContent: elements.enableToolContent.checked`

### Step 2.4 — Add popup tests

**File**: `test/popup/index.test.ts`
**Actions**: Add 2 tests following existing patterns:

- `populateForm()` sets `enableToolContent` checkbox from settings
- `collectSettings()` includes `enableToolContent` from checkbox state

**Verify**: `npx vitest run test/popup/index.test.ts` — all pass.

**Phase 2 Checkpoint**: `npm run build` succeeds. Popup tests pass. `npm run dev` → toggle visible in Extraction section.

---

## Phase 3: Content Script Wiring

> Connects settings to extractor. Depends on Phase 1.

### Step 3.1 — Extend `applyExtractorSettings()`

**File**: `src/content/index.ts`
**Action**: Add `ClaudeExtractor` import and `instanceof` check:

```typescript
import { ClaudeExtractor } from './extractors/claude';

// Inside applyExtractorSettings():
if (extractor instanceof ClaudeExtractor) {
  extractor.enableToolContent = settings.enableToolContent ?? false;
}
```

**Verify**: `npx tsc --noEmit` — expect error (property doesn't exist on ClaudeExtractor yet). This is expected; will resolve in Phase 4.

**Phase 3 Checkpoint**: Change is ready, will compile after Phase 4.

---

## Phase 4: Claude Extractor Implementation

> Core extraction logic. Depends on Phases 1 + 3.

### Step 4.1 — Add `enableToolContent` property

**File**: `src/content/extractors/claude.ts`
**Action**: Add public property to `ClaudeExtractor` class (after `readonly platform`):

```typescript
/** Include tool-use / intermediate content in extraction */
enableToolContent = false;
```

**Verify**: `npx tsc --noEmit` — 0 errors (Phase 3 import now resolves).

### Step 4.2 — Add tool-use selectors

**File**: `src/content/extractors/claude.ts`
**Action**: Add `toolUseResponse` entry to `SELECTORS` constant:

```typescript
// Tool-use response selectors (opt-in via enableToolContent)
toolUseResponse: [
  '.font-claude-response-body',           // Semantic (HIGH)
  '[class*="font-claude-response-body"]',  // Partial match (HIGH)
],
```

### Step 4.3 — Modify `extractMessages()`

**File**: `src/content/extractors/claude.ts`
**Action**: Add tool-use collection block after existing assistant response collection, guarded by `if (this.enableToolContent)`.

**CRITICAL IMPLEMENTATION NOTE**: Deduplication MUST use exact class match:
```typescript
const normalParent = el.closest('.font-claude-response');
```
NOT substring match `[class*="font-claude-response"]` which would match the element itself.

See DES-006 Section 3.7.3 for the complete code.

**Verify**: `npx tsc --noEmit` — 0 errors.

### Step 4.4 — Add DOM test helpers

**File**: `test/fixtures/dom-helpers.ts`
**Actions**:

1. Add `createClaudeToolUseResponse(summaryText, content)` helper
2. Add `createClaudePageWithToolUse(conversationId, messages, toolUseInsertions)` composite helper

### Step 4.5 — Add extractor tests

**File**: `test/extractors/claude.test.ts`
**Action**: Add new describe block `'Tool-use content extraction'` with 9 test cases:

| TC | Description | Key Assertion |
|----|-------------|---------------|
| 1 | OFF: tool-use skipped (default) | `messages.length === 2` (user+assistant only) |
| 2 | ON: tool-use included | `messages.length === 3` (user+tool+assistant) |
| 3 | ON: mixed responses maintain DOM order | `messages[1].content` is tool-use, `messages[2].content` is normal |
| 4 | ON: no double-count when inside .font-claude-response | `messages.length` is not inflated |
| 5 | ON: content sanitized via DOMPurify | No `<script>` tags in output |
| 6 | ON: .standard-markdown extraction works | Content matches expected markdown |
| 7 | ON: summary button text excluded | `content` does not contain summary text |
| 8 | OFF: normal responses unaffected (regression) | Identical output with/without tool-use DOM present |
| 9 | ON: user-like elements inside tool-use excluded | User content inside `.font-claude-response-body` not in user messages |

**Verify**: `npx vitest run test/extractors/claude.test.ts` — all 73 tests pass.

**Phase 4 Checkpoint**: `npm run build` succeeds. All extractor tests pass.

---

## Phase 5: Final Verification

### Step 5.1 — Full build + lint + test

```bash
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint — 0 errors, 0 warnings
npm run format   # Prettier — all clean
npx vitest run   # All tests pass, coverage thresholds met
```

### Step 5.2 — Verify acceptance criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Toggle visible in Advanced Settings → Extraction | Visual check in `npm run dev` |
| AC-2 | OFF: tool-use not saved | TC-1, TC-8 |
| AC-3 | ON: tool-use saved | TC-2, TC-6 |
| AC-4 | ON: DOM order preserved | TC-3 |
| AC-5 | Settings persist across restart | TC-S1, TC-S2 |

### Step 5.3 — Commit

```bash
git add <specific files>
git commit -m "feat: add enableToolContent opt-in for Claude tool-use responses (#84)"
```

**Phase 5 Checkpoint**: Clean build, all tests pass, conventional commit created.

---

## Dependency Graph

```
Phase 0: Branch Setup
    │
    ▼
Phase 1: Types + Storage ──────────────────┐
    │                                       │
    ▼                                       ▼
Phase 2: Popup UI            Phase 3: Content Script Wiring
    │                                       │
    └───────────────┬───────────────────────┘
                    │
                    ▼
             Phase 4: Claude Extractor
                    │
                    ▼
             Phase 5: Final Verification
```

## Files Changed (Implementation Order)

| # | File | Phase | Lines |
|---|------|-------|-------|
| 1 | `src/lib/types.ts` | 1.1 | +2 |
| 2 | `src/lib/storage.ts` | 1.2 | +5 |
| 3 | `test/lib/storage.test.ts` | 1.3 | +20 |
| 4 | `src/_locales/en/messages.json` | 2.1 | +8 |
| 5 | `src/_locales/ja/messages.json` | 2.1 | +6 |
| 6 | `src/popup/index.html` | 2.2 | +14 |
| 7 | `src/popup/index.ts` | 2.3 | +3 |
| 8 | `test/popup/index.test.ts` | 2.4 | +15 |
| 9 | `src/content/index.ts` | 3.1 | +4 |
| 10 | `src/content/extractors/claude.ts` | 4.1-4.3 | +20 |
| 11 | `test/fixtures/dom-helpers.ts` | 4.4 | +35 |
| 12 | `test/extractors/claude.test.ts` | 4.5 | +90 |
| | **Total** | | **~222** |

## Risk Checkpoints

| After Phase | Check | Abort If |
|-------------|-------|----------|
| 1 | `tsc --noEmit` + storage tests | Type errors in unrelated files |
| 2 | `npm run build` | Popup rendering broken |
| 4 | Full test suite | Existing 64 Claude tests regress |
| 5 | `npm run build && npm run lint && npx vitest run` | Any failure |
