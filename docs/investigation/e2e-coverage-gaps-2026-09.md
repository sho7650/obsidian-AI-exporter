# E2E Coverage Gaps (2026-09 audit)

**Date:** 2026-09-22
**Scope:** `e2e/selectors/` live selector validation, fixture-based extraction tests, CI
**Status:** Investigation — facts only, no remediation decided

## What the E2E suite does today

- The live spec runs seven targets: gemini conv/DR, claude conv/DR, chatgpt conv, perplexity conv, notebooklm conv (`e2e/selectors/smoke-test.spec.ts:409-490`).
- The only measurement is `matchCount` / `nonEmptyCount` per selector string (`smoke-test.spec.ts:106-140`). `nonEmptyCount` is `textContent.trim().length > 0` (`:124`). No extraction, conversion, or save runs (`docs/design/DES-015-live-selector-validation.md:21`).
- Contract size: 41 selector names / 88 selector strings (gemini 15/33, claude 9/20, chatgpt 5/12, perplexity 6/12, notebooklm 6/11). Baseline format is v3 (`e2e/selectors/baseline.ts:26`).
- Assertions: zero-match names, baseline `lost` / `new_selector` / `removed`, dead primaries (`smoke-test.spec.ts:350-386`). `degraded` / `content_degraded` are advisory (`classifier.ts:87-89`).

### September 2026 run history

| Period | overallStatus | Detail |
| --- | --- | --- |
| 09-01 – 09-11 (10 runs) | warn | claude only: `assistantResponse` 62→6, `markdownContent` 12→8 and 18→14, DR `content` 10→9, identical every day |
| 09-12 – 09-21 (8 runs) | pass | baseline re-recorded 2026-09-11T23:53Z; the degradation was frozen in, not fixed |
| 09-22 | fail | chatgpt `authStatus: test_data_missing` (pinned `CHATGPT_CONV_URL` dead; 11th occurrence since 2026-07-17) |

Reports for 09-07 and 09-20 do not exist (cause not determined).

## A. Features in `src/` with no E2E selector contract

| Feature | src location | E2E |
| --- | --- | --- |
| Perplexity Deep Research prose | `src/content/extractors/perplexity.ts:59-62` | No perplexity DR target exists (#463) |
| Perplexity legacy placeholder | `perplexity.ts:40` | Deliberately outside the contract (`:27-30`) |
| ChatGPT Deep Research iframe | `src/content/extractors/chatgpt.ts:40-45` | Deliberately excluded to avoid the #402 baseline trap (`:25-31`) |
| Claude Extended Thinking | `src/content/extractors/claude.ts:368` | None |
| Claude tool-output grid / inert guard | `claude.ts:350-434` / `:68` | None |
| ChatGPT multi-block answers | `chatgpt.ts:217,290,320` | `[data-message-id]` is the accumulation key but not under contract |
| NotebookLM citation content | `src/content/extractors/notebooklm.ts:41,60` | `citationMarker` count only; `aria-label` presence unverified |
| Gemini Gem conversations | `src/content/extractors/gemini.ts:191` | `auth-check.ts:22` matches only `/(app\|deepresearch)/`; a `/gem/` URL is classified `test_data_missing` |
| ChatGPT custom GPTs | `chatgpt.ts:66` | `auth-check.ts:24` matches only `/c/`; a `/g/` URL is classified `test_data_missing` |
| markdown-rules selectors (`.cm-content`, `[data-footnote-ref]`, table heads) | `src/content/markdown-rules.ts:147-320` | None |
| Content-script boot detection | `src/content/bootstrap.ts:80-81` | None. `article[data-turn-id]` survives here although `selectors/chatgpt.ts:13-15` records it as 0 matches live since 2026-07 |
| Observation roots (`PLATFORM_ROOT_SELECTORS`) | `bootstrap.ts:59-65` | None |
| Gemini generated images | under contract (`generatedImage` matchCount 1, nonEmptyCount 0) | Test conversation holds one image; multi-image, 20-image cap, 10 MB cap unverified |

Hard-coded duplicates of contract selectors inside extractors (do not follow contract changes): `gemini.ts:236,250,298`, `claude.ts:173`, `notebooklm.ts:68,70`.

## B. Behaviours validated only by count, or not at all

Count only:

- Extracted text correctness. No string comparison anywhere.
- Fallback correctness. Gemini baseline: `user-query` = 4 matches, `[class*="user-query"]` = 20; a fallback matching 5× the elements still passes.

Not at all (no trace under `e2e/`):

- Scroll / virtualization accumulation (ADR-017, ADR-024). `scrollContainer` is only proven to match one element; no scroll runs. The #499 sidebar-decoy failure is structurally undetectable because short test conversations mount every row.
- Append mode, image byte capture, Obsidian REST write, popup UI, clipboard, file download.
- Title extraction (ADR-040): E2E never reads `document.title`.
- Truncation guard (ADR-033), badge invalidation (ADR-036), note size (ADR-038), tags (ADR-039): unit tests only.
- Loading the real built extension: `launchPersistentContext` / `--load-extension` have zero hits repo-wide; `chrome.*` is fully mocked (`test/setup.ts:4-30`).

Fixture-based extraction tests (`test/extractors/e2e/`):

- No NotebookLM fixture (`test/fixtures/html/` holds chatgpt, claude, gemini, perplexity only).
- Claude DR fixture is `artifacts.html` only. ChatGPT has `chat-simple.html` (2026-03) and `chat-code.html`, no DR fixture, no generated image.

## C. Infrastructure

1. No E2E in CI: `.github/workflows/ci.yml:38-48` runs lint, format:check, test:coverage, build only. `vitest.config.ts:20` includes `e2e/**/*.test.ts`, which are helper unit tests, not the live spec.
2. No launchd plist in the repo (DES-015 OPEN-02). Report timestamps range 05:27–15:53, consistent with manual runs.
3. `e2e/results/` and `e2e/baselines/` are gitignored (`.gitignore:46-47`): the contract is per-machine and unreviewable.
4. One test conversation per platform (`e2e/.env.local.example:5-20`). One dead URL zeroes the platform. A URL picker exists for Gemini only (`package.json` `e2e:gemini:pick-url`).
5. Viewport fixed at 1440×900 (`smoke-test.spec.ts:102`); narrow layouts never validated.
6. `auth_expired` skips (`smoke-test.spec.ts:191-197`); regressions are invisible while a session is dead. `overallStatus: auth_expired` is not `fail` (`report-builder.ts:182`).
7. Stall skips: threshold 3 (`smoke-test.spec.ts:93`); the counter lives in gitignored `e2e/results/stall-state.json`.
8. `unsettledTargets` is populated (`report-builder.ts:145-147`) but appears in neither the notifier table (`notifier.ts:144`) nor the notify fingerprint (`notify-policy.ts:43-69`).
9. Advisory degradation never blocks and is frozen into the contract on the next `e2e:baseline:update` (see claude, 2026-09-11).
10. `test_data_missing` fails (`smoke-test.spec.ts:200-208`) but recovery is manual for four of five platforms.

## Not verified

- Values in `e2e/.env.local` (sandbox denies `.env.*`). "Gemini test conversation holds one image" is inferred from the baseline entry, not observed.
- Whether a launchd plist is registered under `~/Library/LaunchAgents/`.
- Why the 09-07 and 09-20 reports are missing.
