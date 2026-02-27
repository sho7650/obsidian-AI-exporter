# WF-011: Angle Bracket Escape Implementation Workflow

> Design: [DES-011](../design/DES-011-angle-bracket-escape.md)
> Requirement: [REQ-083](../requirements/REQ-083-angle-bracket-escape.md)
> Date: 2026-02-27
> Baseline: 675 tests passing, 0 lint errors

## Phase Overview

```
Phase 1: Setup           ──► Phase 2: Core Function  ──► Phase 3: Integration
(branch, baseline)            (escapeAngleBrackets)       (htmlToMarkdown, formatMessage)
                                      │
                                      ▼
                              Phase 4: Tests         ──► Phase 5: Validation & PR
                              (unit + integration)       (regression, lint, build)
```

**Estimated scope:** ~35 lines production code, ~80 lines test code, 2 files changed

---

## Phase 1: Setup

### Step 1.1: Create feature branch

```bash
git checkout -b fix/angle-bracket-escape
```

### Step 1.2: Verify baseline

```bash
npm test            # 675 tests passing
npm run lint        # 0 errors
npm run build       # Clean build
```

**Checkpoint:** All green before any changes

---

## Phase 2: Core Function — `escapeAngleBrackets()`

### Step 2.1: Add `escapeAngleBracketsInLine()` private helper

**File:** `src/content/markdown.ts`
**Location:** After `escapeMarkdownLink()` function (line ~40)

```typescript
/**
 * Escape angle brackets in a single line of Markdown text.
 * Preserves blockquote markers and inline code segments.
 */
function escapeAngleBracketsInLine(line: string): string {
  const bqMatch = line.match(/^(\s*>\s*)+/);
  const prefix = bqMatch ? bqMatch[0] : '';
  const rest = line.slice(prefix.length);

  const parts = rest.split(/(`[^`]+`)/);
  const escaped = parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/</g, '\\<').replace(/>/g, '\\>');
    })
    .join('');

  return prefix + escaped;
}
```

### Step 2.2: Add `escapeAngleBrackets()` public function

**File:** `src/content/markdown.ts`
**Location:** Immediately after `escapeAngleBracketsInLine()`

```typescript
/**
 * Escape angle brackets in Markdown text for safe Obsidian rendering.
 * Preserves brackets inside fenced code blocks, inline code, and
 * blockquote markers.
 *
 * CommonMark §2.4: \< and \> are valid backslash escapes.
 */
export function escapeAngleBrackets(text: string): string {
  const lines = text.split('\n');
  let inFencedBlock = false;

  const result = lines.map(line => {
    const stripped = line.replace(/^(\s*>\s*)*/, '');
    if (/^`{3,}/.test(stripped)) {
      inFencedBlock = !inFencedBlock;
      return line;
    }
    if (inFencedBlock) return line;
    return escapeAngleBracketsInLine(line);
  });

  return result.join('\n');
}
```

**Checkpoint:** `npm run build` passes (type check only, no integration yet)

---

## Phase 3: Integration

### Step 3.1: Modify `htmlToMarkdown()`

**File:** `src/content/markdown.ts` (line 327-332)

```diff
 export function htmlToMarkdown(html: string): string {
   const cleaned = html.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ');
-  return turndown.turndown(cleaned);
+  return escapeAngleBrackets(turndown.turndown(cleaned));
 }
```

**Effect:** All assistant messages + Deep Research content now escaped.

### Step 3.2: Modify `formatMessage()`

**File:** `src/content/markdown.ts` (line 372)

```diff
-  const markdown = role === 'assistant' ? htmlToMarkdown(content) : content;
+  const markdown = role === 'assistant'
+    ? htmlToMarkdown(content)
+    : escapeAngleBrackets(content);
```

**Effect:** User messages now escaped.

**Checkpoint:** `npm run build` passes

---

## Phase 4: Tests

### Step 4.1: Add export to test import

**File:** `test/content/markdown.test.ts` (line 1-8)

Add `escapeAngleBrackets` to the import statement.

### Step 4.2: Add unit tests — `escapeAngleBrackets()`

**File:** `test/content/markdown.test.ts`
**Location:** New `describe('escapeAngleBrackets', ...)` block after `htmlToMarkdown` tests

| # | Test Name | Input | Expected |
|---|-----------|-------|----------|
| 1 | escapes bare angle brackets | `<module>` | `\<module\>` |
| 2 | escapes nested angle brackets | `<Generic<T>>` | `\<Generic\<T\>\>` |
| 3 | preserves fenced code block content | ` ```\n<div>\n``` ` | unchanged |
| 4 | preserves fenced code block with lang | ` ```ts\n<T>\n``` ` | unchanged |
| 5 | preserves inline code content | `` Use `<span>` for this `` | unchanged |
| 6 | preserves blockquote markers | `> text with <tag>` | `> text with \<tag\>` |
| 7 | preserves nested blockquote markers | `> > nested <tag>` | `> > nested \<tag\>` |
| 8 | no-op for plain text | `plain text` | `plain text` |
| 9 | no-op for empty string | `""` | `""` |
| 10 | escapes multiple angles per line | `<a> and <b>` | `\<a\> and \<b\>` |
| 11 | handles mixed code + text + angles | multiline with all regions | only prose escaped |
| 12 | preserves fenced code inside blockquote | `> ```\n> <code>\n> ``` ` | unchanged |

### Step 4.3: Add integration tests — `conversationToNote()`

**File:** `test/content/markdown.test.ts`
**Location:** Inside existing `describe('conversationToNote', ...)` block

| # | Test Name | Setup | Assertion |
|---|-----------|-------|-----------|
| 1 | escapes angle brackets in assistant HTML | `content: '<p>Error in &lt;module&gt;</p>'` | body contains `\<module\>` |
| 2 | escapes angle brackets in user messages | `content: '<Generic<T>>'`, role: user | body contains `\<Generic\<T\>\>` |
| 3 | does not escape code blocks in assistant | `content: '<pre><code>&lt;div&gt;</code></pre>'` | `<div>` inside ` ``` ` |
| 4 | does not escape inline code in assistant | `content: 'Use <code>&lt;span&gt;</code>'` | `` `<span>` `` preserved |

**Checkpoint:** `npm test` — all new + existing tests pass

---

## Phase 5: Validation & PR

### Step 5.1: Full regression suite

```bash
npm test              # All tests pass (675 + ~16 new)
npm run lint          # 0 errors
npm run build         # Clean production build
```

### Step 5.2: Verify existing test stability

Specific attention to tests that may be affected by the new escaping:

- [ ] `htmlToMarkdown` → basic formatting (paragraphs, bold, italic, headings, links, lists)
- [ ] `htmlToMarkdown` → code blocks (fenced with/without lang, inline code)
- [ ] `htmlToMarkdown` → tables
- [ ] `htmlToMarkdown` → math rendering (display math, inline math)
- [ ] `conversationToNote` → callout format, blockquote format, plain format
- [ ] `convertDeepResearchContent` → citations, footnotes, References section

### Step 5.3: Manual verification (optional but recommended)

1. Build extension: `npm run build`
2. Load in Chrome
3. Open Gemini, send: `Pythonで <module> のトレースバックについて教えて`
4. Save to Obsidian
5. Open in Obsidian Reading mode → `\<module\>` should render as literal `<module>`

### Step 5.4: Commit & PR

```bash
git add src/content/markdown.ts test/content/markdown.test.ts
git commit -m "fix: escape angle brackets in Markdown output (#83)"
```

PR title: `fix: escape angle brackets in Markdown output`

---

## Dependency Graph

```
Step 1.1 ──► Step 1.2 ──► Step 2.1 ──► Step 2.2 ──► Step 3.1 ──┐
                                                      Step 3.2 ──┤
                                                                  ▼
                                                      Step 4.1 ──► Step 4.2 ──┐
                                                                   Step 4.3 ──┤
                                                                               ▼
                                                                   Step 5.1 ──► Step 5.4
                                                                   Step 5.2 ──┘
```

**Critical path:** Phase 2 → Phase 3 → Phase 4 → Phase 5

---

## Risk Checkpoints

| After Phase | Check | Abort Condition |
|-------------|-------|-----------------|
| Phase 2 | `npm run build` passes | Type errors in new functions |
| Phase 3 | `npm run build` passes | Type errors from integration |
| Phase 4 | `npm test` all pass | Existing tests broken by escaping |
| Phase 5 | lint + build + test all green | Any regression |

## Rollback

If existing tests break in Phase 4, the most likely cause is `htmlToMarkdown()` now producing `\<` / `\>` where tests expected bare `<` / `>`. Fix by updating test expectations, NOT by reverting the escape logic.
