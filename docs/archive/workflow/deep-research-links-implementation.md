# Deep Research リンク抽出機能 - 実装ワークフロー

## ワークフロー概要

| 項目 | 内容 |
|------|------|
| 設計書 | [../design/deep-research-links-extraction.md](../design/deep-research-links-extraction.md) v1.1 |
| 総フェーズ数 | 4 |
| 変更ファイル数 | 5 |
| 依存関係 | Phase 1 → Phase 2 → Phase 3 → Phase 4（順序依存） |

---

## Phase 1: 型定義と基本構造

**目的**: 新しいインターフェースを追加し、既存の型を拡張

### タスク 1.1: 新規インターフェース追加
- **ファイル**: `src/lib/types.ts`
- **追加内容**:
  - `DeepResearchSource` インターフェース（4フィールド）
  - `InlineCitation` インターフェース（2フィールド）
  - `DeepResearchLinks` インターフェース（3フィールド）

### タスク 1.2: ConversationData 拡張
- **ファイル**: `src/lib/types.ts`
- **変更内容**: `links?: DeepResearchLinks` フィールドを追加

### 検証基準
- TypeScript コンパイルエラーなし
- 既存テストがすべてパス

---

## Phase 2: 抽出ロジック実装

**目的**: Gemini DOM からリンク/引用情報を抽出

### タスク 2.1: セレクタ定義追加
- **ファイル**: `src/content/extractors/gemini.ts`
- **追加内容**: `DEEP_RESEARCH_LINK_SELECTORS` 定数

### タスク 2.2: extractInlineCitations() 実装
- **ファイル**: `src/content/extractors/gemini.ts`
- **機能**: `data-turn-source-index` 属性から引用番号を抽出

### タスク 2.3: extractSourceList() 実装
- **ファイル**: `src/content/extractors/gemini.ts`
- **機能**: ソースリストから URL/タイトル/ドメインを抽出
- **注意**: URL パース失敗時の try-catch 必須

### タスク 2.4: extractDeepResearchLinks() 実装
- **ファイル**: `src/content/extractors/gemini.ts`
- **機能**: 上記2メソッドを統合、`usedIndices` 配列を生成

### タスク 2.5: extractDeepResearch() 更新
- **ファイル**: `src/content/extractors/gemini.ts`
- **変更内容**: リンク情報を抽出結果に含める

### 検証基準
- `npm run lint` エラーなし
- `npm run build` 成功

---

## Phase 3: Markdown 変換実装

**目的**: HTML を脚注付き Markdown に変換

### タスク 3.1: セキュリティ関数追加
- **ファイル**: `src/content/markdown.ts`
- **追加関数**:
  - `sanitizeUrl()` - 危険なスキーム除去
  - `escapeMarkdownLinkText()` - `[]` エスケープ
  - `escapeMarkdownLinkUrl()` - `()` エンコード

### タスク 3.2: HTML 変換関数追加
- **ファイル**: `src/content/markdown.ts`
- **追加関数**:
  - `convertInlineCitations()` - `<sup>` → `[^N]`
  - `removeSourcesCarousel()` - カルーセル除去

### タスク 3.3: 出力生成関数追加
- **ファイル**: `src/content/markdown.ts`
- **追加関数**:
  - `generateFootnoteDefinitions()` - 脚注定義生成（`---` 区切り線含む）
  - `generateReferencesSection()` - References セクション生成

### タスク 3.4: convertDeepResearchContent() 実装
- **ファイル**: `src/content/markdown.ts`
- **機能**: 上記関数を統合した変換パイプライン

### タスク 3.5: conversationToNote() 更新
- **ファイル**: `src/content/markdown.ts`
- **変更内容**: Deep Research 時に `convertDeepResearchContent()` を使用

### 検証基準
- `npm run lint` エラーなし
- `npm run build` 成功

---

## Phase 4: テスト実装

**目的**: 新機能の品質保証

### タスク 4.1: dom-helpers.ts 拡張
- **ファイル**: `test/fixtures/dom-helpers.ts`
- **追加内容**: 引用/ソースリスト付き DOM 生成ヘルパー

### タスク 4.2: gemini.test.ts 拡張
- **ファイル**: `test/extractors/gemini.test.ts`
- **追加テスト**:
  - `extractInlineCitations()` テスト
  - `extractSourceList()` テスト
  - `extractDeepResearchLinks()` テスト
  - リンク情報付き Deep Research 抽出テスト

### タスク 4.3: markdown.test.ts 拡張
- **ファイル**: `test/content/markdown.test.ts`
- **追加テスト**:
  - `sanitizeUrl()` テスト（危険スキーム除去）
  - `escapeMarkdownLinkText()` テスト
  - `convertInlineCitations()` テスト
  - `generateFootnoteDefinitions()` テスト
  - `generateReferencesSection()` テスト
  - エッジケーステスト（設計書 Section 7.2）

### 検証基準
- `npm run test` 全テストパス
- カバレッジ低下なし

---

## 依存関係図

```
Phase 1 (types.ts)
    │
    ▼
Phase 2 (gemini.ts) ─── imports types
    │
    ▼
Phase 3 (markdown.ts) ─── imports types
    │
    ▼
Phase 4 (tests) ─── validates all
```

---

## 実装順序チェックリスト

| # | タスク | ファイル | 依存 | 状態 |
|---|--------|----------|------|------|
| 1.1 | 新規インターフェース追加 | types.ts | なし | [ ] |
| 1.2 | ConversationData 拡張 | types.ts | 1.1 | [ ] |
| 2.1 | セレクタ定義追加 | gemini.ts | 1.2 | [ ] |
| 2.2 | extractInlineCitations() | gemini.ts | 2.1 | [ ] |
| 2.3 | extractSourceList() | gemini.ts | 2.1 | [ ] |
| 2.4 | extractDeepResearchLinks() | gemini.ts | 2.2, 2.3 | [ ] |
| 2.5 | extractDeepResearch() 更新 | gemini.ts | 2.4 | [ ] |
| 3.1 | セキュリティ関数追加 | markdown.ts | 1.2 | [ ] |
| 3.2 | HTML 変換関数追加 | markdown.ts | 3.1 | [ ] |
| 3.3 | 出力生成関数追加 | markdown.ts | 3.1 | [ ] |
| 3.4 | convertDeepResearchContent() | markdown.ts | 3.2, 3.3 | [ ] |
| 3.5 | conversationToNote() 更新 | markdown.ts | 3.4 | [ ] |
| 4.1 | dom-helpers.ts 拡張 | dom-helpers.ts | 2.5 | [ ] |
| 4.2 | gemini.test.ts 拡張 | gemini.test.ts | 4.1 | [ ] |
| 4.3 | markdown.test.ts 拡張 | markdown.test.ts | 3.5 | [ ] |

---

## 品質ゲート

各フェーズ完了時に以下を確認：

```bash
npm run lint      # ESLint エラーなし
npm run build     # TypeScript コンパイル成功
npm run test      # 全テストパス
```

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|----------|
| 1.0 | 2025-01-11 | 初版作成 |

---

*作成日: 2025-01-11*
*設計書: deep-research-links-extraction.md v1.1*
