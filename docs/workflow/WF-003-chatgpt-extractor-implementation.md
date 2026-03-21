# WF-003: ChatGPT Extractor 実装ワークフロー

| 項目 | 内容 |
|------|------|
| **文書ID** | WF-003 |
| **関連設計書** | [DES-003-chatgpt-extractor.md](../design/DES-003-chatgpt-extractor.md) |
| **作成日** | 2026-01-20 |
| **総タスク数** | 12 |
| **推定難易度** | Medium |

---

## 実行前提条件

- [ ] 設計書 DES-003 がレビュー済み
- [ ] `npm run build` が成功する状態
- [ ] `npm run test` が全て PASS する状態

---

## Phase 1: 型定義の更新

### Task 1.1: types.ts に 'chatgpt' を追加

**ファイル**: `src/lib/types.ts`

**変更内容**:
```typescript
// L30: ConversationData.source
source: 'gemini' | 'claude' | 'perplexity' | 'chatgpt';

// L257: IConversationExtractor.platform
readonly platform: 'gemini' | 'claude' | 'perplexity' | 'chatgpt';
```

**検証**: TypeScript コンパイルエラーがないこと

---

### Task 1.2: base.ts の platform 型を更新

**ファイル**: `src/content/extractors/base.ts`

**変更内容**:
```typescript
// L18
abstract readonly platform: 'gemini' | 'claude' | 'perplexity' | 'chatgpt';
```

**検証**: TypeScript コンパイルエラーがないこと

---

## Phase 2: ChatGPTExtractor 実装

### Task 2.1: chatgpt.ts の基本構造を作成

**ファイル**: `src/content/extractors/chatgpt.ts` (新規)

**内容**:
- SELECTORS 定数定義
- CITATION_SELECTORS 定数定義
- ChatGPTExtractor クラスの骨格

**参照**: DES-003 Section 5.3, 5.4

---

### Task 2.2: canExtract() を実装

**仕様**: DES-003 Section 5.6.1
- `hostname === 'chatgpt.com'` で厳密比較

---

### Task 2.3: getConversationId() を実装

**仕様**: DES-003 Section 5.6.2
- `/\/c\/([a-f0-9-]+)/i` または `/\/g\/([a-f0-9-]+)/i` でマッチ
- フォールバック: `chatgpt-${Date.now()}`

---

### Task 2.4: getTitle() を実装

**仕様**: DES-003 Section 5.6.3
- 最初の User メッセージから取得
- 100 文字でトランケート
- デフォルト: `'Untitled ChatGPT Conversation'`

---

### Task 2.5: extractMessages() を実装

**仕様**: DES-003 Section 5.6.4
- `section[data-turn-id]` でターン取得（`article[data-turn-id]` はレガシーフォールバック）
- `data-turn` 属性で role 判別
- DOM 順序でソート

---

### Task 2.6: extract() を実装

**内容**:
- canExtract() チェック
- extractMessages() 呼び出し
- ConversationData 構築
- ExtractionResult 返却

---

## Phase 3: Content Script 統合

### Task 3.1: index.ts に ChatGPT ルーティング追加

**ファイル**: `src/content/index.ts`

**変更箇所 1**: getExtractor() 関数 (L115-127)
```typescript
if (hostname === 'chatgpt.com') {
  return new ChatGPTExtractor();
}
```

**変更箇所 2**: import 追加
```typescript
import { ChatGPTExtractor } from './extractors/chatgpt';
```

---

### Task 3.2: waitForConversationContainer() セレクター修正

**ファイル**: `src/content/index.ts`

**変更箇所**: L63, L73
```typescript
const existing = document.querySelector(
  '.conversation-container, [class*="conversation"], section[data-turn-id], article[data-turn-id]'
);
```

```typescript
const container = document.querySelector(
  '.conversation-container, [class*="conversation"], section[data-turn-id], article[data-turn-id]'
);
```

---

## Phase 4: Manifest 更新

### Task 4.1: vite.config.ts の manifest に ChatGPT 追加

**ファイル**: `vite.config.ts`

**変更内容**:
- `host_permissions` に `"https://chatgpt.com/*"` 追加
- `content_scripts.matches` に `"https://chatgpt.com/*"` 追加

---

## Phase 5: ビルド・動作確認

### Task 5.1: ビルドと基本動作確認

**コマンド**:
```bash
npm run build
npm run lint
```

**手動検証**:
1. Chrome に拡張機能をリロード
2. https://chatgpt.com/ にアクセス
3. 会話ページで Sync ボタンが表示されることを確認
4. Sync ボタンをクリックして抽出が成功することを確認

---

## Phase 6: テスト作成（オプション）

### Task 6.1: DOM ヘルパー追加

**ファイル**: `test/fixtures/dom-helpers.ts`

**内容**:
- `createChatGPTConversationDOM()`
- `setChatGPTLocation()`
- `createChatGPTInlineCitation()`

---

### Task 6.2: テストファイル作成

**ファイル**: `test/extractors/chatgpt.test.ts` (新規)

**テストケース**: DES-003 Section 6.3 参照（32 ケース）

---

## 実行順序サマリー

```
Phase 1: 型定義
  └─ Task 1.1 → Task 1.2

Phase 2: Extractor 実装
  └─ Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6

Phase 3: 統合
  └─ Task 3.1 → Task 3.2

Phase 4: Manifest
  └─ Task 4.1

Phase 5: 検証
  └─ Task 5.1

Phase 6: テスト（オプション）
  └─ Task 6.1 → Task 6.2
```

---

## チェックポイント

| Phase | 検証項目 |
|-------|----------|
| Phase 1 完了 | `npm run build` が成功 |
| Phase 2 完了 | TypeScript エラーなし |
| Phase 3 完了 | `npm run build` が成功 |
| Phase 4 完了 | `npm run build` が成功 |
| Phase 5 完了 | 手動検証 OK |
| Phase 6 完了 | `npm run test` が全 PASS |
