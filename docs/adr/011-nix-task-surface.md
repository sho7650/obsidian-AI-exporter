# ADR-011: Nix as Canonical Task Surface

## Status

Accepted (2026-05-02).

Extends [ADR-010](010-nix-only-dev-environment.md).

## Context

[ADR-010](010-nix-only-dev-environment.md) made `flake.nix` the single source of truth for the **dev environment** (Node toolchain + system deps), replacing `mise`. It deliberately scoped the change to environment provisioning; the **task surface** remained `npm run …` (e.g. `npm run build`, `npm run test`, `npm run e2e:auth`).

The maintainer subsequently asked whether TypeScript execution, transpile, and test workflows could also be expressed through Nix — i.e. whether `nix run .#test` should be a first-class equivalent to `npm run test`.

Three architectural shapes were considered:

- **Option A — Nix `apps` wrap `node_modules/.bin` binaries.** Each script in `package.json` is mirrored as a `pkgs.writeShellApplication` exposed under `apps.<system>.<name>`. Tool binaries (`vite`, `vitest`, `eslint`, `tsc`, `prettier`, `tsx`, `playwright`) continue to be installed by npm into `./node_modules/.bin/`; Nix supplies the runtime (`nodejs_24`, `zip`, `bash`, `coreutils`) and the invocation surface.
- **Option B — `pkgs.buildNpmPackage` derivation owns `node_modules`.** A Nix derivation produces a hash-pinned `node_modules/` in the Nix store; build/zip become Nix derivations; apps consume the store-built tree. Hermetic, but introduces sandbox-only failure modes (Playwright browser download, Vite/Vitest cache writes, `@crxjs/vite-plugin@2.0.0-beta.23` resolution under sandbox) and an `npmDepsHash` maintenance burden that must be kept in sync with every `package-lock.json` change.
- **Option C — Hybrid: pin standalone CLIs (typescript, prettier, tsx) at Nix level, leave plugin-coupled tools in npm.** Mixed sources of truth for tool versions; rejected as confusing without addressing the stated goal.

### Verified facts (2026-05-02)

- All 14 npm scripts in `package.json` (`dev`, `build`, `build:zip`, `lint`, `lint:platforms`, `format`, `format:check`, `test`, `test:watch`, `test:coverage`, `e2e:auth`, `e2e:selectors`, `e2e:selectors:headed`, `e2e:daemon`) reduce to invocations of binaries already present in `node_modules/.bin/` after `npm ci`.
- `pkgs.writeShellApplication` (nixpkgs-25.11-darwin) provides the wrapper primitive needed for Option A with no additional inputs.
- `package.json` `overrides` (`@crxjs/vite-plugin → rollup 2.80.0`, `undici >=7.24.0`) are resolved by npm at lockfile-generation time and are inert at runtime; they are unaffected by Option A.
- Nix attribute names cannot contain `:`. Script names like `e2e:auth` map to attribute names like `e2e-auth`.

## Decision

Adopt **Option A**. The `flake.nix` `apps` outputs become the **canonical task surface**; `npm run …` continues to work unchanged as a compatibility alias.

### Concrete settings

| Decision | Value | Rationale |
|---|---|---|
| Task surface | `nix run .#<name>` for every npm script | Single canonical entry point; works from any directory containing the flake. |
| Wrapper primitive | `pkgs.writeShellApplication` | Stdlib idiom in nixpkgs; gives `set -euo pipefail` and PATH composition for free. |
| Script name mapping | `:` → `-` (`e2e:auth` → `e2e-auth`) | Nix attribute-name syntax requirement. Documented in README. |
| `node_modules/` missing behaviour | Fail with a clear error pointing at `npm ci` | Project rule: "package.json / node_modules に触る操作は必ずユーザー承認を得る". Auto-install rejected for the same reason. |
| `npm run …` retention | Keep all `package.json` scripts unchanged | Backwards compatibility for muscle memory, IDE integrations, and `husky`/`release-please`. |
| Tool binary source | `./node_modules/.bin/` (npm-installed) | Plugin-coupled tools (Vite + `@crxjs/vite-plugin` + `vite-plugin-static-copy`, Vitest + `@vitest/coverage-v8`, ESLint + `typescript-eslint`) require Node module resolution from the project root; Nix-store binaries would either lose plugin discovery or require Option B's sandbox-aware setup. |
| Argument forwarding | `"$@"` in every wrapper | Allows `nix run .#e2e-daemon -- start` and equivalent forms. |
| CI migration | Deferred (unchanged from ADR-010) | Out of scope. |

## Consequences

### Positive

- **Single canonical surface**: every workflow is invocable through `nix run .#<name>`, consistent with the nix-only philosophy of ADR-010.
- **Zero risk of plugin-resolution regression**: Option A does not move tool binaries; Vite/Vitest/ESLint plugin discovery is byte-identical to the prior `npm run` path.
- **Trivial reversibility**: removing `apps` from `flake.nix` reverts the change without touching `package.json` or `node_modules/`.
- **`npm run` continues to work**, preserving editor integrations, `release-please`, and contributor muscle memory.
- **No new flake inputs**: `flake.lock` does not change.

### Negative / risks

- **Two sources of truth for tool versions**: Node runtime is pinned by Nix (`nodejs_24` via `flake.lock`); every other tool is pinned by npm (`package.json` + `package-lock.json`). Acceptable trade-off: Option B's hermeticity is not worth the Playwright sandbox / `npmDepsHash` maintenance cost on a Chrome extension dev workflow.
- **Onboarding edge case**: a contributor running `nix run .#test` before `npm ci` hits the missing-`node_modules` error. Mitigated by the wrapper's error message and README.
- **Naming mismatch (`:` vs `-`)**: documented in README; both surfaces are first-class so contributors can use whichever they remember.

### Out of scope (future work)

- **Option B** (`buildNpmPackage`-based hermetic builds). Would warrant a separate ADR if pursued; revisit if the project's contributor base grows or CI moves to Nix.
- **CI migration** to `cachix/install-nix-action` + `nix run .#<task>` (deferred per ADR-010).
- **Auto-install** on missing `node_modules/` (rejected per project rules).
