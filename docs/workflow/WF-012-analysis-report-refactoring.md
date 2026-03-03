# WF-012: Analysis Report Refactoring Implementation Workflow

> Design: [DES-012](../design/DES-012-analysis-report-refactoring.md)
> Source: [Analysis Report](../analysis-report.md)
> Date: 2026-03-03
> Baseline: 742 tests passing, 0 lint errors

## Phase Overview

```
Phase 1: Setup
(branch, baseline)
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
Phase 2: markdown.ts Split          Phase 3: Scroll Manager
(rules → deep-research →            (scroll-manager.ts → gemini.ts)
 formatting → barrel)                     │
       │                                  │
       ├──────────────────────────────────┘
       ▼
Phase 4: Minor Fixes
(chatgpt.ts param rename)
       │
       ▼
Phase 5: Documentation
(ADR-003)
       │
       ▼
Phase 6: Verification & PR
(build, lint, test, format)
```

**Estimated scope:** ~540 lines moved/created, 5 new files, 3 modified files, 0 test changes

---

## Phase 1: Setup

### Step 1.1: Create feature branch

```bash
git checkout main
git pull
git checkout -b refactor/analysis-report-recommendations
```

### Step 1.2: Verify baseline

```bash
npm run build       # Clean build
npm run lint        # 0 errors, 0 warnings
npx vitest run      # 742+ tests passing
```

**Checkpoint:** All green before any changes

---

## Phase 2: Split `markdown.ts` into 4 Modules

> Phases 2 and 3 are independent and can be parallelized.

### Step 2.1: Create `src/content/markdown-rules.ts` (leaf module)

**Create new file** with contents moved from `markdown.ts`:

1. **Module header** — JSDoc describing responsibility (Turndown HTML→Markdown engine)
2. **Import:** `TurndownService` from `'turndown'` (only external dependency)
3. **Move `escapeAngleBracketsInLine()`** — private function (current lines 46–71)
4. **Move `escapeAngleBrackets()`** — exported function (current lines 80–98)
5. **Move Turndown instance** — `const turndown = new TurndownService({...})` (current lines 258–264)
6. **Move all 6 Turndown rules** in order:
   - `codeBlocks` (lines 267–283)
   - `inlineCode` (lines 286–293)
   - `footnoteRef` (lines 297–305)
   - `mathBlock` (lines 308–317)
   - `mathInline` (lines 320–333)
   - `tables` (lines 336–380)
7. **Move `htmlToMarkdown()`** — exported function (current lines 385–390)

**Exports:** `escapeAngleBrackets`, `htmlToMarkdown`

**Checkpoint:** File compiles independently (`tsc --noEmit` on save)

### Step 2.2: Create `src/content/markdown-deep-research.ts`

**Create new file** with contents moved from `markdown.ts`:

1. **Module header** — JSDoc describing the citation→footnote pipeline
2. **Imports:**
   ```typescript
   import { htmlToMarkdown } from './markdown-rules';
   import { buildSourceMap } from '../lib/source-map';
   import type { DeepResearchLinks, DeepResearchSource } from '../lib/types';
   ```
3. **Move regex constants:**
   - `CITATION_PATTERN_WRAPPED` (line 27–28)
   - `CITATION_PATTERN_STANDALONE` (line 31–32)
4. **Move private functions in order:**
   - `escapeMarkdownLink()` (line 38–40)
   - `sanitizeUrl()` (lines 103–114)
   - `createCitationReplacer()` (lines 120–135)
   - `convertInlineCitationsToFootnoteRefs()` (lines 152–167)
   - `generateReferencesSection()` (lines 182–204)
   - `removeSourcesCarousel()` (lines 209–211)
5. **Move `convertDeepResearchContent()`** — exported function (lines 227–251)

**Exports:** `convertDeepResearchContent`

**Checkpoint:** File compiles. No circular dependency with markdown-rules.ts.

### Step 2.3: Create `src/content/markdown-formatting.ts`

**Create new file** with contents moved from `markdown.ts`:

1. **Module header** — JSDoc describing message formatting responsibility
2. **Imports:**
   ```typescript
   import { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
   import { PLATFORM_LABELS } from '../lib/constants';
   import type { TemplateOptions } from '../lib/types';
   ```
3. **Move functions:**
   - `getAssistantLabel()` — private (lines 416–418)
   - `formatMessage()` — exported (lines 423–457)
   - `formatToolContent()` — exported (lines 468–500)

**Exports:** `formatMessage`, `formatToolContent`

**Checkpoint:** File compiles. Imports only from markdown-rules.ts (no cycle).

### Step 2.4: Reduce `src/content/markdown.ts` to barrel + orchestrator

**Replace entire file** with:

1. **Module header** — JSDoc listing internal modules
2. **Re-exports** (preserve existing import paths):
   ```typescript
   export { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
   export { convertDeepResearchContent } from './markdown-deep-research';
   ```
3. **Own imports:**
   ```typescript
   import { formatMessage, formatToolContent } from './markdown-formatting';
   import { convertDeepResearchContent } from './markdown-deep-research';
   import { generateHash } from '../lib/hash';
   import { MAX_FILENAME_BASE_LENGTH, FILENAME_ID_SUFFIX_LENGTH } from '../lib/constants';
   import type { ConversationData, ObsidianNote, NoteFrontmatter, TemplateOptions } from '../lib/types';
   ```
4. **Keep functions** (not moved):
   - `generateFileName()` (lines 395–404)
   - `generateContentHash()` (lines 409–411)
   - `conversationToNote()` (lines 505–560) — calls `formatMessage`, `formatToolContent`, `convertDeepResearchContent`

**Critical:** Remove the `TurndownService` import and all moved functions. The file should be ~100 lines.

### Step 2.5: Verify markdown split

```bash
npm run build       # No errors, no circular dependency warnings
npx vitest run test/content/markdown.test.ts   # All 67+ tests pass
```

**Checkpoint:** All markdown tests pass unchanged through barrel re-export.

---

## Phase 3: Extract Scroll Manager

### Step 3.1: Create `src/lib/scroll-manager.ts`

**Create new file** with contents moved from `gemini.ts`:

1. **Imports:**
   ```typescript
   import {
     SCROLL_POLL_INTERVAL,
     SCROLL_TIMEOUT,
     SCROLL_STABILITY_THRESHOLD,
     SCROLL_REARM_DELAY,
   } from './constants';
   ```
2. **Move `ScrollResult` interface** (gemini.ts lines 122–131) — exported
3. **Add private helpers:**
   - `delay(ms)` — moved from gemini.ts line 321–323
   - `countElements(selector)` — adapted from gemini.ts `countConversationElements()` (lines 314–316), now takes selector parameter
4. **Add exported function:**
   - `ensureAllElementsLoaded(container, elementSelector)` — moved from gemini.ts `ensureAllMessagesLoaded()` (lines 336–414), adapted:
     - Remove container lookup (caller passes it in)
     - Remove "no container" early return (caller handles this)
     - Replace `this.countConversationElements()` with `countElements(elementSelector)`
     - Replace `this.delay()` with `delay()`
     - Keep all `console.info/debug/warn` log lines unchanged

**Exports:** `ScrollResult` (interface), `ensureAllElementsLoaded` (function)

### Step 3.2: Update `src/content/extractors/gemini.ts`

1. **Add import:**
   ```typescript
   import { ensureAllElementsLoaded, type ScrollResult } from '../../lib/scroll-manager';
   ```
2. **Remove from imports:** `SCROLL_POLL_INTERVAL`, `SCROLL_STABILITY_THRESHOLD`, `SCROLL_REARM_DELAY`
   - **Keep** `SCROLL_TIMEOUT` (still used in `onAfterExtract` warning message at line 183)
3. **Remove:**
   - `ScrollResult` interface (lines 122–131)
   - `countConversationElements()` method (lines 314–316)
   - `delay()` method (lines 321–323)
   - `ensureAllMessagesLoaded()` method (lines 336–414)
4. **Replace `onBeforeExtract()`** with new version:
   ```typescript
   protected async onBeforeExtract(): Promise<void> {
     if (!this.enableAutoScroll) {
       this.lastScrollResult = {
         fullyLoaded: true, elementCount: 0, scrollIterations: 0, skipped: true,
       };
       return;
     }

     const container = this.queryWithFallback<HTMLElement>(SELECTORS.scrollContainer);
     if (!container) {
       console.info('[G2O] No scroll container found, skipping auto-scroll');
       this.lastScrollResult = {
         fullyLoaded: true, elementCount: 0, scrollIterations: 0, skipped: true,
       };
       return;
     }

     this.lastScrollResult = await ensureAllElementsLoaded(
       container,
       COMPUTED_SELECTORS.conversationTurn
     );
   }
   ```

### Step 3.3: Verify scroll extraction

```bash
npm run build
npx vitest run test/extractors/gemini.test.ts   # All 69 tests pass (including 8 auto-scroll tests)
```

**Checkpoint:** All gemini tests pass. Scroll behavior unchanged.

---

## Phase 4: Minor Fixes

### Step 4.1: Fix parameter naming in `chatgpt.ts`

**File:** `src/content/extractors/chatgpt.ts:214–215`

Change `(_, url)` to `(_match, url)` in both `.replace()` callbacks:

```typescript
// Line 214
.replace(/href="([^"]+)\?utm_source=chatgpt\.com"/g, (_match, url) => `href="${url}"`)
// Line 215
.replace(/href="([^"]+)&utm_source=chatgpt\.com"/g, (_match, url) => `href="${url}"`)
```

### Step 4.2: Verify

```bash
npm run lint        # 0 errors
npx vitest run test/extractors/chatgpt.test.ts   # All tests pass
```

---

## Phase 5: Documentation

### Step 5.1: Create ADR-003

**File:** `docs/adr/003-markdown-module-split.md`

```markdown
# ADR-003: Markdown Module Split

## Status
Accepted

## Context
`src/content/markdown.ts` grew to 560 lines with 4 distinct concerns:
Turndown rules, citation processing, message formatting, and note orchestration.
Modifying one concern required navigating the entire file.

## Decision
Split into 3 focused modules + barrel re-export:
- `markdown-rules.ts` — Turndown engine (leaf, no internal deps)
- `markdown-deep-research.ts` — Citation → footnote pipeline
- `markdown-formatting.ts` — Message formatting templates
- `markdown.ts` — Barrel re-exports + `conversationToNote` orchestrator

## Key Constraint
Barrel preserves all existing import paths. Zero consumer or test file changes.

## Dependency Graph
markdown-rules.ts (leaf) ← markdown-deep-research.ts, markdown-formatting.ts ← markdown.ts (barrel)

## Alternatives Rejected
- **Direct imports from sub-modules**: Breaks 4 consumers, requires updating all test imports
- **Region-based organization (status quo)**: Doesn't improve cognitive load or testability
```

---

## Phase 6: Verification & PR

### Step 6.1: Full verification

```bash
npm run build       # TypeScript — no errors
npm run lint        # ESLint — 0 errors, 0 warnings
npm run format      # Prettier — all clean
npx vitest run      # All 742+ tests pass
```

### Step 6.2: Verify no circular dependencies

Check Vite build output for any circular dependency warnings. Expected: none.

### Step 6.3: Review diff

```bash
git diff --stat
```

Expected:
- 5 new files (3 markdown modules + scroll-manager + ADR)
- 3 modified files (markdown.ts barrel, gemini.ts, chatgpt.ts)
- 0 test files changed

### Step 6.4: Commit and PR

Follow conventional commit format. Suggested commit message:

```
refactor: split markdown.ts into focused modules and extract scroll manager

- Split 560-line markdown.ts into 4 modules with barrel re-export
  (markdown-rules, markdown-deep-research, markdown-formatting)
- Extract auto-scroll logic from gemini.ts to scroll-manager.ts
- Fix parameter naming in chatgpt.ts (_match convention)
- Add ADR-003 documenting the module split decision

Based on analysis report recommendations (DES-012).
Zero consumer or test file changes.
```

---

## Dependency Map

```
Step 1.1 ──► Step 1.2 ──┬──► Step 2.1 ──► Step 2.2 ──► Step 2.3 ──► Step 2.4 ──► Step 2.5
                         │
                         ├──► Step 3.1 ──► Step 3.2 ──► Step 3.3
                         │
                         └──► Step 4.1 ──► Step 4.2
                                                              │
                         ┌────────────────────────────────────┘
                         ▼
                    Step 5.1 ──► Step 6.1 ──► Step 6.2 ──► Step 6.3 ──► Step 6.4
```

**Parallelizable:** Phase 2 (markdown split), Phase 3 (scroll extraction), and Phase 4 (chatgpt fix) are fully independent.

---

## Quality Gates

| Gate | When | Criteria |
|------|------|----------|
| Baseline | After Step 1.2 | 742+ tests pass, 0 lint errors |
| Markdown split | After Step 2.5 | All markdown.test.ts tests pass unchanged |
| Scroll extraction | After Step 3.3 | All gemini.test.ts tests pass (including 8 auto-scroll) |
| Full regression | After Step 6.1 | 742+ tests, 0 lint errors, clean build, no circular deps |

---

## Rollback Plan

Each phase is independently reversible:
- **Phase 2:** Delete 3 new files, restore markdown.ts from git
- **Phase 3:** Delete scroll-manager.ts, restore gemini.ts from git
- **Phase 4:** Revert 2-line change in chatgpt.ts

No phase has external dependencies (no API changes, no settings changes, no consumer changes).
