---
name: improve
description: |
  Autonomous improvement loop — repeatedly runs QA, Fix, and Refactor cycles to continuously improve code quality.
  Each round runs tests and auto-reverts refactoring commits that break tests.
  Leverages SuperClaude commands for enhanced analysis.
  Uses MCP servers (serena, sequential-thinking, context7, playwright, tavily) for semantic analysis, documentation lookup, and multi-step reasoning.
arguments:
  - name: rounds
    description: Maximum number of improvement rounds (early termination if 0 issues found)
    default: "5"
  - name: focus
    description: Scope of improvement (all)
    default: all
  - name: dry-run
    description: If true, run QA only without fixes or refactoring
    default: "false"
---

# Autonomous Improvement Loop

Repeats QA → Fix → Refactor → Safety Check → Reflection → Self-Learning for up to {{rounds}} rounds.
Terminates early when open issues reach 0, or when abort conditions are triggered.

## Toolchain

This skill uses the following tools:

**SuperClaude commands:**
- `/sc:analyze` — Phase 1: Code and architecture structural analysis
- `/sc:troubleshoot` — Phase 2: Debug and root-cause test failures
- `/sc:cleanup` — Phase 3: Structured refactoring
- `/sc:reflect` — Phase 5: Structured retrospective

**MCP servers:**
- `serena` — Phase 1/3: Semantic code understanding, dependency graph analysis
- `sequential-thinking` — Phase 1/6: Multi-step reasoning for complex problems
- `context7` — Phase 2: Official documentation lookup for CRXJS/Vite and related tools
- `playwright` — Phase 1/4: Browser-based E2E test execution
- `tavily` — Phase 6: Web research for best practices

**Fallback rule:** If any MCP server or `/sc:` command is unavailable, log a warning and continue without it. MCPs and SuperClaude enhance the loop but are NOT required.

## Critical Safety Rules

- **All work MUST be done on a feature branch. NEVER modify the main branch.**
- Auto-revert refactoring commits when tests break after refactoring.
- Record results of each phase in `.improvement-state/`.
- Follow Conventional Commits commit format.
- **NEVER weaken or delete tests to make them pass.** Fix the implementation instead.

## Logging

After completing each phase and at each round boundary, record results in `.improvement-state/execution.log` and `.improvement-state/run.log`.

**execution.log format:**
```
[HH:MM:SS] [Phase N-name] result summary
```

**run.log format (per round):**
```
## Round N — YYYY-MM-DDTHH:MM:SS
Result: found=X, fixed=Y
```

This logging is a **required workflow step** — the same as writing `issues-round-N.md` or `reflection-log.md`. Follow the **"Log:"** instruction at the end of each phase.

## Abort Conditions (Loop Stops Entirely)

The loop MUST stop immediately and report to the user if ANY of these occur:

1. **Git conflict**: Any git operation (revert, merge) fails with a conflict.
2. **Net regression**: Issue count INCREASES for 2 consecutive rounds.
3. **Recurring failure**: The same file/test fails in 2 consecutive rounds after being "fixed".
4. **Phase 2 regression**: A fix in Phase 2 causes NEW test failures that did not exist before.
5. **Consecutive reverts**: Phase 4 auto-revert triggers in 2 consecutive rounds.
6. **Test runner crash**: Test command exits non-zero but produces no failure lines AND no test summary (infrastructure failure, not test failure).
7. **Disk space critical**: Less than 500MB free disk space.

When aborting, output:
```
=== LOOP ABORTED ===
Reason: {specific abort condition}
Round: N / {{rounds}}
Branch: {branch name}
Last stable state: {git tag name}
Action required: {what the user should do}
```

## Phase 0: Setup (first round only)

1. Verify the working directory is a git repository.
2. Run `git status` to confirm the working tree is clean.
   - If not clean, warn the user and abort.
3. Check `timeout` command availability and save to persistent env file:
   ```bash
   if command -v timeout >/dev/null 2>&1; then
     TIMEOUT_CMD="timeout --kill-after=10s"
   elif command -v gtimeout >/dev/null 2>&1; then
     TIMEOUT_CMD="gtimeout --kill-after=10s"
   else
     TIMEOUT_CMD=""
     echo "⚠️ timeout command not available — tests will run without timeout protection"
   fi
   # Persist for use in all subsequent bash blocks
   mkdir -p .improvement-state
   echo "TIMEOUT_CMD=\"$TIMEOUT_CMD\"" > .improvement-state/timeout-env.sh
   ```
   `$TIMEOUT_CMD` is persisted in `.improvement-state/timeout-env.sh` for use in subsequent bash blocks.
4. Confirm the current branch is main.
5. Create a feature branch:
   ```bash
   BRANCH="improve/$(date +%Y%m%d-%H%M%S)"
   if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
     echo "ERROR: Branch $BRANCH already exists. Aborting."
     exit 1
   fi
   git checkout -b "$BRANCH"
   ```
6. Create the state directory:
   ```bash
   mkdir -p .improvement-state
   ```
7. Initialize execution log:
   ```bash
   echo "=== Improvement Loop Started ===" > .improvement-state/execution.log
   echo "Time: $(date '+%Y-%m-%dT%H:%M:%S')" >> .improvement-state/execution.log
   echo "Parameters: rounds={{rounds}}, focus={{focus}}, dry-run={{dry-run}}" >> .improvement-state/execution.log
   echo "" >> .improvement-state/execution.log
   ```
8. Initialize the run log:
   ```bash
   echo "# Run Log — $BRANCH" > .improvement-state/run.log
   echo "Started: $(date '+%Y-%m-%dT%H:%M:%S')" >> .improvement-state/run.log
   echo "Parameters: rounds={{rounds}}, focus={{focus}}, dry-run={{dry-run}}" >> .improvement-state/run.log
   ```
9. Load `.improvement-config.json` if it exists. Otherwise use default values.
10. **Capture test baseline** — run unit tests to record the initial state:
   ```bash
   npx vitest run 2>&1 2>&1 | tee .improvement-state/test-baseline.log
   BASELINE_UNIT_EXIT=$?
   ```
   Extract baseline test counts from output. Record: `BASELINE_UNIT_TEST_COUNT`, `BASELINE_UNIT_FAIL_COUNT`.
   These baselines are used throughout the loop to detect regressions.
11. **Use available MCP servers to understand project structure** — Query semantic analysis tools for module structure, dependency graph, and key entry points.

**Initialize the round counter:**
Set `ROUND_NUM=1`. This variable tracks the current round number throughout the loop.

**Phase 0 complete. Proceed IMMEDIATELY to the Main Loop (starting at Phase 1 with ROUND_NUM=1).**

## Running Tests (Reference)

Whenever this skill says "run tests", follow this procedure:

1. **Run with timeout** (if available — detected in Phase 0):
   ```bash
   [ -f .improvement-state/timeout-env.sh ] && source .improvement-state/timeout-env.sh
   ${TIMEOUT_CMD:-} ${TEST_TIMEOUT:-120}s npx vitest run 2>&1 2>&1 | tee /tmp/test-output.log
   TEST_EXIT=${PIPESTATUS[0]}
   ```
   If timeout is not available, run directly:
   ```bash
   npx vitest run 2>&1 2>&1 | tee /tmp/test-output.log
   TEST_EXIT=$?
   ```
2. **Classify exit code**: 124=timeout (HIGH issue), infrastructure failure patterns (Docker, port, disk) → NOT a test failure, else → actual test failure.
3. **Parse failures** using Vitest output patterns (see `references/qa-guide.md` for parsing rules).
4. **Create a separate issue for EACH failure** with: file, line, test name, error, severity=HIGH.
5. **Regression check**: If current test count < `BASELINE_UNIT_TEST_COUNT` → **ABORT** (test file deleted).

---

## Main Loop: Round 1 ~ {{rounds}}

**Repeat Phase 1 through Phase 5 for each round.** Use `ROUND_NUM` (initialized to 1 in Phase 0) as the current round number. After each round, the "Loop Continuation Decision" section at the end of Phase 5 determines whether to continue, exit, or proceed to finalization.

Log `[Round $ROUND_NUM/{{rounds}}]` at the start of each round.

### Phase 1: QA (Issue Detection)

Scope: {{focus}}

**Create a savepoint before this round:**
```bash
git tag "savepoint-round-$ROUND_NUM"
```

**Log:** Append to `.improvement-state/run.log`: `## Round $ROUND_NUM — {current timestamp}`
Append to `.improvement-state/execution.log`: `[HH:MM:SS] [Round $ROUND_NUM] Started`

Run QA checks. If agent teams are available (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), run in parallel using separate agent teams. Otherwise, run sequentially.

#### 1-1. Lint (ESLint)

```bash
npx eslint src/ 2>&1 2>&1 | tee /tmp/lint-output.log
LINT_EXIT=$?
```

Extract warnings/errors from output and record as issues.

#### 1-2. Type Check (tsc)

```bash
npx tsc --noEmit 2>&1 2>&1 | tee /tmp/typecheck-output.log
TYPECHECK_EXIT=$?
```

Record type errors as issues (severity: HIGH — type errors mean compilation failure).

#### 1-3. Unit Tests (Vitest)

```bash
npx vitest run 2>&1 2>&1 | tee /tmp/test-output.log
UNIT_TEST_EXIT=${PIPESTATUS[0]}
```

Parse test output using Vitest patterns (see `references/qa-guide.md`).
File each failure as a separate issue.


#### 1-5. Code Analysis with /sc:analyze

Use `/sc:analyze` for structural analysis:

```
/sc:analyze "Analyze {{focus}} codebase for code quality issues:
- Type safety problems
- Error handling gaps
- Files exceeding 300 lines
- Functions exceeding 50 lines
- Missing input validation
- Hardcoded strings/config values
- Circular dependencies"
```

**MCP-enhanced analysis**: Use available MCP servers for deeper code understanding:
Use serena for semantic analysis: check module dependency issues, unused exports, and circular call graphs.
Use sequential-thinking for complex architectural problems: multi-step reasoning to identify root causes at the design level.
Use context7 to look up official documentation for CRXJS/Vite APIs before flagging potential misuse.

#### Code Review (Claude)

If no SuperClaude `/sc:analyze` is available, perform manual code review:
- Read source files in src
- Check for: type safety, error handling, file/function size limits, input validation, hardcoded values, circular dependencies
- Classify findings by severity: CRITICAL, HIGH, MEDIUM, LOW

#### Issue Aggregation

Save all QA results to `.improvement-state/issues-round-N.md`:

```markdown
# Issues - Round N

**Found**: X issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0
**Baseline test count**: {BASELINE_TEST_COUNT} | **Current test count**: {current}

## Issues

### [SEVERITY] Short description
- **File**: `path/to/file:line`
- **Source**: lint | typecheck | unit-test | e2e | review
- **Detail**: Description of the problem
- **Suggestion**: Proposed fix (if any)
```

**Log:** Append to `.improvement-state/execution.log`:
- `[HH:MM:SS] [Phase 1] Unit tests — {passed} passed, {failed} failed (exit={code})`
- `[HH:MM:SS] [Phase 1] Lint — {N} warnings, {M} errors`
- `[HH:MM:SS] [Phase 1] Typecheck — {result}`
- `[HH:MM:SS] [Phase 1] Issues found: {total} (CRITICAL={n}, HIGH={n}, MEDIUM={n}, LOW={n})`

**Decision**:
- Issue count is 0 → exit the loop and proceed to Phase 7 (Finalize).
- **Quality gate check**: If `.improvement-config.json` defines `quality_gates`, enforce them:
  - `max_critical_issues`: If CRITICAL count exceeds this, **ABORT** with "Quality gate failed: too many CRITICAL issues".
  - `max_high_issues`: If HIGH count exceeds this, **ABORT** with "Quality gate failed: too many HIGH issues".
  - `min_test_pass_rate`: If test pass rate drops below this percentage, **ABORT** with "Quality gate failed: test pass rate below threshold".
  - A `null` value for any gate means it is not enforced.
- **Net regression check**: If this round's issue count > previous round's, increment `REGRESSION_COUNTER`. If `REGRESSION_COUNTER >= 2`, trigger abort condition #2.

### Phase 2: Fix (Issue Resolution)

Skip this phase if {{dry-run}} is true.

#### 2-1. Auto-fix with Tools

Apply lint auto-fixes first:
```bash
npx eslint --fix src/ 2>&1 | tee /tmp/lint-fix-output.log
```

#### 2-2. Fix Test Failures (HIGHEST PRIORITY)

**Test failure issues MUST be fixed before all other issues.**

**Use `/sc:troubleshoot` for debugging:**
```
/sc:troubleshoot "Test failure in {test file name}:
Error: {error message}
Analyze the root cause and suggest a fix."
```

Fix procedure:
1. **Read the source code** of both the failing test file and the implementation under test.
2. **Identify the cause**.
3. **Decide the fix strategy**:
   - Bug in implementation → fix the implementation (NEVER weaken tests)
   - Mock/setup issue in test → fix the test code (legitimate fix)
   - Outdated test → update the test
4. **Verify the fix** by re-running only that test file:
   ```bash
   npx vitest run {testfile} 2>&1 | tee /tmp/single-test-output.log
   SINGLE_TEST_EXIT=$?
   ```
   If failures remain, retry (maximum 3 attempts per test). If still failing after 3 attempts, log as "unresolvable" and proceed.

#### 2-3. Fix Review Findings

Prioritize HIGH severity and above. Only fix MEDIUM and below if safe and low-risk.

#### 2-4. Commit

```bash
git add -A
git commit -m "fix: resolve N QA issues [round $ROUND_NUM]"
```

#### 2-5. Post-fix Regression Check (MANDATORY)

After committing Phase 2 fixes, run the full test suite:

```bash
npx vitest run 2>&1 2>&1 | tee /tmp/postfix-output.log
POSTFIX_EXIT=${PIPESTATUS[0]}
```

- **All tests pass**: Proceed to Phase 3.
- **New failures appear** (not in Phase 1 issue list): **Trigger abort condition #4.** Revert:
  ```bash
  git revert --no-edit HEAD
  ```
  Skip to Phase 5.
- **Same failures as Phase 1 remain**: Proceed to Phase 3.

**Log:** Append to `.improvement-state/execution.log`:
- `[HH:MM:SS] [Phase 2] Fixed {Y}/{X} issues, committed {hash}` — or if reverted: `[HH:MM:SS] [Phase 2] REGRESSION — fix reverted`

### Phase 3: Refactor (Quality Improvement)

Skip this phase if {{dry-run}} is true.

**Pre-condition gate (MANDATORY):**
Run the full test suite:
```bash
npx vitest run 2>&1 2>&1 | tee /tmp/phase3-precheck-output.log
PHASE3_PRECHECK_EXIT=${PIPESTATUS[0]}
```

**If ANY test fails:**
1. Attempt fix (maximum 2 attempts).
2. If fixed: commit as `fix: repair failing tests before refactor [round $ROUND_NUM]`
3. Re-run to confirm ALL tests pass.
4. If still failing: **skip Phase 3**, proceed to Phase 5. Log: "Refactoring skipped — tests not stable."

**Check refactor blocklist:** Load `.improvement-state/refactor-blocklist.json`. Skip any file/strategy combination that previously caused a revert.

**Use `/sc:cleanup` for refactoring:**
```
/sc:cleanup "{target file path} — strategy: {refactoring strategy}"
```

Also refer to `references/refactor-patterns.md` for safe refactoring patterns.

Maximum refactorings per round (configurable via `refactor.max_per_round` in `.improvement-config.json`, default: 3).

Refactoring candidate selection criteria:
- Files where Phase 1 found issues
- Files exceeding 300 lines
- Functions exceeding 50 lines
- Complex conditionals (nesting 3+ levels)
- Duplicate code
- **Exclude files in refactor-blocklist**

**Commit each refactoring individually:**
```bash
git add -A
git commit -m "refactor: {specific description} [round $ROUND_NUM]"
```

**Log:** Append to `.improvement-state/execution.log`:
- `[HH:MM:SS] [Phase 3] Refactored {N} files, committed {hash}` — or `[HH:MM:SS] [Phase 3] Skipped (tests unstable)`

### Phase 4: Safety Check

Only run if refactoring was performed in Phase 3.

Unit tests MUST pass for the round to be considered safe.

```bash
npx vitest run 2>&1 2>&1 | tee /tmp/safety-unit-output.log
SAFETY_UNIT_EXIT=${PIPESTATUS[0]}
```


Run the test count regression check (current total >= BASELINE_UNIT_TEST_COUNT).

#### On all tests passing

Proceed to Phase 5. Reset `CONSECUTIVE_REVERT_COUNT` to 0.

#### On test failure — Auto-Revert

Identify and revert Phase 3 refactoring commits using stable SHAs:

```bash
# Collect refactor commit SHAs (newest first)
REFACTOR_SHAS=$(git log --oneline "savepoint-round-$ROUND_NUM"..HEAD | grep "refactor:.*\[round $ROUND_NUM\]" | awk '{print $1}')

# Revert each (newest first)
for SHA in $REFACTOR_SHAS; do
  if ! git revert --no-edit "$SHA" 2>&1; then
    git revert --abort
    # Trigger abort condition #1 (git conflict)
    exit 1
  fi
done
```

After revert, re-run tests:
```bash
npx vitest run 2>&1 2>&1 | tee /tmp/post-revert-output.log
POST_REVERT_EXIT=${PIPESTATUS[0]}
```

- **Tests pass**: Add file + strategy to `.improvement-state/refactor-blocklist.json`. Increment `CONSECUTIVE_REVERT_COUNT`.
- **Tests still fail**: Revert to the savepoint:
  ```bash
  git revert --no-edit "savepoint-round-$ROUND_NUM"..HEAD
  ```

**Log:** Append to `.improvement-state/execution.log`:
- `[HH:MM:SS] [Phase 4] Safety check — PASSED` — or `[HH:MM:SS] [Phase 4] Safety check — REVERTED ({N} commits)`

**Consecutive revert check**: If `CONSECUTIVE_REVERT_COUNT >= 2`, trigger abort condition #5.

### Phase 5: Reflection (Record Results)

**Use `/sc:reflect` for a structured retrospective:**
```
/sc:reflect "Improvement Loop Round $ROUND_NUM retrospective:
- QA found X issues
- Fixed Y issues
- Refactored Z files (reverted: W)
- Safety Check: PASSED/REVERTED/SKIPPED
Analyze what went well, what didn't, and patterns to watch."
```

Append to `.improvement-state/reflection-log.md`:

```markdown
## Round N - YYYY-MM-DD HH:MM

| Phase | Result |
|-------|--------|
| QA | X issues found |
| Fix | Y/X issues fixed |
| Post-fix regression | PASSED / REVERTED |
| Refactor | Z refactorings applied / SKIPPED |
| Safety Check | PASSED / REVERTED / SKIPPED |

### Modified Files
- `path/to/file1` - summary of changes

### Observations
(1-3 sentence summary)

---
```

**Log:** Append to `.improvement-state/execution.log`:
- `[HH:MM:SS] [Phase 5] Reflection — issues={X}, fixed={Y}, rate={Z}%`

Append to `.improvement-state/run.log`:
- `Result: found={X}, fixed={Y}`

### Loop Continuation Decision

**This is the critical loop control point.** After completing Phase 5, decide the next action:

1. **If issues found == 0 in this round**: Exit the loop. Proceed to Phase 7 (Finalize). Log: "No issues found — exiting loop early at round $ROUND_NUM."
2. **If $ROUND_NUM == {{rounds}}** (maximum rounds reached): Proceed to Phase 6 (Self-Learning), then Phase 7 (Finalize). Log: "Maximum rounds reached."
3. **Otherwise** (issues remain AND rounds remaining):
   - Set `ROUND_NUM = ROUND_NUM + 1`
   - **GO BACK TO "Phase 1: QA (Issue Detection)" above** and execute the entire Phase 1 → 2 → 3 → 4 → 5 sequence again.
   - Do NOT proceed to Phase 6 or Phase 7.
   - Log: "Round $ROUND_NUM complete. Issues remain. Proceeding to round $((ROUND_NUM+1))."

**⚠️ CRITICAL: You MUST repeat Phase 1 through Phase 5 for each round. This is a LOOP, not a single pass. Do NOT stop after one round unless exit condition 1 or 2 is met.**

---

### Phase 6: Self-Learning (Improve the Improvement Process)

**Run ONLY after the final round** (when exiting the loop due to condition 1 or 2 above).

Analyze all rounds in `.improvement-state/reflection-log.md`:
- Organize trends in issue count, fix count, and revert rate across rounds
- Identify recurring issue category patterns
- Generate prioritized improvement suggestions

**Use available MCP tools** for deeper analysis and best practice research.

Save output to `.improvement-state/self-learning-suggestions.md`:

```markdown
# Self-Learning Suggestions

Generated: YYYY-MM-DD HH:MM
Rounds analyzed: 1-N

## Suggestions

### [IMPACT: HIGH/MEDIUM/LOW] Suggestion title
- **Current**: Current setting/behavior
- **Proposed**: Proposed change
- **Rationale**: Evidence-based reasoning
- **Action**: Which parameter in `.improvement-config.json` to change
```

**These suggestions are NOT auto-applied.** The user reviews and manually updates the config.

## Phase 7: Finalize

After all rounds complete (or early termination):


1. Output a final summary:
   ```
   === Improvement Loop Summary ===
   Rounds completed: X / {{rounds}}
   Total issues found: Y
   Total issues fixed: Z
   Refactorings applied: W (reverted: V)
   Branch: $BRANCH

   === Changes Summary ===
   {output of: git log main..$BRANCH --oneline}
   {output of: git diff main...$BRANCH --stat}
   ```

2. **[MANUAL GATE]** Ask the user whether to push the branch:
   ```
   Push $BRANCH to origin? The summary above shows all changes.
   ```
   - If confirmed: `git push -u origin "$BRANCH"`. Check exit code.
   - If not confirmed: Keep branch local.

3. Suggest creating a PR (do not auto-create).

## Error Handling

| Situation | Action |
|-----------|--------|
| Lint tool not found | Skip lint |
| Git conflict | **ABORT** the loop (abort condition #1) |
| Test timeout (exit code 124) | Treat as HIGH-severity issue. If 3+ timeouts in one run, ABORT |
| 0 issues in all rounds | Report "codebase is in good shape" |
| MCP server not connected | Log warning, continue without that MCP |
| /sc: command not installed | Log warning, continue without SuperClaude |
| Disk space < 500MB | **ABORT** (abort condition #7) |
| Test count decreased | **ABORT** — potential test file deletion |
