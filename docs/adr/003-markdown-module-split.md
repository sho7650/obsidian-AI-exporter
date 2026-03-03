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
