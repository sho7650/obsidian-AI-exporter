# DES-012: Analysis Report Refactoring

> Source: [docs/analysis-report.md](../analysis-report.md) (2026-03-03 Code Analysis)
> Status: Draft
> Date: 2026-03-03
> Branch: `refactor/analysis-report-recommendations`

## 1. Overview

The comprehensive code analysis (score: 92/100) identified 8 improvement recommendations. After investigation, **5 of 8 are false positives** — the codebase already addresses them. This design covers the 3 actionable items:

1. **Split `markdown.ts`** (560 lines) into 4 focused modules
2. **Extract scroll logic** from `gemini.ts` into `scroll-manager.ts`
3. **Fix parameter naming** in `chatgpt.ts`

### Scope

| In Scope | Out of Scope |
|----------|-------------|
| markdown.ts module split (barrel re-export) | New features or functionality |
| Scroll logic extraction to standalone module | Scroll behavior changes |
| chatgpt.ts parameter rename | Other extractors' code style |
| ADR-003 for markdown split decision | Test file restructuring |

### False Positive Assessment

| # | Recommendation | Finding | Evidence |
|---|---------------|---------|----------|
| P2-4 | Add JSDoc to conversion functions | Already documented | `markdown.ts:382,392,406` all have JSDoc |
| P3-5 | Test `stripCodeBlocks()` | Already tested | `message-counter.test.ts:72-86,216-236` |
| P3-6 | Test append mode save paths | Already tested | 40+ tests in `append-utils.test.ts` |
| P4-7 | Deep Research inline examples | Already documented | Module-level comments describe pipeline |
| P4-8 | Document KaTeX rationale | Already documented | `sanitize.ts:23-42` comprehensive JSDoc |

### Design Principles

1. **Zero consumer changes** — Barrel re-export preserves all existing import paths
2. **No behavior changes** — Pure structural refactoring; all tests pass unchanged
3. **No circular dependencies** — Strict DAG module dependency graph
4. **Minimal surface area** — Only export what consumers already import

---

## 2. Component Design: markdown.ts Split

### 2.1 Current Structure (560 lines, 1 file)

```
src/content/markdown.ts
├── Deep Research citation processing (lines 22–251, ~230 lines)
│   ├── CITATION_PATTERN_WRAPPED, CITATION_PATTERN_STANDALONE
│   ├── escapeMarkdownLink()
│   ├── escapeAngleBracketsInLine()
│   ├── escapeAngleBrackets()              ← exported
│   ├── sanitizeUrl()
│   ├── createCitationReplacer()
│   ├── convertInlineCitationsToFootnoteRefs()
│   ├── generateReferencesSection()
│   ├── removeSourcesCarousel()
│   └── convertDeepResearchContent()       ← exported
├── Turndown config + 6 rules (lines 253–390, ~138 lines)
│   ├── Turndown instance (headingStyle, codeBlockStyle, etc.)
│   ├── codeBlocks rule
│   ├── inlineCode rule
│   ├── footnoteRef rule
│   ├── mathBlock rule
│   ├── mathInline rule
│   ├── tables rule
│   └── htmlToMarkdown()                   ← exported
├── Filename/hash utilities (lines 392–411, ~20 lines)
│   ├── generateFileName()                 ← exported
│   └── generateContentHash()              ← exported
└── Message formatting (lines 413–560, ~148 lines)
    ├── getAssistantLabel()
    ├── formatMessage()
    ├── formatToolContent()
    └── conversationToNote()               ← exported
```

**Problem:** 4 distinct concerns in one file. Adding a new Turndown rule, citation format, or message style requires reading the entire 560-line file.

### 2.2 Target Structure (4 files)

```
src/content/
├── markdown-rules.ts           ← NEW (leaf module)
├── markdown-deep-research.ts   ← NEW
├── markdown-formatting.ts      ← NEW
└── markdown.ts                 ← MODIFIED (barrel + orchestrator)
```

### 2.3 Module: `markdown-rules.ts` (~140 lines)

**Responsibility:** Turndown HTML→Markdown conversion engine.

**Exports:**
```typescript
export function escapeAngleBrackets(text: string): string;
export function htmlToMarkdown(html: string): string;
```

**Contents (moved from markdown.ts):**

| Function | Visibility | Source Lines |
|----------|-----------|-------------|
| `escapeAngleBracketsInLine()` | private | 46–71 |
| `escapeAngleBrackets()` | **exported** | 80–98 |
| `turndown` instance | module-private | 258–264 |
| `codeBlocks` rule | — | 267–283 |
| `inlineCode` rule | — | 286–293 |
| `footnoteRef` rule | — | 297–305 |
| `mathBlock` rule | — | 308–317 |
| `mathInline` rule | — | 320–333 |
| `tables` rule | — | 336–380 |
| `htmlToMarkdown()` | **exported** | 385–390 |

**Imports:**
```typescript
import TurndownService from 'turndown';
```

**Rationale for `escapeAngleBrackets` placement:** `htmlToMarkdown()` calls `escapeAngleBrackets()` at line 389. Colocating them avoids a cross-module call for the hot path. `markdown-formatting.ts` imports it from here for user message escaping.

### 2.4 Module: `markdown-deep-research.ts` (~230 lines)

**Responsibility:** Deep Research citation-to-footnote pipeline.

**Exports:**
```typescript
export function convertDeepResearchContent(html: string, links?: DeepResearchLinks): string;
```

**Contents (moved from markdown.ts):**

| Function | Visibility | Source Lines |
|----------|-----------|-------------|
| `CITATION_PATTERN_WRAPPED` | module-private | 27–28 |
| `CITATION_PATTERN_STANDALONE` | module-private | 31–32 |
| `escapeMarkdownLink()` | private | 38–40 |
| `sanitizeUrl()` | private | 103–114 |
| `createCitationReplacer()` | private | 120–135 |
| `convertInlineCitationsToFootnoteRefs()` | private | 152–167 |
| `generateReferencesSection()` | private | 182–204 |
| `removeSourcesCarousel()` | private | 209–211 |
| `convertDeepResearchContent()` | **exported** | 227–251 |

**Imports:**
```typescript
import { htmlToMarkdown } from './markdown-rules';
import { buildSourceMap } from '../lib/source-map';
import type { DeepResearchLinks, DeepResearchSource } from '../lib/types';
```

### 2.5 Module: `markdown-formatting.ts` (~90 lines)

**Responsibility:** Message-to-Obsidian-callout/blockquote/plain formatting.

**Exports:**
```typescript
export function formatMessage(
  content: string, role: 'user' | 'assistant',
  options: TemplateOptions, source: string
): string;
export function formatToolContent(toolContent: string, options: TemplateOptions): string;
```

**Contents (moved from markdown.ts):**

| Function | Visibility | Source Lines |
|----------|-----------|-------------|
| `getAssistantLabel()` | private | 416–418 |
| `formatMessage()` | **exported** | 423–457 |
| `formatToolContent()` | **exported** | 468–500 |

**Imports:**
```typescript
import { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
import { PLATFORM_LABELS } from '../lib/constants';
import type { TemplateOptions } from '../lib/types';
```

### 2.6 Module: `markdown.ts` (barrel + orchestrator, ~100 lines)

**Responsibility:** Public API surface + `conversationToNote()` orchestrator.

**Structure:**
```typescript
/**
 * HTML to Markdown conversion — public API barrel
 *
 * Internal modules:
 * - markdown-rules.ts      — Turndown config + conversion
 * - markdown-deep-research.ts — Citation → footnote pipeline
 * - markdown-formatting.ts — Message formatting templates
 */

// Re-exports (preserve existing import paths)
export { htmlToMarkdown, escapeAngleBrackets } from './markdown-rules';
export { convertDeepResearchContent } from './markdown-deep-research';

// Own imports
import { formatMessage, formatToolContent } from './markdown-formatting';
import { convertDeepResearchContent } from './markdown-deep-research';
import { generateHash } from '../lib/hash';
import { MAX_FILENAME_BASE_LENGTH, FILENAME_ID_SUFFIX_LENGTH } from '../lib/constants';
import type { ConversationData, ObsidianNote, NoteFrontmatter, TemplateOptions } from '../lib/types';

// Own exports
export function generateFileName(title: string, conversationId: string): string { ... }
export function generateContentHash(content: string): string { ... }
export function conversationToNote(data: ConversationData, options: TemplateOptions): ObsidianNote { ... }
```

### 2.7 Dependency Graph

```
    markdown-rules.ts              ← LEAF (only 'turndown' external import)
         ↑           ↑
         │           │
markdown-deep-research.ts    markdown-formatting.ts
    (imports htmlToMarkdown)    (imports htmlToMarkdown,
                                 escapeAngleBrackets)
         ↑           ↑
         │           │
         └─── markdown.ts ───┘    ← BARREL (imports from all 3, re-exports)
```

**Circular dependency analysis:** No cycles possible. `markdown-rules.ts` is a leaf with no internal imports. The other two modules import only from `markdown-rules.ts`. The barrel imports from all three but none import from the barrel.

### 2.8 Consumer Impact

| Consumer | Current Import | After | Change? |
|----------|---------------|-------|---------|
| `src/content/index.ts:12` | `{ conversationToNote }` from `'./markdown'` | Same | None |
| `test/content/markdown.test.ts` | `{ htmlToMarkdown, escapeAngleBrackets, generateFileName, generateContentHash, conversationToNote, convertDeepResearchContent }` from barrel | Same | None |
| `test/extractors/e2e/helpers.ts` | `{ conversationToNote }` from barrel | Same | None |
| `test/extractors/perplexity.test.ts` | `{ htmlToMarkdown }` from barrel | Same | None |

**All consumers import from `./markdown` which now re-exports. Zero changes required.**

---

## 3. Component Design: Scroll Manager Extraction

### 3.1 Current Structure

`src/content/extractors/gemini.ts` (535 lines) contains auto-scroll logic mixed with DOM extraction:

| Component | Lines | Purpose |
|-----------|-------|---------|
| `ScrollResult` interface | 122–131 | Scroll operation result type |
| `countConversationElements()` | 314–316 | DOM query for element count |
| `delay()` | 321–323 | Promise-based sleep |
| `ensureAllMessagesLoaded()` | 336–414 | **79-line** scroll orchestration |

**Problem:** Scroll coordination is a general-purpose concern that doesn't belong in a DOM extractor class. It couples `GeminiExtractor` to scroll timing constants and DOM query patterns that have nothing to do with conversation extraction.

### 3.2 Target Structure

```
src/lib/
└── scroll-manager.ts      ← NEW (standalone function)

src/content/extractors/
└── gemini.ts              ← MODIFIED (reduced by ~100 lines)
```

### 3.3 Module: `scroll-manager.ts` (~80 lines)

**Exports:**
```typescript
export interface ScrollResult {
  /** Whether all elements loaded before timeout */
  fullyLoaded: boolean;
  /** Number of elements found after scrolling */
  elementCount: number;
  /** Total scroll-poll iterations performed */
  scrollIterations: number;
  /** Whether scrolling was unnecessary (already at top or disabled) */
  skipped: boolean;
}

/**
 * Scroll container to top to trigger lazy loading of all elements.
 *
 * Designed for edge-triggered scroll loaders (e.g., Gemini's infinite-scroller
 * fires onScrolledTopPastThreshold when scrollTop crosses below a threshold).
 * Re-arms by scrolling to bottom first, then back to top.
 *
 * @param container - The scrollable container element
 * @param elementSelector - CSS selector to count loaded elements
 * @returns ScrollResult with loading outcome
 */
export async function ensureAllElementsLoaded(
  container: HTMLElement,
  elementSelector: string,
): Promise<ScrollResult>;
```

**Module-private helpers:**
```typescript
function delay(ms: number): Promise<void>;
function countElements(selector: string): number;
```

**Imports:**
```typescript
import {
  SCROLL_POLL_INTERVAL,
  SCROLL_TIMEOUT,
  SCROLL_STABILITY_THRESHOLD,
  SCROLL_REARM_DELAY,
} from './constants';
```

**Key design decision:** The function takes a pre-resolved `HTMLElement` container and a CSS selector string. It does **not** depend on `BaseExtractor` or `queryWithFallback`. Container resolution stays in `GeminiExtractor.onBeforeExtract()` where `queryWithFallback` is available.

### 3.4 GeminiExtractor Changes

**Remove:**
- `ScrollResult` interface (lines 122–131)
- `countConversationElements()` method (lines 314–316)
- `delay()` method (lines 321–323)
- `ensureAllMessagesLoaded()` method (lines 336–414)
- `SCROLL_*` constant imports (no longer used directly)

**Add:**
```typescript
import { ensureAllElementsLoaded, type ScrollResult } from '../../lib/scroll-manager';
```

**Refactored `onBeforeExtract()`:**
```typescript
protected async onBeforeExtract(): Promise<void> {
  if (!this.enableAutoScroll) {
    this.lastScrollResult = {
      fullyLoaded: true, elementCount: 0, scrollIterations: 0, skipped: true
    };
    return;
  }

  const container = this.queryWithFallback<HTMLElement>(SELECTORS.scrollContainer);
  if (!container) {
    console.info('[G2O] No scroll container found, skipping auto-scroll');
    this.lastScrollResult = {
      fullyLoaded: true, elementCount: 0, scrollIterations: 0, skipped: true
    };
    return;
  }

  this.lastScrollResult = await ensureAllElementsLoaded(
    container,
    COMPUTED_SELECTORS.conversationTurn
  );
}
```

**Behavioral change analysis:**

The "no container" guard moves from inside `ensureAllMessagesLoaded` to `onBeforeExtract`. Before:

```
onBeforeExtract() → ensureAllMessagesLoaded() → [container check inside]
```

After:

```
onBeforeExtract() → [container check] → ensureAllElementsLoaded(container, ...)
```

Behavior is identical. The existing test "skips scroll when no scroll container exists" covers this path.

### 3.5 `onAfterExtract()` — No Changes

The `SCROLL_TIMEOUT` constant used in the warning message at line 183 needs to remain imported in `gemini.ts` for the `onAfterExtract` warning string. Keep this single constant import.

---

## 4. Component Design: Parameter Naming Fix

### 4.1 Current Code

**File:** `src/content/extractors/chatgpt.ts:211–216`

```typescript
private cleanCitationUrls(html: string): string {
  return html
    .replace(/href="([^"]+)\?utm_source=chatgpt\.com"/g, (_, url) => `href="${url}"`)
    .replace(/href="([^"]+)&utm_source=chatgpt\.com"/g, (_, url) => `href="${url}"`);
}
```

### 4.2 Fix

```typescript
    .replace(/href="([^"]+)\?utm_source=chatgpt\.com"/g, (_match, url) => `href="${url}"`)
    .replace(/href="([^"]+)&utm_source=chatgpt\.com"/g, (_match, url) => `href="${url}"`)
```

**Rationale:** `_` is conventionally used for intentionally unused single parameters. When a named parameter follows (e.g., `url`), the convention is `_match` to clarify what's being discarded. This matches the project's existing pattern in `markdown.ts:122` where `createCitationReplacer` uses `(_match: string, indexStr: string)`.

---

## 5. Data Flow

### 5.1 markdown.ts Module Resolution

```
Consumer code
  │
  │  import { conversationToNote } from './markdown'
  ▼
markdown.ts (barrel)
  │
  ├──→ re-exports { htmlToMarkdown, escapeAngleBrackets }
  │      from './markdown-rules'
  │
  ├──→ re-exports { convertDeepResearchContent }
  │      from './markdown-deep-research'
  │
  └──→ own exports: conversationToNote, generateFileName, generateContentHash
         │
         ├── calls formatMessage(), formatToolContent()
         │     from './markdown-formatting'
         │
         └── calls convertDeepResearchContent()
               from './markdown-deep-research'
```

### 5.2 Scroll Manager Call Flow

```
GeminiExtractor.extract()
  │
  ├── tryExtractDeepResearch()  ← if Deep Research, skip scroll
  │
  └── onBeforeExtract()
        │
        ├── enableAutoScroll === false → skip (ScrollResult.skipped=true)
        │
        ├── queryWithFallback(SELECTORS.scrollContainer) → null → skip
        │
        └── ensureAllElementsLoaded(container, selector)
              │  ← src/lib/scroll-manager.ts
              │
              ├── scrollTop === 0 → already loaded, return early
              │
              └── scroll loop:
                    ├── re-arm (scroll to bottom)
                    ├── scroll to top (trigger edge event)
                    ├── count elements
                    └── stabilize or timeout → return ScrollResult
```

---

## 6. Affected Files

### 6.1 New Files

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/content/markdown-rules.ts` | ~140 | Turndown config + 6 rules + htmlToMarkdown |
| `src/content/markdown-deep-research.ts` | ~230 | Citation → footnote pipeline |
| `src/content/markdown-formatting.ts` | ~90 | Message formatting (callout/blockquote/plain) |
| `src/lib/scroll-manager.ts` | ~80 | Standalone scroll orchestration |
| `docs/adr/003-markdown-module-split.md` | ~40 | Architecture Decision Record |

### 6.2 Modified Files

| File | Change | Lines Changed |
|------|--------|--------------|
| `src/content/markdown.ts` | Reduce to barrel + orchestrator (remove ~460 lines, keep ~100) | Major refactor |
| `src/content/extractors/gemini.ts` | Remove scroll logic (~100 lines), import scroll-manager | ~110 lines removed, ~15 added |
| `src/content/extractors/chatgpt.ts` | `_` → `_match` in 2 regex callbacks | 2 lines |

### 6.3 Unchanged Files

| Category | Files | Reason |
|----------|-------|--------|
| **All test files** | `test/content/markdown.test.ts`, `test/extractors/gemini.test.ts`, etc. | Barrel re-export preserves import paths; scroll tests pass via extract() |
| **Other extractors** | `claude.ts`, `perplexity.ts`, `base.ts` | No interface changes |
| **Background** | `index.ts`, `validation.ts`, `obsidian-handlers.ts` | No API changes |
| **Popup** | `index.html`, `index.ts` | No settings changes |

**Total: 5 new files, 3 modified files, 0 test files changed**

---

## 7. Test Strategy

### 7.1 Regression Testing (All Existing Tests)

No new tests are required. All 742+ existing tests pass unchanged because:

1. **Barrel re-export** preserves all import paths from `./markdown`
2. **Scroll manager** is tested through `GeminiExtractor.extract()` integration tests (8 auto-scroll tests in `gemini.test.ts` with fake timers)
3. **Parameter rename** has no behavioral impact

### 7.2 Verification Matrix

| Module | Existing Test Coverage | Test File |
|--------|----------------------|-----------|
| `markdown-rules.ts` | `htmlToMarkdown` (20+ tests), `escapeAngleBrackets` (15+ tests) | `markdown.test.ts` |
| `markdown-deep-research.ts` | `convertDeepResearchContent` (8 tests), footnote integration (1 test) | `markdown.test.ts` |
| `markdown-formatting.ts` | `conversationToNote` (17 tests), tool content (11 tests) | `markdown.test.ts` |
| `scroll-manager.ts` | 8 auto-scroll tests (stabilize, timeout, skip, merge warnings, etc.) | `gemini.test.ts` |
| `chatgpt.ts` rename | `cleanCitationUrls` tested via extractor integration | `chatgpt.test.ts` |

### 7.3 Manual Verification

```bash
npm run build       # TypeScript — no errors, no circular dependency warnings
npm run lint        # ESLint — 0 errors, 0 warnings
npm run format      # Prettier — all clean
npx vitest run      # All 742+ tests pass
```

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Circular dependency between markdown sub-modules | None | — | DAG verified: rules → deep-research → barrel (Section 2.7) |
| Barrel re-export breaks tree-shaking | Very Low | Low | Chrome Extension bundle is small; Vite handles barrel re-exports efficiently |
| Turndown singleton initialization order | None | — | Module-level `const` in `markdown-rules.ts` initializes once at import time, identical to current behavior |
| Scroll manager behavioral regression | Low | Medium | 8 existing tests with fake timers cover all paths (skip, stabilize, timeout, no-container) |
| `_match` rename causes ESLint warning | None | — | `_match` prefix convention recognized by `@typescript-eslint/no-unused-vars` |

---

## 9. ADR-003: Markdown Module Split

To be created at `docs/adr/003-markdown-module-split.md`:

**Context:** `src/content/markdown.ts` grew to 560 lines with 4 distinct concerns: Turndown rules, citation processing, message formatting, and note orchestration. Modifying one concern requires navigating the entire file.

**Decision:** Split into 3 focused modules + barrel re-export:
- `markdown-rules.ts` — Turndown engine (leaf, no internal deps)
- `markdown-deep-research.ts` — Citation pipeline
- `markdown-formatting.ts` — Message templates
- `markdown.ts` — Barrel re-exports + `conversationToNote` orchestrator

**Key constraint:** Barrel preserves all existing import paths. Zero consumer or test file changes.

**Alternatives rejected:**
- Direct imports from sub-modules → breaks 4 consumers, requires updating all test imports
- Region-based organization (status quo) → doesn't improve cognitive load or independent testability

---

## 10. Implementation Order

| Step | Task | Depends On | Parallelizable |
|------|------|------------|----------------|
| 1 | Create branch `refactor/analysis-report-recommendations` | — | — |
| 2a | Create `src/content/markdown-rules.ts` | — | Yes (with 3a) |
| 2b | Create `src/content/markdown-deep-research.ts` | 2a | — |
| 2c | Create `src/content/markdown-formatting.ts` | 2a | — |
| 2d | Reduce `src/content/markdown.ts` to barrel | 2a–2c | — |
| 3a | Create `src/lib/scroll-manager.ts` | — | Yes (with 2a) |
| 3b | Update `src/content/extractors/gemini.ts` | 3a | — |
| 4 | Fix `src/content/extractors/chatgpt.ts` params | — | Yes (with 2, 3) |
| 5 | Create `docs/adr/003-markdown-module-split.md` | 2d | — |
| 6 | Verify: build + lint + format + test | All | — |

**Estimated total: ~540 lines moved/created, 3 modified, 0 test changes**
