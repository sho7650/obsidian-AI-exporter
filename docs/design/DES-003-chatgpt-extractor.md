# DES-003: ChatGPT Extractor 設計書

| 項目 | 内容 |
|------|------|
| **文書ID** | DES-003 |
| **バージョン** | 1.1.0 |
| **作成日** | 2026-01-20 |
| **更新日** | 2026-01-20 |
| **ステータス** | Draft (レビュー反映) |
| **関連計画** | なし |

---

## 1. 概要

### 1.1 目的

ChatGPT (chatgpt.com) の会話データを抽出し、Obsidian にエクスポートする機能を追加する。通常チャットのみ対応（Deep Research は通常チャットとして扱う）。

### 1.2 スコープ

| 含む | 含まない |
|------|---------|
| ChatGPT 通常チャット抽出 | ChatGPT API 直接連携 |
| インライン引用の Markdown 変換 | Deep Research 専用モード（通常会話として扱う） |
| 既存 Gemini/Claude パターンとの統合 | Custom GPT 特殊対応 |
| - | 画像/ファイル添付の抽出 |

**注**: Sources ボタン内の引用は、インライン引用と同一の DOM 構造（`span[data-testid="webpage-citation-pill"]`）で表現されるため、インライン引用抽出で自動的にカバーされる。

### 1.3 優先順位

1. **P0**: 通常チャット抽出（User/Assistant メッセージ）
2. **P1**: インライン引用のリンク変換
3. **P2**: モデル名メタデータ抽出（オプション）

---

## 2. 機能要件

### 2.1 FR-001: プラットフォーム検出

| ID | 要件 |
|----|------|
| FR-001-1 | `hostname === 'chatgpt.com'` で ChatGPT ページを識別する（厳密比較必須） |
| FR-001-2 | URL パターンから会話 ID を抽出する（形式: `/c/{uuid}`） |

### 2.2 FR-002: 通常チャット抽出

| ID | 要件 |
|----|------|
| FR-002-1 | User メッセージを `[data-message-author-role="user"]` から抽出する |
| FR-002-2 | Assistant メッセージを `[data-message-author-role="assistant"]` から抽出する |
| FR-002-3 | Markdown コンテンツは `.markdown.prose` から取得する |
| FR-002-4 | メッセージは DOM 順序で正しくインターリーブする |
| FR-002-5 | `section[data-turn-id]` を会話ターンの単位として使用する（`article[data-turn-id]` はレガシーフォールバック） |

### 2.3 FR-003: 引用抽出

| ID | 要件 |
|----|------|
| FR-003-1 | インライン引用を `span[data-testid="webpage-citation-pill"] a[href]` から抽出する |
| FR-003-2 | 引用リンクをそのまま Markdown リンクに変換する |
| FR-003-3 | 引用元 URL を保持する |

### 2.4 FR-004: 出力形式

| ID | 要件 |
|----|------|
| FR-004-1 | Gemini/Claude と同一の Obsidian callout 形式で出力する |
| FR-004-2 | `source: chatgpt` を YAML frontmatter に設定する |
| FR-004-3 | アシスタント callout のラベルは「ChatGPT」とする |

---

## 3. 非機能要件

### 3.1 NFR-001: セキュリティ

| ID | 要件 | 根拠 |
|----|------|------|
| NFR-001-1 | Hostname は厳密比較 (`===`) を使用する | CodeQL js/incomplete-url-substring-sanitization 対策 |
| NFR-001-2 | HTML コンテンツは DOMPurify でサニタイズする | XSS 防止 |
| NFR-001-3 | 悪意のあるサブドメイン攻撃を防止する | `evil-chatgpt.com.attacker.com` を拒否 |

### 3.2 NFR-002: 互換性

| ID | 要件 |
|----|------|
| NFR-002-1 | 既存の BaseExtractor を継承する |
| NFR-002-2 | IConversationExtractor インターフェースを完全実装する |
| NFR-002-3 | 既存の Markdown 変換パイプラインを再利用する |

### 3.3 NFR-003: テスタビリティ

| ID | 要件 |
|----|------|
| NFR-003-1 | 85% 以上のステートメントカバレッジを維持する |
| NFR-003-2 | 全フォールバックセレクターをテストする |
| NFR-003-3 | DOM ヘルパーで再現可能なテストフィクスチャを提供する |

---

## 4. システムアーキテクチャ

### 4.1 コンポーネント図

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐     ┌──────────────────────────────────────┐ │
│  │Content Script│     │           Extractors                  │ │
│  │   index.ts   │────▶│  ┌────────────────┐ ┌──────────────┐ │ │
│  └──────────────┘     │  │GeminiExtractor │ │ClaudeExtractor│ │ │
│         │             │  └────────────────┘ └──────────────┘ │ │
│         │             │  ┌────────────────┐                   │ │
│         │             │  │ChatGPTExtractor│ ◀── NEW          │ │
│         │             │  └───────┬────────┘                   │ │
│         │             │          │                             │ │
│         │             │          ▼                             │ │
│         │             │  ┌──────────────────────────────────┐ │ │
│         │             │  │          BaseExtractor           │ │ │
│         │             │  └──────────────────────────────────┘ │ │
│         │             └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 ルーティングフロー

```
URL アクセス
    │
    ▼
┌─────────────────────────────────────┐
│   Content Script (index.ts)         │
│   hostname チェック (=== 厳密比較)   │
└─────────────────────────────────────┘
    │
    ├── gemini.google.com ──▶ GeminiExtractor
    │
    ├── claude.ai ──▶ ClaudeExtractor
    │
    └── chatgpt.com ──▶ ChatGPTExtractor ◀── NEW
                            │
                            ▼
                        extractMessages()
```

---

## 5. 詳細設計

### 5.1 index.ts の waitForConversationContainer() 変更

#### 5.1.1 現在のセレクター

```typescript
// src/content/index.ts:63
const existing = document.querySelector('.conversation-container, [class*="conversation"]');
```

#### 5.1.2 変更後のセレクター

```typescript
// ChatGPT 用に section[data-turn-id] を追加（article はレガシーフォールバック）
const existing = document.querySelector(
  '.conversation-container, [class*="conversation"], section[data-turn-id], article[data-turn-id]'
);
```

#### 5.1.3 変更理由

| 変更箇所 | 理由 |
|----------|------|
| `section[data-turn-id]`, `article[data-turn-id]` 追加 | ChatGPT は `.conversation-container` や `[class*="conversation"]` を使用しないため、ChatGPT の会話コンテナを検出できない。2026年3月に `article` から `section` に変更されたため、`section` を優先し `article` をレガシーフォールバックとして保持 |

---

### 5.2 manifest.json 変更

#### 5.2.1 現在の設定

```json
{
  "host_permissions": [
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "http://127.0.0.1:27123/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://gemini.google.com/*",
      "https://claude.ai/*"
    ],
    "js": ["src/content/index.ts"],
    "run_at": "document_idle"
  }]
}
```

#### 5.2.2 変更後の設定

```json
{
  "host_permissions": [
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "http://127.0.0.1:27123/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://gemini.google.com/*",
      "https://claude.ai/*",
      "https://chatgpt.com/*"
    ],
    "js": ["src/content/index.ts"],
    "run_at": "document_idle"
  }]
}
```

---

### 5.3 セレクター定義

#### 5.3.1 セレクター安定性マトリックス

| セレクター | 安定性 | リスク | フォールバック優先度 | 備考 |
|-----------|--------|--------|---------------------|------|
| `section[data-turn-id]` | HIGH | LOW | 1 | data 属性ベース、現行構造 |
| `article[data-turn-id]` | LOW | MEDIUM | 3 | レガシーフォールバック（2026年3月に section へ変更） |
| `[data-message-author-role]` | HIGH | LOW | 1 | data 属性ベース、安定 |
| `[data-message-id]` | HIGH | LOW | 1 | data 属性ベース、安定 |
| `.markdown.prose` | HIGH | LOW | 1 | セマンティッククラス |
| `.whitespace-pre-wrap` | MEDIUM | MEDIUM | 2 | Tailwind クラス |
| `[data-testid="webpage-citation-pill"]` | LOW | HIGH | 3 | テスト属性、本番で削除される可能性 |
| `section[data-turn="user"]` | HIGH | LOW | 1 | data 属性ベース、現行構造 |
| `article[data-turn="user"]` | LOW | MEDIUM | 3 | レガシーフォールバック |

#### 5.3.2 通常チャット用セレクター (SELECTORS)

```typescript
const SELECTORS = {
  // 会話ターン（各 Q&A ペア）
  conversationTurn: [
    'section[data-turn-id]',                    // 現行構造 (HIGH)
    'section[data-testid^="conversation-turn"]', // テスト属性 (MEDIUM)
    'article[data-turn-id]',                    // レガシーフォールバック (LOW)
    'article[data-testid^="conversation-turn"]', // レガシーテスト属性 (LOW)
  ],

  // User メッセージ
  userMessage: [
    '[data-message-author-role="user"] .whitespace-pre-wrap',  // 構造 (HIGH)
    'section[data-turn="user"] .whitespace-pre-wrap',           // 現行構造 (HIGH)
    'article[data-turn="user"] .whitespace-pre-wrap',           // レガシーフォールバック (LOW)
    '.user-message-bubble-color .whitespace-pre-wrap',          // スタイル (MEDIUM)
  ],

  // Assistant メッセージ
  assistantResponse: [
    '[data-message-author-role="assistant"] .markdown.prose',   // 構造 (HIGH)
    'section[data-turn="assistant"] .markdown.prose',           // 現行構造 (HIGH)
    'article[data-turn="assistant"] .markdown.prose',           // レガシーフォールバック (LOW)
    '.markdown.prose.dark\\:prose-invert',                      // スタイル (MEDIUM)
  ],

  // Markdown コンテンツ
  markdownContent: [
    '.markdown.prose',                          // セマンティック (HIGH)
    '.markdown-new-styling',                    // スタイル (MEDIUM)
  ],

  // メッセージ ID 属性
  messageId: [
    '[data-message-id]',                        // data 属性 (HIGH)
    '[data-turn-id]',                           // data 属性 (HIGH)
  ],
};
```

#### 5.3.3 引用用セレクター (CITATION_SELECTORS)

```typescript
const CITATION_SELECTORS = {
  // インライン引用
  inlineCitation: [
    'span[data-testid="webpage-citation-pill"] a[href^="http"]',  // テスト属性 (LOW)
    'a[target="_blank"][rel="noopener"][href^="http"]',           // 属性 (MEDIUM)
  ],
};
```

#### 5.3.4 メタデータ用セレクター（オプション）

```typescript
const METADATA_SELECTORS = {
  // モデル名（P2: オプション機能）
  modelSlug: [
    '[data-message-model-slug]',  // data 属性 (HIGH)
  ],
};
```

**注**: `data-message-model-slug` 属性（例: `"gpt-5-2"`）からモデル名を取得可能。P2 優先度のため初期実装では省略可。将来的に frontmatter の `model` フィールドとして追加を検討。

---

### 5.4 クラス設計

#### 5.4.1 ChatGPTExtractor クラス

```typescript
export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt' as const;

  // ========== プラットフォーム検出 ==========

  /**
   * ChatGPT ページかどうかを判定
   * 重要: 厳密比較 (===) を使用（CodeQL 対策）
   */
  canExtract(): boolean;

  // ========== ID・タイトル取得 ==========

  /**
   * URL から会話 ID を抽出
   * 形式: /c/{uuid} または /g/{uuid}
   * @returns UUID または null
   */
  getConversationId(): string | null;

  /**
   * 会話タイトルを取得
   * 優先順位: 最初の User メッセージ > デフォルト
   */
  getTitle(): string;

  // ========== メッセージ抽出 ==========

  /**
   * 全メッセージを抽出
   * User/Assistant を DOM 順序でインターリーブ
   */
  extractMessages(): ConversationMessage[];

  /**
   * User メッセージコンテンツを抽出
   */
  private extractUserContent(element: Element): string;

  /**
   * Assistant レスポンスコンテンツを抽出（HTML）
   */
  private extractAssistantContent(element: Element): string;

  // ========== メインエントリポイント ==========

  /**
   * 抽出メイン処理
   */
  async extract(): Promise<ExtractionResult>;
}
```

---

### 5.5 型定義の変更

#### 5.5.1 src/lib/types.ts の変更

```typescript
// ConversationData.source に 'chatgpt' を追加
export interface ConversationData {
  // ...
  source: 'gemini' | 'claude' | 'perplexity' | 'chatgpt';  // chatgpt 追加
  // ...
}

// IConversationExtractor.platform に 'chatgpt' を追加
export interface IConversationExtractor {
  readonly platform: 'gemini' | 'claude' | 'perplexity' | 'chatgpt';  // chatgpt 追加
  // ...
}
```

#### 5.5.2 src/content/extractors/base.ts の変更

```typescript
export abstract class BaseExtractor implements IConversationExtractor {
  abstract readonly platform: 'gemini' | 'claude' | 'perplexity' | 'chatgpt';  // chatgpt 追加
  // ...
}
```

---

### 5.6 メソッド仕様

#### 5.6.1 canExtract()

| 項目 | 内容 |
|------|------|
| **目的** | ChatGPT ページかどうかを判定 |
| **入力** | なし |
| **出力** | `boolean` |
| **ロジック** | `window.location.hostname === 'chatgpt.com'` (厳密比較必須) |
| **セキュリティ** | サブドメイン攻撃防止のため `===` を使用 |

#### 5.6.2 getConversationId()

| 項目 | 内容 |
|------|------|
| **目的** | URL から会話 ID を抽出 |
| **入力** | なし |
| **出力** | `string \| null` |
| **ロジック** | `/\/c\/([a-f0-9-]+)/i` または `/\/g\/([a-f0-9-]+)/i` でマッチ |
| **URL例** | `https://chatgpt.com/c/6789abcd-ef01-2345-6789-abcdef012345` |

#### 5.6.3 getTitle()

| 項目 | 内容 |
|------|------|
| **目的** | 会話タイトルを取得 |
| **入力** | なし |
| **出力** | `string` |
| **ロジック** | 1. 最初の User メッセージを検索<br>2. 見つかった場合、先頭 100 文字を返却（`MAX_TITLE_LENGTH`）<br>3. 見つからない場合、デフォルト `'Untitled ChatGPT Conversation'` を返却 |
| **トランケーション** | `substring(0, MAX_TITLE_LENGTH)` で 100 文字に制限 |

#### 5.6.4 extractMessages()

| 項目 | 内容 |
|------|------|
| **目的** | 全メッセージを DOM 順序で抽出 |
| **入力** | なし |
| **出力** | `ConversationMessage[]` |
| **ロジック** | 1. `section[data-turn-id]` で各ターンを取得（`article[data-turn-id]` をレガシーフォールバック）<br>2. `data-turn` 属性で user/assistant を判別<br>3. DOM 順序でソート |

---

### 5.7 エラーハンドリング設計

#### 5.7.1 エラーハンドリングマトリックス

| 状況 | 期待動作 | 戻り値 |
|------|----------|--------|
| DOM 要素なし | 警告ログ出力、空配列返却 | `[]` |
| URL パースエラー | null 返却、フォールバック ID 生成 | `chatgpt-${Date.now()}` |
| 空の会話 | エラー結果返却 | `{ success: false, error: 'No messages found' }` |
| サニタイズエラー | 空文字列返却、警告ログ | `''` |
| セレクター全失敗 | エラー結果返却 | `{ success: false, error: 'Selectors may have changed' }` |

---

### 5.8 DOM 構造マッピング

#### 5.8.1 通常チャット構造

```html
<div class="flex flex-col text-sm pb-25">
  <!-- User ターン (2026年3月〜: article → section に変更) -->
  <section
    data-turn-id="6d1f7499-baef-46c5-ae51-892d9c1e2d03"
    data-testid="conversation-turn-1"
    data-turn="user"
  >
    <div data-message-author-role="user"
         data-message-id="6d1f7499-baef-46c5-ae51-892d9c1e2d03">
      <div class="whitespace-pre-wrap">
        ユーザーの質問テキスト
      </div>
    </div>
  </section>

  <!-- Assistant ターン -->
  <section
    data-turn-id="b6bda243-ac61-4156-82d2-d6df42953db4"
    data-testid="conversation-turn-2"
    data-turn="assistant"
  >
    <div data-message-author-role="assistant"
         data-message-id="56d7ef64-7cc6-4736-9711-b8b6d6789351"
         data-message-model-slug="gpt-5-2">
      <div class="markdown prose dark:prose-invert w-full break-words light markdown-new-styling">
        <p>ChatGPT の回答...</p>
        <!-- インライン引用 -->
        <span data-testid="webpage-citation-pill">
          <a href="https://example.com?utm_source=chatgpt.com"
             target="_blank" rel="noopener">
            example.com
          </a>
        </span>
      </div>
    </div>
  </section>
</div>
```

#### 5.8.2 インライン引用構造

```html
<span class="" data-state="closed">
  <span class="ms-1 inline-flex max-w-full items-center select-none relative top-[-0.094rem]"
        data-testid="webpage-citation-pill"
        style="width: 107px;">
    <a href="https://example.com?utm_source=chatgpt.com"
       target="_blank"
       rel="noopener"
       alt="https://example.com?utm_source=chatgpt.com"
       class="flex h-4.5 overflow-hidden rounded-xl px-2 text-[9px] font-medium">
      <span class="max-w-[15ch] grow truncate overflow-hidden text-center">
        example.com
      </span>
    </a>
  </span>
</span>
```

---

## 6. テスト戦略

### 6.1 テストカテゴリ

| カテゴリ | テスト内容 | ファイル |
|----------|-----------|----------|
| プラットフォーム検出 | hostname 判定、URL パターン | `chatgpt.test.ts` |
| セキュリティ | hostname 攻撃パターン、XSS 防止 | `chatgpt.test.ts` |
| ID 抽出 | UUID 抽出、フォールバック | `chatgpt.test.ts` |
| タイトル抽出 | User メッセージ、デフォルト | `chatgpt.test.ts` |
| メッセージ抽出 | User/Assistant、インターリーブ | `chatgpt.test.ts` |
| 引用抽出 | インライン引用の抽出 | `chatgpt.test.ts` |
| フォールバック | 全セレクターのフォールバック | `chatgpt.test.ts` |
| エラーハンドリング | 各種エラー状況 | `chatgpt.test.ts` |

### 6.2 DOM ヘルパー追加

```typescript
// test/fixtures/dom-helpers.ts に追加

/**
 * ChatGPT 会話 DOM を生成
 */
export function createChatGPTConversationDOM(
  messages: Array<{ role: 'user' | 'assistant'; content: string; id?: string }>
): string;

/**
 * ChatGPT URL をモック
 */
export function setChatGPTLocation(conversationId: string): void;

/**
 * ChatGPT インライン引用を生成
 */
export function createChatGPTInlineCitation(
  url: string,
  displayText: string
): string;
```

### 6.3 テストケース一覧 (32 テスト)

#### 6.3.1 プラットフォーム検出 (3 テスト)

- [ ] `canExtract()` returns true for chatgpt.com
- [ ] `canExtract()` returns false for other hosts
- [ ] `canExtract()` returns false for chat.openai.com (旧ドメイン)

#### 6.3.2 セキュリティテスト (4 テスト)

- [ ] rejects malicious subdomains containing chatgpt.com (`evil-chatgpt.com.attacker.com`)
- [ ] rejects chatgpt.com as subdomain (`chatgpt.com.evil.com`)
- [ ] sanitizes XSS script tags in assistant content
- [ ] sanitizes XSS onerror attributes in content

#### 6.3.3 ID 抽出 (4 テスト)

- [ ] extracts UUID from `/c/{uuid}` URL
- [ ] extracts UUID from `/g/{uuid}` URL (GPT mode)
- [ ] returns null for non-chat URLs
- [ ] generates fallback ID when URL parsing fails

#### 6.3.4 タイトル抽出 (3 テスト)

- [ ] extracts title from first user message
- [ ] truncates long titles (>100 chars)
- [ ] returns default title when no content

#### 6.3.5 メッセージ抽出 (6 テスト)

- [ ] extracts user and assistant messages
- [ ] handles multiple conversation turns
- [ ] maintains correct message order via data-turn-id
- [ ] handles empty conversations
- [ ] extracts HTML content for assistant messages
- [ ] uses data-message-author-role for role identification

#### 6.3.6 引用抽出 (4 テスト)

- [ ] extracts inline citations from webpage-citation-pill
- [ ] removes utm_source parameter from URLs
- [ ] handles missing citations gracefully
- [ ] handles multiple citations in single message

#### 6.3.7 フォールバックセレクター (5 テスト)

- [ ] conversationTurn primary selector (section[data-turn-id])
- [ ] conversationTurn secondary selector ([data-testid])
- [ ] userMessage primary selector ([data-message-author-role])
- [ ] assistantResponse primary selector
- [ ] markdownContent fallback chain

#### 6.3.8 エラーハンドリング (3 テスト)

- [ ] returns error when DOM elements not found
- [ ] returns error for empty conversation
- [ ] handles sanitization errors gracefully

---

## 7. 実装ファイル一覧

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `vite.config.ts` (manifest) | 変更 | ChatGPT URL パターン追加 |
| `src/lib/types.ts` | 変更 | `'chatgpt'` を source/platform 型に追加 |
| `src/content/extractors/base.ts` | 変更 | platform 型に `'chatgpt'` 追加 |
| `src/content/index.ts` | 変更 | hostname ルーティング追加 + `waitForConversationContainer()` セレクター修正 |
| `src/content/extractors/chatgpt.ts` | **新規** | ChatGPTExtractor 実装 |
| `test/fixtures/dom-helpers.ts` | 変更 | ChatGPT DOM ヘルパー追加 |
| `test/extractors/chatgpt.test.ts` | **新規** | ChatGPTExtractor テスト (32 cases) |

---

## 8. 引用変換仕様

### 8.1 変換ロジック

ChatGPT のインライン引用は、既存の Turndown HTML→Markdown 変換パイプラインで自然にリンクに変換される。

```html
<!-- 入力 HTML -->
<span data-testid="webpage-citation-pill">
  <a href="https://example.com?utm_source=chatgpt.com">example.com</a>
</span>

<!-- 出力 Markdown -->
[example.com](https://example.com)
```

### 8.2 utm_source パラメータの削除

ChatGPT は URL に `?utm_source=chatgpt.com` を付与する。これを削除して保存する。

```typescript
function cleanChatGPTUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.delete('utm_source');
    return urlObj.toString();
  } catch {
    return url;
  }
}
```

---

## 付録

### A. ChatGPT HTML サンプルファイル

| ファイル | 内容 |
|----------|------|
| `data/chatgpt-elements-sample.html` | 通常チャット HTML |
| `data/chatgpt-deep-research-sample.html` | Deep Research（通常会話として処理）HTML |

### B. URL パターン

| プラットフォーム | パターン | 例 |
|-----------------|----------|-----|
| Gemini | `/app/{hex-id}` | `/app/abc123def` |
| Claude | `/chat/{uuid}` | `/chat/1fbb8252-2bec-4ef2-bf1f-88393dd9bb5f` |
| ChatGPT | `/c/{uuid}` or `/g/{uuid}` | `/c/6789abcd-ef01-2345-6789-abcdef012345` |

### C. 出力形式サンプル

```markdown
---
id: chatgpt_6789abcd-ef01-2345-6789-abcdef012345
title: 'IK Multimedia iLoud Sub 評価'
source: chatgpt
extractedAt: '2026-01-20T10:00:00.000Z'
---

> [!QUESTION] User
> https://www.ikmultimedia.com/products/iloudsub/ 評価して

> [!NOTE] ChatGPT
> こちらは **IK Multimedia iLoud Sub** の総合評価レビューです。[IK Multimedia](https://www.ikmultimedia.com/products/iloudsub)
>
> ## 製品概要
> **iLoud Sub** はコンパクトなスタジオ品質サブウーファーです。
```

### D. Gemini/Claude との DOM 構造比較

| 特徴 | Gemini | Claude | ChatGPT |
|------|--------|--------|---------|
| **ターン識別** | `.conversation-container` | `.group` + role判定 | `section[data-turn-id]`（レガシー: `article`） |
| **ユーザーメッセージ** | `user-query` タグ | `.whitespace-pre-wrap` | `[data-message-author-role="user"]` |
| **アシスタント** | `model-response` タグ | `.font-claude-response` | `[data-message-author-role="assistant"]` |
| **Markdown** | `.markdown-main-panel` | `.standard-markdown` | `.markdown.prose` |
| **引用形式** | `data-turn-source-index` | インラインリンク | `data-testid="webpage-citation-pill"` |

### E. content_scripts 実行タイミング

ChatGPT は SPA (Single Page Application) のため、`document_idle` で content script を注入後、URL 変更を監視する必要がある可能性がある。既存の `waitForConversationContainer()` パターンで対応可能か検証が必要。

```typescript
// 既存の waitForConversationContainer() を ChatGPT 用にも適用
// section[data-turn-id] または article[data-turn-id] が出現するまで待機
```

---

### F. レビュー対応チェックリスト

- [x] P0: `waitForConversationContainer()` のセレクター変更を Section 5.1 に追加
- [x] P1: Sources ボタン引用は inline 引用と同一 DOM のため、スコープ表に注記追加
- [x] P2: モデル名抽出セレクター（`data-message-model-slug`）を Section 5.3.4 に追加
- [x] P2: `getTitle()` メソッド仕様を Section 5.6.3 に追加
- [x] セクション番号の整合性を修正（5.1〜5.8）
