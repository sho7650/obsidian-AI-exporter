# ADR-006: Custom Playwright Reporter for Obsidian Notification

## Status

Accepted (2026-03-22)

## Context

The live selector validation system (DES-015) sends health reports to Obsidian when WARN, FAIL, or AUTH_EXPIRED conditions are detected. The original design used `globalTeardown` to read Playwright's JSON report (`report.json`) and build a `ValidationReport`.

However, Playwright's execution order is:

1. Run all tests
2. Run `globalTeardown`
3. Write reporter output files (JSON, HTML, etc.)

Because `globalTeardown` executes **before** the JSON reporter writes its output, `report.json` never exists at teardown time. The teardown silently skips notification with:

```
[globalTeardown] No report.json found. Skipping notification.
```

This means the Obsidian notification pipeline has been non-functional since initial implementation (OPEN-01 in DES-015).

## Decision

Replace `globalTeardown` with a **custom Playwright Reporter** that:

1. Collects test results directly via `onTestEnd(test, result)` — no dependency on `report.json`
2. Builds the `ValidationReport` and sends the Obsidian notification in `onEnd()`
3. Extracts pure report-building logic into a separate module (`report-builder.ts`) for unit testability

### Architecture

```
smoke-test.spec.ts
  ↓ annotations (pass/warn/fail/baseline_issues)
ObsidianReporter.onTestEnd()
  ↓ accumulates per-platform data
ObsidianReporter.onEnd()
  ↓ builds ValidationReport
  ↓ saves timestamped JSON
  ↓ calls notifyObsidian()
```

### Files

| Action | File |
|--------|------|
| Create | `e2e/selectors/obsidian-reporter.ts` (Reporter class) |
| Create | `e2e/selectors/report-builder.ts` (pure functions) |
| Create | `e2e/selectors/__tests__/report-builder.test.ts` |
| Delete | `e2e/selectors/global-teardown.ts` |
| Modify | `e2e/playwright.config.ts` |
| Modify | `e2e/selectors/notifier.ts` (log prefix only) |

## Alternatives Considered

### B: Post-test npm script

```json
"e2e:selectors": "npx playwright test --config ... && node e2e/selectors/notify.js"
```

Rejected: When `playwright test` exits with a non-zero code (test failures), the `&&` chain stops and notification is never sent — which is exactly the case where notification is most needed.

### C: `onExit()` reporter hook

Playwright's `onExit()` runs after all reporters have flushed, so `report.json` would exist. However, `onExit()` does not receive `FullResult` and would require re-parsing `report.json`, reintroducing the file-timing coupling.

## Consequences

### Positive

- Obsidian notifications actually work
- No dependency on `report.json` file timing
- Pure functions are independently unit-testable (21 test cases)
- Reporter receives structured data directly from Playwright, eliminating JSON parsing

### Negative

- One additional module (`report-builder.ts`) in `e2e/selectors/`
- Coupled to Playwright's Reporter API (stable since v1.10)
