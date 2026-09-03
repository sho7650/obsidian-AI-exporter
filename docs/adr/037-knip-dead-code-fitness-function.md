# ADR-037: knip as the dead-code fitness function

- Status: Accepted
- Date: 2026-09-03
- Extends: [ADR-012](012-fitness-functions.md)
- Related: [ADR-015](015-entry-shim-coverage.md), [#471](https://github.com/sho7650/obsidian-AI-exporter/pull/471), [#474](https://github.com/sho7650/obsidian-AI-exporter/pull/474)

## Context

ADR-012 made the design philosophy executable — layering, cycles, platform SSOT,
maintainability limits — but left one class of drift unguarded: code that nothing
reaches any more. Unused exports, unused files, and dependencies that are imported
but not declared were only ever found by hand.

The 2026-09-03 optimisation round ran [knip](https://knip.dev) against the tree and
found, with an independent grep scan agreeing on every item:

| Finding | Count | Verdict |
| --- | --- | --- |
| Unused exports / exported types in `src/` | 4 + 4 | Real: `export` on symbols only used in their own file (fixed in #474) |
| Unused files | 2 | False positive: `src/content/index.ts` and `src/popup/index.ts` are the CRXJS entry shims (ADR-015), referenced only from `manifest.json` and `popup/index.html` |
| Unlisted dependency | 1 | Real: seven `e2e/` files import `playwright` directly while only `@playwright/test` was declared; it resolved through the transitive dependency |
| Dead code to delete | 0 | — |

Two of the three real findings were invisible to every existing gate.

## Decision

Adopt knip as fitness function #11 and run it in the `lint` chain, so a finding
fails CI on every PR.

| Aspect | Decision | Rationale |
| --- | --- | --- |
| Tool | `knip` (devDependency, `^6.34.0`) | Zero config for the Vitest and Playwright plugins; reports files, exports, types, and dependencies in one pass |
| Wiring | `npm run lint` = ESLint → platform lint → `knip`; also `npm run lint:dead` / `nix run .#lint-dead` on their own | `ci.yml` already runs `npm run lint`, so no workflow change; a standalone entry keeps the fast local loop |
| Config | `knip.jsonc` declaring the four manifest entry points | knip cannot read `src/manifest.json`; declaring the shims as entries removes the false positive without an `ignore` that would also hide a genuinely dead file. `jsonc` so the reason lives next to the setting |
| Test-only exports | Not reported, by design | Vitest test files are entries, so an export consumed only by a test counts as used. ADR-015's `getExtractor` / `initialize` / `handleSync` stay exported |
| `playwright` | Declared in devDependencies at the same range as `@playwright/test` (`^1.58.2`) | The two packages must resolve to one version — a first attempt with a bare `npm install` pulled 1.62.1 next to `@playwright/test`'s 1.58.2 and was re-pinned. The lockfile holds a single, de-duplicated `playwright@1.58.2` |

## Consequences

- **Positive.** An `export` that loses its last consumer, a module that nothing
  imports, or an import of an undeclared package now fails the PR instead of
  waiting for the next manual audit.
- **Cost.** One devDependency; `npm run lint` gains roughly two seconds.
- **Maintenance.** A new manifest entry point (a second content script, a new
  page) must be added to `knip.jsonc`, or knip will report it as an unused file.
  That is the right failure: it makes the new entry explicit.
- Deleting a genuinely dead file remains a human decision; knip only reports.

## Files

| Path | Role |
| --- | --- |
| `knip.jsonc` | Entry points knip cannot infer, with the reason |
| `package.json` | `knip`, `playwright` devDependencies; `lint`, `lint:dead` scripts |
| `flake.nix` | `lint` app runs knip; new `lint-dead` app |
| `docs/fitness-functions-assessment.md` | Row 11 |
