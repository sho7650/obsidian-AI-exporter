# Workflow: DES-009 Claude Extended Thinking Fix

**Design**: [DES-009-claude-extended-thinking-fix.md](../design/DES-009-claude-extended-thinking-fix.md)
**Issue**: #48
**Branch**: `fix/claude-extended-thinking-extraction`

## Phase Overview

```
Phase 1: Branch Setup
  │
Phase 2: DOM Helper (test infrastructure)
  │
Phase 3: Test Cases (red → failing tests first)
  │
Phase 4: Implementation (green → make tests pass)
  │
Phase 5: Verification (lint, typecheck, full test suite)
  │
Phase 6: Documentation Update
```

---

## Phase 1: Branch Setup

**Goal**: Create feature branch from main

### Step 1.1: Create branch
```bash
git checkout -b fix/claude-extended-thinking-extraction
```

**Checkpoint**: `git branch --show-current` shows `fix/claude-extended-thinking-extraction`

---

## Phase 2: DOM Helper

**Goal**: Add Extended Thinking DOM generation to test fixtures
**File**: `test/fixtures/dom-helpers.ts`

### Step 2.1: Update `ClaudeConversationMessage` interface

Add optional `thinking` field:

```typescript
interface ClaudeConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string[];  // Extended Thinking chunks
}
```

### Step 2.2: Create `createClaudeExtendedThinkingResponse()` helper

New private function to generate the grid layout with `.row-start-1` (thinking) and `.row-start-2` (response):

```typescript
function createClaudeExtendedThinkingResponse(
  content: string,
  thinkingChunks: string[],
  collapsed: boolean = true
): string
```

Must generate:
- Outer `div.grid` with appropriate `grid-rows-[...]` class
- `.row-start-1` containing thinking chunks as individual `.standard-markdown` elements
- `.row-start-2` containing the actual response as `.standard-markdown`
- `button` with "Claude's Thoughts" text (for realism)

### Step 2.3: Modify `createClaudeConversationDOM()` branching

When `msg.thinking` is provided on an assistant message, call `createClaudeExtendedThinkingResponse()` instead of the flat `.standard-markdown` structure.

**Checkpoint**: `npm run lint` and `npx tsc --noEmit` pass

---

## Phase 3: Test Cases

**Goal**: Write 5 new test cases (expected to fail before implementation)
**File**: `test/extractors/claude.test.ts`

### Step 3.1: Add `describe('Extended Thinking')` block

Location: After the existing "Message Extraction" describe block (after line ~267).

### Step 3.2: Test case list

| # | Test Name | DOM Setup | Assertion |
|---|-----------|-----------|-----------|
| 1 | extracts response content, not thinking content (collapsed) | Single turn, `thinking: ['chunk1']`, collapsed grid | Content matches response, not thinking |
| 2 | extracts response content, not thinking content (expanded) | Same but with expanded grid class | Same assertion |
| 3 | handles multiple thinking chunks without capturing any | `thinking: ['chunk1', 'chunk2', 'chunk3']` | Content is response only |
| 4 | works with mixed conversation | Turn 1: no thinking; Turn 2: with thinking | Both turns extract correct content |
| 5 | backward compatible: non-thinking responses still work | Standard DOM (no thinking) | Existing behavior preserved |

Each test uses `createClaudePage()` with the extended message format.

**Checkpoint**: `npx vitest run test/extractors/claude.test.ts` shows 5 new **failing** tests (red phase)

---

## Phase 4: Implementation

**Goal**: Fix `extractAssistantContent()` to skip Extended Thinking content
**File**: `src/content/extractors/claude.ts`

### Step 4.1: Modify `extractAssistantContent()` (lines 273-282)

Apply the `.row-start-2` scoping logic from DES-009 Section 3.3.1:

1. First, check `element.querySelector('.row-start-2')`
2. If found, scope `queryWithFallback` to that section
3. If not found, fall through to existing behavior

**Checkpoint**: `npx vitest run test/extractors/claude.test.ts` shows all tests **passing** (green phase)

---

## Phase 5: Verification

**Goal**: Ensure no regressions across the entire project

### Step 5.1: Full test suite
```bash
npx vitest run
```
**Expect**: All tests pass (existing + 5 new)

### Step 5.2: TypeScript strict check
```bash
npx tsc --noEmit
```
**Expect**: 0 errors

### Step 5.3: ESLint
```bash
npm run lint
```
**Expect**: 0 errors, 0 warnings

### Step 5.4: Prettier
```bash
npm run format
```

### Step 5.5: Build
```bash
npm run build
```
**Expect**: Clean build

**Checkpoint**: All 5 verification steps pass

---

## Phase 6: Documentation Update

**Goal**: Finalize investigation document status

### Step 6.1: Update investigation document

**File**: `docs/investigation/claude-extended-thinking-dom.md`

- Change Status to: `Complete (fix implemented in DES-009)`
- Update Proposed Fix section to reference the actual implementation

### Step 6.2: Update design document status

**File**: `docs/design/DES-009-claude-extended-thinking-fix.md`

- Change Status from `Draft` to `Implemented`

**Checkpoint**: All doc updates committed

---

## Dependency Map

```
Phase 1 (branch)
    └──→ Phase 2 (DOM helper)
              └──→ Phase 3 (tests - red)
                        └──→ Phase 4 (implementation - green)
                                  └──→ Phase 5 (verification)
                                            └──→ Phase 6 (docs)
```

All phases are sequential. No parallelism possible due to dependencies.

---

## Exit Criteria

- [ ] 5 new Extended Thinking tests pass
- [ ] All existing tests pass (no regressions)
- [ ] `npm run build` succeeds
- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] Investigation doc status updated
- [ ] Design doc status updated
