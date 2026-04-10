# 実装ワークフロー: DOM抽出再設計

## 概要

| 項目 | 内容 |
|------|------|
| 対象ファイル | `src/content/extractors/gemini.ts` |
| 問題 | Gemini DOM構造との不一致による抽出エラー |
| 目標 | 複数会話ターンの正確な抽出 |

## 実装タスク

### Phase 1: SELECTORS更新

**ファイル**: `src/content/extractors/gemini.ts`

**変更内容**:
```
現行セレクタ → 新セレクタ

conversationContainer → conversationTurn
  - '.conversation-container'

userQuery:
  - '.user-query-container' → 'user-query'

userQueryText → queryTextLine:
  - '.query-text-line' (複数取得対応)

modelResponse:
  - '.model-response-text' → 'model-response'

modelResponseContent:
  - '.markdown.markdown-main-panel' (変更なし)
```

**完了条件**:
- [ ] SELECTORS定数が新しいDOM構造に対応
- [ ] フォールバックセレクタが定義されている

---

### Phase 2: extractMessages()再実装

**変更箇所**: `extractMessages()` メソッド

**実装方針**:
1. `.conversation-container`を全て取得
2. 各コンテナ内で`user-query`と`model-response`をペアで抽出
3. DOM順序を維持してメッセージ配列を構築

**完了条件**:
- [ ] 全ての会話ターンが抽出される
- [ ] ユーザー質問とモデル回答がペアで取得される
- [ ] DOM順序が維持される

---

### Phase 3: extractUserQueryContent()追加

**新規メソッド**: `private extractUserQueryContent(element: Element): string`

**実装方針**:
1. `.query-text-line`要素を全て取得
2. 各行のテキストを改行で結合
3. フォールバック: 要素全体のtextContent

**完了条件**:
- [ ] 複数行の質問が正しく結合される
- [ ] 空行が適切に処理される
- [ ] フォールバックが機能する

---

### Phase 4: extractModelResponseContent()改善

**変更箇所**: `extractMessageContent()` → 専用メソッドへ分離

**実装方針**:
1. `.markdown.markdown-main-panel`からHTML取得
2. フォールバック: `.model-response-text`
3. 最終フォールバック: 要素全体のinnerHTML

**完了条件**:
- [ ] マークダウンコンテンツが正しく抽出される
- [ ] コードブロックが保持される
- [ ] フォールバックチェーンが機能する

---

## 検証チェックリスト

### 単体検証
- [ ] `element-sample.html`でセレクタをコンソールテスト
- [ ] 全ての`.conversation-container`が検出される
- [ ] 各`user-query`から複数行テキストが取得される
- [ ] 各`model-response`からHTMLが取得される

### 統合検証
- [ ] Chrome拡張をビルド (`npm run build`)
- [ ] 実際のGeminiページで抽出テスト
- [ ] 出力markdownファイルの内容確認

### 期待結果
- [ ] 重複するQUESTIONブロックがない
- [ ] 複数行の質問が完全に含まれる
- [ ] 全ての会話ターンが出力される
- [ ] メッセージカウントが正確

## 依存関係

```
gemini.ts
    ├── imports: BaseExtractor (./base.ts)
    ├── imports: ConversationMessage, ExtractionResult (../../lib/types.ts)
    └── used by: content.ts → popup UI
```

## リスク・注意点

1. **DOM変更リスク**: GeminiのUIは頻繁に変更される可能性あり
   - 対策: フォールバックセレクタを複数用意

2. **Angularコンポーネント**: `_nghost-*`属性は動的生成
   - 対策: タグ名セレクタ(`user-query`, `model-response`)を優先

3. **パフォーマンス**: 大量の会話での処理時間
   - 現時点では問題なし、必要に応じて最適化

## 実装順序

```
1. SELECTORS更新 (Phase 1)
   ↓
2. extractUserQueryContent()追加 (Phase 3)
   ↓
3. extractModelResponseContent()改善 (Phase 4)
   ↓
4. extractMessages()再実装 (Phase 2)
   ↓
5. 検証・テスト
```

※ Phase 2は他のメソッドに依存するため最後に実装
