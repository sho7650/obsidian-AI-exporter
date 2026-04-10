# Phase 3: Append Mode — Implementation Workflow

**Document ID:** WF-003
**Status:** Draft
**Created:** 2026-02-25
**Prereq:** [REQ-003](./phase3-append-mode-requirements.md) | [DES-003](./phase3-append-mode-design.md)

---

## Dependency Graph

```
Step 1: Title Extraction ──────────────────────────────────────────┐
Step 2: Types + Storage + Popup UI ────────────────────────────────┤
Step 3: frontmatter-parser.ts ──────┐                              │
Step 4: message-counter.ts ─────────┼──→ Step 6: append-utils.ts ──┤
Step 5: listFiles() API ───────────┘                               │
                                        Step 6 + Step 2 ──→ Step 7: handleSave() integration
                                                                   │
                                                            Step 8: Toast improvement
                                                                   │
                                                            Step 9: Verification
```

---

## Phase A: Foundation (並行実施可能)

### Step 1: Title Extraction Improvement

**Branch:** `feat/phase3-title-extraction`

**Goal:** Claude/ChatGPT/Perplexity の `getTitle()` を `document.title` 優先に変更

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 1.1 | Claude extractor の `getTitle()` 変更 | `src/content/extractors/claude.ts:168` | `getPageTitle() ?? getFirstMessageTitle()` |
| 1.2 | ChatGPT extractor の `getTitle()` 変更 | `src/content/extractors/chatgpt.ts:93` | 同上 |
| 1.3 | Perplexity extractor の `getTitle()` 変更 | `src/content/extractors/perplexity.ts:81` | 同上 |
| 1.4 | Claude extractor テスト追加 | `test/extractors/claude.test.ts` | `document.title` 優先 + fallback テスト (+2) |
| 1.5 | ChatGPT extractor テスト追加 | `test/extractors/chatgpt.test.ts` | 同上 (+2) |
| 1.6 | Perplexity extractor テスト追加 | `test/extractors/perplexity.test.ts` | 同上 (+1) |
| 1.7 | 全テスト実行 | — | `npm test` パス |

**Quality Gate:** `npm test && npm run build && npm run lint` — 0 errors

---

### Step 2: Types, Storage, Popup UI

**Branch:** `feat/phase3-settings`

**Goal:** `enableAppendMode` 設定の型定義・ストレージ・UI配線

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 2.1 | `SyncSettings` に `enableAppendMode: boolean` 追加 | `src/lib/types.ts:164-171` | TypeScript コンパイル通過 |
| 2.2 | `DEFAULT_SYNC_SETTINGS` にデフォルト値追加 | `src/lib/storage.ts:40-46` | `enableAppendMode: false` |
| 2.3 | `getSettings()` に取得ロジック追加 | `src/lib/storage.ts:66-81` | `?? false` fallback |
| 2.4 | `saveSettings()` に保存ロジック追加 | `src/lib/storage.ts:108-131` | `syncData.enableAppendMode` |
| 2.5 | Popup HTML にトグル追加 | `src/popup/index.html` | Auto-scroll の直後に配置 |
| 2.6 | Popup JS に `populateForm` / `collectSettings` 追加 | `src/popup/index.ts` | チェックボックス連携 |
| 2.7 | i18n 文字列追加 | `src/_locales/en/messages.json` | 4 keys |
| 2.8 | storage テスト更新 | `test/lib/storage.test.ts` | enableAppendMode get/save テスト |
| 2.9 | 全テスト・ビルド実行 | — | `npm test && npm run build` パス |

**Quality Gate:** 既存テスト全パス + 新規設定の保存/読込が動作

---

### Step 3: Frontmatter Parser

**Branch:** `feat/phase3-frontmatter-parser`

**Goal:** YAML frontmatter のパースと部分更新（ライブラリ不要）

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 3.1 | `ParsedFrontmatter` interface 定義 | `src/lib/frontmatter-parser.ts` | raw, fields, body |
| 3.2 | `parseFrontmatter()` 実装 | 同上 | `---` 区切り分割 + key:value パース |
| 3.3 | `updateFrontmatter()` 実装 | 同上 | 行置換 + `escapeYamlValue()` 再利用 |
| 3.4 | テスト: 正常系 | `test/lib/frontmatter-parser.test.ts` | 全フィールドパース、タグリスト、クォート値 |
| 3.5 | テスト: エッジケース | 同上 | frontmatter無し(null)、不正形式、body内の `---` |
| 3.6 | テスト: updateFrontmatter | 同上 | modified更新、message_count更新、タグ保持、未知フィールド保持 |
| 3.7 | 全テスト実行 | — | `npm test` パス (~15 新規テスト) |

**Quality Gate:** パース → 更新 → 再パースの往復テストが正しい

---

### Step 4: Message Counter

**Branch:** `feat/phase3-message-counter`

**Goal:** 既存ノート内のメッセージ数カウントと末尾メッセージ抽出

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 4.1 | Callout/Label 検出パターン定義 | `src/lib/message-counter.ts` | CALLOUT_PATTERN, LABEL_PATTERN |
| 4.2 | `countExistingMessages()` 実装 | 同上 | 3形式対応 (callout/blockquote/plain) |
| 4.3 | `extractTailMessages()` 実装 | 同上 | skipCount 以降のメッセージを抽出 |
| 4.4 | テスト: callout形式 | `test/lib/message-counter.test.ts` | 2, 4, 6 メッセージのカウント |
| 4.5 | テスト: blockquote/plain形式 | 同上 | 各形式でカウント正確 |
| 4.6 | テスト: extractTailMessages | 同上 | skip 0, skip N, skip all |
| 4.7 | テスト: エッジケース | 同上 | 空body, コードブロック内の偽パターン, 全5プラットフォームラベル |
| 4.8 | 全テスト実行 | — | `npm test` パス (~15 新規テスト) |

**Quality Gate:** `formatMessage()` の出力と `countExistingMessages()` が一致することを確認

---

### Step 5: Obsidian API — listFiles()

**Branch:** `feat/phase3-list-files`

**Goal:** `ObsidianApiClient` にディレクトリ一覧メソッドを追加

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 5.1 | `listFiles(directory)` メソッド実装 | `src/lib/obsidian-api.ts` | `GET /vault/{dir}/` + `Accept: application/json` |
| 5.2 | レスポンスパース（ディレクトリ除外） | 同上 | `files.filter(f => !f.endsWith('/'))` |
| 5.3 | 404 → 空配列 | 同上 | ディレクトリ未存在時 |
| 5.4 | テスト: 正常系 | `test/lib/obsidian-api.test.ts` | ファイル配列返却、ディレクトリ除外 |
| 5.5 | テスト: エラー系 | 同上 | 404→空配列、非404エラー→throw、タイムアウト |
| 5.6 | 全テスト実行 | — | `npm test` パス (~5 新規テスト) |

**Quality Gate:** fetch mock でレスポンス形式が正しく処理される

---

## Phase B: Core Logic (Phase A 完了後)

### Step 6: Append Utils

**Branch:** `feat/phase3-append-utils`
**Depends on:** Step 3 (frontmatter-parser), Step 4 (message-counter), Step 5 (listFiles)

**Goal:** ファイル検索・差分計算・コンテンツ再構築のコアロジック

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 6.1 | `FileLookupResult`, `AppendResult` interface 定義 | `src/lib/append-utils.ts` | 型定義 |
| 6.2 | `extractIdSuffix()` 実装 | 同上 | `"my-chat-abc12345.md"` → `"abc12345"` |
| 6.3 | `lookupExistingFile()` 実装 — Step 1: 直接パス | 同上 | `getFile()` + frontmatter ID 照合 |
| 6.4 | `lookupExistingFile()` 実装 — Step 2: IDスキャン | 同上 | `listFiles()` + サフィックスフィルタ + ID照合 |
| 6.5 | `buildAppendContent()` 実装 | 同上 | parse → count → extract tail → update FM → rebuild |
| 6.6 | テスト: extractIdSuffix | `test/lib/append-utils.test.ts` | 標準名、複数ダッシュ、エッジケース |
| 6.7 | テスト: lookupExistingFile — 直接パス | 同上 | ヒット、ID不一致 |
| 6.8 | テスト: lookupExistingFile — IDスキャン | 同上 | サフィックス一致、不一致、listFiles失敗 |
| 6.9 | テスト: buildAppendContent — 追記あり | 同上 | 2メッセージ追記、FM更新確認 |
| 6.10 | テスト: buildAppendContent — 追記なし | 同上 | 同数→null、既存多い→null |
| 6.11 | テスト: buildAppendContent — エラー | 同上 | frontmatterパース失敗→null |
| 6.12 | テスト: 既存body保護 | 同上 | 手動メモが保持されること |
| 6.13 | 全テスト実行 | — | `npm test` パス (~20 新規テスト) |

**Quality Gate:** 往復テスト — `generateNoteContent()` → save → append 2 messages → verify content

---

## Phase C: Integration (Phase A + B 完了後)

### Step 7: Background Handler Integration

**Branch:** `feat/phase3-append-mode` (メインフィーチャーブランチ)
**Depends on:** Step 2 (settings), Step 6 (append-utils)

**Goal:** `handleSave()` に Append Mode ブランチを統合

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 7.1 | Step 1-6 のブランチをマージ | — | コンフリクト解決、全テストパス |
| 7.2 | `handleSave()` に Append ブランチ追加 | `src/background/obsidian-handlers.ts` | enableAppendMode + type !== deep-research ガード |
| 7.3 | `lookupExistingFile()` 呼び出し追加 | 同上 | found → append、not found → overwrite |
| 7.4 | `buildAppendContent()` 呼び出し追加 | 同上 | result → putFile、null → no-op |
| 7.5 | エラーフォールバック実装 | 同上 | try/catch → console.warn → overwrite fallback |
| 7.6 | `SaveResponse.messagesAppended` 返却 | 同上 | 追記数 or 0 |
| 7.7 | テスト: Append ON + 既存ファイル + 新メッセージ | `test/background/index.test.ts` | appendResult 返却 |
| 7.8 | テスト: Append ON + 既存ファイル + 変更なし | 同上 | messagesAppended: 0 |
| 7.9 | テスト: Append ON + ファイル未発見 | 同上 | 新規作成 (overwrite) |
| 7.10 | テスト: Append ON + Deep Research | 同上 | 常に overwrite |
| 7.11 | テスト: Append ON + パースエラー | 同上 | fallback to overwrite |
| 7.12 | テスト: Append OFF | 同上 | 既存動作変更なし |
| 7.13 | 全テスト実行 | — | `npm test` パス (~8 新規テスト) |

**Quality Gate:** `npm test && npm run build && npm run lint` — 0 errors, coverage ≥ 85%

---

### Step 8: Toast Improvement

**Branch:** `feat/phase3-append-mode` (Step 7 に続けて)
**Depends on:** Step 7

**Goal:** `SaveResponse.messagesAppended` を活用した Toast 表示

| # | Task | File | Checkpoint |
|---|------|------|------------|
| 8.1 | Toast 表示ロジック更新 | `src/content/index.ts` | `messagesAppended > 0` → "N new messages appended" |
| 8.2 | No new messages Toast | 同上 | `messagesAppended === 0` → "No new messages" |
| 8.3 | 既存 Toast 維持 | 同上 | Append OFF / 新規ファイル → 現行メッセージ |
| 8.4 | 全テスト・ビルド実行 | — | `npm test && npm run build` パス |

---

## Phase D: Verification

### Step 9: Final Verification

| # | Task | Command/Action | Expected |
|---|------|---------------|----------|
| 9.1 | TypeScript 型チェック | `npm run build` | 0 errors |
| 9.2 | ESLint | `npm run lint` | 0 errors, 0 warnings |
| 9.3 | 全テスト | `npm test` | 全パス (既存 631 + 新規 ~68 = ~699) |
| 9.4 | カバレッジ | `npm test -- --coverage` | stmts ≥ 85%, branch ≥ 75% |
| 9.5 | Append OFF 回帰 | 手動確認 | 既存の上書き動作が変わらない |
| 9.6 | Append ON + 新規会話 | 手動確認 | 新規ファイル作成 |
| 9.7 | Append ON + 3メッセージ追加 | 手動確認 | 3件追記、FM更新、既存body保持 |
| 9.8 | Append ON + 変更なし | 手動確認 | "No new messages" toast |
| 9.9 | タグ・メモ保護 | 手動確認 | Obsidian側の手動追加が保持 |
| 9.10 | タイトル変更→IDスキャン | 手動確認 | 既存ファイル発見 |

---

## Summary

| Phase | Steps | 新規テスト | 主な成果物 |
|-------|-------|----------|-----------|
| **A: Foundation** | 1-5 (並行可) | ~40 | 3 extractor改善、設定UI、3新モジュール、API拡張 |
| **B: Core Logic** | 6 | ~20 | append-utils (検索・差分・再構築) |
| **C: Integration** | 7-8 | ~8 | handleSave統合、Toast改善 |
| **D: Verification** | 9 | — | 回帰テスト + 手動確認 |

**合計:** ~68 新規テスト、3 新規モジュール、12 既存ファイル変更
