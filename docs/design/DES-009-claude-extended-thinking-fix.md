# DES-009: Claude Extended Thinking Extraction Fix

**Issue**: #48 - Claude extractor captures Extended Thinking instead of actual response
**Date**: 2026-02-20
**Status**: Implemented
**Investigation**: [docs/investigation/claude-extended-thinking-dom.md](../investigation/claude-extended-thinking-dom.md)

## 1. Problem Statement

When Extended Thinking is enabled on Claude AI, `extractAssistantContent()` returns the **thinking content** instead of the **actual response**. This is because `queryWithFallback(SELECTORS.markdownContent, element)` returns the first `.standard-markdown` in DOM order, which is inside the thinking section (`.row-start-1`), not the response section (`.row-start-2`).

### 1.1 Scope

| Extraction Path | Affected | Reason |
|-----------------|----------|--------|
| `extractAssistantContent()` | **YES** | First `.standard-markdown` match is thinking content |
| `extractDeepResearchContent()` | No | Uses `#markdown-artifact .standard-markdown` (separate right panel) |
| Artifacts | No | Same right panel as Deep Research (`#markdown-artifact`) |

## 2. DOM Structure Analysis

### 2.1 Extended Thinking Response (all modes: Normal, Deep Research, Artifacts)

```
.font-claude-response
  └── div.grid (grid-rows-[0fr_1fr] | grid-rows-[1fr_1fr] | grid-rows-[auto_auto])
      ├── .row-start-1  ← Thinking section (ALWAYS in DOM, even when collapsed)
      │   └── div (overflow:hidden, min-h:0)
      │       └── div.group/thinking
      │           └── div.grid
      │               ├── .standard-markdown (chunk 1) ← FIRST MATCH (BUG)
      │               ├── .standard-markdown (chunk 2)
      │               └── ...
      │
      └── .row-start-2  ← Actual response
          └── div
              └── .standard-markdown  ← CORRECT content
```

### 2.2 Non-Extended-Thinking Response (existing behavior)

```
.font-claude-response
  └── .standard-markdown  ← Single direct child, no grid
```

### 2.3 Stable Selectors

| Selector | Target | Stability | Notes |
|----------|--------|-----------|-------|
| `.row-start-1` | Thinking section | HIGH | Tailwind grid utility |
| `.row-start-2` | Response section | HIGH | Tailwind grid utility |
| `.group\/thinking` | Thinking wrapper | MEDIUM | Escaped `/` in class |
| `.row-start-2 .standard-markdown` | Correct content | HIGH | Composite |

## 3. Design

### 3.1 Approach

Add a scoping step to `extractAssistantContent()`: when `.row-start-2` exists within the response element, narrow the search scope to that section before applying the existing selector chain. This ensures thinking content in `.row-start-1` is excluded.

When `.row-start-2` is absent (non-Extended-Thinking responses), the existing behavior is preserved.

### 3.2 Why `.row-start-2` scoping (not exclusion of `.row-start-1`)

| Approach | Pros | Cons |
|----------|------|------|
| **Scope to `.row-start-2`** (chosen) | Simple, positive selection; works with existing `queryWithFallback` | Relies on `.row-start-2` being present |
| Exclude `.row-start-1` via `:not()` | Doesn't require `.row-start-2` | Complex selector; fragile with nesting |
| Skip first N markdown elements | No selector dependency | Brittle; count varies |

### 3.3 Code Changes

#### 3.3.1 `src/content/extractors/claude.ts` - `extractAssistantContent()`

**Before:**
```typescript
private extractAssistantContent(element: Element): string {
  const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
  if (markdownEl) {
    return sanitizeHtml(markdownEl.innerHTML);
  }
  return sanitizeHtml(element.innerHTML);
}
```

**After:**
```typescript
private extractAssistantContent(element: Element): string {
  // Extended Thinking: scope to .row-start-2 to skip thinking in .row-start-1
  const responseSection = element.querySelector('.row-start-2');
  if (responseSection) {
    const markdownEl = this.queryWithFallback<HTMLElement>(
      SELECTORS.markdownContent, responseSection
    );
    if (markdownEl) {
      return sanitizeHtml(markdownEl.innerHTML);
    }
  }

  // Non-Extended-Thinking fallback: existing behavior
  const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
  if (markdownEl) {
    return sanitizeHtml(markdownEl.innerHTML);
  }

  return sanitizeHtml(element.innerHTML);
}
```

**Line count change**: +8 lines (273-282 current → 273-290 proposed)

### 3.4 No SELECTORS constant changes

`.row-start-2` is used as a **structural scoping selector**, not a content selector. It does not belong in the `SELECTORS` object which holds fallback chains for content discovery.

## 4. Test Plan

### 4.1 DOM Helper Changes (`test/fixtures/dom-helpers.ts`)

Add an optional `thinking` field to `ClaudeConversationMessage` to generate Extended Thinking DOM:

```typescript
interface ClaudeConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string[];  // Optional: thinking chunks for Extended Thinking
}
```

When `thinking` is provided on an assistant message, `createClaudeConversationDOM()` will generate the grid structure with `.row-start-1` (thinking) and `.row-start-2` (response) instead of the flat `.standard-markdown`.

**New helper function:**

```typescript
/**
 * Create Extended Thinking assistant response DOM
 */
function createClaudeExtendedThinkingResponse(
  content: string,
  thinkingChunks: string[],
  collapsed: boolean = true
): string
```

### 4.2 New Test Cases (`test/extractors/claude.test.ts`)

```
describe('Extended Thinking')
  ├── it('extracts response content, not thinking content (collapsed)')
  ├── it('extracts response content, not thinking content (expanded)')
  ├── it('handles multiple thinking chunks without capturing any')
  ├── it('works with mixed conversation (some turns with thinking, some without)')
  └── it('backward compatible: non-thinking responses still work')
```

**Total new tests**: 5

### 4.3 Existing Tests

All existing tests must continue to pass. The non-Extended-Thinking DOM structure has no `.row-start-2`, so the new code path falls through to the existing behavior.

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `.row-start-2` class name changes | LOW | Response not extracted | Tailwind utility class; unlikely to change |
| Claude removes grid layout | LOW | Falls through to existing behavior (safe) | Fallback preserves backward compatibility |
| `.row-start-2` used elsewhere in DOM | LOW | Wrong scoping target | Scoped to `.font-claude-response` element only |

## 6. Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/content/extractors/claude.ts` | Modify `extractAssistantContent()` | +8 |
| `test/fixtures/dom-helpers.ts` | Add Extended Thinking DOM helper | ~30 |
| `test/extractors/claude.test.ts` | Add 5 Extended Thinking test cases | ~80 |
| `docs/investigation/claude-extended-thinking-dom.md` | Update status to Complete | ~2 |

**Total estimated change**: ~120 lines
