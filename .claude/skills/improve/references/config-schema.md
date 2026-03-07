# Configuration File Spec (.improvement-config.json)

Place `.improvement-config.json` in the project root to customize improvement loop behavior.
If the file does not exist, all defaults are used.

## Schema

```json
{
  "rounds": 5,
  "focus": "all",
  "qa": {
    "lint": { "enabled": true, "tool": "biome" },
    "typecheck": { "enabled": true, "tool": "tsc" },
    "unit_test": { "enabled": true, "tool": "vitest" },
    "e2e": { "enabled": false, "tool": "playwright" },
    "claude_review": true,
    "severity_filter": ["critical", "high", "medium"]
  },
  "refactor": {
    "enabled": true,
    "max_per_round": 3,
    "strategies": [
      "extract-function",
      "simplify-conditional",
      "remove-duplication",
      "split-file",
      "strengthen-types"
    ]
  },
  "safety": {
    "auto_revert_on_failure": true,
    "test_timeout_s": 120,
    "max_fix_attempts_per_test": 3,
    "max_consecutive_reverts": 2,
    "max_consecutive_regressions": 2
  },
  "quality_gates": {
    "max_critical_issues": 0,
    "max_high_issues": null,
    "min_test_pass_rate": null
  },
  "self_learning": {
    "enabled": true
  },
  "logging": {
    "level": "INFO",
    "include_commands": true
  }
}
```

## Field Descriptions

### Top Level

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rounds` | number | 5 | Maximum round count. Overridable via CLI `--rounds` |
| `focus` | string | "all" | Target scope. Detected from project structure (e.g., "api\|frontend\|all") |

### qa

Each QA tool has an `enabled` flag and a `tool` name for identification:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `lint.enabled` | boolean | true | Run lint checks |
| `lint.tool` | string | varies | Lint tool name: "biome", "eslint", "ruff", "clippy", "rubocop", "golangci-lint" |
| `typecheck.enabled` | boolean | true | Run type checking |
| `typecheck.tool` | string | varies | Type checker name: "tsc", "mypy", "pyright", "go vet" |
| `unit_test.enabled` | boolean | true | Run unit tests (may require Docker for testcontainers) |
| `unit_test.tool` | string | varies | Test runner name: "vitest", "jest", "pytest", "cargo test", "go test", "rspec" |
| `e2e.enabled` | boolean | false | Run E2E tests (highly environment-dependent) |
| `e2e.tool` | string | varies | E2E tool name: "playwright", "cypress", "make" |
| `claude_review` | boolean | true | Run Claude code review (via /sc:analyze if available) |
| `severity_filter` | string[] | ["critical","high","medium"] | Only address issues at or above these severity levels |

### refactor

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | true | Run the refactoring phase |
| `max_per_round` | number | 3 | Maximum refactorings per round |
| `strategies` | string[] | (all patterns) | Allowed refactoring strategies |

### safety

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auto_revert_on_failure` | boolean | true | Auto-revert refactoring on test failure |
| `test_timeout_s` | number | 120 | Test execution timeout in seconds (used with `timeout` command) |
| `max_fix_attempts_per_test` | number | 3 | Max attempts to fix a single failing test before giving up |
| `max_consecutive_reverts` | number | 2 | Abort loop if this many consecutive Phase 4 reverts occur |
| `max_consecutive_regressions` | number | 2 | Abort loop if issue count increases this many consecutive rounds |

### quality_gates

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_critical_issues` | number\|null | 0 | Abort if CRITICAL issues exceed this count. null = no limit |
| `max_high_issues` | number\|null | null | Abort if HIGH issues exceed this count. null = no limit |
| `min_test_pass_rate` | number\|null | null | Abort if test pass rate drops below this percentage (0-100). null = no limit |

### self_learning

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | true | Run the self-learning phase |

### logging

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | string | "INFO" | Log level: "DEBUG", "INFO", "WARN", "ERROR" |
| `include_commands` | boolean | true | Log executed commands to execution.log |

**Notes:**
- All log output goes to `.improvement-state/execution.log` (file only)
- Only `[ABORT]` messages are printed to stdout (to signal Claude to stop)
- Use `tail -f .improvement-state/execution.log` in a separate terminal to monitor progress
- START/END pairs help identify where Claude stopped (useful for debugging context exhaustion)

## State Files

The loop creates these files in `.improvement-state/`:

| File | Purpose |
|------|---------|
| `run.log` | High-level audit log with timestamps for each phase |
| `execution.log` | Detailed execution trace with START/END pairs and command logs |
| `log-env.sh` | Log configuration environment variables (generated from config) |
| `log-functions.sh` | Bash helper functions for logging |
| `issues-round-N.md` | Issues found in round N |
| `test-baseline.log` | Initial unit test output before any modifications |
| `e2e-baseline.log` | Initial E2E test output (if E2E enabled) |
| `reflection-log.md` | Retrospective notes appended after each round |
| `self-learning-suggestions.md` | Generated after the final round |
| `refactor-blocklist.json` | Files/strategies that caused reverts (persists across runs) |

## Recommended .gitignore additions

```
# Improvement loop state (session-specific, except blocklist)
.improvement-state/

# Improvement config (optional: commit if you want to share with team)
# .improvement-config.json
```
