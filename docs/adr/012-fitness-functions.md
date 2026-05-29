# ADR-012: Architecture Fitness Functions

## Status

Accepted (2026-05-29).

Informed by an internal research note on fitness functions and the design philosophy recorded in [CLAUDE.md](../../CLAUDE.md).

## Context

CLAUDE.md and the global coding-style rules state an explicit design philosophy for this codebase: a one-way layering (`Content → Background → Obsidian`), an extractor pattern, a platform Single Source of Truth (SSOT) anchored in `src/manifest.json`, and maintainability limits (small files, small functions, shallow nesting). Until now these were enforced by convention and review only — nothing failed CI when a layer was crossed, a cycle was introduced, or a platform fell out of sync on the code side.

That research note reframes "is the code adapted to its design intent?" as a set of **machine-checkable rules with pass/fail thresholds** (Neal Ford / Rebecca Parsons, *Building Evolutionary Architectures*). The maintainer asked whether such fitness functions could be generated and used to verify (検収) this codebase.

### Verified facts (2026-05-29)

- The repo already runs an implicit fitness-function suite, wired into `ci.yml` on every PR: ESLint (`no-explicit-any`, `no-console`) **+ `scripts/lint-platforms.mjs`** (platform SSOT across docs/locales/manifest), `prettier --check`, `tsc --noEmit`, Vitest coverage thresholds (85/75/85/85), commitlint, and the Playwright/CDP **selector-validation** harness (a continual/temporal DOM-drift detector).
- The dependency direction is currently clean: `src/lib` does not import `content`/`background`/`popup`/`offscreen`; `content` reaches `background` only via the Chrome messaging API; extractors import only `base`, `selectors`, `lib`, and `content/markdown-rules`.
- No automated check covered: (a) the layering direction, (b) import cycles, (c) the **code-side** of the platform SSOT (`AIPlatform` union, `ALLOWED_ORIGINS`, `getExtractor()` routing), (d) the maintainability limits.
- `@nielspeter/ts-archunit@0.10.0` (Vitest-native, `ts-morph`-based) provides `project()`, `modules().that().resideInFolder().should().notImportFrom()`, and `slices().beFreeOfCycles()`. It requires **Node ≥ 24**. `flake.nix` already uses `nodejs_24` and local dev is on v24; only `.github/workflows/ci.yml` lagged at Node 20.

Two tooling shapes were considered for the dependency-direction/cycle checks:

- **Option A — `@nielspeter/ts-archunit`.** Vitest-native, actively maintained, `ts-morph` analysis, first-class `.warn()`/`.severity()`. Requires Node ≥ 24.
- **Option B — `tsarch` (MaibornWolff).** The package literally cited in the research note; Node-20 compatible but less maintained, and Vitest 4 / TS 5.3 compatibility was unverifiable offline.

## Decision

Adopt **Option A**. Formalize the design philosophy as fitness functions that run inside the existing Vitest + ESLint gates (no new CI stage), per the research note's staged-adoption guidance.

### Concrete settings

| Decision | Value | Rationale |
|---|---|---|
| Arch-test library | `@nielspeter/ts-archunit` (devDependency) | Vitest-native, maintained, matches the research note's intent (layering + cycles). |
| Layering tests | `test/arch/layering.test.ts` | Enforces `lib`/`content`/`background`/`popup`/`offscreen` import direction. |
| Cycle test | `test/arch/cycles.test.ts` | `slices('src/*/').beFreeOfCycles()` over top-level subsystems. |
| Code-side SSOT | `test/arch/platform-ssot.test.ts` | Manifest matches ↔ `AIPlatform` union, `ALLOWED_ORIGINS`, `getExtractor()` routing, `host_permissions`. Complements `lint-platforms.mjs` (docs side). |
| Maintainability limits | ESLint `max-lines` 800, `max-lines-per-function` 50, `max-depth` 4, `complexity` 15 | Codifies CLAUDE.md / coding-style limits. |
| Limit severity | **`warn` first** | Per the note's staged-threshold advice: surface drift without breaking CI on existing files (e.g. `popup/index.ts` 542 lines). Promote to `error` in a later PR once clean. |
| CI Node version | `20` → `24` | Required by `@nielspeter/ts-archunit`; also aligns CI with the existing `flake.nix` `nodejs_24` and local toolchain, fixing pre-existing drift. |
| Wiring | None beyond the above | Vitest auto-collects `test/**/*.test.ts`; ESLint runs under `npm run lint`; `ci.yml` already runs both. |

## Consequences

- **Positive.** Layer violations, import cycles, and code-side platform drift now fail `npm run test`. Maintainability regressions surface as ESLint warnings. The design philosophy is executable, not just documented — ADRs *record* decisions, fitness functions *assure* them.
- **Negative / cost.** One new devDependency (transitively `ts-morph`, `picomatch`, and an optional `graphql` peer used only by an unused subpath). Arch tests add a `ts-morph` project load (~hundreds of ms) to the suite. The `PLATFORM_IDS` map in the SSOT test is a second place to update when adding a platform — intentional, mirroring `HOST_DISPLAY_NAMES` in `lint-platforms.mjs`.
- **Follow-up.** Once the codebase is clean against the ESLint limits, promote them from `warn` to `error`. Candidate future fitness functions (deferred, see assessment doc): Chrome-API purity test, sanitization-path invariant, dependency-drift/vuln gate, content-script bundle-size budget.

## Related

- [docs/fitness-functions-assessment.md](../fitness-functions-assessment.md) — principle → fitness-function mapping (the 検収 report).
- [ADR-005](005-shared-selector-modules.md), [ADR-011](011-nix-task-surface.md).
