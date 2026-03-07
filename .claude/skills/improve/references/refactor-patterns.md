# Refactoring Patterns

This document defines safe refactoring patterns for Phase 3 (Refactor) of the autonomous improvement loop.

## Core Principles

1. **Preserve behavior**: Refactoring MUST NOT change externally observable behavior.
2. **One commit per change**: Each refactoring is an independent commit.
3. **Verify with tests**: Always run tests after refactoring.
4. **Keep reversible**: Keep changes small enough to safely `git revert`.

## Pattern 1: Extract Function (extract-function)

**When to apply**: Function exceeds 50 lines.

**Steps**:
1. Identify a cohesive block of logic within the function.
2. Extract it into a new private function.
3. Call the new function from the original location.
4. Carry over type information accurately.

**Warnings**:
- Be careful when extracting blocks with side effects.
- Pass closure-captured variables as explicit arguments.
- Name the extracted function to accurately describe its purpose.

**Commit message example**: `refactor: extract parseArticleContent from ingest-service [round N]`

## Pattern 2: Simplify Conditional (simplify-conditional)

**When to apply**: Nesting 3+ levels deep, or complex boolean expressions.

**Steps**:
1. Reduce nesting with guard clauses (early return).
2. Extract complex conditions into named boolean variables.
3. Replace switch statements with object maps (when appropriate).

**Warnings**:
- Ensure removing else clauses preserves the original logic exactly.
- Watch for side effects when reordering conditions.

**Commit message example**: `refactor: simplify error handling conditionals in article-service [round N]`

## Pattern 3: Remove Duplication (remove-duplication)

**When to apply**: Same or very similar code blocks exist in 2+ locations.

**Steps**:
1. Identify duplicate sections and clarify their differences.
2. Parameterize differences and create a shared function.
3. Replace original locations with calls to the shared function.
4. Place the shared function in an appropriate module (avoid dumping into generic utils/helpers).

**Warnings**:
- Do NOT deduplicate coincidental duplication (looks the same but exists for different reasons).
- Verify that deduplication does not create complex dependency chains.

**Commit message example**: `refactor: extract shared pagination logic from article and source routes [round N]`

## Pattern 4: Split File (split-file)

**When to apply**: File exceeds 300 lines.

**Steps**:
1. Classify responsibilities within the file.
2. Create new files and move related code.
3. Update export/import statements.
4. Add re-exports in index.ts (if needed).

**Warnings**:
- MUST NOT create circular dependencies.
- Update ALL existing import paths.
- Update test file imports as well.

**Commit message example**: `refactor: split article-service into article-query and article-mutation [round N]`

## Pattern 5: Strengthen Types (strengthen-types)

**When to apply**: Use of `any` type, excessive type assertions, insufficient type guards.

**Steps**:
1. Replace `any` with specific types.
2. Replace type assertions (`as Type`) with type guard functions.
3. Add exhaustive checks for union types.

**Warnings**:
- When external library type definitions are insufficient, allow `any` with a `// biome-ignore` comment.
- Verify that type changes do not break existing tests.

**Commit message example**: `refactor: replace any types with proper interfaces in ingest-service [round N]`

## Rollback Patterns

When refactoring causes test failures, the loop auto-reverts using these strategies. Understanding the rollback flow helps avoid patterns that are hard to revert cleanly.

### Individual Commit Revert

The primary rollback strategy. Each refactoring is committed individually, so a failing refactoring can be reverted without affecting other changes in the same round.

**How it works**:
1. Phase 3 commits each refactoring as a separate commit with a `refactor:` prefix.
2. Phase 4 runs the full test suite after all refactorings.
3. If tests fail, the loop collects all refactoring commit SHAs from the current round using the savepoint tag.
4. Each commit is reverted individually (newest first) using `git revert --no-edit`.
5. If a revert causes a merge conflict, the loop aborts entirely (abort condition #1).

**Why individual commits matter**: If multiple refactorings were squashed into one commit, you could not revert just one problematic change. The one-commit-per-refactoring rule makes selective rollback possible.

### Savepoint-Based Full Revert

The fallback strategy when individual reverts are insufficient.

**When used**: After reverting all refactoring commits, if tests still fail (meaning Phase 2 fixes also have problems), the loop reverts everything back to the savepoint tag created at the start of the round.

**How it works**:
1. At the start of each round, a git tag `savepoint-round-N` is created.
2. If full revert is needed: `git revert --no-edit "savepoint-round-N"..HEAD`
3. This reverts ALL changes made during the round (both fixes and refactorings).

### Blocklist Accumulation

A learning mechanism that prevents repeated failures.

**How it works**:
1. When a file/strategy combination causes a revert, it is added to `.improvement-state/refactor-blocklist.json`.
2. In subsequent rounds, Phase 3 skips any file/strategy that appears in the blocklist.
3. The blocklist persists across loop runs, so previously problematic patterns are not retried.

**Format**:
```json
[
  { "file": "src/services/article-service.ts", "strategy": "split-file", "round": 2, "reason": "circular dependency after split" }
]
```

### Pre-condition Gate

A preventive measure that avoids refactoring when tests are already unstable.

**How it works**:
1. Before Phase 3 starts, the full test suite is run.
2. If any test fails, the loop attempts to fix it (max 2 attempts).
3. If tests remain unstable, Phase 3 is skipped entirely for that round.
4. This prevents refactoring on an unstable codebase, which would make it impossible to determine whether a test failure was caused by the refactoring or a pre-existing issue.

## Patterns NOT to Apply

The following refactorings are **NOT performed** in the autonomous improvement loop (too risky):

- Architecture changes (major directory structure reorganization)
- Database schema changes
- External API interface changes
- Dependency library updates
- Test framework or build tool changes
- Performance optimization (optimization without measurement is harmful)
