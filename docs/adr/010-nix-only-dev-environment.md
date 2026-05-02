# ADR-010: nix-only Development Environment (supersedes ADR-009)

## Status

Accepted (2026-05-01).

Supersedes [ADR-009](009-mise-nix-dev-environment.md). Extended by [ADR-011](011-nix-task-surface.md) (2026-05-02).

## Context

ADR-009 established a layered architecture where `mise` owned the Node toolchain and `nix` provided system-level deps (`zip`). The decision against a nix-only approach (ADR-009 called this "Option C") rested on two claims:

1. nixpkgs Node would **lag** upstream releases.
2. Bumping Node via `nix flake update` is more cumbersome than `mise use --pin node@X`.

Both claims were stated without empirical evidence at the time. After ADR-009 merged, the maintainer asked to revisit — at which point the verification was actually run.

### Verified facts (2026-05-01, against `github:NixOS/nixpkgs/nixpkgs-25.11-darwin`)

- `pkgs.nodejs_24.version` = **24.15.0** — bit-identical to the upstream Node 24 LTS HEAD and to the version that `mise.lock` was pinning.
- `pkgs.nodejs_24` ships **npm 11.12.1** bundled — bit-identical to the npm version on the host.
- `pkgs.nodejs_24` is **in the darwin binary cache** (`cache.nixos.org`) — verified by successful `nix run github:NixOS/nixpkgs/nixpkgs-25.11-darwin#nodejs_24` with observed cache copy. No source-build risk like the `pkgs.mise` failure documented in ADR-009.
- `pkgs.nodejs_22.version` = `22.22.2`; `pkgs.nodejs` aliases to `nodejs_22` (current LTS); `pkgs.nodejs-slim_24` and `pkgs.corepack_24` also exist.

The "lag" claim was overstated for this project: nixpkgs darwin tracks Node LTS patches within days. The ergonomic gap between `nix flake update` and `mise use --pin` is one command vs. one command — no material difference for a project that bumps Node a handful of times per year.

## Decision

Adopt a **nix-only** dev environment:

- **`flake.nix`** owns the Node toolchain (`pkgs.nodejs_24`, which bundles npm) and system deps (`pkgs.zip`).
- **`flake.lock`** pins the nixpkgs commit. Reproducibility comes from the lockfile, not the channel name.
- **`shellHook`** in `flake.nix` prepends `node_modules/.bin` to `PATH` (replacing mise's `_.path = [...]`).
- **`.envrc`** = `use flake` (unchanged from ADR-009).
- **`mise`** is removed from the repo. It remains a host-level tool the maintainer may keep for unrelated projects, but `gemini2obsidian` does not depend on it.

### Concrete settings

| Decision | Value | Rationale |
|---|---|---|
| Node attribute | `pkgs.nodejs_24` | Tracks 24.x; `flake.lock` pins the exact derivation. nixpkgs idiom (per nix.dev `concepts/flakes.md`). |
| npm | Node-bundled (npm 11.12.1) | Matches host; no separate package needed. |
| corepack | **Excluded** | Project is npm-only; no `packageManager` field in `package.json`; YAGNI. |
| `node_modules/.bin` PATH injection | `shellHook` in `flake.nix` | Fires on both `nix develop` and direnv-loaded entry. `.envrc`'s `PATH_add` would only fire under direnv. |
| nixpkgs channel | `nixpkgs-25.11-darwin` (unchanged from ADR-009) | macOS Hydra-pre-built channel, per nix.dev FAQ. |
| `flake.lock` refresh in this PR | No | Current lock already resolves to desired versions; bumping mixes concerns. Future `nix flake update` is a deliberate maintainer action. |
| CI migration | Deferred | Out of scope; CI continues to use `actions/setup-node@v4`. Track separately. |

## Consequences

### Positive

- **Single source of truth**: one config (`flake.nix`), one lockfile (`flake.lock`).
- **Bit-identical Node + npm** to the previous mise-managed setup — no version drift on adoption.
- **Reproducibility from `flake.lock`** is stronger than `mise.lock` because it pins the entire nixpkgs commit (transitive deps included), not just one tool's checksum table.
- **Easier onboarding** (after host prereqs): only `nix` + `direnv` + `nix-direnv` are required. `mise` becomes optional.

### Negative / risks

- **Future contributors expect mise**: solo project today, but documented in this ADR for any external collaborator.
- **`shellHook` does not fire in non-`nix develop` subshells** (e.g. some IDE-spawned shells). Same constraint as mise's `_.path` — net neutral.
- **Node major adoption tied to nixpkgs availability**: when Node 25 lands, it will appear as `nodejs_25` only after nixpkgs packages it. Acceptable for this project (Node 24 is current LTS through Apr 2027 per Node.js release schedule).
- **Passive Node patch drift cannot occur** (lock-file-pinned), but `nix flake update` is now the deliberate update mechanism. Document in PR descriptions when this is run.

### Out of scope (future work)

- CI migration to `cachix/install-nix-action` + `nix develop --command npm ...`.
- README update with host prereqs (none today; consider if external contributors arrive).
- Bumping `nixpkgs-25.11-darwin` → `nixpkgs-26.05-darwin` after the May 2026 stable cut.
