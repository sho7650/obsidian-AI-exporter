# Fitness-Function Assessment (検収)

**Question:** Is this codebase adapted to its original design intent, and can that be verified objectively?

**Answer:** Yes. Each documented design principle maps to a fitness function with a machine-checkable pass/fail. Most already existed (implicitly); [ADR-012](adr/012-fitness-functions.md) adds the missing layering, cycle, code-side SSOT, and maintainability checks. This document is the mapping. Terminology follows *Building Evolutionary Architectures* (Neal Ford / Rebecca Parsons).

## Design principle → fitness function

| # | Design principle (source) | Fitness function | Classification | Status |
|---|---|---|---|---|
| 1 | One-way layering: `Content → Background → Obsidian`; `lib` shared base; `popup`/`offscreen` leaves (CLAUDE.md › Architecture) | `test/arch/layering.test.ts` — `modules().resideInFolder().should().notImportFrom()` for each layer | atomic · triggered · static | **New (ADR-012)** |
| 2 | No architecture erosion via circular coupling | `test/arch/cycles.test.ts` — `slices('src/*/').beFreeOfCycles()` | atomic · triggered · static | **New (ADR-012)** |
| 3 | Platform SSOT = `manifest.json` matches; code must agree (CLAUDE.md › Adding New Platforms) | `test/arch/platform-ssot.test.ts` (code side: `AIPlatform` union, `ALLOWED_ORIGINS`, `getExtractor()`, `host_permissions`) + `scripts/lint-platforms.mjs` (docs/locales side) | holistic · triggered · static | **New + existing** |
| 4 | No untyped escape hatches; clean console usage | ESLint `@typescript-eslint/no-explicit-any`, `no-console` | atomic · triggered · static | Existing |
| 5 | Type safety (strict mode, no type errors) | `tsc --noEmit` (in `build`) | atomic · triggered · static | Existing |
| 6 | Maintainability: files ≤ 800 lines, functions < 50, nesting ≤ 4, bounded complexity (CLAUDE.md / coding-style) | ESLint `max-lines`, `max-lines-per-function`, `max-depth`, `complexity` (warn-first) | atomic · triggered · dynamic→static | **New (ADR-012)** |
| 7 | Test confidence | Vitest coverage thresholds 85/75/85/85 | atomic · triggered · static | Existing |
| 8 | Consistent commit/release hygiene | commitlint (conventional commits) | atomic · triggered · static | Existing |
| 9 | Consistent formatting | `prettier --check` | atomic · triggered · static | Existing |
| 10 | DOM selectors keep working as target sites evolve | Playwright + CDP selector-validation harness (`e2e/selectors`) | holistic · continual/temporal · dynamic | Existing |

All triggered functions run in `.github/workflows/ci.yml` on every PR (lint → format → coverage → build); the selector harness runs on demand against live sites.

## What "verification (検収)" looks like

- **Green on `main`** = the codebase currently conforms to principles 1–9.
- **Plant-violation proof** (done during ADR-012 implementation): adding a `src/lib → src/content` import makes case 1 fail; dropping a platform from `ALLOWED_ORIGINS` makes case 3 fail. The gate demonstrably catches regressions, not just passes vacuously.
- **Warn-first limits** (principle 6) report current drift without blocking; promotion to `error` is the next ratchet.

## Deferred (candidate future fitness functions)

Scoped out of ADR-012 to keep the change focused; recorded here so the backlog is explicit (the note warns against over-fitting to all `-ilities`):

- **Chrome-API purity** — assert designated pure modules (e.g. `note-generator.ts`, `path-utils.ts`) never reference `chrome.*`, protecting testability. (`messaging`/`storage`/`i18n` legitimately use `chrome`.)
- **Sanitization-path invariant** — assert extractor HTML always flows through `sanitizeHtml()` (DOMPurify).
- **Immutability lint** — `no-param-reassign` and related, codifying the immutability rule.
- **Dependency-drift / vulnerability gate** — `npm audit --audit-level=high` (or osv-scanner) as a temporal gate — the `failBuildOnCVSS` analog.
- **Content-script bundle-size budget** — regression gate on the built bundle size.

## References

- *Building Evolutionary Architectures* (Ford, Parsons, Kua) — the fitness-functions concept this operationalizes.
- [ADR-012](adr/012-fitness-functions.md) — the decision and concrete settings.
