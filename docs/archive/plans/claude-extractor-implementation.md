# Claude Extractor Implementation Plan

## Objective
Add Claude AI conversation extraction support (normal chat + Deep Research) to gemini2obsidian Chrome Extension.

## HTML Structure Analysis

### Normal Chat (`claude-elements-sample.html`)
| Element | Selector |
|---------|----------|
| User message | `[data-testid="user-message"]` |
| User wrapper | `.bg-bg-300` (parent div) |
| Date | `.text-text-500.text-xs` |
| Assistant response | `.font-claude-response` |
| Markdown content | `.standard-markdown` |
| Deep Research button | `.artifact-block-cell` |

### Deep Research (`claude-deep-research-sample.html`)
| Element | Selector |
|---------|----------|
| Root container | `#markdown-artifact` |
| Content | `.standard-markdown` |
| Headings | `h1, h2, h3` with `.text-text-100` |
| Tables | `table.min-w-full` |
| Inline citations | `span.inline-flex a[href]` (source links) |

### URL Pattern
- Format: `https://claude.ai/chat/{uuid}`
- Example: `https://claude.ai/chat/1fbb8252-2bec-4ef2-bf1f-88393dd9bb5f`

## Implementation Steps

### Phase 1: Manifest & Routing

**1.1 Update `src/manifest.json`**
- Add `https://claude.ai/*` to `host_permissions`
- Add content_scripts entry for `https://claude.ai/chat/*`

**1.2 Update `src/content/index.ts`**
- Modify hostname validation to accept `claude.ai`
- Add extractor routing logic for Claude

### Phase 2: Claude Extractor

**2.1 Create `src/content/extractors/claude.ts`**

```typescript
// SELECTORS
const SELECTORS = {
  // User messages
  userMessage: ['[data-testid="user-message"]'],
  userWrapper: ['.bg-bg-300', '[class*="bg-bg-300"]'],

  // Assistant messages
  assistantResponse: ['.font-claude-response'],
  markdownContent: ['.standard-markdown', '.progressive-markdown'],

  // Date
  messageDate: ['.text-text-500.text-xs'],
};

// DEEP RESEARCH SELECTORS
const DEEP_RESEARCH_SELECTORS = {
  artifact: ['#markdown-artifact'],
  content: ['.standard-markdown'],
  title: ['h1.text-text-100', 'h1'],
  inlineCitation: ['span.inline-flex a[href^="http"]'],
};
```

**Key Methods:**
- `canExtract()`: Check `hostname === 'claude.ai'`
- `getConversationId()`: Extract UUID from `/chat/{uuid}` path
- `getTitle()`: First user message or h1 from Deep Research
- `extractMessages()`: Parse user/assistant message pairs
- `isDeepResearch()`: Check for `#markdown-artifact`
- `extractDeepResearch()`: Extract artifact content with citations

### Phase 3: Test Infrastructure

**3.1 Create `test/fixtures/dom-helpers.ts` additions**
- `createClaudeConversationDOM(messages)`
- `setClaudeLocation(conversationId)`
- `createClaudeDeepResearchDOM(title, content)`

**3.2 Create `test/extractors/claude.test.ts`**
- Platform detection tests
- Conversation ID extraction tests
- Message extraction tests
- Deep Research extraction tests
- Fallback selector tests

### Phase 4: Integration

**4.1 Update content script routing**
```typescript
// src/content/index.ts
const hostname = window.location.hostname;
let extractor: IConversationExtractor;

if (hostname === 'gemini.google.com') {
  extractor = new GeminiExtractor();
} else if (hostname === 'claude.ai') {
  extractor = new ClaudeExtractor();
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/manifest.json` | Add Claude URL patterns |
| `src/content/index.ts` | Add hostname routing |
| `src/content/extractors/claude.ts` | **NEW** - Claude extractor |
| `test/fixtures/dom-helpers.ts` | Add Claude DOM helpers |
| `test/extractors/claude.test.ts` | **NEW** - Claude tests |

## Output Format (Same as Gemini)

```markdown
---
id: claude_1fbb8252-2bec-4ef2-bf1f-88393dd9bb5f
title: '...'
source: claude
---

> [!QUESTION] User
> query text

> [!NOTE] Claude
> response text
```

## Deep Research Citations

Inline citations will be converted to Markdown footnotes:
```markdown
Content with citation[^1]

[^1]: [Source Title](https://example.com)
```

## Security Considerations

- Strict hostname validation (`===` not includes)
- DOMPurify sanitization for all HTML content
- Same CSP rules as Gemini

## Test Coverage Target

- Maintain 85%+ statement coverage
- Test all fallback selectors
- Test Deep Research detection and extraction
