# Issue #151: globalTeardown → Custom Playwright Reporter 詳細設計

## Context

`e2e/selectors/global-teardown.ts` が `report.json` を読んで Obsidian 通知を送る設計だが、Playwright の実行順序が「テスト → globalTeardown → レポーター出力」のため、`report.json` は teardown 時に存在しない。通知パイプラインが完全に非機能。Custom Reporter の `onTestEnd()` + `onEnd()` で直接テスト結果を収集する方式に置き換える。

---

## Architecture: Data Flow

```
smoke-test.spec.ts
  test.info().annotations.push({type:'pass', description:'5'}, ...)
  test.skip(true, 'gemini: AUTH_EXPIRED ...')
       │
       ▼
ObsidianReporter.onTestEnd(test: TestCase, result: TestResult)
  ├─ platform = test.parent.title.toLowerCase()  // 'Gemini' → 'gemini'
  ├─ status   = result.status                     // 'passed' | 'skipped' | ...
  ├─ annotations = result.annotations             // [{type:'pass', description:'5'}, ...]
  └─ processTestResult() → Map<platform, PlatformReport> に蓄積
       │
       ▼
ObsidianReporter.onEnd(result: FullResult)
  ├─ buildValidationReport(platformMap) → ValidationReport
  ├─ e2e/results/report-YYYY-MM-DD.json に保存
  ├─ dotenv.config() で環境変数読み込み
  └─ notifyObsidian(report, config)
```

---

## New Files

### 1. `e2e/selectors/report-builder.ts` — 純粋関数モジュール

Reporter クラスから分離した、副作用なしのロジック。vitest でテスト可能。

```typescript
// --- Types ---

export interface TestEndInput {
  platform: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  annotations: ReadonlyArray<{ type: string; description?: string }>;
}

// --- Exported Functions ---

/** describe ブロック title → プラットフォーム名 (小文字) */
export function extractPlatform(parentTitle: string): string;
// '' → 'unknown', 'Gemini' → 'gemini'

/** annotations から pass/warn/fail/baseline_issues カウントを抽出 */
export function parseAnnotationCounts(
  annotations: ReadonlyArray<{ type: string; description?: string }>
): { pass: number; warn: number; fail: number; baselineIssues: number };
// type マッチ → parseInt(description) ?? 0

/** skip annotation から理由を特定 */
export function detectSkipReason(
  annotations: ReadonlyArray<{ type: string; description?: string }>
): 'auth_expired' | 'unreachable' | null;
// description に 'AUTH_EXPIRED' → 'auth_expired'
// description に 'unreachable' → 'unreachable'

/** テスト結果をプラットフォームマップにマージ (immutable) */
export function processTestResult(
  platformMap: ReadonlyMap<string, PlatformReport>,
  input: TestEndInput
): Map<string, PlatformReport>;
// skipped → authStatus 設定 + classification=undefined
// passed/failed → annotation カウント → placeholder 配列でマージ

/** 蓄積データから ValidationReport を構築 */
export function buildValidationReport(
  platformMap: ReadonlyMap<string, PlatformReport>
): ValidationReport;
// overallStatus 優先度: fail > auth_expired > warn > pass
```

**マージロジックの詳細** (Gemini は conv + DR の 2 テスト):

```typescript
// 2 番目のテスト到着時:
classification = {
  pass: [...existing.pass, ...new Array(newPassCount).fill(null)],
  warn: [...existing.warn, ...new Array(newWarnCount).fill(null)],
  fail: [...existing.fail, ...new Array(newFailCount).fill(null)],
  baselineIssues: [...existing.baselineIssues, ...new Array(newBaselineCount).fill(null)],
};
```

`notifier.ts` の `generateMarkdown()` は `.length` のみ参照するため、placeholder 配列で十分。

### 2. `e2e/selectors/obsidian-reporter.ts` — Reporter クラス

```typescript
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

class ObsidianReporter implements Reporter {
  private platformMap: Map<string, PlatformReport> = new Map();

  onTestEnd(test: TestCase, result: TestResult): void {
    // extractPlatform + processTestResult
    this.platformMap = processTestResult(this.platformMap, { ... });
  }

  async onEnd(_result: FullResult): Promise<void> {
    // buildValidationReport → save JSON → dotenv → notifyObsidian
  }

  printsToStdio(): boolean {
    return false;  // list reporter との共存のため
  }
}

export default ObsidianReporter;
```

**設計判断**:
- `printsToStdio() → false`: `list` reporter を妨げない
- `onEnd()` は Promise を返す → Playwright が await する (公式仕様)
- dotenv は `onEnd()` 内で読み込み (モジュールスコープでの副作用回避)
- `results/` ディレクトリが存在しない場合は `mkdirSync({ recursive: true })`

### 3. `e2e/selectors/__tests__/report-builder.test.ts` — ユニットテスト

#### `extractPlatform`

| Input | Expected | 理由 |
|-------|----------|------|
| `'Gemini'` | `'gemini'` | 標準ケース |
| `'claude'` | `'claude'` | 小文字入力 |
| `''` | `'unknown'` | 空文字列フォールバック |

#### `parseAnnotationCounts`

| Input | Expected |
|-------|----------|
| 4 annotation 全て存在 | `{pass:5, warn:2, fail:0, baselineIssues:1}` |
| 空配列 | `{pass:0, warn:0, fail:0, baselineIssues:0}` |
| description が undefined | `{pass:0, ...}` (NaN → 0 へフォールバック) |

#### `detectSkipReason`

| Input | Expected |
|-------|----------|
| `AUTH_EXPIRED` を含む skip annotation | `'auth_expired'` |
| `unreachable` を含む skip annotation | `'unreachable'` |
| skip annotation なし | `null` |
| 別理由の skip | `null` |

#### `processTestResult`

| Scenario | Expected |
|----------|----------|
| 最初のテスト (空マップ) | プラットフォームエントリ作成 |
| 同一プラットフォーム 2 回目 | カウントがマージされる |
| skipped テスト | authStatus 設定、classification=undefined |
| immutability | 元の Map が変更されていない |

#### `buildValidationReport`

| Platforms | Expected overallStatus |
|-----------|----------------------|
| 全 pass | `'pass'` |
| 1 つ fail | `'fail'` |
| auth_expired のみ (fail なし) | `'auth_expired'` |
| warn のみ | `'warn'` |
| fail + auth_expired | `'fail'` (fail 優先) |
| 空マップ | `'pass'` |

---

## Modified Files

### 4. `e2e/playwright.config.ts`

```diff
- globalTeardown: './selectors/global-teardown.ts',
+ // globalTeardown removed — replaced by ObsidianReporter (see ADR-006)
```

```diff
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(RESULTS_DIR, 'report.json') }],
+   ['./selectors/obsidian-reporter.ts'],
  ],
```

JSON reporter は残す（デバッグ用途。通知パイプラインからは切り離された）。

### 5. `e2e/selectors/notifier.ts` — ログプレフィックス変更

4 箇所:
- L38: `[globalTeardown]` → `[ObsidianReporter]`
- L61: `[globalTeardown]` → `[ObsidianReporter]`
- L63: `[globalTeardown]` → `[ObsidianReporter]`
- L66: `[globalTeardown]` → `[ObsidianReporter]`

### 6. `e2e/selectors/smoke-test.spec.ts` — コメント更新

L124 のコメントのみ:
```diff
-    // Record in annotations for globalTeardown to read
+    // Record in annotations for ObsidianReporter to read
```

---

## Deleted Files

### 7. `e2e/selectors/global-teardown.ts`

全ロジックは `report-builder.ts` (純粋関数) と `obsidian-reporter.ts` (オーケストレーション) に吸収済み。

---

## Documentation

### 8. `docs/adr/006-custom-reporter-for-obsidian-notification.md` (新規)

- **Status**: Accepted
- **Context**: Playwright が globalTeardown の後に report.json を書くため通知不可
- **Decision**: Custom Reporter (`onTestEnd` + `onEnd`) + 純粋関数分離
- **Alternatives**: (B) npm script チェーン (脆弱 + exit code 問題), (C) `onExit()` (FullResult なし)

### 9. DES-015 更新箇所

1. ディレクトリ構造テーブル (L184): `global-teardown.ts` → `obsidian-reporter.ts` + `report-builder.ts`
2. パイプライン図 (L921-934): Reporter ベースのフローに書き換え
3. OPEN-01 (L453 付近): RESOLVED マーク

### 10. WF-015 更新箇所

1. OPEN-01 (L453): RESOLVED マーク
2. リスクテーブル (L406): `global-teardown.ts` → `obsidian-reporter.ts`

---

## Execution Workflow

### Phase 0: 準備

| ID | Task | 依存 | 並列 |
|----|------|------|------|
| T-00 | `git checkout -b fix/151-replace-global-teardown-with-reporter` | — | — |

---

### Phase 1: report-builder (TDD: RED → GREEN)

| ID | Task | 依存 | 並列 |
|----|------|------|------|
| T-01 | `e2e/selectors/__tests__/report-builder.test.ts` 作成 (RED) | T-00 | — |
| T-02 | `e2e/selectors/report-builder.ts` 作成 (GREEN) | T-01 | — |
| T-03 | `npm run test` — 全テスト pass 確認 | T-02 | — |

**Quality Gate 1**: T-03 pass でなければ Phase 2 に進まない

**T-01 詳細** (テストファイル):
```
describe('extractPlatform')     — 3 cases
describe('parseAnnotationCounts') — 3 cases
describe('detectSkipReason')    — 4 cases
describe('processTestResult')   — 4 cases
describe('buildValidationReport') — 6 cases
```
合計 ~20 テストケース。`classifier.test.ts` の `makeResult()` パターンに倣うファクトリ関数を用意。

**T-02 詳細** (実装):
- `TestEndInput` 型定義
- 5 つの純粋関数 (前述の関数シグネチャ)
- `notifier.ts` の `PlatformReport` / `ValidationReport` を import
- `classifier.ts` の `ClassificationResult` を import
- `auth-check.ts` の `AuthStatus` を import

---

### Phase 2: Reporter クラス

| ID | Task | 依存 | 並列 |
|----|------|------|------|
| T-04 | `e2e/selectors/obsidian-reporter.ts` 作成 | T-03 | — |
| T-05 | `npm run build` — TypeScript 通過確認 | T-04 | — |

**Quality Gate 2**: T-05 pass でなければ Phase 3 に進まない

**T-04 詳細**:
- `Reporter` interface 実装 (`@playwright/test/reporter`)
- `onTestEnd()`: extractPlatform + processTestResult
- `onEnd()`: buildValidationReport → JSON 保存 → dotenv → notifyObsidian
- `printsToStdio() → false`
- `export default ObsidianReporter`

---

### Phase 3: 既存ファイル更新 + 旧ファイル削除

| ID | Task | 依存 | 並列 |
|----|------|------|------|
| T-06 | `e2e/playwright.config.ts` 更新 | T-05 | ★ |
| T-07 | `e2e/selectors/notifier.ts` ログプレフィックス 4 箇所 | T-05 | ★ |
| T-08 | `e2e/selectors/smoke-test.spec.ts` コメント 1 箇所 | T-05 | ★ |
| T-09 | `e2e/selectors/global-teardown.ts` 削除 | T-06 | — |
| T-10 | `npm run build` + `npm run test` + `npm run lint` | T-09 | — |

★ = T-06, T-07, T-08 は互いに独立で並列実行可

**Quality Gate 3**: T-10 全 pass でなければ Phase 4 に進まない

**T-06 diff**:
```diff
- globalTeardown: './selectors/global-teardown.ts',
```
```diff
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(RESULTS_DIR, 'report.json') }],
+   ['./selectors/obsidian-reporter.ts'],
  ],
```

**T-07 diff** (replace_all):
```diff
- [globalTeardown]
+ [ObsidianReporter]
```

**T-08 diff**:
```diff
-    // Record in annotations for globalTeardown to read
+    // Record in annotations for ObsidianReporter to read
```

---

### Phase 4: ドキュメント

| ID | Task | 依存 | 並列 |
|----|------|------|------|
| T-11 | `docs/adr/006-custom-reporter-for-obsidian-notification.md` 作成 | T-10 | ★ |
| T-12 | `docs/design/DES-015-*.md` 更新 | T-10 | ★ |
| T-13 | `docs/workflow/WF-015-*.md` 更新 | T-10 | ★ |

★ = 並列実行可

**T-11 ADR 構成**:
- Status: Accepted
- Context: Playwright 実行順序の問題
- Decision: Custom Reporter + 純粋関数分離
- Alternatives: (B) npm script, (C) onExit()
- Consequences: 通知機能回復 + テスタビリティ向上

**T-12 DES-015 更新**:
1. L184: ディレクトリ構造 `global-teardown.ts` → `obsidian-reporter.ts` + `report-builder.ts`
2. L921-934: パイプライン図を Reporter ベースに書き換え
3. OPEN-01: RESOLVED マーク + 解決策記述

**T-13 WF-015 更新**:
1. L406: リスクテーブル `global-teardown.ts` → `obsidian-reporter.ts`
2. L453: OPEN-01 RESOLVED マーク

---

### Phase 5: 最終検証

| ID | Task | 依存 | 並列 |
|----|------|------|------|
| T-14 | `npm run build` | T-11-13 | ★ |
| T-15 | `npm run test` (coverage 確認) | T-11-13 | ★ |
| T-16 | `npm run lint` | T-11-13 | ★ |
| T-17 | `grep -r "global-teardown\|globalTeardown" e2e/ src/` 参照残り検出 | T-11-13 | ★ |
| T-18 | `npm run e2e:selectors` (手動統合テスト、ユーザー判断) | T-14-17 | — |

★ = 並列実行可

**Final Gate**: T-14-17 全 pass → コミット可。T-18 はユーザー判断 (headed Chrome + ログイン済み state 必要)。

---

## Dependency Graph (Critical Path)

```
T-00 → T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-09 → T-10 → T-11~13 → T-14~17 → T-18
                                              ↗ T-07 ↗
                                              ↗ T-08 ↗
```

**クリティカルパス**: T-00 → T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-09 → T-10 → T-14

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `import.meta.dirname` が Reporter 内で動作しない | Low | Playwright 1.58.2 の ESM サポートで対応。フォールバック: `path.dirname(new URL(import.meta.url).pathname)` |
| Reporter 相対パス解決 | Low | Playwright は config ディレクトリから解決 (公式文書) |
| 同一プラットフォーム skip + pass 混在 | Low | 現行動作を保持 (skip が override)。将来改善候補 |
| `onEnd()` async 完了待ち | Low | Playwright が Promise を await することは公式文書化済み |

---

## Success Criteria

- [ ] `npm run build` pass
- [ ] `npm run test` pass (既存 + 新規 ~20 テスト)
- [ ] `npm run lint` pass (0 errors, 0 warnings)
- [ ] `global-teardown.ts` 削除済み、どこからも参照なし
- [ ] `playwright.config.ts` に `globalTeardown` プロパティなし
- [ ] Custom reporter が `playwright.config.ts` の reporter 配列に存在
- [ ] ADR-006 作成済み
- [ ] DES-015 / WF-015 の OPEN-01 が RESOLVED
