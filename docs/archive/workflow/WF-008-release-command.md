# WF-008: `/release` Custom Slash Command Implementation

**Status**: Pending
**Design**: `docs/design/DES-008-release-command.md`
**Precedent Workflow**: `docs/workflow/WF-007-platform-lint-and-perplexity-docs.md`

---

## Workflow Summary

| Property | Value |
|---|---|
| Total Phases | 3 |
| Total Steps | 5 |
| New Files | 1 (`.claude/commands/release.md`) |
| Modified Files | 1 (`.gitignore`) |

---

## Phase 1: Prepare Directory and Git Tracking (Steps 1-2)

> Make `.claude/commands/` trackable and create the directory.

### Step 1: Update `.gitignore`

**Action**: Add negation rule so `.claude/commands/` is tracked by git while `.claude/settings.local.json` remains ignored.

**File**: `.gitignore`

**Change**:
```
- Before: .claude/
+ After:  .claude/
+         !.claude/commands/
```

Add the `!.claude/commands/` line immediately after the `.claude/` line.

**Validation**:
- [ ] `.gitignore` is syntactically correct
- [ ] `git check-ignore .claude/settings.local.json` returns the path (still ignored)

**Depends on**: Nothing
**Blocks**: Step 3, Step 4

---

### Step 2: Create `.claude/commands/` directory

**Action**: Create the commands directory if it does not exist.

**Command**:
```bash
mkdir -p .claude/commands
```

**Validation**:
- [ ] Directory `.claude/commands/` exists

**Depends on**: Nothing
**Blocks**: Step 3

---

## Phase 2: Create Command File (Step 3)

> Write the `/release` command prompt file per DES-008.

### Step 3: Create `.claude/commands/release.md`

**Action**: Create the custom slash command file with YAML frontmatter and prompt body per DES-008 §2-§3.

**File**: `.claude/commands/release.md` (new)

**Specification**:

The file contains:

1. **YAML frontmatter** with `description` field only
2. **Prompt body** instructing Claude to execute the 8-step workflow:
   - Step 1: Verify preconditions (`git status`, `git diff --stat`, sensitive file check)
   - Step 2: Detect commit type (parse `$ARGUMENTS` for explicit `type:` prefix, or auto-detect from file paths per DES-008 §2.5)
   - Step 3: Generate commit message (`{type}: {description}`, header < 100 chars, lowercase start, no period, no emoji)
   - Step 4: Create branch if on `main` (`{type}/{slug}`, slug max 50 chars per DES-008 §2.7)
   - Step 5: Stage and commit (explicit file paths, never `git add -A`, skip sensitive files per DES-008 §2.9, heredoc commit with Co-Authored-By trailer)
   - Step 6: Push (`git push -u origin HEAD`, never force push)
   - Step 7: Create PR (check for existing PR first, `gh pr create` with title matching commit header, body with Summary + Test plan per DES-008 §2.10)
   - Step 8: Report (branch name, commit message, PR URL)

3. **Safety rules** embedded in the prompt (DES-008 §2.11):
   - Never `--force`, `--no-verify`, `--amend`
   - Never `git add -A` or `git add .`
   - Abort on divergent remote
   - Check for existing PR before creating

4. **Edge case handling** (DES-008 §2.12):
   - No changes -> abort
   - Already on feature branch -> use it
   - PR exists -> report URL, skip creation
   - Commit rejected by hook -> fix and create NEW commit

5. **Type detection table** (DES-008 §2.5):
   - `src/` new files -> `feat`
   - `src/` bug fixes -> `fix`
   - `src/` structural -> `refactor`
   - `docs/` only -> `docs`
   - Test files only -> `test`
   - Config only -> `chore`
   - `.github/workflows/` only -> `ci`
   - Formatting only -> `style`

**Validation**:
- [ ] File exists at `.claude/commands/release.md`
- [ ] YAML frontmatter is valid (has `description` field)
- [ ] Prompt contains all 8 workflow steps
- [ ] Prompt includes safety rules (no force push, no --amend, no --no-verify)
- [ ] Prompt includes type detection heuristics
- [ ] Prompt includes branch naming rules
- [ ] Prompt includes Co-Authored-By trailer instruction

**Depends on**: Steps 1, 2
**Blocks**: Step 4

---

## Phase 3: Verification (Steps 4-5)

> Verify git tracking and command availability.

### Step 4: Verify Git Tracking

**Action**: Confirm the `.gitignore` negation rule works correctly.

**Commands**:
```bash
# release.md should NOT be ignored
git check-ignore .claude/commands/release.md
# Expected: no output (exit code 1 = not ignored)

# settings.local.json should still be ignored
git check-ignore .claude/settings.local.json
# Expected: .claude/settings.local.json (exit code 0 = ignored)
```

**Validation**:
- [ ] `.claude/commands/release.md` is NOT ignored by git
- [ ] `.claude/settings.local.json` IS still ignored by git
- [ ] `git status` shows `.claude/commands/release.md` as untracked (ready to commit)

**Depends on**: Steps 1, 3
**Blocks**: Step 5

---

### Step 5: Verify Command Content

**Action**: Read the created file and confirm structural completeness.

**Checks**:
```bash
# File exists and has content
wc -l .claude/commands/release.md
# Expected: non-zero line count

# YAML frontmatter is present
head -5 .claude/commands/release.md
# Expected: starts with ---

# Key workflow elements present
grep -c "git status" .claude/commands/release.md    # precondition check
grep -c "git diff" .claude/commands/release.md      # diff analysis
grep -c "git checkout -b" .claude/commands/release.md  # branch creation
grep -c "git commit" .claude/commands/release.md    # commit
grep -c "git push" .claude/commands/release.md      # push
grep -c "gh pr create" .claude/commands/release.md  # PR creation
grep -c "Co-Authored-By" .claude/commands/release.md # co-author trailer
grep -c "NEVER" .claude/commands/release.md         # safety rules
```

**Validation**:
- [ ] All grep checks return non-zero counts
- [ ] File has valid YAML frontmatter
- [ ] All 8 workflow steps are represented

**Depends on**: Step 4
**Blocks**: Nothing (final step)

---

## Dependency Graph

```
Phase 1: Prepare
  Step 1 (.gitignore) ─────────────────────────────────┐
  Step 2 (mkdir commands/) ─────────────────────────────┤
                                                        ↓
Phase 2: Create                                         │
  Step 3 (release.md) ◄────────────────────────────────┘
       │
       ↓
Phase 3: Verification
  Step 4 (git tracking check) ──→ Step 5 (content check)
```

**Parallelizable groups**:
- Steps 1 and 2 can run in parallel

---

## Execution Checkpoints

| After Phase | Checkpoint | Command |
|---|---|---|
| Phase 1 | `.claude/commands/` dir exists, `.gitignore` updated | `ls -d .claude/commands/ && grep '!.claude/commands/' .gitignore` |
| Phase 2 | Command file created with complete content | `wc -l .claude/commands/release.md` |
| Phase 3 | Git tracking correct, all content checks pass | `git check-ignore .claude/commands/release.md; echo "exit: $?"` |

---

## Files Changed Summary

### New Files (1)
| File | Phase | Step |
|---|---|---|
| `.claude/commands/release.md` | 2 | 3 |

### Modified Files (1)
| File | Phase | Step | Changes |
|---|---|---|---|
| `.gitignore` | 1 | 1 | Add `!.claude/commands/` negation rule |

**Total: 2 files (1 new, 1 modified)**
