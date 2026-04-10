# WF-005: Test Coverage Improvement Implementation Workflow

> **Design Reference:** DES-005 Rev.3
> **Branch:** `feature/e2e-test-system`
> **Total Test Cases:** 35 net-new across 9 files (1 create, 8 modify)
> **Constraint:** No production code changes. Test-only modifications.

---

## Phase Overview

```
Phase 1: Foundation (Step 1)           ── CREATE new test file
Phase 2: Extractors (Steps 2-4)       ── MODIFY 3 extractor test files
Phase 3: Service Worker (Step 5)      ── MODIFY background test file
Phase 4: Content Layer (Steps 6-7)    ── MODIFY markdown + ui test files
Phase 5: Libraries (Steps 8-9)        ── MODIFY 2 lib test files
Phase 6: Final Verification           ── Coverage threshold validation
```

Each step follows the cycle: **Implement → Run Tests → Verify Coverage → Commit Gate**.

---

## Pre-Implementation Checklist

- [ ] Confirm on branch `feature/e2e-test-system`
- [ ] Run `npm test` — all 514+ existing tests pass
- [ ] Run `npm run test:coverage` — record baseline numbers
- [ ] Verify no uncommitted production code changes (`git diff src/`)

```bash
git branch --show-current        # Expect: feature/e2e-test-system
npm test                          # Expect: 514+ tests pass
npm run test:coverage             # Record baseline
git diff --name-only src/         # Expect: only src/background/index.ts (staged)
```

---

## Phase 1: Foundation

### Step 1 — CREATE `test/lib/note-generator.test.ts` (7 tests)

**Source:** DES-005 Section 3.1
**Target:** `src/lib/note-generator.ts` branch 57.14% → 100%

#### 1.1 Action: Create new test file

Create `test/lib/note-generator.test.ts` with:
- Imports: `describe, it, expect` from vitest; `generateNoteContent` from source; types
- Factory: `createTestNote()` — minimal valid `ObsidianNote`
- Factory: `createTestSettings()` — all template options enabled + `userCalloutType`/`assistantCalloutType`
- 7 test cases inside `describe('generateNoteContent')` > `describe('templateOptions conditional branches')`

#### 1.2 Test cases

| # | Test Name | Covers |
|---|-----------|--------|
| 1 | omits id when includeId=false | line 22 false-branch |
| 2 | omits title when includeTitle=false | line 26 false-branch |
| 3 | omits source+url when includeSource=false | line 30 false-branch |
| 4 | omits created+modified when includeDates=false | line 35 false-branch |
| 5 | omits tags when includeTags=false | line 40 false-branch (LHS) |
| 6 | omits tags when tags array empty | line 40 compound (RHS) |
| 7 | omits message_count when includeMessageCount=false | line 47 false-branch |

#### 1.3 Verification

```bash
npx vitest run test/lib/note-generator.test.ts    # 7 tests pass
npm run test:coverage                               # note-generator.ts branch → 100%
```

#### 1.4 Checkpoint

- [ ] 7/7 new tests pass
- [ ] `note-generator.ts` branch = 100%
- [ ] No existing test regressions (514+ still pass)

---

## Phase 2: Extractors

### Step 2 — MODIFY `test/extractors/chatgpt.test.ts` (+6 tests)

**Source:** DES-005 Section 3.2
**Target:** `src/content/extractors/chatgpt.ts` stmts 81.94% → 92%+

#### 2.1 Action: Append new describe blocks

Insert after existing Security tests section. Two new `describe` blocks:
1. `extract() error paths` — 3 tests (canExtract false, Error catch, non-Error catch)
2. `extractMessages fallback selectors` — 3 tests (empty turns, user fallback, assistant fallback)

#### 2.2 Test cases

| # | Test Name | Covers |
|---|-----------|--------|
| 1 | returns error on non-chatgpt domain | lines 238-243 |
| 2 | returns error with Error.message in catch | lines 291-297 (Error) |
| 3 | returns "Unknown extraction error" for non-Error | line 295 (non-Error) |
| 4 | warns when no conversation turns found | lines 126-129 |
| 5 | user content via .whitespace-pre-wrap fallback | lines 178-181 |
| 6 | assistant content via assistantResponse fallback | lines 203-210 |

#### 2.3 Implementation notes

- Tests 2-3: Spy on `document.querySelectorAll`, throw on `data-turn-id` selector. Call `vi.restoreAllMocks()` after.
- Test 4: Use `vi.spyOn(console, 'warn')`, restore after.
- Tests 5-6: Use `loadFixture()` with carefully crafted DOM that forces fallback selectors.

#### 2.4 Verification

```bash
npx vitest run test/extractors/chatgpt.test.ts     # All tests pass
npm run test:coverage                                # chatgpt.ts stmts → 92%+
```

#### 2.5 Checkpoint

- [ ] 6 new tests pass
- [ ] `chatgpt.ts` stmts 92%+, branch 85%+
- [ ] No existing test regressions

---

### Step 3 — MODIFY `test/extractors/gemini.test.ts` (+4 tests)

**Source:** DES-005 Section 3.3
**Target:** `src/content/extractors/gemini.ts` stmts 88.02% → 93%+

#### 3.1 Action: Append new describe blocks

Three new `describe` blocks:
1. `extract() canExtract false` — 1 test
2. `extractMessagesFromRoot` — 1 test
3. `extractUserQueryContent fallback paths` — 2 tests

#### 3.2 Test cases

| # | Test Name | Covers |
|---|-----------|--------|
| 1 | returns error on non-gemini domain | lines 444-449 |
| 2 | falls back to root extraction (no container) | lines 280-322 |
| 3 | whitespace-only query-text-line fallback | lines 340-342 |
| 4 | element.textContent final fallback | line 352 |

#### 3.3 Implementation notes

- Test 2: Create DOM with `user-query` and `model-response` tags but WITHOUT `.conversation-container` wrapper.
- Test 3: All `.query-text-line` elements contain only whitespace. Assert at minimum 1 message extracted.
- Test 4: No `.query-text-line` at all — plain text inside `query-content`.

#### 3.4 Verification

```bash
npx vitest run test/extractors/gemini.test.ts      # All tests pass
npm run test:coverage                               # gemini.ts stmts → 93%+
```

#### 3.5 Checkpoint

- [ ] 4 new tests pass
- [ ] `gemini.ts` stmts 92%+, branch 85%+
- [ ] No existing test regressions

---

### Step 4 — MODIFY `test/extractors/claude.test.ts` (+8 tests)

**Source:** DES-005 Section 3.4
**Target:** `src/content/extractors/claude.ts` stmts 88.39% → 95%+

#### 4.1 Action: Append new describe blocks

Six new `describe` blocks:
1. `extract() error paths` — 2 tests
2. `extract() warning generation` — 2 tests
3. `extractMessages nested content filtering` — 1 test
4. `getTitle Deep Research routing` — 1 test
5. `getDeepResearchTitle fallback` — 1 test
6. `extractSourceList URL parse error handling` — 1 test

#### 4.2 Test cases

| # | Test Name | Covers |
|---|-----------|--------|
| 1 | returns error on non-claude domain | lines 415-420 |
| 2 | "Unknown extraction error" for non-Error throw | lines 475-481 |
| 3 | warns when no user messages found | lines 445-446 |
| 4 | warns when no assistant messages found | lines 448-450 |
| 5 | skips nested user-like elements in assistant | lines 207-210 |
| 6 | returns DR h1 title from artifact panel | lines 164-166 |
| 7 | returns default title when h1 absent | lines 181-187 |
| 8 | falls back to "unknown" domain on URL throw | lines 324-328 |

#### 4.3 Implementation notes

- Test 6: Use `createClaudeDeepResearchPage()` from dom-helpers.
- Test 7: Use `loadFixture()` with `#markdown-artifact` but no `h1`.
- Test 8: **Critical** — Use `vi.stubGlobal('URL', ...)` with extended class that throws for specific input. Call `vi.unstubAllGlobals()` after.

#### 4.4 Verification

```bash
npx vitest run test/extractors/claude.test.ts      # All tests pass
npm run test:coverage                               # claude.ts stmts → 95%+
```

#### 4.5 Checkpoint

- [ ] 8 new tests pass
- [ ] `claude.ts` stmts 95%+, branch 90%+
- [ ] No existing test regressions

---

## Phase 3: Service Worker

### Step 5 — MODIFY `test/background/index.test.ts` (+4 tests)

**Source:** DES-005 Section 3.5
**Target:** `src/background/index.ts` stmts 91.61% → 94%+

#### 5.1 Action: Append 4 new describe blocks inside outer `describe('background/index')`

Each block defines its own local `validSender` and `validNote` constants (matching existing file convention).

#### 5.2 Test cases

| # | Test Name | Covers |
|---|-----------|--------|
| 1 | scheduleOffscreenClose resets timer + closes | lines 332-345 |
| 2 | handleSaveToObsidian catches generic Error | lines 380-386 |
| 3 | handleDownloadToFile catches error | lines 447-453 |
| 4 | handleMultiOutput maps rejected promise | lines 526-535 |

#### 5.3 Implementation notes — CRITICAL

1. **Variable scoping**: Each `describe` block MUST define its own `validSender` and `validNote`. These are NOT module-level variables in the existing file.

2. **Listener pattern**: All tests use the shared `capturedListener` from `beforeEach`. Do NOT call `vi.resetModules()` in any test body.

3. **Test 1 (scheduleOffscreenClose)**:
   - Use `vi.useFakeTimers()` / `vi.useRealTimers()`
   - Send two clipboard operations, advance timers past 5000ms
   - Assert `chrome.offscreen.closeDocument` called
   - **Risk**: `chrome.offscreen.closeDocument` may not be auto-mocked. If test fails with "closeDocument is not a function", add explicit mock in the describe block.

4. **Test 2 (handleSaveToObsidian)**: Mock `mockClient.getFile` to throw synchronously.

5. **Test 3 (handleDownloadToFile)**: Mock `chrome.downloads.download` to throw synchronously (before callback).

6. **Test 4 (handleMultiOutput)**: Mock `mockClient.putFile` to reject with a string (not Error).

#### 5.4 Verification

```bash
npx vitest run test/background/index.test.ts       # All tests pass
npm run test:coverage                                # background/index.ts stmts → 94%+
```

#### 5.5 Checkpoint

- [ ] 4 new tests pass
- [ ] `background/index.ts` stmts 94%+, branch 92%+
- [ ] No existing test regressions
- [ ] `chrome.offscreen.closeDocument` mock worked (no manual setup needed)

---

## Phase 4: Content Layer

### Step 6 — MODIFY `test/content/markdown.test.ts` (+3 tests)

**Source:** DES-005 Section 3.6
**Target:** `src/content/markdown.ts` stmts 95.2% → 98%+

#### 6.1 Pre-requisite: Add `vi` to imports

Update existing import: `import { describe, it, expect, vi } from 'vitest';`

#### 6.2 Action: Insert 3 test cases into existing describe blocks

| # | Test Name | Insert Into | Covers |
|---|-----------|-------------|--------|
| 1 | source-footnote wrapper with missing source | `describe('convertInlineCitationsToFootnoteRefs')` | lines 73-74 |
| 2 | "Assistant" label for unknown source | `describe('conversationToNote')` | line 329 |
| 3 | omits References when sources empty | `describe('conversationToNote')` | line 176 |

#### 6.3 Implementation notes

- Test 1: Construct HTML with `<source-footnote>` wrapper containing `data-turn-source-index="99"`. Spy on `console.warn`.
- Test 2: Use `'unknown_platform' as 'gemini'` type cast. Add code comment explaining intentional fragility.
- Test 3: Create `ConversationData` with `type: 'deep-research'` and `links: { sources: [] }`.

#### 6.4 Verification

```bash
npx vitest run test/content/markdown.test.ts        # All tests pass
npm run test:coverage                                # markdown.ts stmts → 98%+
```

#### 6.5 Checkpoint

- [ ] 3 new tests pass
- [ ] `markdown.ts` stmts 98%+, branch 92%+
- [ ] No existing test regressions

---

### Step 7 — MODIFY `test/content/ui.test.ts` (+1 test)

**Source:** DES-005 Section 3.7
**Target:** `src/content/ui.ts` branch 79.16% → 85%+

#### 7.1 Action: Add 1 describe block

`describe('getMessage error fallback')` with 1 test.

#### 7.2 Implementation notes

- Mock `chrome.i18n.getMessage` to throw.
- Call `injectSyncButton(() => {})`.
- Assert button created with `id='g2o-sync-button'`.
- Assert `.text` span content is raw key `'ui_syncButton'`.

#### 7.3 Verification

```bash
npx vitest run test/content/ui.test.ts              # All tests pass
npm run test:coverage                                # ui.ts branch → 85%+
```

#### 7.4 Checkpoint

- [ ] 1 new test passes
- [ ] `ui.ts` branch 85%+
- [ ] No existing test regressions

---

## Phase 5: Libraries

### Step 8 — MODIFY `test/lib/obsidian-api.test.ts` (+1 test)

**Source:** DES-005 Section 3.8
**Target:** `src/lib/obsidian-api.ts` branch 97.56% → 100%

#### 8.1 Pre-requisite: Update import

Add `classifyNetworkError` to the import statement.

#### 8.2 Action: Add 1 describe block

`describe('classifyNetworkError')` with 1 test.

#### 8.3 Implementation notes

- Create `new DOMException('The operation was aborted', 'AbortError')`.
- Call `classifyNetworkError(abortError)`.
- Assert returns `'abort'`.

#### 8.4 Verification

```bash
npx vitest run test/lib/obsidian-api.test.ts        # All tests pass
npm run test:coverage                                # obsidian-api.ts branch → 100%
```

#### 8.5 Checkpoint

- [ ] 1 new test passes
- [ ] `obsidian-api.ts` branch 100%
- [ ] No existing test regressions

---

### Step 9 — MODIFY `test/lib/storage.test.ts` (+1 test)

**Source:** DES-005 Section 3.9
**Target:** `src/lib/storage.ts` branch 96.42% → 100%

#### 9.1 Action: Insert 1 test into existing `describe('saveSettings')`

#### 9.2 Implementation notes

- Mock `chrome.storage.sync.get` to return existing `outputOptions`.
- Call `saveSettings({ outputOptions: { file: true } as never })`.
- Assert merged result: `file=true` (new) + `obsidian=true` (existing).

#### 9.3 Verification

```bash
npx vitest run test/lib/storage.test.ts             # All tests pass
npm run test:coverage                                # storage.ts branch → 100%
```

#### 9.4 Checkpoint

- [ ] 1 new test passes
- [ ] `storage.ts` branch 100%
- [ ] No existing test regressions

---

## Phase 6: Final Verification

### Step 10 — Full Suite Validation

```bash
npm test                    # ALL tests pass (549+ expected)
npm run test:coverage       # Coverage exceeds all targets
npm run lint                # No lint errors
```

#### 10.1 Expected Final Coverage

| Metric | Before | Target | Expected |
|--------|--------|--------|----------|
| Statements | 92.87% | 95%+ | 95%+ |
| Branches | 83.63% | 90%+ | 90%+ |
| Functions | 94.79% | 96%+ | 96%+ |
| Lines | 93.42% | 95%+ | 95%+ |

#### 10.2 Final Checklist

- [ ] All 549+ tests pass (514 existing + 35 new)
- [ ] Statement coverage >= 95%
- [ ] Branch coverage >= 90%
- [ ] Function coverage >= 96%
- [ ] Line coverage >= 95%
- [ ] `npm run lint` passes
- [ ] No production source files modified
- [ ] No test infrastructure files (setup.ts, mocks/, fixtures/) modified

---

## Dependency Graph

```
Step 1 (note-generator)          ← Independent, no dependencies
   │
   ├── Step 2 (chatgpt)         ← Independent of Step 1
   │
   ├── Step 3 (gemini)          ← Independent of Steps 1-2
   │
   ├── Step 4 (claude)          ← Independent of Steps 1-3
   │
   ├── Step 5 (background)      ← Independent of Steps 1-4
   │
   ├── Step 6 (markdown)        ← Independent of Steps 1-5
   │
   ├── Step 7 (ui)              ← Independent of Steps 1-6
   │
   ├── Step 8 (obsidian-api)    ← Independent of Steps 1-7
   │
   └── Step 9 (storage)         ← Independent of Steps 1-8
         │
         └── Step 10 (final)    ← Depends on ALL Steps 1-9
```

> All Steps 1-9 are independent. Sequential execution is recommended to catch regressions early, but parallelization is safe if needed.

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| `chrome.offscreen.closeDocument` not auto-mocked | Step 5 test 1 fails | Add explicit `vi.fn()` mock in describe block |
| DOM fixture doesn't trigger fallback selector | Steps 2-4 tests pass but coverage unchanged | Verify coverage diff after each step; adjust fixture DOM structure |
| `vi.stubGlobal('URL')` leaks to subsequent tests | Step 4 test 8 breaks other tests | Call `vi.unstubAllGlobals()` in test and also in `afterEach` safety net |
| `vi.useFakeTimers()` interferes with async operations | Step 5 test 1 hangs | Use `vi.advanceTimersByTimeAsync()` (async-compatible); restore with `vi.useRealTimers()` |
| Background `capturedListener` becomes stale | Step 5 tests all fail | Verify all describe blocks are INSIDE outer `describe('background/index')` where `beforeEach` runs |
| TypeScript strict mode rejects factory types | Step 1 compile error | Include all required `TemplateOptions` fields (userCalloutType, assistantCalloutType) |

---

## Execution Command Summary

```bash
# Per-step validation (replace STEP_FILE with actual path)
npx vitest run STEP_FILE && npm run test:coverage

# Step 1
npx vitest run test/lib/note-generator.test.ts && npm run test:coverage

# Step 2
npx vitest run test/extractors/chatgpt.test.ts && npm run test:coverage

# Step 3
npx vitest run test/extractors/gemini.test.ts && npm run test:coverage

# Step 4
npx vitest run test/extractors/claude.test.ts && npm run test:coverage

# Step 5
npx vitest run test/background/index.test.ts && npm run test:coverage

# Step 6
npx vitest run test/content/markdown.test.ts && npm run test:coverage

# Step 7
npx vitest run test/content/ui.test.ts && npm run test:coverage

# Step 8
npx vitest run test/lib/obsidian-api.test.ts && npm run test:coverage

# Step 9
npx vitest run test/lib/storage.test.ts && npm run test:coverage

# Step 10 — Final
npm test && npm run test:coverage && npm run lint
```
