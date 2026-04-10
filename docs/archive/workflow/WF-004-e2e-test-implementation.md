# WF-004: E2Eテストシステム実装ワークフロー

## 概要

| 項目 | 内容 |
|------|------|
| 設計書 | `docs/design/DES-004-e2e-test-system.md` (v1.2) |
| 目的 | HTML→Markdown変換パイプラインのフィクスチャベースE2Eテスト実装 |
| 戦略 | Systematic |
| 作成日 | 2025-01-28 |

## 前提条件

- 設計書 DES-004 v1.2 が承認済み
- 明示的な実装指示を待機

## 依存関係マップ

```
Phase 1: インフラ整備
├── Step 1.1: note-generator.ts 作成
│   └── Step 1.2: background/index.ts 変更 (依存: 1.1)
├── Step 1.3: ディレクトリ構造作成 (独立)
├── Step 1.4: helpers.ts 作成 (依存: 1.1)
└── Step 1.5: vitest.config.ts 更新 (独立)

Phase 2: テストファイル作成 (依存: Phase 1完了)
├── Step 2.1: gemini.e2e.test.ts
├── Step 2.2: claude.e2e.test.ts
└── Step 2.3: chatgpt.e2e.test.ts

Phase 3: フィクスチャ取得 (ユーザー作業)
├── Step 3.1: gemini/chat-simple.html
├── Step 3.2: gemini/deep-research.html
├── Step 3.3: claude/chat-simple.html
├── Step 3.4: claude/artifacts.html
├── Step 3.5: chatgpt/chat-simple.html
└── Step 3.6: chatgpt/chat-code.html

Phase 4: 検証・スナップショット生成 (依存: Phase 2, 3完了)
├── Step 4.1: 既存テスト実行・確認
├── Step 4.2: E2Eテスト実行・スナップショット生成
└── Step 4.3: スナップショットレビュー
```

## Phase 1: インフラ整備

### Step 1.1: note-generator.ts 作成

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/note-generator.ts` |
| アクション | 新規作成 |
| 依存 | なし |
| 検証 | TypeScriptコンパイル成功 |

**実装内容**: DES-004 セクション3.1.2のコードをそのまま使用

**チェックポイント**:
- [ ] ファイル作成完了
- [ ] `npm run build` エラーなし

### Step 1.2: background/index.ts 変更

| 項目 | 内容 |
|------|------|
| ファイル | `src/background/index.ts` |
| アクション | 変更 |
| 依存 | Step 1.1 |
| 検証 | 既存テスト PASS |

**変更内容**:
1. Line 8: `import { escapeYamlValue, escapeYamlListItem } from '../lib/yaml-utils';` を削除
2. Line 8: `import { generateNoteContent } from '../lib/note-generator';` を追加
3. Line 317-364: `generateNoteContent` 関数定義を削除

**チェックポイント**:
- [ ] import文変更完了
- [ ] 関数定義削除完了
- [ ] `npm run build` エラーなし
- [ ] `npm test` 既存テストPASS

### Step 1.3: ディレクトリ構造作成

| 項目 | 内容 |
|------|------|
| アクション | ディレクトリ・ファイル作成 |
| 依存 | なし |

**作成対象**:
```
test/
├── fixtures/
│   └── html/
│       ├── README.md
│       ├── gemini/
│       ├── claude/
│       └── chatgpt/
└── extractors/
    └── e2e/
```

**チェックポイント**:
- [ ] ディレクトリ作成完了
- [ ] README.md 作成完了 (DES-004 セクション3.4.1)

### Step 1.4: helpers.ts 作成

| 項目 | 内容 |
|------|------|
| ファイル | `test/extractors/e2e/helpers.ts` |
| アクション | 新規作成 |
| 依存 | Step 1.1 (note-generator.tsをimport) |
| 検証 | TypeScriptコンパイル成功 |

**実装内容**: DES-004 セクション3.2の全コードを結合

**チェックポイント**:
- [ ] ファイル作成完了
- [ ] `npm run build` エラーなし

### Step 1.5: vitest.config.ts 更新

| 項目 | 内容 |
|------|------|
| ファイル | `vitest.config.ts` |
| アクション | 変更 |
| 依存 | なし |

**変更内容**: `testTimeout: 30000` 追加

**チェックポイント**:
- [ ] 設定追加完了
- [ ] `npm test` 既存テストPASS

## Phase 2: テストファイル作成

### Step 2.1: gemini.e2e.test.ts

| 項目 | 内容 |
|------|------|
| ファイル | `test/extractors/e2e/gemini.e2e.test.ts` |
| アクション | 新規作成 |
| 依存 | Phase 1完了 |

**実装内容**: DES-004 セクション3.3.1

**チェックポイント**:
- [ ] ファイル作成完了
- [ ] TypeScriptコンパイル成功

### Step 2.2: claude.e2e.test.ts

| 項目 | 内容 |
|------|------|
| ファイル | `test/extractors/e2e/claude.e2e.test.ts` |
| アクション | 新規作成 |
| 依存 | Phase 1完了 |

**実装内容**: DES-004 セクション3.3.2

**チェックポイント**:
- [ ] ファイル作成完了
- [ ] TypeScriptコンパイル成功

### Step 2.3: chatgpt.e2e.test.ts

| 項目 | 内容 |
|------|------|
| ファイル | `test/extractors/e2e/chatgpt.e2e.test.ts` |
| アクション | 新規作成 |
| 依存 | Phase 1完了 |

**実装内容**: DES-004 セクション3.3.3

**チェックポイント**:
- [ ] ファイル作成完了
- [ ] TypeScriptコンパイル成功

## Phase 3: フィクスチャ取得（ユーザー作業）

### Step 3.1-3.6: HTMLフィクスチャ取得

| ファイル | プラットフォーム | 内容 |
|---------|-----------------|------|
| `gemini/chat-simple.html` | Gemini | 基本Q&A会話 |
| `gemini/deep-research.html` | Gemini | Deep Research（引用付き） |
| `claude/chat-simple.html` | Claude | 基本会話 |
| `claude/artifacts.html` | Claude | Artifacts |
| `chatgpt/chat-simple.html` | ChatGPT | 基本会話 |
| `chatgpt/chat-code.html` | ChatGPT | コードブロック付き |

**手順**: `test/fixtures/html/README.md` を参照

## Phase 4: 検証・スナップショット生成

### Step 4.1: 既存テスト確認

```bash
npm test
```

**期待結果**: 全既存テストPASS

### Step 4.2: E2Eテスト実行・スナップショット生成

```bash
npx vitest run test/extractors/e2e/ -u
```

**期待結果**: 全E2Eテスト PASS、スナップショット生成

### Step 4.3: スナップショットレビュー

生成されたスナップショットファイルを確認:
- `test/extractors/e2e/__snapshots__/gemini.e2e.test.ts.snap`
- `test/extractors/e2e/__snapshots__/claude.e2e.test.ts.snap`
- `test/extractors/e2e/__snapshots__/chatgpt.e2e.test.ts.snap`

## 実行順序サマリー

```
[並列可能]
├── Step 1.1 → Step 1.2 → Step 1.4
├── Step 1.3
└── Step 1.5

[Phase 1完了後、並列可能]
├── Step 2.1
├── Step 2.2
└── Step 2.3

[Phase 2完了後、ユーザー作業]
└── Step 3.1-3.6

[Phase 3完了後]
├── Step 4.1
├── Step 4.2
└── Step 4.3
```

## 変更対象ファイル一覧

| ファイル | アクション | Phase |
|---------|----------|-------|
| `src/lib/note-generator.ts` | 新規作成 | 1 |
| `src/background/index.ts` | 変更 | 1 |
| `test/fixtures/html/README.md` | 新規作成 | 1 |
| `test/extractors/e2e/helpers.ts` | 新規作成 | 1 |
| `vitest.config.ts` | 変更 | 1 |
| `test/extractors/e2e/gemini.e2e.test.ts` | 新規作成 | 2 |
| `test/extractors/e2e/claude.e2e.test.ts` | 新規作成 | 2 |
| `test/extractors/e2e/chatgpt.e2e.test.ts` | 新規作成 | 2 |

## 次のアクション

**実装開始には明示的な指示が必要**

実装指示例:
- `Phase 1を実装せよ`
- `Step 1.1を実装せよ`
- `全フェーズを実装せよ`
