# ADR-016: E2E selector validation — enforced baseline contract, state separation, and diff-based reporting

## Status

Accepted (2026-07-04) — amends the behavior described in DES-015

## Context

The 2026-07-04 investigation of the live selector-validation system found it
structurally unable to do its job:

1. **Advisory-only baseline.** The only failing assertion was
   "every variant of a selector name matched zero elements". Baseline
   comparisons (`lost` / `degraded` / `new_selector`) were computed but never
   enforced and never fed into `overallStatus`.
2. **Broken update procedure.** Baselines were written implicitly on first
   run, one file per platform, while gemini/claude run TWO tests against the
   same file — the first test's groups won and the second's stayed
   `new_selector` forever. The documented `rm && rerun` procedure regenerated
   the identical broken state. Gemini's constant `baselineIssues=17` since
   2026-03-23 was exactly its 17 deep-research variants.
3. **Lossy reporting.** Results crossed the Playwright boundary as four
   integer annotations, so saved reports were arrays of nulls; a test that
   failed before pushing annotations was invisible, letting the reporter
   claim "all passed" on mostly-failed runs.
4. **Conflated failure states.** Auth expiry, transient content stalls, and
   dead pinned test conversations all ended in silent skips. A logged-out
   Gemini shell contains a perpetual spinner, so auth expiry masqueraded as
   a "transient stall" indefinitely.
5. **Alert fatigue.** Every non-pass run produced an identical Obsidian note
   — 100+ consecutive daily warn notes in which nothing new could be seen.

## Decision

### 1. Baseline as an enforced contract (`e2e/selectors/baseline.ts` v2)

- One file per platform holding ALL selector groups; each test reads and
  updates only its own groups (no first-writer race).
- Baselines are written ONLY by `npm run e2e:baseline:update`
  (`UPDATE_BASELINE=1`); there is no implicit save.
- Zero-match entries are rejected at update time, with the offending
  selectors named — a baseline may never record an unfindable selector
  (that is what made `lost` undetectable).
- Comparison keys on group + name + **selector string** (not variant index):
  reordering variants is diff-free; a changed selector surfaces as
  `new_selector` + `removed`.
- `lost` / `new_selector` / `removed` FAIL the run; `degraded` is advisory.
  Missing or legacy-v1 baselines FAIL with the update-command hint.
- Baselines are per-machine artifacts (gitignored), like `e2e/.env.local`.

### 2. First-class failure states (`auth-check.ts`, `load-readiness.ts`, `stall-tracker.ts`)

- `resolveAuthStatus()` (pure) classifies post-navigation state:
  conversation-URL pattern → login-URL pattern → platform logged-out DOM
  marker. New `test_data_missing` state: authenticated but the pinned
  conversation no longer opens → FAILs with guidance to refresh
  `*_CONV_URL` in `e2e/.env.local`.
- Transient stall skips are counted per target (local state file); at 3
  consecutive stalls the skip escalates to validation → FAIL. This is what
  surfaces a logged-in tab spinning forever on a dead conversation URL.
- A dead primary selector (fallback still carrying) FAILs instead of
  logging a warn nobody reads.

### 3. Full-fidelity reporting (`report-builder.ts`, `obsidian-reporter.ts`)

- Each test attaches its complete result as a JSON attachment
  (`test.info().attach`, Playwright's official channel for structured data
  to custom reporters) at every exit point, BEFORE assertions.
- The reporter rebuilds platform reports from these attachments: real
  classification objects, per-target failure names, stall targets. A failed
  Playwright test counts toward `overallStatus` even without an attachment.
- `overallStatus`: fail ⊃ {any failed test, zero-match, dead primary,
  baseline violation, test_data_missing} > auth_expired > warn ⊃
  {advisory degradation, transient stall} > pass.

### 4. Diff-based notification (`notify-policy.ts`)

- A normalized fingerprint of issue IDENTITIES (never counts) is persisted
  per run; Obsidian is notified only when the fingerprint changed.
  Standing failures stay silent; recovery to pass sends a short note;
  no note = nothing new.

### 5. Operational tooling

- `npm run e2e:gemini:pick-url`: Gemini's 2026 sidebar exposes no
  conversation hrefs (empty custom elements, SPA click handlers, collapsed
  icon rail after fresh navigation), so refreshing a dead test URL requires
  desktop viewport + sidenav expansion + a real pointer click. The helper
  automates this against the CDP daemon and prints the URL plus follow-up
  steps. Both new commands are exposed on the nix task surface (ADR-011).

## Consequences

- The suite fails loudly on divergence; going green again requires either
  fixing selectors/test data or explicitly recording the change via the
  update command. Runs are red until stale test URLs and dead fallback
  variants are repaired — intended, replacing 103 days of silent warn.
- Baseline updates are deliberate operations on a healthy page state;
  a broken page cannot be enshrined as the contract.
- Saved reports (`e2e/results/report-*.json`) are self-sufficient records
  of what changed, per selector.
- Local state files (`stall-state.json`, `notify-state.json`) reset
  harmlessly: worst case one extra skip cycle or one extra note.
- Delivered across PRs #313 (R1), #315 (R2), #317 (R3), #318 (R5),
  #321 (R4); investigation and design 2026-07-04.
