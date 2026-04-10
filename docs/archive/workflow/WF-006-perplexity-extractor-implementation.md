# WF-006: Perplexity Extractor Implementation Workflow

**Status**: Pending
**Requirements**: `docs/requirements/REQ-perplexity-extractor.md`
**Design**: `docs/design/DES-004-perplexity-extractor.md`
**Precedent Workflow**: `docs/workflow/WF-003-chatgpt-extractor-implementation.md`

---

## Workflow Summary

| Property | Value |
|---|---|
| Total Phases | 4 |
| Total Steps | 10 |
| New Files | 3 (`perplexity.ts`, `perplexity.test.ts`, `perplexity.e2e.test.ts`) |
| Modified Files | 5 (`content/index.ts`, `background/index.ts`, `manifest.json`, `dom-helpers.ts`, `e2e/helpers.ts`) |
| Renamed Dirs | 1 (`test/fixtures/html/perplxity/` → `test/fixtures/html/perplexity/`) |
| Files Unchanged | 3 (`types.ts`, `sanitize.ts`, `markdown.ts`) — verified no changes needed |

---

## Phase 1: Foundation (Steps 1–2)

> Prepare the file system and test infrastructure before writing any extractor code.

### Step 1: Rename Fixture Directory

**Action**: Rename `test/fixtures/html/perplxity/` → `test/fixtures/html/perplexity/`

**Files**:
- `test/fixtures/html/perplxity/` → `test/fixtures/html/perplexity/`

**Command**:
```bash
git mv test/fixtures/html/perplxity test/fixtures/html/perplexity
```

**Validation**:
- [ ] Directory `test/fixtures/html/perplexity/` exists
- [ ] Files `chat-simple.html` and `deep-research.html` present
- [ ] No remaining `perplxity` references in codebase (`grep -r perplxity .`)

**Depends on**: Nothing
**Blocks**: Steps 7, 8, 9

---

### Step 2: Add Perplexity DOM Helpers

**Action**: Append Perplexity helper functions to `test/fixtures/dom-helpers.ts`

**File**: `test/fixtures/dom-helpers.ts`

**Functions to add** (following ChatGPT helper pattern at lines 575–742):

1. **`PerplexityConversationMessage` interface**
   - `role: 'user' | 'assistant'`
   - `content: string`

2. **`createPerplexityConversationDOM(messages): string`**
   - Creates minimal DOM matching observed Perplexity structure
   - User queries: `div[class*="group/query"] > div.bg-offset.rounded-2xl > span.select-text`
   - Assistant responses: `div[id="markdown-content-{N}"] > div.prose.dark:prose-invert`
   - Index `N` is 0-based, sequential

3. **`setPerplexityLocation(slug: string): void`**
   - Sets `window.location` for Perplexity URL
   - `hostname: 'www.perplexity.ai'`
   - `pathname: /search/${slug}`
   - `origin: 'https://www.perplexity.ai'`

4. **`setNonPerplexityLocation(hostname: string, pathname?: string): void`**
   - For security testing (subdomain attack prevention)

5. **`createPerplexityInlineCitation(url: string, displayText: string): string`**
   - Creates `<span class="citation inline" data-pplx-citation-url="..."><a href="...">...</a></span>`

6. **`createPerplexityPage(slug: string, messages): void`**
   - Combines `setPerplexityLocation` + `loadFixture`

**Reference pattern**: `createChatGPTConversationDOM` at `dom-helpers.ts:592`
**Reference pattern**: `setChatGPTLocation` at `dom-helpers.ts:650`

**Validation**:
- [ ] TypeScript compiles without errors
- [ ] Functions exported and accessible from test files

**Depends on**: Nothing
**Blocks**: Steps 8, 9

---

## Phase 2: Core Implementation (Steps 3–5)

> Create the extractor and integrate it into the extension pipeline.

### Step 3: Create PerplexityExtractor

**Action**: Create new file `src/content/extractors/perplexity.ts`

**Design reference**: `DES-004 Section 4`

**Structure** (following `chatgpt.ts` at 299 lines):

```
src/content/extractors/perplexity.ts
├── Imports: BaseExtractor, extractErrorMessage, sanitizeHtml, types, constants
├── SELECTORS constant (DES-004 Section 4.1)
│   ├── userQuery: ['span.select-text', 'div.bg-offset.rounded-2xl span.select-text']
│   ├── markdownContent: ['div[id^="markdown-content-"]', '.prose.dark\\:prose-invert']
│   └── proseContent: ['.prose.dark\\:prose-invert', '.prose']
├── class PerplexityExtractor extends BaseExtractor
│   ├── readonly platform = 'perplexity' as const
│   ├── canExtract(): boolean
│   │   └── window.location.hostname === 'www.perplexity.ai'
│   ├── getConversationId(): string | null
│   │   └── pathname.match(/\/search\/(.+)$/) → full slug
│   ├── getTitle(): string
│   │   └── First span.select-text → sanitize → truncate(100)
│   │   └── Fallback: 'Untitled Perplexity Conversation'
│   ├── extractMessages(): ConversationMessage[]
│   │   ├── Collect all span.select-text → user queries
│   │   ├── Collect all div[id^="markdown-content-"] → responses
│   │   ├── Pair by sequential index
│   │   ├── User: textContent → sanitizeText()
│   │   └── Assistant: .prose innerHTML → sanitizeHtml()
│   ├── private extractUserContent(queryElement): string
│   ├── private extractAssistantContent(contentElement): string
│   └── async extract(): Promise<ExtractionResult>
│       ├── canExtract() guard
│       ├── extractMessages()
│       ├── Validate counts, build warnings
│       ├── getConversationId() || `perplexity-${Date.now()}`
│       ├── getTitle()
│       └── Return ExtractionResult { source: 'perplexity' }
```

**Key implementation details**:

- **Turn pairing**: `span.select-text` elements are collected document-wide. `div[id^="markdown-content-"]` elements provide 0-indexed IDs. Pair `queries[i]` with `responses[i]`.
- **Assistant content extraction**: For each `div[id^="markdown-content-"]`, find the `.prose` child element and extract its `innerHTML`. Pass through `sanitizeHtml()`.
- **Citation handling**: No special processing. `<a href>` tags inside citation spans survive DOMPurify and get converted to Markdown links by Turndown.

**Validation**:
- [ ] `npm run build` succeeds (TypeScript compiles)
- [ ] Class extends `BaseExtractor` correctly
- [ ] All abstract methods implemented

**Depends on**: Nothing (standalone file)
**Blocks**: Step 6

---

### Step 4: Update Manifest

**Action**: Modify `src/manifest.json`

**Changes**:

1. Add to `host_permissions` array (after `"https://chatgpt.com/*"`):
   ```json
   "https://www.perplexity.ai/*"
   ```

2. Add to `content_scripts[0].matches` array (after `"https://chatgpt.com/*"`):
   ```json
   "https://www.perplexity.ai/*"
   ```

**Reference**: Current `manifest.json` lines 21–25 (host_permissions), lines 36–39 (content_scripts.matches)

**Validation**:
- [ ] JSON syntax valid
- [ ] `npm run build` succeeds
- [ ] 4 entries in host_permissions (excluding localhost)
- [ ] 4 entries in content_scripts.matches

**Depends on**: Nothing
**Blocks**: Nothing (but required for runtime)

---

### Step 5: Update Background Worker

**Action**: Modify `src/background/index.ts`

**Change**: Add `'https://www.perplexity.ai'` to `ALLOWED_ORIGINS` (line 35–39):

```typescript
const ALLOWED_ORIGINS = [
  'https://gemini.google.com',
  'https://claude.ai',
  'https://chatgpt.com',
  'https://www.perplexity.ai',
] as const;
```

**Verified NO CHANGE needed**:
- `validateNoteData()` at line 140: already includes `'perplexity'` in source validation list

**Validation**:
- [ ] `npm run build` succeeds
- [ ] Array has 4 entries
- [ ] Origin matches `www.perplexity.ai` (with `www`)

**Depends on**: Nothing
**Blocks**: Nothing (but required for runtime)

---

## Phase 3: Routing Integration (Step 6)

> Wire the extractor into the content script pipeline.

### Step 6: Update Content Script Router

**Action**: Modify `src/content/index.ts`

**Changes**:

1. **Add import** (after line 8):
   ```typescript
   import { PerplexityExtractor } from './extractors/perplexity';
   ```

2. **Add routing** in `getExtractor()` (after line 133, before `return null`):
   ```typescript
   if (hostname === 'www.perplexity.ai') {
     return new PerplexityExtractor();
   }
   ```

3. **Update container wait selectors** in `waitForConversationContainer()` (lines 65–66, 78–79):
   - Current: `'.conversation-container, [class*="conversation"], article[data-turn-id]'`
   - Updated: `'.conversation-container, [class*="conversation"], article[data-turn-id], div[class*="threadContentWidth"]'`
   - Apply to both `document.querySelector` calls (lines 65 and 78)

**Reference**: `getExtractor()` at `content/index.ts:122–137`
**Reference**: `waitForConversationContainer()` at `content/index.ts:61–114`

**Validation**:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Import resolves correctly

**Depends on**: Step 3 (perplexity.ts must exist)
**Blocks**: Steps 8, 9

---

## Phase 4: Testing (Steps 7–10)

> Create tests and validate the full pipeline.

### Step 7: Update E2E Helper

**Action**: Modify `test/extractors/e2e/helpers.ts`

**Changes** (6 locations):

1. **Add import** (line 18):
   ```typescript
   import { setPerplexityLocation } from '../../fixtures/dom-helpers';
   ```
   ```typescript
   import { PerplexityExtractor } from '../../../src/content/extractors/perplexity';
   ```

2. **Update `loadFixtureFile()` platform type** (line 119):
   ```typescript
   platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity',
   ```

3. **Update `setLocationForPlatform()` switch** (lines 142–157):
   Add case:
   ```typescript
   case 'perplexity':
     setPerplexityLocation(conversationId);
     break;
   ```

4. **Update `createExtractor()` switch** (lines 162–171):
   Add case:
   ```typescript
   case 'perplexity':
     return new PerplexityExtractor();
   ```

5. **Update `runE2EPipeline()` platform type** (line 185):
   ```typescript
   platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity',
   ```

6. **Update `assertSourcePlatform()` expected type** (line 263):
   ```typescript
   expected: 'gemini' | 'claude' | 'chatgpt' | 'perplexity'
   ```

7. **Update `assertCalloutFormat()` platform type** (line 343):
   ```typescript
   _platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity'
   ```

**Validation**:
- [ ] TypeScript compiles
- [ ] Existing E2E tests still pass: `npx vitest run test/extractors/e2e/`

**Depends on**: Steps 1, 3 (fixture renamed, extractor exists)
**Blocks**: Step 9

---

### Step 8: Create Unit Tests

**Action**: Create new file `test/extractors/perplexity.test.ts`

**Test structure** (following `claude.test.ts` pattern):

```
test/extractors/perplexity.test.ts
├── describe('PerplexityExtractor')
│   ├── describe('Platform Detection')
│   │   ├── it('canExtract() returns true on www.perplexity.ai')
│   │   ├── it('canExtract() returns false on perplexity.ai (no www)')
│   │   ├── it('canExtract() returns false on evil.www.perplexity.ai.attacker.com')
│   │   └── it('canExtract() returns false on other domains')
│   │
│   ├── describe('URL Extraction')
│   │   ├── it('getConversationId() extracts slug from /search/{slug}')
│   │   ├── it('getConversationId() handles URL-encoded characters')
│   │   ├── it('getConversationId() returns null for non-search paths')
│   │   └── it('getConversationId() returns null for root path')
│   │
│   ├── describe('Title Extraction')
│   │   ├── it('getTitle() returns first user query text')
│   │   ├── it('getTitle() truncates long titles')
│   │   └── it('getTitle() returns default when no queries found')
│   │
│   ├── describe('Message Extraction')
│   │   ├── it('extractMessages() extracts paired user/assistant messages')
│   │   ├── it('extractMessages() handles multi-turn conversations')
│   │   ├── it('extractMessages() returns empty array when no content')
│   │   ├── it('extractMessages() preserves HTML for assistant messages')
│   │   └── it('extractMessages() handles query without response (pending)')
│   │
│   └── describe('Full Extraction')
│       ├── it('extract() returns success with valid data')
│       ├── it('extract() sets source to perplexity')
│       ├── it('extract() returns failure when not on Perplexity page')
│       └── it('extract() handles empty conversation')
```

**Test helpers used**:
- `setPerplexityLocation()` from `dom-helpers.ts`
- `setNonPerplexityLocation()` from `dom-helpers.ts`
- `createPerplexityConversationDOM()` from `dom-helpers.ts`
- `createPerplexityPage()` from `dom-helpers.ts`
- `loadFixture()`, `clearFixture()`, `resetLocation()` from `dom-helpers.ts`

**Validation**:
- [ ] `npx vitest run test/extractors/perplexity.test.ts` — all tests pass
- [ ] Minimum 14 test cases

**Depends on**: Steps 2, 3 (DOM helpers + extractor)
**Blocks**: Step 10

---

### Step 9: Create E2E Tests

**Action**: Create new file `test/extractors/e2e/perplexity.e2e.test.ts`

**Test structure** (following `chatgpt.e2e.test.ts` pattern):

```
test/extractors/e2e/perplexity.e2e.test.ts
├── describe('Perplexity E2E Extraction')
│   ├── beforeEach: clearFixture()
│   ├── afterEach: clearFixture() + resetLocation()
│   │
│   ├── describe('Chat - Simple Conversation')
│   │   ├── FIXTURE = 'chat-simple'
│   │   ├── CONVERSATION_ID = 'e2e-perplexity-chat-001'
│   │   ├── it('should extract conversation with valid structure')
│   │   │   ├── assertExtractionSuccess
│   │   │   ├── assertSourcePlatform(data, 'perplexity')
│   │   │   ├── assertMessageStructure(data, { minCount: 2 })
│   │   │   ├── assertFrontmatterFields(note)
│   │   │   └── assertCalloutFormat(markdown, 'perplexity')
│   │   └── it('should generate correct markdown output')
│   │       └── expect(result.finalMarkdown).toMatchSnapshot()
│   │
│   └── describe('Deep Research')
│       ├── FIXTURE = 'deep-research'
│       ├── CONVERSATION_ID = 'e2e-perplexity-dr-001'
│       ├── it('should extract deep research as normal conversation')
│       │   ├── assertExtractionSuccess
│       │   ├── assertSourcePlatform(data, 'perplexity')
│       │   ├── expect(data.type).not.toBe('deep-research')
│       │   └── assertMessageStructure(data, { minCount: 1 })
│       └── it('should generate correct markdown output')
│           └── expect(result.finalMarkdown).toMatchSnapshot()
```

**Note on E2E helper `setLocationForPlatform`**: The Perplexity slug-based ID format differs from UUID-based IDs of other platforms. The `conversationId` parameter will be used as-is for the URL slug in `setPerplexityLocation()`.

**Validation**:
- [ ] `npx vitest run test/extractors/e2e/perplexity.e2e.test.ts` — all tests pass
- [ ] Snapshots generated and reviewed
- [ ] Minimum 4 test cases

**Depends on**: Steps 1, 2, 3, 7 (fixture renamed, DOM helpers, extractor, E2E helper updated)
**Blocks**: Step 10

---

### Step 10: Final Validation

**Action**: Run full test suite and build validation

**Commands** (sequential):

```bash
# 1. Format
npm run format

# 2. Lint
npm run lint

# 3. TypeScript check + production build
npm run build

# 4. Full test suite (includes existing + new tests)
npx vitest run

# 5. Verify no regressions in existing extractors
npx vitest run test/extractors/e2e/gemini.e2e.test.ts
npx vitest run test/extractors/e2e/claude.e2e.test.ts
npx vitest run test/extractors/e2e/chatgpt.e2e.test.ts

# 6. Verify new tests pass
npx vitest run test/extractors/perplexity.test.ts
npx vitest run test/extractors/e2e/perplexity.e2e.test.ts

# 7. Verify no perplxity typo remains
grep -r "perplxity" . --include="*.ts" --include="*.json" --include="*.md"
```

**Acceptance criteria checklist** (from REQ Section 9):
- [ ] Extension activates on `www.perplexity.ai` pages (verified by unit test)
- [ ] Simple chat: All user queries and assistant responses extracted (verified by E2E)
- [ ] Deep Research: Full report content extracted (verified by E2E)
- [ ] Inline citations preserved in Markdown output (verified by snapshot)
- [ ] YAML frontmatter includes `source: perplexity` (verified by E2E)
- [ ] Output matches Obsidian callout format (verified by E2E)
- [ ] Unit tests pass (verified by vitest)
- [ ] E2E tests pass (verified by vitest)
- [ ] No regressions in existing extractors (verified by existing E2E tests)
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

**Depends on**: Steps 1–9 (all)
**Blocks**: Nothing (final step)

---

## Dependency Graph

```
Phase 1: Foundation
  Step 1 (rename fixture) ─────────────────────┐
  Step 2 (DOM helpers)    ──────────────────┐   │
                                            │   │
Phase 2: Core Implementation                │   │
  Step 3 (perplexity.ts)  ──────────┐      │   │
  Step 4 (manifest.json)  ──[independent]   │   │
  Step 5 (background.ts)  ──[independent]   │   │
                                    │      │   │
Phase 3: Routing                    │      │   │
  Step 6 (content/index.ts) ◄───────┘      │   │
                                    │      │   │
Phase 4: Testing                    │      │   │
  Step 7 (e2e/helpers.ts)  ◄────────┼──────┼───┘
  Step 8 (unit tests)      ◄────────┼──────┘
  Step 9 (e2e tests)       ◄────────┴──────────┐
                                               │
  Step 10 (final validation) ◄─────────────────┘
```

**Parallelizable groups**:
- Steps 1 + 2 (can run in parallel)
- Steps 3 + 4 + 5 (can run in parallel)
- Steps 7 + 8 (can run in parallel after dependencies met)

---

## Execution Checkpoints

| After Phase | Checkpoint | Command |
|---|---|---|
| Phase 1 | Fixtures renamed, DOM helpers compile | `npm run build` |
| Phase 2 | Extractor + manifest + background all compile | `npm run build` |
| Phase 3 | Full pipeline compiles, format + lint clean | `npm run format && npm run lint && npm run build` |
| Phase 4 | All tests pass, no regressions | `npm run format && npm run lint && npm run build && npx vitest run` |

---

## Files Changed Summary

### New Files (3)
| File | Phase | Step |
|---|---|---|
| `src/content/extractors/perplexity.ts` | 2 | 3 |
| `test/extractors/perplexity.test.ts` | 4 | 8 |
| `test/extractors/e2e/perplexity.e2e.test.ts` | 4 | 9 |

### Modified Files (5)
| File | Phase | Step | Lines Changed (est.) |
|---|---|---|---|
| `src/manifest.json` | 2 | 4 | +2 |
| `src/background/index.ts` | 2 | 5 | +1 |
| `src/content/index.ts` | 3 | 6 | +5 |
| `test/fixtures/dom-helpers.ts` | 1 | 2 | +120 |
| `test/extractors/e2e/helpers.ts` | 4 | 7 | +15 |

### Renamed (1)
| From | To | Step |
|---|---|---|
| `test/fixtures/html/perplxity/` | `test/fixtures/html/perplexity/` | 1 |

### Verified Unchanged (3)
| File | Reason |
|---|---|
| `src/lib/types.ts` | `'perplexity'` already in unions (line 30, 256) |
| `src/lib/sanitize.ts` | `<a href>` survives DOMPurify; `data-pplx-*` not needed |
| `src/content/markdown.ts` | `getAssistantLabel('perplexity')` already returns `'Perplexity'` (line 327) |
