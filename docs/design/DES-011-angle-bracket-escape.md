# DES-011: Angle Bracket Escape in Markdown Output

> Requirement: [REQ-083](../requirements/REQ-083-angle-bracket-escape.md)
> Status: Draft
> Date: 2026-02-27

## 1. Problem Statement

Turndown converts HTML entities (`&lt;`, `&gt;`) back to literal `<` / `>` during HTML→Markdown conversion. Obsidian's Markdown renderer then interprets these as HTML tags, causing content to vanish in Reading mode and corrupting subsequent formatting.

**Affected content examples:**
- Python tracebacks: `<module>`
- TypeScript generics: `<Generic<T>>`
- HTML tag names mentioned in prose: `<div>`, `<span>`

**Two distinct code paths:**

| Path | Source | Current Behavior |
|------|--------|-----------------|
| Assistant messages | `htmlToMarkdown()` → Turndown decodes `&lt;` → bare `<` | Not escaped |
| User messages | `.textContent` → plain text with literal `<` | Not escaped |

## 2. Design Decision: Backslash Escape

**Chosen approach:** `\<` and `\>` (CommonMark Section 2.4 backslash escapes)

**Alternatives considered:**

| Approach | Pros | Cons |
|----------|------|------|
| **`\<` `\>` (chosen)** | CommonMark compliant; obsidian-importer precedent; preserves text style | Requires code-aware parsing |
| `` `<module>` `` (inline code) | Simple | Changes visual style to monospace; loses context |
| `&lt;` `&gt;` (HTML entities) | Simple | Obsidian may re-decode in some contexts |
| Zero-width space injection | Invisible to user | Fragile; breaks copy-paste |

## 3. Architecture

### 3.1 Function: `escapeAngleBrackets(text: string): string`

A single utility function in `markdown.ts` that escapes `<` and `>` in Markdown text while preserving code regions and blockquote syntax.

**Exported:** Yes (for direct testing and potential reuse)

### 3.2 Integration Points

```
┌─────────────────────────────────────────────────────────┐
│ formatMessage(content, role, options, source)            │
│                                                         │
│   role === 'assistant'                                  │
│     │                                                   │
│     ▼                                                   │
│   htmlToMarkdown(html)                                  │
│     │  turndown.turndown(cleaned)                       │
│     │  escapeAngleBrackets(markdown)  ◄── NEW           │
│     ▼                                                   │
│   markdown output (escaped)                             │
│                                                         │
│   role === 'user'                                       │
│     │                                                   │
│     ▼                                                   │
│   escapeAngleBrackets(content)        ◄── NEW           │
│     │                                                   │
│     ▼                                                   │
│   plain text output (escaped)                           │
│                                                         │
│   → callout / blockquote / plain formatting             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ convertDeepResearchContent(html, links)                 │
│     │                                                   │
│     ▼                                                   │
│   htmlToMarkdown(processed)                             │
│     │  escapeAngleBrackets(markdown)  ◄── inherited     │
│     ▼                                                   │
│   + generateReferencesSection()                         │
└─────────────────────────────────────────────────────────┘
```

**Coverage:** All 4 platforms (Gemini, Claude, ChatGPT, Perplexity) are handled automatically because all message content flows through `formatMessage()` or `convertDeepResearchContent()`.

### 3.3 Algorithm

Line-by-line processing with fenced code block state tracking:

```
escapeAngleBrackets(text)
│
├─ Split text into lines
├─ For each line:
│   ├─ Strip blockquote prefix → check if fenced code delimiter
│   ├─ Toggle inFencedBlock state on ```
│   ├─ If inFencedBlock → return line unchanged
│   └─ Otherwise → escapeAngleBracketsInLine(line)
│       ├─ Extract blockquote prefix (^(\s*>\s*)+)
│       ├─ Split remainder by inline code segments (`...`)
│       ├─ In non-code segments: < → \<, > → \>
│       └─ Reassemble: prefix + escaped segments
└─ Join lines with \n
```

**Why line-by-line instead of single regex?**
- Fenced code blocks span multiple lines and require state tracking
- Line-based processing makes blockquote detection trivial (`^` anchor)
- More maintainable and debuggable than a complex multi-line regex

### 3.4 Protected Regions

| Region | Detection | Action |
|--------|-----------|--------|
| Fenced code block | Line matching `^`{3,}` (after stripping blockquote prefix) | Skip entire block |
| Inline code | Split by `` `[^`]+` `` capture group | Preserve matched segments |
| Blockquote marker | `^(\s*>\s*)+` at line start | Extract prefix, escape only remainder |

## 4. Detailed Implementation

### 4.1 `escapeAngleBrackets()` — public utility

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
    // Detect fenced code delimiter (may be inside a blockquote)
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

### 4.2 `escapeAngleBracketsInLine()` — private helper

```typescript
function escapeAngleBracketsInLine(line: string): string {
  // 1. Extract blockquote prefix (preserve as-is)
  const bqMatch = line.match(/^(\s*>\s*)+/);
  const prefix = bqMatch ? bqMatch[0] : '';
  const rest = line.slice(prefix.length);

  // 2. Split by inline code segments (capture group → odd indices are code)
  const parts = rest.split(/(`[^`]+`)/);

  // 3. Escape < and > only in non-code segments
  const escaped = parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // inline code — preserve
      return part.replace(/</g, '\\<').replace(/>/g, '\\>');
    })
    .join('');

  return prefix + escaped;
}
```

### 4.3 Changes to `htmlToMarkdown()`

```typescript
export function htmlToMarkdown(html: string): string {
  const cleaned = html.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ');
- return turndown.turndown(cleaned);
+ return escapeAngleBrackets(turndown.turndown(cleaned));
}
```

### 4.4 Changes to `formatMessage()`

```typescript
function formatMessage(content, role, options, source) {
- const markdown = role === 'assistant' ? htmlToMarkdown(content) : content;
+ const markdown = role === 'assistant'
+   ? htmlToMarkdown(content)            // escaping applied inside htmlToMarkdown
+   : escapeAngleBrackets(content);      // escape user message content
  // ... rest unchanged
}
```

## 5. Edge Cases

| Case | Input | Expected Output | Notes |
|------|-------|-----------------|-------|
| Python traceback | `<module>` | `\<module\>` | Most common trigger |
| TS generics | `<Generic<T>>` | `\<Generic\<T\>\>` | Nested brackets |
| Angle in fenced code | ` ```\n<div>\n``` ` | Unchanged | Code block preserved |
| Angle in inline code | `` Use `<span>` here `` | Unchanged | Inline code preserved |
| Blockquote with angle | `> see <tag>` | `> see \<tag\>` | BQ marker preserved |
| Nested blockquote | `> > <tag>` | `> > \<tag\>` | All BQ levels preserved |
| No angles | `normal text` | `normal text` | No-op passthrough |
| Empty string | `""` | `""` | No-op |
| Fenced in blockquote | `> ```\n> <code>\n> ``` ` | Unchanged | BQ-wrapped code block |
| Comparison operator | `x > 0` at line start | `x \> 0` | Correct — not a BQ marker |
| Mixed content | Code + text + angles | Only text angles escaped | Combined scenario |

## 6. Test Plan

### 6.1 Unit Tests — `escapeAngleBrackets()`

New `describe('escapeAngleBrackets', ...)` block in `markdown.test.ts`:

| Test | Input | Assertion |
|------|-------|-----------|
| basic escape | `<module>` | `\<module\>` |
| nested angles | `<Generic<T>>` | `\<Generic\<T\>\>` |
| fenced code preserved | ` ```\n<div>\n``` ` | unchanged |
| fenced code with lang | ` ```ts\n<T>\n``` ` | unchanged |
| inline code preserved | `` Use `<span>` for this `` | `` Use `<span>` for this `` |
| blockquote preserved | `> text with <tag>` | `> text with \<tag\>` |
| nested blockquote | `> > nested <tag>` | `> > nested \<tag\>` |
| no angles | `plain text` | `plain text` |
| empty string | `""` | `""` |
| mixed: code + text | code block + `<module>` + inline code | only prose escaped |
| multiple angles per line | `<a> and <b>` | `\<a\> and \<b\>` |

### 6.2 Integration Tests — `conversationToNote()`

| Test | Setup | Assertion |
|------|-------|-----------|
| assistant angle escape | message with `&lt;module&gt;` in HTML | body contains `\<module\>` |
| user angle escape | user content `<Generic<T>>` | body contains `\<Generic\<T\>\>` |
| code block not escaped | assistant HTML with `<pre><code>&lt;div&gt;</code></pre>` | `<div>` inside code fence |
| inline code not escaped | assistant HTML `Use <code>&lt;span&gt;</code>` | `` `<span>` `` preserved |

### 6.3 Regression

- All existing `htmlToMarkdown` tests must pass (the escaping should not alter code blocks, tables, math, etc.)
- All existing `conversationToNote` tests must pass (callout formatting, blockquote mode, etc.)

## 7. Files Changed

| File | Change | Lines (est.) |
|------|--------|-------------|
| `src/content/markdown.ts` | Add `escapeAngleBrackets()` + `escapeAngleBracketsInLine()`, modify `htmlToMarkdown()` + `formatMessage()` | ~35 new, ~2 modified |
| `test/content/markdown.test.ts` | Add unit + integration tests | ~80 new |

**No changes required to:**
- Extractor files (gemini.ts, claude.ts, chatgpt.ts, perplexity.ts)
- Background service worker
- Popup UI
- manifest.json

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing tests break from new escaping | Medium | High | Run full suite before merge |
| Blockquote markers incorrectly escaped | Low | Medium | Explicit prefix extraction algorithm |
| Performance regression on large conversations | Very Low | Low | Line-by-line is O(n); no backtracking regex |
| Math expressions contain `<`/`>` | None | — | Math uses `data-math` attribute, processed by custom Turndown rules before text escaping |
| Footnote references broken | None | — | `[^N]` syntax has no angle brackets |
