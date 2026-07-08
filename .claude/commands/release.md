---
description: "Commit, push, and create PR following release-please conventions"
---

Release workflow for current changes. User description: $ARGUMENTS

Execute the following steps **in order**. Stop and report if any step fails.

---

## Step 1: Verify preconditions

1. Run `git status` (never use `-uall`) and `git diff --stat` to see all changes (staged + unstaged + untracked).
2. If there are **no changes** (no untracked files, no modifications, no staged changes), stop and report: "Nothing to release — no changes detected."
3. Scan for sensitive files in the changes. NEVER stage any of these:
   - `.env`, `.env.local`, `.mcp.json`
   - Files matching `*credential*`, `*secret*`, `*token*`, `*.key`, `*.pem`
   - `node_modules/`, `dist/`, `coverage/`
   - `.DS_Store`, `Thumbs.db`
4. If sensitive files are found in the diff, warn the user and ask for confirmation before proceeding. Exclude them from staging regardless.

---

## Step 2: Detect commit type

First, check if `$ARGUMENTS` explicitly starts with a recognized conventional commit type followed by a colon (e.g., `fix: correct null pointer`). If so, use that type and description directly. Skip auto-detection.

Recognized types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `revert`, `build`, `ci`, `security`, `ui`, `release`.

If `$ARGUMENTS` does NOT start with a `type:` prefix (or is empty), auto-detect the **dominant** type by analyzing the changed file paths:

| Changed File Patterns | Detected Type |
|----------------------|---------------|
| `src/` with **new files** or substantial new functionality | `feat` |
| `src/` with bug fix modifications (small targeted changes) | `fix` |
| `src/` with structural changes, no new features | `refactor` |
| Only `docs/`, `README*`, `CLAUDE.md`, `*.html` doc files | `docs` |
| Only test files (`*.test.ts`, `*.spec.ts`, fixtures) | `test` |
| Only config files (`package.json` scripts, `eslint*`, `vite.config*`, `tsconfig*`) | `chore` |
| Only `.github/workflows/` | `ci` |
| Only CSS / formatting-only changes | `style` |
| Performance-focused changes | `perf` |
| Security-related changes | `security` |
| UI-only changes (popup, CSS) | `ui` |
| Mixed categories | Use the type covering the most impactful files; default to `feat` if new functionality exists, otherwise `chore` |

### Documentation sync check (suggestion only)

If the detected type is `feat` or the change set contains a **breaking / user-facing**
change (new platform, new setting, changed output behavior), and `README.md` /
`README.ja.md` are **not** already part of this change set, note it and suggest:

> This looks like a user-facing change but the READMEs aren't updated. Consider running
> `/sync-docs` first to keep the docs in sync.

This is a **suggestion only** — do not run `/sync-docs` automatically and do not block the
release. Proceed with the release regardless of the user's choice.

---

## Step 3: Generate commit message

Format: `{type}: {description}`

Rules:
- Total header length MUST be **under 100 characters** (commitlint rule)
- Description starts **lowercase**
- No period at the end
- No emoji in the header
- If `$ARGUMENTS` is provided and does not start with a `type:` prefix, use it as the description verbatim
- If `$ARGUMENTS` starts with `type: description`, use both parts directly
- If `$ARGUMENTS` is empty, generate a concise description from the diff analysis

---

## Step 4: Create branch if needed

Check the current branch with `git branch --show-current`.

**If on `main`**:
1. Slugify the description: lowercase, replace non-alphanumeric characters (except hyphens) with `-`, collapse consecutive hyphens, trim hyphens from start/end, truncate to 50 characters
2. Run: `git checkout -b {type}/{slug}`

**If already on a non-main branch**: stay on it, do not create a new branch.

---

## Step 5: Stage and commit

### Staging

Stage files selectively using `git add` with **explicit file paths**. Group related files together.

NEVER use `git add -A` or `git add .`.

Skip these patterns entirely:
- `.env`, `.env.local`, `.mcp.json`
- `node_modules/`, `dist/`, `coverage/`
- `.DS_Store`, `Thumbs.db`
- Files matching `*credential*`, `*secret*`, `*token*`, `*.key`, `*.pem`

### Committing

Commit using a heredoc to ensure proper multi-line formatting:

```bash
git commit -m "$(cat <<'EOF'
{type}: {description}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**If the commit fails** (e.g., commitlint hook rejects the message):
1. Analyze the error message
2. Fix the message format
3. Create a **NEW** commit — NEVER use `--amend` or `--no-verify`

---

## Step 6: Push

Run:
```bash
git push -u origin HEAD
```

**If the push fails** because the remote branch already exists with divergent history:
- Stop and report the issue to the user
- NEVER force push (`--force` or `--force-with-lease`)

---

## Step 7: Create PR

First check if a PR already exists for this branch:
```bash
gh pr view --json url 2>/dev/null
```

If a PR already exists, report the existing PR URL and **skip PR creation**.

If no PR exists, create one:

```bash
gh pr create --title "{type}: {description}" --body "$(cat <<'EOF'
## Summary
- {bullet points summarizing the actual changes from the diff}

## Test plan
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] {additional relevant checks based on what changed}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Rules:
- The PR **title MUST exactly match** the commit message header
- Customize the Summary bullets based on what actually changed — not a generic template
- Customize the Test plan based on which checks are relevant (e.g., for docs-only changes, skip test/build checks)

---

## Step 8: Report result

Output a summary:
- **Branch**: the branch name
- **Commit**: the full commit message header
- **Files**: number of files changed
- **PR**: the PR URL (clickable)

---

## Safety Rules (ABSOLUTE — never override)

- NEVER run `git push --force` or `git push --force-with-lease`
- NEVER use `--no-verify` on any git command
- NEVER use `--amend` on any commit
- NEVER use `git add -A` or `git add .`
- NEVER commit `.env`, `.mcp.json`, credential files, or secret files
- NEVER force push to `main`
- If push fails due to divergence, STOP and report — do not attempt to resolve automatically
