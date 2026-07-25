# ADR-019: Coverage is measured over `src/` only, via `exclude`

## Status

Accepted (2026-07-25)

## Context

`vitest.config.ts` declared `coverage.include: ['src/**/*.ts']`, which reads as
"measure the extension source". It did not do that.

Vitest's own documentation describes `coverage.include` as the set of "covered
and uncovered files matching this pattern", with the default being "files that
were imported during test run". Empirically, with `vitest@4.1.8` and
`@vitest/coverage-v8@4.1.8`, setting `include` does **not** narrow the reported
set: the E2E selector-validation tooling under `e2e/` — imported by its own unit
tests, which `test.include` picks up via `e2e/**/*.test.ts` — appeared in every
report. Verified three ways, all of which still reported the `e2e/` directories:

| Attempt | Result |
| --- | --- |
| `include: ['src/**/*.ts']` in the config file | `e2e/` present |
| `--coverage.include='src/**/*.ts'` on the CLI | `e2e/` present |
| `--coverage.include='**/src/**/*.ts'` (globstar-anchored, cf. ADR-012) | `e2e/` present |
| `--coverage.exclude='e2e/**'` | `e2e/` **absent** |

Only `exclude` filters.

The consequence was that the thresholds gated the wrong population. E2E tooling
sits far below product code (`e2e/tools/gemini-pick-url.ts` at 12.9%,
`e2e/daemon/chrome-launcher.ts` at 26.0%), so it dragged the aggregate down:

| Population | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| Reported (src + e2e) | 90.85% | 84.76% | 94.45% | 91.66% |
| src only | 96.28% | 87.20% | 98.64% | 97.40% |

Against thresholds of 85/75/85/85, `src/` could have regressed by roughly eight
points and still passed. The gate was also coupled the wrong way round: growth
in developer tooling could fail CI for reasons unrelated to shipped code.

## Decision

Add `'e2e/**'` to `coverage.exclude` and raise the thresholds to match what
`src/` actually sustains: **95 / 85 / 95 / 95** (statements / branches /
functions / lines), a small margin under the measured 96.13 / 87.17 / 98.67 /
97.43.

`coverage.include` stays in the config with a comment recording that it does not
narrow the set on its own. It documents intent and becomes effective if the
upstream behaviour changes; the `exclude` entry is the mechanism that works
today.

Per-glob thresholds (`thresholds: { 'src/**': { … } }`) are supported by Vitest
and were considered. They are not used here: once `e2e/` is excluded, the global
thresholds already describe exactly the population we care about, and a single
set of numbers is easier to reason about.

## Consequences

- Coverage numbers now describe shipped extension code. The reported figure
  jumped from 90.85% to 96.13% statements with no test added — the earlier
  number was measuring a different thing, so it is not comparable to history.
- The gate is meaningfully tight: `src/` has ~1 point of statement headroom, so
  a genuine regression fails CI instead of hiding under tooling dilution.
- E2E tooling keeps its unit tests; they simply no longer count toward the
  product coverage gate.
- A new `src/` file with no test at all is still only visible once something
  imports it, because `include` does not add uncovered files here. Every current
  `src/` file is imported by the suite, so nothing is missing today; if that
  assumption breaks, revisit whether `include` has started working upstream.
