# ADR-009: mise + nix Development Environment

## Status

Superseded by [ADR-010](010-nix-only-dev-environment.md) (2026-05-01).

The "nixpkgs Node lags upstream" rationale (cited as the reason to keep mise as the Node manager) was empirically refuted: `pkgs.nodejs_24` in `nixpkgs-25.11-darwin` resolves to **24.15.0** (bit-identical to the upstream LTS and to the mise pin recorded here), with bundled npm 11.12.1, and is in the darwin binary cache. ADR-010 records the migration to a single-tool nix architecture.

The "Implementation-time discoveries" section below is preserved for historical context — the `pkgs.mise` build failure on `aarch64-darwin` and the `nix-direnv` bash 4.4 finding remain valid institutional knowledge.

## Context

The project previously had no declarative dev-environment pinning: contributors relied on whatever `node` / `npm` / `zip` happened to be on the host. With `mise` and `nix` now both installed on the maintainer machine, we want a reproducible setup that:

- Pins the Node toolchain so a fresh checkout always builds with the same runtime.
- Provides system-level utilities (`mise` itself, `zip` for `npm run build:zip`) without polluting the host's global environment.
- Does not break the Playwright + CDP daemon (`e2e/daemon/`) which deliberately uses the host's installed Chrome to bypass automation detection.
- Keeps CI (`actions/setup-node@v4`) untouched in this iteration; CI migration is a follow-up.

### Verified facts at decision time (2026-04-30)

- Host: macOS `aarch64-darwin`, Node 24.15.0, npm 11.12.1, mise 2026.4.22, nix 2.34.6 (upstream Nix, not Determinate — verified via `org.nixos.*` LaunchDaemons and absence of `experimental-features` in `/etc/nix/nix.conf`).
- `e2e/daemon/chrome-launcher.ts` spawns the host's Chrome via `findChromeExecutable()` and connects through `chromium.connectOverCDP()`. Comment in source: "Spawns Chrome as a regular process (not via Playwright) to avoid automation flags that trigger bot detection." Playwright's bundled Chromium is **not** a substitute.
- Node 22 LTS bundles npm 10.9.x; Node 24 bundles npm 11.x — relevant to the npm-pinning question below.

## Decision

Adopt a **layered architecture**:

- **`mise`** owns Node toolchain pinning via `mise.toml` + `mise.lock`.
- **`nix` flake** owns system-level non-JS dependencies that are not already on the host (`zip` today; future additions as needed).
- **`direnv` (from `nix profile`) + `nix-direnv`** + `.envrc` glues them together for auto-shell-entry on `cd`.

`mise` itself is **not** provided by the flake — it is a host-level prerequisite (installed once via the official mise installer, Homebrew, or any other channel). Pinning mise to the flake was attempted but rejected (see Alternatives Considered).

`direnv` must come from `nix profile install nixpkgs#direnv` (not from `mise`, `brew`, or any other channel) to satisfy `nix-direnv`'s bash ≥ 4.4 requirement on macOS, where the system bash is 3.2.57. See Consequences below.

### Concrete settings

| Decision | Value | Rationale |
|---|---|---|
| Node major | **24** | Match current host; bundles npm 11 — eliminates npm divergence vs host. |
| Node pin strategy | **`mise.lock`** | mise's own docs recommend it over inline `mise.toml` pins for reproducibility. |
| npm | **Node-bundled (npm 11.x)** | No separate pin needed once Node 24 is used. |
| nixpkgs channel | **`nixpkgs-25.11-darwin`** | Per nix.dev FAQ, macOS users should use `nixpkgs-*-darwin` channels (Hydra-tested darwin pre-builds). No `*-stable` alias exists in nixpkgs; `YY.MM` form is canonical. |
| nix `experimental-features` enable | **`~/.config/nix/nix.conf`** (user scope) | Flakes are not enabled by default on upstream Nix 2.34.6; user-level config avoids `sudo` and is per-developer. |
| direnv variant | **`nix-direnv`** | Caches flake evaluation (near-instant subsequent entries) and adds gcroots so deps survive `nix-collect-garbage`. Plain `use flake` re-evaluates on every `cd`. |
| Playwright Chrome | **Host system Chrome** | Daemon explicitly avoids Playwright-bundled Chromium for bot-detection bypass; nixpkgs `google-chrome` is unfree and unavailable on `aarch64-darwin`. |
| `[tasks.*]` in mise.toml | Deferred | `package.json` scripts already cover the surface area. |
| CI migration | Deferred (separate PR) | Keep `actions/setup-node@v4` until a focused follow-up. |

### Architecture rejected: nix-only or mise-only

| Alternative | Rejected because |
|---|---|
| **mise-only with `nix:` backend** (jbadeau/mise-nix plugin) | Plugin resolves through nixhub.io, not the host's flake registry — no `flake.lock` produced, weaker reproducibility than a real flake. |
| **nix-flake primary, mise demoted to task-runner** | Wastes mise's primary feature (Node version management). nixpkgs Node updates lag upstream; bumping Node would require a flake input update + `nix flake update`, slower than `mise use --pin node@X`. |

### Implementation-time discoveries

| Issue | Resolution |
|---|---|
| `pkgs.mise` (2025.11.7) is not in the `nixpkgs-25.11-darwin` binary cache; local build pulls in a `direnv` test phase that gets `Killed: 9` on aarch64-darwin. | Removed `pkgs.mise` from the flake. mise is now a host-level prerequisite, installed via the official mise installer or any other channel. The flake provides only `pkgs.zip` (and future additions). |
| `direnv` installed via mise uses macOS system bash 3.2.57 to evaluate `.envrc`, which `nix-direnv` rejects (requires bash ≥ 4.4). Per nix-direnv README: "MacOS ships with bash 3.2 from 2007. As a work-around we suggest that macOS users install `direnv` via Nix or Homebrew." | direnv is installed via `nix profile install nixpkgs#direnv`, which links direnv against a nix-store bash ≥ 4.4. The mise-installed direnv was uninstalled. |

## Consequences

### Positive

- Reproducible Node + npm toolchain from a fresh checkout.
- System tools (`zip`, future additions) declared declaratively without polluting global PATH.
- `nix develop` can be invoked manually when direnv is unavailable.
- CI remains unchanged; opt-in to `jdx/mise-action` later when value is clear.

### Negative / risks

- Two config files (`mise.toml`, `flake.nix`) for contributors to understand.
- `nixpkgs-25.11-darwin` must be manually bumped to `nixpkgs-26.05-darwin` after May 2026 stable cut.
- `husky` hooks invoked from non-shell GUIs (some IDEs, GUI git clients) may not inherit direnv's environment — verified working from terminal during Phase 4 (commitlint runs cleanly through direnv-loaded env); mitigation is `core.hooksPath` wrapper if it bites in GUI tools.
- `nix flake update` produces lock churn; bump deliberately, not on every PR.

### Host prerequisites (one-time setup, not in repo)

- `mise` installed (official installer, Homebrew, etc.) and shell-activated.
- `nix` installed (upstream Nix or Determinate). Flakes enabled (e.g. `~/.config/nix/nix.conf` with `experimental-features = nix-command flakes` for upstream Nix).
- `direnv` installed via `nix profile install nixpkgs#direnv`. **Do not** install direnv via mise on macOS — it will fail nix-direnv's bash ≥ 4.4 check.
- `nix-direnv` installed via `nix profile install nixpkgs#nix-direnv`, sourced from `~/.config/direnv/direnvrc`.
- Shell hook for direnv (e.g. `direnv hook fish | source` in `~/.config/fish/config.fish`, after `mise activate`).

### Out of scope (future work)

- CI migration to `jdx/mise-action@v4`.
- Adding `[tasks.*]` aliases in `mise.toml` if the script list grows beyond `package.json` ergonomics.
- Considering `flakehub.com` semver inputs (only relevant for Determinate Nix users).
