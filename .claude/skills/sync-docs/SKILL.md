---
name: sync-docs
description: Detect user-facing feature drift and update README.md + README.ja.md and the Chrome Web Store descriptions in lockstep. Use when features have shipped but the docs are stale, or before a release. Docs-only — never touches src/.
version: 1.1.0
---

# sync-docs

Keeps the user-facing documentation (`README.md`, `README.ja.md`, and the Chrome Web Store
descriptions in `docs/store/`) in sync with the features that have actually shipped. This
skill **only edits documentation** — it never modifies `src/`, tests, or configuration.

## When to use

- Features have landed but the READMEs haven't been updated.
- Before cutting a release (invoked manually; `/release` suggests it — the two are
  deliberately decoupled).
- After adding a new platform, setting, or output behavior.

## Absolute rules

- **Docs only.** Edit `README.md`, `README.ja.md`, the store descriptions in `docs/store/`,
  and (if needed) `docs/`. Never edit `src/`, tests, `manifest.json`, or build config.
- **EN/JA parity is mandatory.** Every change to `README.md` must have an equivalent
  change in `README.ja.md`, and vice versa. The same rule applies to the store pair
  (`docs/store/description_en.md` ⇄ `docs/store/description_ja.md`). Each language pair must
  stay structurally parallel (same sections, same order, same tables/bullets).
- **Verify before done.** Report what changed and prove the docs still format cleanly.
- Follow the project rules in `CLAUDE.md`: work on a branch, never commit secrets, no
  scope creep.

## Workflow

### 1. Establish the "documented" baseline

Read both READMEs **and** both store descriptions (`docs/store/description_en.md`,
`docs/store/description_ja.md`) and list the features they currently describe (Features
bullets, Usage subsections, settings mentioned, supported platforms). The store
descriptions are a terser, Chrome-Web-Store-formatted subset — they drift the same way and
must be checked every run.

### 2. Establish the "shipped" reality

Gather the real feature set from these sources (do not assume — read them):

- `CHANGELOG.md` — the `Features` / `BREAKING CHANGES` entries since the last version the
  README reflects. `git log --oneline -- README.md` shows when the README was last touched;
  everything after that commit is a drift candidate.
- `src/lib/types.ts` — `SyncSettings` / `TemplateOptions` describe every user-facing
  setting. Any setting not mentioned in the README is a drift candidate.
- `src/lib/platform-registry.ts` — the source of truth for supported platforms.
- `src/popup/index.html` + `src/_locales/en/messages.json` — the settings UI surface and
  its labels.

### 3. Compute the diff

Produce a concrete list: "shipped but undocumented" and "documented but removed/renamed".
Present it to the user as a short table before editing if the drift is large (5+ items);
for small drift, proceed and report afterward.

Scope filter: only **user-facing** changes belong in the README (new platforms, settings,
output behaviors, guards). Internal refactors, ADRs, and test/CI changes do **not**.

### 4. Apply edits in lockstep

For each drift item, edit `README.md` and `README.ja.md` together, matching the existing
style:

- Terse Features bullets (`- **Name**: one-line description`).
- New settings → mention in the relevant section; add a table row if the file already uses
  a table for that area.
- New platform → add to the intro tagline, the platform Features bullet, the Usage section,
  the Vault Path token list, and the Key Components table.
- Keep tone concise and factual; mirror the English wording in natural Japanese (see
  `feedback_english_messages` applies to commits/PRs, not README.ja.md content).

Then update the store descriptions (`docs/store/description_en.md` +
`docs/store/description_ja.md`) in the same lockstep for **user-facing** drift only:

- These follow the Chrome Web Store layout (WHAT IT DOES / THREE EXPORT OPTIONS / KEY
  FEATURES / PRIVACY FIRST / REQUIREMENTS / HOW TO USE). Add or reword `KEY FEATURES`
  bullets (`• ...`) to match; keep them shorter and more marketing-toned than the README.
- New platform → also update the tagline, WHAT IT DOES host list, and HOW TO USE step 1.
- Keep EN/JA bullets 1:1 and in the same order.

### 5. Verify

- `nix run .#format-check` (or `npm run format:check`) — the READMEs must pass Prettier.
- Parity check: the two files have the same set of `##`/`###` headings in the same order.
  A quick diff of the heading lists catches missed mirroring:

  ```bash
  diff <(grep -nE '^#{2,3} ' README.md    | sed 's/[0-9].*: //') \
       <(grep -nE '^#{2,3} ' README.ja.md | sed 's/[0-9].*: //')
  ```

  (Heading *text* differs by language, but the *count and structure* must match — inspect,
  don't expect byte-equality.)
- Confirm every internal anchor link (`#image-export`, `#画像エクスポート`, ADR links)
  resolves to a heading that exists.
- Store parity: `docs/store/description_en.md` and `description_ja.md` must have the same
  number of `•` bullets in each section, in the same order. Compare the bullet counts:

  ```bash
  grep -c '^•' docs/store/description_en.md docs/store/description_ja.md
  ```

### 6. Report

Summarize: which features were added to the docs, README EN + JA and store EN + JA all
updated, format-check and store-parity results. Do **not** commit or push — leave that to
the user or `/release`.
