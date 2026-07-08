---
name: sync-docs
description: Detect user-facing feature drift and update README.md + README.ja.md in lockstep. Use when features have shipped but the READMEs are stale, or before a release. Docs-only — never touches src/.
version: 1.0.0
---

# sync-docs

Keeps the user-facing documentation (`README.md` and `README.ja.md`) in sync with the
features that have actually shipped. This skill **only edits documentation** — it never
modifies `src/`, tests, or configuration.

## When to use

- Features have landed but the READMEs haven't been updated.
- Before cutting a release (invoked manually; `/release` suggests it — the two are
  deliberately decoupled).
- After adding a new platform, setting, or output behavior.

## Absolute rules

- **Docs only.** Edit `README.md`, `README.ja.md`, and (if needed) `docs/`. Never edit
  `src/`, tests, `manifest.json`, or build config.
- **EN/JA parity is mandatory.** Every change to `README.md` must have an equivalent
  change in `README.ja.md`, and vice versa. The two files must stay structurally parallel
  (same sections, same order, same tables).
- **Verify before done.** Report what changed and prove the docs still format cleanly.
- Follow the project rules in `CLAUDE.md`: work on a branch, never commit secrets, no
  scope creep.

## Workflow

### 1. Establish the "documented" baseline

Read both READMEs and list the features they currently describe (Features bullets,
Usage subsections, settings mentioned, supported platforms).

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

### 6. Report

Summarize: which features were added to the docs, EN + JA both updated, format-check result.
Do **not** commit or push — leave that to the user or `/release`.
