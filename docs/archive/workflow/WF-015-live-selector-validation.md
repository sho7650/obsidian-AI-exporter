# ライブサイト セレクタ検証システム 実装ワークフロー

**設計書**: [DES-015-live-selector-validation.md](../design/DES-015-live-selector-validation.md)
**ADR**: [ADR-005-shared-selector-modules.md](../adr/005-shared-selector-modules.md)
**作成日**: 2026-03-22
**ベースブランチ**: main

---

## 依存関係図

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: セレクタ共有モジュール抽出 (standalone PR)               │
│                                                                   │
│  ┌─────────────┐                                                 │
│  │ 1.1 types.ts │                                                │
│  └──────┬──────┘                                                 │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 1.2 selectors/{gemini,claude,chatgpt,perplexity}.ts      │    │
│  │     (ソースから as-is で移動 + export + satisfies)        │    │
│  └──────┬───────────────────────────────────────────────────┘    │
│         ▼                                                         │
│  ┌─────────────┐                                                 │
│  │ 1.3 index.ts │ (集約 re-export)                               │
│  └──────┬──────┘                                                 │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 1.4 各 extractor: const 定義削除 + import 追加            │    │
│  │     gemini.ts / claude.ts / chatgpt.ts / perplexity.ts   │    │
│  └──────┬───────────────────────────────────────────────────┘    │
│         ▼                                                         │
│  ┌──────────────┐                                                │
│  │ 1.5 検証     │ build + test + lint                            │
│  └──────────────┘                                                │
│                                                                   │
│  ★ Phase 1 完了 → PR 作成・マージ                                 │
├─────────────────────────────────────────────────────────────────┤
│ Phase 2: E2E インフラ構築 (Phase 1 マージ後)                      │
│                                                                   │
│  ┌──────────────────────────────┐                                │
│  │ 2.1 依存パッケージ追加        │                                │
│  │     @playwright/test, dotenv │                                │
│  └──────┬───────────────────────┘                                │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────┐                │
│  │ 2.2 e2e/ ディレクトリ構造 + tsconfig.json     │                │
│  └──────┬───────────────────────────────────────┘                │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────┐                │
│  │ 2.3 setup-profile.ts + .env.local.example     │                │
│  └──────┬───────────────────────────────────────┘                │
│         ▼                                                         │
│  ┌──────────────────────────────┐                                │
│  │ 2.4 .gitignore 更新          │                                │
│  └──────────────────────────────┘                                │
├─────────────────────────────────────────────────────────────────┤
│ Phase 3: Smoke Test ロジック (Phase 2 に続く)                     │
│                                                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ 3.1 auth-check.ts    │  │ 3.2 baseline.ts      │             │
│  │ (認証プリフライト)    │  │ (ベースライン管理)    │             │
│  └──────┬───────────────┘  └──────┬───────────────┘             │
│         └─────────┬───────────────┘                               │
│                   ▼                                               │
│  ┌──────────────────────┐                                        │
│  │ 3.3 classifier.ts    │ (結果分類)                              │
│  └──────┬───────────────┘                                        │
│         ▼                                                         │
│  ┌──────────────────────────────────────┐                        │
│  │ 3.4 classifier / baseline テスト     │ (vitest)                │
│  └──────┬───────────────────────────────┘                        │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────┐                │
│  │ 3.5 playwright.config.ts                      │                │
│  │     (workers:1, globalTeardown, JSON reporter)│                │
│  └──────┬───────────────────────────────────────┘                │
│         ▼                                                         │
│  ┌──────────────────────────────────────┐                        │
│  │ 3.6 smoke-test.spec.ts               │                        │
│  │     (4 describe + runPlatformValidation) │                    │
│  └──────────────────────────────────────┘                        │
├─────────────────────────────────────────────────────────────────┤
│ Phase 4: 通知パイプライン (Phase 3 に続く)                        │
│                                                                   │
│  ┌──────────────────────┐                                        │
│  │ 4.1 notifier.ts      │ (Obsidian REST API)                    │
│  └──────┬───────────────┘                                        │
│         ▼                                                         │
│  ┌──────────────────────────────────────────────┐                │
│  │ 4.2 global-teardown.ts                        │                │
│  │     (report.json → ValidationReport → 通知)  │                │
│  └──────┬───────────────────────────────────────┘                │
│         ▼                                                         │
│  ┌──────────────────────────────────────┐                        │
│  │ 4.3 npm scripts 追加                  │                        │
│  │     e2e:auth / e2e:selectors          │                        │
│  └──────────────────────────────────────┘                        │
│                                                                   │
│  ★ Phase 2-4 完了 → PR 作成・マージ                               │
├─────────────────────────────────────────────────────────────────┤
│ Phase 5: 手動検証 + スケジュール登録 (マージ後)                    │
│                                                                   │
│  ┌──────────────────────────────────────┐                        │
│  │ 5.1 npm run e2e:auth (手動ログイン)   │                        │
│  └──────┬───────────────────────────────┘                        │
│         ▼                                                         │
│  ┌──────────────────────────────────────┐                        │
│  │ 5.2 .env.local 設定                   │                        │
│  └──────┬───────────────────────────────┘                        │
│         ▼                                                         │
│  ┌──────────────────────────────────────┐                        │
│  │ 5.3 npm run e2e:selectors (初回実行)  │                        │
│  │     → ベースライン保存                │                        │
│  └──────┬───────────────────────────────┘                        │
│         ▼                                                         │
│  ┌──────────────────────────────────────┐                        │
│  │ 5.4 launchd plist 登録 (日次実行)     │                        │
│  └──────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## PR 戦略

| PR | Phase | ブランチ名 | 内容 |
|----|-------|-----------|------|
| PR-1 | Phase 1 | `refactor/shared-selector-modules` | セレクタ共有モジュール抽出のみ。ロジック変更なし。既存テスト全パス |
| PR-2 | Phase 2-4 | `feat/live-selector-validation` | E2E インフラ + Smoke Test + 通知パイプライン。Phase 1 マージ後にベース |

Phase 5 はコード変更ではなく手動操作のため PR 不要。

---

## Phase 1: セレクタ共有モジュール抽出

### Step 1.1 — types.ts 作成

| 項目 | 内容 |
|------|------|
| 対象ファイル | `src/content/extractors/selectors/types.ts` (新規) |
| 作業内容 | `SelectorList`, `SelectorGroup`, `ComputedSelectors` 型定義を作成 |
| 検証 | `npm run build` — コンパイル成功 |

### Step 1.2 — プラットフォームセレクタモジュール作成

| 項目 | 内容 |
|------|------|
| 対象ファイル | `src/content/extractors/selectors/{gemini,claude,chatgpt,perplexity}.ts` (新規 x4) |
| 作業内容 | 各 extractor から SELECTORS 定数を **as-is** で移動。`export const` + `as const satisfies SelectorGroup` 付与 |
| 移動対象 | DES-015 Section 1.3 の移動対象テーブル参照 |
| 注意 | JSDoc コメントも移動。コードの変更は export と satisfies の付与のみ |

移動元と行番号:

| File | Constants | Lines |
|------|-----------|-------|
| `gemini.ts` | SELECTORS, DEEP_RESEARCH_SELECTORS, DEEP_RESEARCH_LINK_SELECTORS, COMPUTED_SELECTORS | L26-L114 |
| `claude.ts` | SELECTORS, DEEP_RESEARCH_SELECTORS, JOINED_SELECTORS | L27-L113 |
| `chatgpt.ts` | SELECTORS | L20-L51 |
| `perplexity.ts` | SELECTORS | L20-L49 |

### Step 1.3 — index.ts 作成

| 項目 | 内容 |
|------|------|
| 対象ファイル | `src/content/extractors/selectors/index.ts` (新規) |
| 作業内容 | 集約 re-export。各プラットフォームの SELECTORS をプレフィックス付きで export |
| 注意 | COMPUTED_SELECTORS / JOINED_SELECTORS は **含めない** (extractor 内部用) |

### Step 1.4 — Extractor の import 書き換え

| 項目 | 内容 |
|------|------|
| 対象ファイル | `gemini.ts`, `claude.ts`, `chatgpt.ts`, `perplexity.ts` |
| 作業内容 | 各ファイルから const 定義ブロックを削除し、`import { ... } from './selectors/xxx'` に置換 |
| 注意 | 参照名 (`SELECTORS.xxx`) は変更しない。ロジック変更ゼロ |

### Step 1.5 — 検証

```bash
npm run build    # TypeScript コンパイル
npm run test     # 全テスト (631+) パス
npm run lint     # ESLint 0 errors
```

### Checkpoint: Phase 1 完了

- [ ] 6 ファイル新規作成 (types + 4 platforms + index)
- [ ] 4 ファイル修正 (extractor 各 1)
- [ ] build / test / lint 全パス
- [ ] PR 作成: `refactor/shared-selector-modules`

---

## Phase 2: E2E インフラ構築

### Step 2.1 — 依存パッケージ追加

```bash
npm install -D @playwright/test dotenv
npx playwright install chromium
```

### Step 2.2 — ディレクトリ構造 + tsconfig

| 項目 | 内容 |
|------|------|
| 対象 | `e2e/` ディレクトリ構造全体 + `e2e/tsconfig.json` |
| tsconfig | `extends: ../tsconfig.json`, `types: ["node"]`, `chrome` 型除外 |

### Step 2.3 — 認証セットアップスクリプト

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/auth/setup-profile.ts` (新規) |
| 作業内容 | DES-015 Section 2.3 に準拠。headed モードで 4 サイトを開き手動ログイン後に保存 |

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/.env.local.example` (新規) |
| 作業内容 | DES-015 Section 2.4 のテンプレート |

### Step 2.4 — .gitignore 更新

追加エントリ:
```
e2e/auth/profiles/
e2e/.env.local
e2e/results/
e2e/baselines/
```

---

## Phase 3: Smoke Test ロジック

### Step 3.1 — auth-check.ts

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/selectors/auth-check.ts` (新規) |
| 作業内容 | DES-015 Section 3.1 に準拠。`AUTH_URL_PATTERNS` + `checkAuthStatus()` |
| Export | `AuthStatus` 型, `checkAuthStatus()` 関数 |

### Step 3.2 — baseline.ts

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/selectors/baseline.ts` (新規) |
| 作業内容 | DES-015 Section 3.3 に準拠。`BaselineEntry`, `compareWithBaseline()` (含 `new_selector` ステータス) |
| Export | `BaselineEntry`, `BaselineComparison`, `hasBaseline()`, `saveBaseline()`, `loadBaseline()`, `compareWithBaseline()` |

### Step 3.3 — classifier.ts

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/selectors/classifier.ts` (新規) |
| 作業内容 | DES-015 Section 3.4 に準拠。`classifyResults()` + `WarnDetail` 型 |
| Export | `SelectorResult`, `WarnDetail`, `ClassificationResult`, `classifyResults()` |

### Step 3.4 — classifier / baseline ユニットテスト

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/selectors/__tests__/classifier.test.ts` (新規) |
| 対象ファイル | `e2e/selectors/__tests__/baseline.test.ts` (新規) |
| テストケース | DES-015 Section 3.8 のリスト + `new_selector` のケース |
| 実行 | `npm run test` (vitest) で既存テストと共に実行 |

**classifier テストケース**:
1. 全セレクタ pass (primary マッチ)
2. Primary 失敗 + fallback マッチ → WARN (`failedPrimary` + `workingFallback`)
3. 全セレクタ不一致 → FAIL
4. 空入力 → 空結果
5. 単一セレクタグループ (fallback なし) で pass
6. 単一セレクタグループ (fallback なし) で fail
7. ベースライン比較で lost → `baselineIssues` に含まれる

**baseline テストケース**:
1. ベースライン保存 + 読み込みの往復
2. `compareWithBaseline` — match / degraded / lost の判定
3. `compareWithBaseline` — 新規セレクタ → `new_selector`
4. ベースラインなし時の `hasBaseline()` → false

### Step 3.5 — playwright.config.ts

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/playwright.config.ts` (新規) |
| Key設定 | `workers: 1`, `timeout: 90_000`, `retries: 1`, `globalTeardown`, JSON reporter |

### Step 3.6 — smoke-test.spec.ts

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/selectors/smoke-test.spec.ts` (新規) |
| 作業内容 | DES-015 Section 3.6 に準拠 |
| 構造 | 4 つの独立 `test.describe` (Gemini, Claude, ChatGPT, Perplexity) |
| Helper | `validateSelectors()`, `runPlatformValidation()`, `READY_SELECTORS` |

---

## Phase 4: 通知パイプライン

### Step 4.1 — notifier.ts

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/selectors/notifier.ts` (新規) |
| 作業内容 | DES-015 Section 4.1 に準拠。`notifyObsidian()` + `generateMarkdown()` |
| 出力形式 | テーブル形式の Obsidian Markdown (frontmatter + Summary + Details) |

### Step 4.2 — global-teardown.ts

| 項目 | 内容 |
|------|------|
| 対象ファイル | `e2e/selectors/global-teardown.ts` (新規) |
| 作業内容 | DES-015 Section 3.7 に準拠 |
| パイプライン | `report.json` 読取 → タイムスタンプ付きコピー保存 → `ValidationReport` 構築 → `notifyObsidian()` |

### Step 4.3 — npm scripts 追加

`package.json` に追加:

```json
"e2e:auth": "npx tsx e2e/auth/setup-profile.ts",
"e2e:selectors": "npx playwright test --config e2e/playwright.config.ts",
"e2e:selectors:headed": "npx playwright test --config e2e/playwright.config.ts --headed"
```

### Checkpoint: Phase 2-4 完了

- [ ] e2e/ 配下に全ファイル作成
- [ ] classifier / baseline のユニットテスト全パス
- [ ] `npm run build` 成功 (既存コードへの影響なし)
- [ ] `npm run test` 成功 (新規ユニットテスト含む)
- [ ] PR 作成: `feat/live-selector-validation`

---

## Phase 5: 手動検証 + スケジュール登録

Phase 5 はコード変更ではなく、マージ後の手動操作。

### Step 5.1 — 認証プロファイル作成

```bash
npm run e2e:auth
# → ブラウザが開く。4 サイトに手動ログイン。Enter で保存。
```

### Step 5.2 — テスト URL 設定

```bash
cp e2e/.env.local.example e2e/.env.local
# → 各プラットフォームの会話 URL + Obsidian API key を記入
```

### Step 5.3 — 初回実行

```bash
npm run e2e:selectors:headed
# → headed モードで動作確認
# → ベースラインが e2e/baselines/ に自動保存される
```

確認項目:
- [ ] 全プラットフォームで認証が通る (AUTH_EXPIRED でない)
- [ ] READY_SELECTORS でページ準備完了を正しく検知
- [ ] 各セレクタの matchCount が 0 以上
- [ ] ベースライン JSON が保存される
- [ ] Obsidian 通知が届く (WARN/FAIL がある場合)

### Step 5.4 — 日次スケジュール登録

```bash
launchctl load ~/Library/LaunchAgents/com.g2o.selector-check.plist
# 翌日の実行を確認: /tmp/g2o-selector-check.log
```

---

## 受入基準チェックリスト

| 基準 | 検証方法 | Phase |
|------|---------|-------|
| 全セレクタグループの PASS/WARN/FAIL 判定 | smoke-test.spec.ts の実行結果 | 5.3 |
| AUTH_EXPIRED の区別 | 未ログインプロファイルでテスト実行 → skip 確認 | 5.3 |
| プラットフォーム分離 | 1 サイトの URL を無効化 → 他が正常に完了 | 5.3 |
| Obsidian 通知 | WARN/FAIL 時に Obsidian ノートが作成される | 5.3 |
| 日次自動実行 | launchd 登録後、翌日のログ確認 | 5.4 |
| ベースライン乖離検知 | 初回実行後にベースラインを手動で書き換え → degraded/lost 検知 | 5.3 |

---

## リスクと対策

| リスク | 発生確率 | 対策 |
|--------|---------|------|
| Bot 検知 (headless) | 中 (特に Google) | `--headed` フォールバックで確認。plist を headed に変更可 |
| セッション期限切れ | 高 (1-2 週間) | AUTH_EXPIRED 検知 → Obsidian 通知 → `e2e:auth` 再実行 |
| テスト URL の会話削除 | 低 | 検証用会話をブックマーク/ピン留め |
| Obsidian REST API 未起動 | 中 | `obsidian-reporter.ts` でエラーハンドリング + コンソールログ出力 |
| `as const satisfies` の既存コード影響 | 低 | Phase 1 の build + test で検証 |

---

## 実装結果 (2026-03-22)

### 設計からの変更点

実装中に以下の設計変更が発生した。詳細は DES-015 の「実装時の設計変更」セクション参照。

| ID | 変更内容 | 理由 |
|----|---------|------|
| **IMP-01** | `launchPersistentContext` → storageState 方式 | Google ログインブロック + SingletonLock (symlink) + Keychain 暗号化不一致の 3 問題が連鎖 |
| **IMP-02** | `headless: true` → `channel: 'chrome'` + `headless: false` | Cloudflare が bundled Chromium (headless) を bot 検知し 403 を返す |
| **IMP-03** | `networkidle` → `domcontentloaded` + `waitForTimeout` | SPA の常時通信 (WebSocket/SSE) で networkidle に到達不可 |
| **IMP-04** | プラットフォーム独立 context → 単一共有 context | storageState 方式ではプロファイルロック不在のため分離不要 |

### 最終的なアーキテクチャ

```
認証 (e2e:auth):
  Chrome 直接起動 (--remote-debugging-port=9222)
  → 手動ログイン
  → connectOverCDP → storageState エクスポート (state.json)
  → Chrome 終了

検証 (e2e:selectors):
  chromium.launch({ channel: 'chrome', headless: false })
  → newContext({ storageState: 'state.json' })
  → 4 platform × 6 tests (sequential, workers: 1)
  → ベースライン比較 + PASS/WARN/FAIL 分類
```

### 検証結果

| Check | Result |
|-------|--------|
| build | TypeScript + Vite 成功 |
| test | 32 files, 818 tests all passed (既存 800 + 新規 18) |
| lint | 0 errors, 0 warnings |
| e2e:selectors | 6/6 passed (22.9s) |

### 既知の残課題

| ID | 課題 | 優先度 |
|----|------|--------|
| ~~OPEN-01~~ | ~~`globalTeardown` で `report.json` が読めない~~ | **RESOLVED** (ADR-006: Custom Reporter) |
| OPEN-02 | launchd plist 未作成 (Phase 5.4) | LOW (OPEN-01 解決済みのため着手可能) |
| OPEN-03 | headed モードのディスプレイ依存 | LOW |
