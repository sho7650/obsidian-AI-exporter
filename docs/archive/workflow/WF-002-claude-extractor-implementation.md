# Claude Extractor 実装ワークフロー

**設計書**: [DES-002-claude-extractor.md](../design/DES-002-claude-extractor.md)  
**作成日**: 2026-01-15  
**推定工数**: 2-3時間

---

## 依存関係図

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 基盤準備 (並列可)                                   │
│  ┌──────────────────┐    ┌─────────────────────────────┐    │
│  │ 1.1 manifest.json│    │ 1.2 ClaudeExtractor骨格    │    │
│  └────────┬─────────┘    └──────────────┬──────────────┘    │
│           │                             │                    │
│           └──────────────┬──────────────┘                    │
│                          ▼                                   │
├─────────────────────────────────────────────────────────────┤
│ Phase 2: コア実装 (順次)                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2.1 ClaudeExtractor メソッド実装                      │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2.2 content/index.ts ルーティング                     │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
├─────────────────────────────────────────────────────────────┤
│ Phase 3: テスト基盤 (順次)                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3.1 dom-helpers.ts 拡張                               │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3.2 claude.test.ts 作成 (48テストケース)              │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: 検証                                                │
│  4.1 テスト実行 → 4.2 カバレッジ → 4.3 ビルド → 4.4 E2E    │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 基盤準備

### 1.1 manifest.json 更新

**ファイル**: `src/manifest.json`

```diff
{
  "host_permissions": [
    "https://gemini.google.com/*",
+   "https://claude.ai/*",
    "http://127.0.0.1:27123/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://gemini.google.com/*",
+     "https://claude.ai/*"
    ],
    "js": ["src/content/index.ts"],
    "run_at": "document_idle"
  }]
}
```

**検証コマンド**:
```bash
npm run build && echo "manifest.json OK"
```

---

### 1.2 ClaudeExtractor 骨格作成

**ファイル**: `src/content/extractors/claude.ts` (新規作成)

```typescript
// 1. インポート
import { BaseExtractor } from './base';
import type { IConversationExtractor, Message, DeepResearchLinks } from '../../lib/types';

// 2. セレクター定義 (設計書 Section 5.2.2, 5.2.3 参照)
const SELECTORS = { /* ... */ };
const DEEP_RESEARCH_SELECTORS = { /* ... */ };

// 3. クラス宣言
export class ClaudeExtractor extends BaseExtractor implements IConversationExtractor {
  // メソッドスタブ
  canExtract(): boolean { throw new Error('Not implemented'); }
  getConversationId(): string | null { throw new Error('Not implemented'); }
  getTitle(): string { throw new Error('Not implemented'); }
  extractMessages(): Message[] { throw new Error('Not implemented'); }
  isDeepResearch(): boolean { throw new Error('Not implemented'); }
  extractDeepResearch(): DeepResearchLinks | null { throw new Error('Not implemented'); }
}
```

---

## Phase 2: コア実装

### 2.1 ClaudeExtractor メソッド実装

**実装順序** (依存関係順):

| # | メソッド | 依存 | 設計書参照 |
|---|----------|------|-----------|
| 1 | `canExtract()` | なし | 5.3.1 |
| 2 | `getConversationId()` | なし | 5.3.2 |
| 3 | `getTitle()` | なし | 5.3.3 |
| 4 | `isDeepResearch()` | なし | 5.3.5 |
| 5 | `extractMessages()` | SELECTORS | 5.3.4 |
| 6 | `extractDeepResearch()` | DEEP_RESEARCH_SELECTORS | 5.3.6 |
| 7 | `extractSourceList()` | extractDeepResearch | 5.3.7 |

**各メソッドの実装ポイント**:

#### canExtract()
```typescript
canExtract(): boolean {
  return window.location.hostname === 'claude.ai';  // 厳密比較 (CodeQL対応)
}
```

#### getConversationId()
```typescript
getConversationId(): string | null {
  const match = window.location.pathname.match(/^\/chat\/([a-f0-9-]{36})$/i);
  return match ? match[1] : null;
}
```

#### extractMessages()
- `queryAllWithFallback()` でメッセージブロック取得
- User/Assistant 判定ロジック実装
- DOMPurify でサニタイズ

#### extractDeepResearch()
- `#markdown-artifact` 検出
- Citation 抽出 (`span.inline-flex a[href]`)
- DeepResearchLinks 型で返却

---

### 2.2 content/index.ts ルーティング

**ファイル**: `src/content/index.ts`

```typescript
import { GeminiExtractor } from './extractors/gemini';
import { ClaudeExtractor } from './extractors/claude';
import type { IConversationExtractor } from '../lib/types';

function getExtractor(): IConversationExtractor | null {
  const hostname = window.location.hostname;
  
  if (hostname === 'gemini.google.com') {
    return new GeminiExtractor();
  }
  if (hostname === 'claude.ai') {
    return new ClaudeExtractor();
  }
  
  return null;
}

// 既存の初期化コードで getExtractor() を使用
```

---

## Phase 3: テスト基盤

### 3.1 dom-helpers.ts 拡張

**ファイル**: `test/fixtures/dom-helpers.ts`

追加するヘルパー関数:

```typescript
// Claude 会話DOM生成
export function createClaudeConversationDOM(messages: Array<{
  role: 'user' | 'assistant';
  content: string;
}>): void { /* ... */ }

// Claude URL設定
export function setClaudeLocation(conversationId: string): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'claude.ai',
      pathname: `/chat/${conversationId}`,
      href: `https://claude.ai/chat/${conversationId}`,
    },
    writable: true,
  });
}

// Deep Research DOM生成
export function createClaudeDeepResearchDOM(
  title: string,
  content: string,
  citations?: Array<{ text: string; url: string }>
): void { /* ... */ }
```

---

### 3.2 claude.test.ts 作成

**ファイル**: `test/extractors/claude.test.ts` (新規作成)

**テストカテゴリ** (設計書 Section 6 準拠):

| カテゴリ | テスト数 | 内容 |
|----------|----------|------|
| 6.1 プラットフォーム検出 | 5 | canExtract, hostname判定 |
| 6.2 会話ID抽出 | 6 | UUID抽出, エッジケース |
| 6.3.1 メッセージ抽出 | 15 | User/Assistant, フォールバック |
| 6.3.2 セキュリティ | 5 | XSS, プロトコル検証 |
| 6.4 Deep Research | 12 | 検出, Citation, 構造 |
| 6.5 エラーハンドリング | 5 | 空DOM, 不正構造 |
| **合計** | **48** | |

**テスト構造**:
```typescript
describe('ClaudeExtractor', () => {
  describe('Platform Detection', () => { /* 5 tests */ });
  describe('Conversation ID Extraction', () => { /* 6 tests */ });
  describe('Message Extraction', () => { 
    describe('Basic Extraction', () => { /* 15 tests */ });
    describe('Security', () => { /* 5 tests */ });
  });
  describe('Deep Research', () => { /* 12 tests */ });
  describe('Error Handling', () => { /* 5 tests */ });
});
```

---

## Phase 4: 検証

### 4.1 単体テスト実行

```bash
npm run test:unit -- --grep "ClaudeExtractor"
```

**期待結果**: 48テスト全パス

---

### 4.2 カバレッジ確認

```bash
npm run test:coverage
```

**目標**:
- Statement: ≥ 85%
- Branch: ≥ 80%
- Function: ≥ 85%

---

### 4.3 ビルド確認

```bash
npm run lint && npm run build
```

**確認項目**:
- [ ] TypeScript エラーなし
- [ ] ESLint エラーなし
- [ ] dist/ にバンドル生成

---

### 4.4 手動E2Eテスト

**テスト手順**:

1. Chrome で `chrome://extensions` を開く
2. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` 選択
3. https://claude.ai/chat/{conversation-id} を開く
4. 拡張機能ポップアップから「Export to Obsidian」実行
5. Obsidian で出力確認

**検証項目**:
- [ ] 通常チャットが正しく抽出される
- [ ] Deep Research が正しく抽出される
- [ ] Citation が footnote 形式で出力される
- [ ] Markdown 形式が Gemini と統一されている

---

## 完了チェックリスト

- [ ] Phase 1.1: manifest.json 更新完了
- [ ] Phase 1.2: ClaudeExtractor 骨格作成完了
- [ ] Phase 2.1: 全メソッド実装完了
- [ ] Phase 2.2: ルーティング実装完了
- [ ] Phase 3.1: dom-helpers.ts 拡張完了
- [ ] Phase 3.2: 48テストケース作成完了
- [ ] Phase 4.1: 全テストパス
- [ ] Phase 4.2: カバレッジ 85%達成
- [ ] Phase 4.3: ビルド成功
- [ ] Phase 4.4: E2Eテスト完了
