# ADR-013: Build Reproducibility — Compare Contents, Not ZIP Bytes

## Status

Accepted (2026-06-20).

## Context

The released Chrome extension ZIP is produced by GitHub Actions
(`.github/workflows/release-please.yml` → `build-and-upload` job, `npm run
build:zip`) and attached to the GitHub Release. Maintainers need a way to
verify that an artifact built **locally** matches the artifact GitHub Actions
built and shipped — both to catch supply-chain tampering and to detect
toolchain drift between local and CI.

The naive approach — `sha256(local.zip) == sha256(ci.zip)` — does **not**
work. `build:zip` uses `zip -r .`, and a ZIP archive is non-deterministic
across machines for reasons unrelated to the actual build output:

- **Entry order** follows filesystem `readdir` order, which differs between
  macOS (local) and Linux (CI runner).
- **Per-file timestamps** (mtime) are stored in each entry.
- **File mode / uid / gid / OS-creator** metadata is stored per entry.

So two ZIPs of byte-identical `dist/` trees will almost always differ in their
container bytes. (Reproducible Builds project; see References.)

### Verified facts (2026-06-20)

- `build:zip` (both `package.json` and the `flake.nix` `build-zip` app) runs
  `cd dist && zip -r ../gemini2obsidian-<version>.zip . -x '*.DS_Store' -x '.vite/*'`.
  The archive root is the **contents of `dist/`**, so an extracted ZIP is
  directly comparable to a local `dist/` tree.
- `vite.config.ts` sets no `entryFileNames`/`chunkFileNames` overrides, so
  Rollup emits **content-hashed** chunk filenames. Identical content ⇒
  identical hash in the filename; a content difference surfaces as both a
  filename and a hash-manifest difference.
- A local build run twice on the same machine is byte-identical
  (verified via `--twice`); Vite/Rollup run-to-run nondeterminism
  (vitejs/vite#13071, #13672) is not currently observed here.
- The release build originally ran on **Node 20** while local/CI use **Node
  24**; this was corrected first (see "Prerequisite") because a Node/V8
  mismatch can change Rollup output and make any comparison meaningless.

## Decision

Compare the **extracted file contents**, not the ZIP container.

The tool (`scripts/compare-build.mjs` + `scripts/lib/build-compare.mjs`,
exposed as `nix run .#compare-build` / `npm run compare-build`):

1. Builds locally (`npm run build`) into `dist/`.
2. Obtains the CI artifact via `gh release download <tag> --pattern
'gemini2obsidian-*.zip'` (or an explicit `--ci-zip <path>`), and extracts
   it with `unzip`.
3. Builds a `posix-path → sha256` manifest of each tree, applying the **same
   exclusions as `build:zip`** (`.vite/`, `*.DS_Store`) to both sides.
4. Diffs the manifests, classifying every difference as `only-local`,
   `only-ci`, or `content-mismatch`. Exits non-zero on any difference.
5. On mismatch, prints a `diffoscope <local> <ci>` hint for human drill-down.

### Rejected alternatives

| Alternative                                                                                     | Why rejected                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sha256` of the whole ZIP                                                                       | Container metadata (order/mtime/perms) differs across OSes; guaranteed false mismatches.                                                                                                            |
| diffoscope only                                                                                 | Excellent for humans, but not a scriptable pass/fail gate; kept as the drill-down step instead.                                                                                                     |
| Make `build:zip` byte-reproducible (`SOURCE_DATE_EPOCH` + `zip -X -D` / `strip-nondeterminism`) | Stronger guarantee, but modifies the release-critical path (duplicated in `package.json` **and** `flake.nix`). Deferred as a separate, optional future change; not required for content comparison. |

### Prerequisite

Align the release build to Node 24 (PR: `ci: align release build to Node
24`). Without matching Node majors, comparison is apples-to-oranges. Do not
compare against releases built before that change.

## Consequences

- A reliable, scriptable equality gate that ignores ZIP-container noise.
- `diffoscope` is provided via the Nix `compare-build` app's `runtimeInputs`,
  so the drill-down works without a separate install. The gate itself
  (manifest diff) needs no diffoscope.
- `gh run download` is **not** used: the release job uploads via
  `softprops/action-gh-release` (a Release asset), not `actions/upload-artifact`.
  The supported retrieval path is `gh release download`.
- The exclusion list lives in one place (`isExcluded` in
  `scripts/lib/build-compare.mjs`) and must be kept in sync with `build:zip`
  if the latter's `-x` patterns change.

## References

- Reproducible Builds — Tools (diffoscope, strip-nondeterminism, reprotest):
  <https://reproducible-builds.org/tools/>
- `SOURCE_DATE_EPOCH` specification:
  <https://reproducible-builds.org/docs/source-date-epoch/>
- Vite non-deterministic build reports: vitejs/vite#13071, vitejs/vite#13672
