# ADR-015: Entry-shim pattern for coverage of side-effectful entry points

## Status

Accepted (2026-07-04)

## Context

`src/popup/index.ts` (537 lines) and `src/content/index.ts` (374 lines) ran
side effects at import time: the popup queried ~24 DOM elements at module
scope and threw when any was missing; the content script auto-ran
`initialize()` on load. Because importing them in jsdom was impossible
without the full production DOM, both were excluded from coverage
(`vitest.config.ts`), and their tests re-implemented logic inline without
ever importing the real modules. ~995 lines — the most side-effect-heavy
code in the extension — were invisible to the coverage gates
(2026-07-04 analysis, quality finding "coverage blind spot").

## Decision

Split each entry point into:

- an **entry shim** (`popup/index.ts`, `content/index.ts`): a few lines whose
  only job is the import-time side effect (`DOMContentLoaded` wiring /
  `startContentScript()`). The manifest and popup HTML keep pointing at these
  paths, so CRXJS wiring is unchanged.
- a **logic module** (`popup/app.ts`, `content/bootstrap.ts`): everything
  else, importable with no side effects. The popup's DOM element map is
  queried inside `initPopup()` instead of at module scope.

Coverage excludes only the shims, each with a justification comment. Tests
import the real logic modules and drive them through their public surface
(`initPopup`, `initialize`, `handleSync`, `startContentScript`) against
fixture DOM, with only the storage/messaging/ui seams mocked.

## Consequences

- The coverage number now measures the whole codebase minus ~15 shim lines;
  both logic modules entered measurement above 93% statements.
- The `platform-ssot` fitness function's extractor-routing assertion moved
  from `content/index.ts` to `content/bootstrap.ts`.
- New entry points must follow the same pattern: shims contain wiring only;
  anything worth testing goes in an importable module.
- Rebuilt `dist/` keeps identical manifest wiring (entry paths unchanged);
  a manual smoke test of the loaded extension is still the final check for
  entry wiring, since jsdom cannot execute the MV3 loader chain.
