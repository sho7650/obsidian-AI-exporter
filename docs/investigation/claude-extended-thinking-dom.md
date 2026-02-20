# Claude Extended Thinking DOM Analysis

**Issue**: #48 - Claude extractor captures Extended Thinking instead of actual response
**Date**: 2026-02-20
**Status**: Complete (fix implemented in DES-009)

## Problem Summary

`ClaudeExtractor.extractAssistantContent()` uses `queryWithFallback(SELECTORS.markdownContent, element)` which returns the **first** `.standard-markdown` found in DOM order. When Extended Thinking is enabled, the first `.standard-markdown` is the **thinking content**, not the actual response.

### Affected Code

```typescript
// src/content/extractors/claude.ts:273-282
private extractAssistantContent(element: Element): string {
  const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
  if (markdownEl) {
    return sanitizeHtml(markdownEl.innerHTML);  // ← Returns thinking, not response!
  }
  return sanitizeHtml(element.innerHTML);
}
```

### Current Selector Chain

```typescript
markdownContent: [
  '.standard-markdown',       // Semantic (HIGH)
  '.progressive-markdown',    // Semantic (HIGH)
  '[class*="markdown"]',      // Partial match (MEDIUM)
],
```

## Verified: Normal Chat + Extended Thinking

### DOM Structure (Common to Collapsed & Expanded)

Each assistant response (`.font-claude-response`) contains a grid layout:

```
.font-claude-response
  └── div.grid (grid-rows-[0fr_1fr] or grid-rows-[1fr_1fr])
      ├── .row-start-1  ← Thinking section (ALWAYS in DOM)
      │   └── div (overflow:hidden, min-h:0)
      │       └── div.group/thinking (border, rounded)
      │           └── div
      │               ├── button "Claude's Thoughts" (toggle)
      │               └── div
      │                   └── div
      │                       └── div.grid
      │                           ├── .standard-markdown (thinking chunk 1) ← ⚠️ FIRST MATCH
      │                           ├── .standard-markdown (thinking chunk 2)
      │                           └── ... (multiple chunks)
      │
      └── .row-start-2  ← Actual response section
          └── div
              └── .standard-markdown  ← THIS is the correct content
```

### Key Findings

1. **Bug confirmed**: `.standard-markdown` in `.row-start-1` (thinking) appears first in DOM order
2. **Thinking is ALWAYS in DOM**: Even when collapsed, elements exist (CSS `grid-template-rows: 0fr` + `overflow:hidden` hides them)
3. **Multiple thinking chunks**: Thinking section contains multiple `.standard-markdown` elements
4. **Response is single**: `.row-start-2` contains exactly one `.standard-markdown`

### Collapsed vs Expanded Differences

| Aspect | Collapsed | Expanded |
|--------|-----------|----------|
| Container grid | `grid-rows-[0fr_1fr]` | `grid-rows-[1fr_1fr]` |
| Thinking visible | No (overflow:hidden + 0fr) | Yes |
| Thinking in DOM | **Yes** (always present) | Yes |
| Bug triggered | **Yes** | **Yes** |

### Stable Selectors Identified

| Selector | Target | Stability |
|----------|--------|-----------|
| `.row-start-1` | Thinking section | HIGH (Tailwind grid utility) |
| `.row-start-2` | Actual response section | HIGH (Tailwind grid utility) |
| `.group\/thinking` | Thinking wrapper (escaped `/`) | MEDIUM |
| `.row-start-2 .standard-markdown` | Correct response content | HIGH |

## Verified: Artifacts + Extended Thinking

Artifact (通常の code/document 生成) は Deep Research と同一の右パネルに配置されることを確認。

### Container Selector (共通)

```
#main-content > div > div.max-md\:absolute.top-0.right-0.bottom-0.left-0.z-20
  .md\:flex-grow-0.md\:flex-shrink-0.md\:basis-0.overflow-hidden.h-full.max-md\:flex-1
```

Both normal Artifacts and Deep Research Artifacts share this identical container, which is completely separate from the conversation panel (`.font-claude-response`).

### Key Findings

1. **Same right panel as Deep Research**: `#markdown-artifact` is in the same DOM location regardless of Artifact type
2. **Extended Thinking does NOT affect Artifact extraction**: Artifact container is outside the conversation panel's `.row-start-1`/`.row-start-2` grid
3. **`isDeepResearchVisible()` covers both cases**: Detection via `#markdown-artifact` presence works for both Deep Research and normal Artifacts

## Verified: Deep Research + Extended Thinking

### DOM Structure

Deep Research with Extended Thinking follows the same `.row-start-1` / `.row-start-2` grid pattern in the conversation panel, but the actual report content is in a separate right panel:

```
Left panel (conversation)
  .font-claude-response
    └── div.grid.grid-rows-[auto_auto]
        ├── .row-start-1  ← Thinking section
        │   └── button (toggle) + thinking steps + .standard-markdown (thinking chunks)
        └── .row-start-2  ← Actual response
            └── .standard-markdown (response content)

Right panel (artifact, completely separate)
  div.max-md:absolute...overflow-hidden
    └── div#markdown-artifact
        └── div.standard-markdown  ← Deep Research report body
```

### Key Findings

1. **`.row-start-1` / `.row-start-2` pattern is consistent**: Same grid structure as Normal Chat
2. **Grid uses `grid-rows-[auto_auto]`**: Different from Normal Chat (`0fr_1fr`/`1fr_1fr`) but `.row-start-1` / `.row-start-2` selectors are unaffected
3. **`#markdown-artifact` is in a separate panel**: Completely outside the conversation `.font-claude-response` elements
4. **Deep Research extraction is NOT affected by the Extended Thinking bug**: `extractDeepResearchContent()` uses `#markdown-artifact .standard-markdown` which targets the right panel, not the conversation panel's thinking content
5. **Normal chat extraction bug still applies**: `extractAssistantContent()` for conversation messages in the left panel would still hit thinking `.standard-markdown` first

## Proposed Fix Approach

All modes verified. The fix scope is limited to `extractAssistantContent()` only:

1. Check `.row-start-2 .standard-markdown` first (Extended Thinking response)
2. Fall back to existing selector chain for non-thinking responses
3. Ensure backward compatibility with conversations without Extended Thinking

### Draft Fix (pending validation)

```typescript
private extractAssistantContent(element: Element): string {
  // Extended Thinking: response is in .row-start-2, thinking is in .row-start-1
  const responseSection = element.querySelector('.row-start-2');
  if (responseSection) {
    const markdownEl = this.queryWithFallback<HTMLElement>(
      SELECTORS.markdownContent, responseSection
    );
    if (markdownEl) {
      return sanitizeHtml(markdownEl.innerHTML);
    }
  }

  // Non-thinking fallback: existing logic
  const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
  if (markdownEl) {
    return sanitizeHtml(markdownEl.innerHTML);
  }

  return sanitizeHtml(element.innerHTML);
}
```

**Impact scope**: `extractAssistantContent()` only. Deep Research and Artifacts are unaffected (both use `#markdown-artifact` in a separate right panel).
