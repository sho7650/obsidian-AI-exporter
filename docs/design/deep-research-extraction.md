# Deep Research 抽出機能 設計書

## 1. 概要

### 1.1 目的
Gemini の Deep Research 機能が生成するレポートを、既存の会話抽出機能に追加して Obsidian に保存できるようにする。

### 1.2 スコープ
- Deep Research レポートの検出と抽出
- 既存の会話抽出との排他制御
- 出力フォーマットの拡張（`type` フィールド追加）
- 同一レポートの上書き保存

### 1.3 スコープ外
- 図表・画像の特殊処理（将来対応）
- thinking-panel（思考過程）の抽出
- toc-menu（目次）の抽出

---

## 2. 要件定義

### 2.1 機能要件

| ID | 要件 | 優先度 |
|----|------|--------|
| FR-01 | Deep Research パネルが展開中の場合、レポートのみを抽出する | 必須 |
| FR-02 | Deep Research パネルが閉じている場合、通常会話を抽出する | 必須 |
| FR-03 | レポートのタイトルを `h2.title-text.gds-title-s` から取得する | 必須 |
| FR-04 | レポート本文を `#extended-response-markdown-content` から取得する | 必須 |
| FR-05 | frontmatter に `type: deep-research` を追加して識別する | 必須 |
| FR-06 | 同一レポートの再保存時は上書きする | 必須 |

### 2.2 非機能要件

| ID | 要件 |
|----|------|
| NFR-01 | 既存の会話抽出機能に影響を与えない |
| NFR-02 | セレクタのフォールバック機構を維持する |
| NFR-03 | DOMPurify によるサニタイズを適用する |

---

## 3. HTML 構造分析

### 3.1 Deep Research パネル構造

```
deep-research-immersive-panel
├── toolbar
│   └── div.toolbar.has-title
│       └── div.left-panel
│           └── h2.title-text.gds-title-s  ← タイトル取得元
│
└── div.container
    ├── thinking-panel  ← 抽出対象外
    │
    └── response-container
        └── structured-content-container[data-test-id="message-content"]
            └── message-content#extended-response-message-content
                └── div#extended-response-markdown-content.markdown.markdown-main-panel
                    └── <h1>, <h2>, <p>, <ul>... ← 本文取得元
```

### 3.2 通常会話構造（比較用）

```
conversation-container
└── model-response
    └── structured-content-container
        └── message-content#message-content-id-r_xxxxx
            └── div.markdown.markdown-main-panel
```

### 3.3 識別ポイント

| 要素 | Deep Research | 通常会話 |
|------|--------------|---------|
| 親コンポーネント | `deep-research-immersive-panel` | `conversation-container` |
| message-content ID | `extended-response-message-content` | `message-content-id-r_xxxxx` |
| markdown ID | `extended-response-markdown-content` | なし（クラスのみ） |
| data-test-id | `message-content` | なし |

### 3.4 Angular 動的属性について

以下の属性は Angular が動的生成するため、セレクタには使用しない：
- `_ngcontent-ng-c*` - コンポーネントスコープ属性
- `_nghost-ng-c*` - ホスト要素属性
- `ng-tns-c*-*` - 動的スコープクラス

追加クラス（`stronger`, `enable-updated-hr-color`, `ng-star-inserted`）は部分一致セレクタで無視される。

---

## 4. 設計

### 4.1 セレクタ定義

```typescript
// src/content/extractors/gemini.ts に追加

const DEEP_RESEARCH_SELECTORS = {
  // Deep Research パネル（存在確認用）
  panel: [
    'deep-research-immersive-panel',
  ],
  
  // レポートタイトル
  title: [
    'deep-research-immersive-panel h2.title-text.gds-title-s',
    'deep-research-immersive-panel .title-text',
    'toolbar h2.title-text',
  ],
  
  // レポート本文
  content: [
    '#extended-response-markdown-content',
    'message-content#extended-response-message-content .markdown-main-panel',
    'structured-content-container[data-test-id="message-content"] .markdown-main-panel',
  ],
};
```

### 4.2 型定義の拡張

#### 4.2.1 `source` と `type` の関係

```typescript
// src/lib/types.ts

/**
 * source: プラットフォーム識別子（既存）
 *   - 'gemini' | 'claude' | 'perplexity'
 *   - IConversationExtractor.platform と一致
 *   - ファイル名やID生成に使用
 *
 * type: コンテンツ種別識別子（新規）
 *   - 'conversation' | 'deep-research'
 *   - 同一プラットフォーム内でのコンテンツ種別を区別
 *   - タグ生成やフォーマット分岐に使用
 */

// ConversationData に type フィールドを追加
export interface ConversationData {
  id: string;
  title: string;
  url: string;
  source: 'gemini' | 'claude' | 'perplexity';  // プラットフォーム（変更なし）
  type?: 'conversation' | 'deep-research';      // コンテンツ種別（新規追加）
  messages: ConversationMessage[];
  extractedAt: Date;
  metadata: ConversationMetadata;
}

// NoteFrontmatter に type フィールドを追加
export interface NoteFrontmatter {
  id: string;
  title: string;
  source: string;
  type?: string;  // 新規追加（optional で後方互換性維持）
  url: string;
  created: string;
  modified: string;
  tags: string[];
  message_count: number;
}
```

#### 4.2.2 型の使い分け

| フィールド | 用途 | 例 |
|-----------|------|-----|
| `source` | プラットフォーム識別、ID prefix | `gemini_xxx`, `claude_xxx` |
| `type` | コンテンツ種別、フォーマット分岐 | `deep-research` → レポート形式出力 |

### 4.3 GeminiExtractor の拡張

```typescript
// src/content/extractors/gemini.ts

export class GeminiExtractor extends BaseExtractor {
  // 既存のプロパティ・メソッド...

  /**
   * Deep Research パネルが表示中かどうかを判定
   */
  isDeepResearchVisible(): boolean {
    const panel = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.panel);
    return panel !== null;
  }

  /**
   * Deep Research レポートのタイトルを取得
   */
  getDeepResearchTitle(): string {
    const titleEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.title);
    if (titleEl?.textContent) {
      return this.sanitizeText(titleEl.textContent).substring(0, 200);
    }
    return 'Untitled Deep Research Report';
  }

  /**
   * Deep Research レポートの本文を抽出
   */
  extractDeepResearchContent(): string {
    const contentEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.content);
    if (contentEl) {
      return sanitizeHtml(contentEl.innerHTML);
    }
    return '';
  }

  /**
   * Deep Research レポートを抽出
   */
  extractDeepResearch(): ExtractionResult {
    const title = this.getDeepResearchTitle();
    const content = this.extractDeepResearchContent();

    if (!content) {
      return {
        success: false,
        error: 'Deep Research content not found',
        warnings: ['Panel is visible but content element is empty or missing'],
      };
    }

    // タイトルからIDを生成（上書き用）
    // BaseExtractor から継承した this.generateHashValue() を使用
    const titleHash = this.generateHashValue(title);
    const conversationId = `deep-research-${titleHash}`;

    return {
      success: true,
      data: {
        id: conversationId,
        title,
        url: window.location.href,
        source: 'gemini',        // プラットフォーム
        type: 'deep-research',   // コンテンツ種別
        messages: [
          {
            id: 'report-0',
            role: 'assistant',
            content,
            htmlContent: content,
            index: 0,
          },
        ],
        extractedAt: new Date(),
        metadata: {
          messageCount: 1,
          userMessageCount: 0,
          assistantMessageCount: 1,
          hasCodeBlocks: content.includes('<code') || content.includes('```'),
        },
      },
    };
  }

  /**
   * メイン抽出メソッド（修正）
   * ルーティングロジック: Deep Research パネル表示 → レポート抽出、それ以外 → 会話抽出
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: 'Not on a Gemini page',
        };
      }

      // ルーティング: Deep Research パネルが表示中の場合はレポートを抽出
      if (this.isDeepResearchVisible()) {
        console.info('[G2O] Deep Research panel detected, extracting report');
        return this.extractDeepResearch();
      }

      // 通常の会話抽出（既存ロジック - 変更なし）
      console.info('[G2O] Extracting normal conversation');
      const messages = this.extractMessages();
      // ... 既存のコード（省略）...
    } catch (error) {
      console.error('[G2O] Extraction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }
}
```

### 4.4 Content Script のルーティングフロー

```
src/content/index.ts: handleSync()
        │
        ▼
  extractor.canExtract()
        │
        ├── false → エラー表示
        │
        ▼ true
  extractor.extract()  ← ここで内部ルーティング
        │
        ├── isDeepResearchVisible() === true
        │   └── extractDeepResearch() → type: 'deep-research'
        │
        └── isDeepResearchVisible() === false
            └── extractMessages() → type: undefined (通常会話)
        │
        ▼
  conversationToNote(result.data)
        │
        ├── data.type === 'deep-research'
        │   └── レポート形式で出力（見出し構造維持）
        │
        └── data.type !== 'deep-research'
            └── Callout 形式で出力（Q&A）
        │
        ▼
  saveToObsidian(note)
```

**重要**: ルーティングは `GeminiExtractor.extract()` 内で完結する。
`src/content/index.ts` は変更不要（`extract()` の結果を `conversationToNote()` に渡すだけ）。

### 4.5 マークダウン変換の拡張

```typescript
// src/content/markdown.ts

export function conversationToNote(
  data: ConversationData,
  options: TemplateOptions
): ObsidianNote {
  const now = new Date().toISOString();

  // frontmatter 生成
  const frontmatter: NoteFrontmatter = {
    id: `${data.source}_${data.id}`,
    title: data.title,
    source: data.source,
    ...(data.type && { type: data.type }),  // type がある場合のみ追加
    url: data.url,
    created: data.extractedAt.toISOString(),
    modified: now,
    tags: data.type === 'deep-research' 
      ? ['ai-research', 'deep-research', data.source]
      : ['ai-conversation', data.source],
    message_count: data.messages.length,
  };

  // Deep Research の場合は本文をそのまま変換（見出し構造維持）
  let body: string;
  if (data.type === 'deep-research') {
    body = htmlToMarkdown(data.messages[0].content);
  } else {
    // 通常会話のフォーマット（既存ロジック）
    const bodyParts: string[] = [];
    for (const message of data.messages) {
      const formatted = formatMessage(message.content, message.role, options);
      bodyParts.push(formatted);
    }
    body = bodyParts.join('\n\n');
  }

  // ファイル名生成
  const fileName = generateFileName(data.title, data.id);
  const contentHash = generateContentHash(body);

  return {
    fileName,
    frontmatter,
    body,
    contentHash,
  };
}
```

---

## 5. 出力フォーマット

### 5.1 Deep Research レポート出力例

```markdown
---
id: gemini_deep-research-a1b2c3d4
title: ハワイ旅行準備と現地注意点レポート
source: gemini
type: deep-research
url: https://gemini.google.com/app/xxx
created: 2025-01-11T10:00:00.000Z
modified: 2025-01-11T10:00:00.000Z
tags:
  - ai-research
  - deep-research
  - gemini
message_count: 1
---

# 2026年3月ハワイ（オアフ島）渡航における観光インフラ・法制度・リスク管理に関する包括的調査報告書

## 1. はじめに

本レポートは、2026年3月にハワイ・オアフ島への渡航を計画されている方向けに...

## 2. 渡航準備

### 2.1 必要書類

- 有効なパスポート（残存有効期間6ヶ月以上推奨）
- ESTA（電子渡航認証システム）の事前申請
...
```

### 5.2 通常会話との比較

| 項目 | Deep Research | 通常会話 |
|------|--------------|---------|
| id | `gemini_deep-research-{hash}` | `gemini_{conversationId}` |
| type | `deep-research` | `conversation` または未設定 |
| tags | `ai-research, deep-research, gemini` | `ai-conversation, gemini` |
| 本文形式 | レポート全体（見出し構造維持） | Callout 形式の Q&A |

---

## 6. ID 生成とファイル上書き

### 6.1 ID 生成ロジック

```typescript
// Deep Research の場合
// BaseExtractor から継承した this.generateHashValue() を使用
const titleHash = this.generateHashValue(title);
const id = `deep-research-${titleHash}`;

// 参照: src/content/extractors/base.ts
protected generateHashValue(content: string): string {
  return generateHash(content);  // src/lib/hash.ts
}

// 参照: src/lib/hash.ts
export function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
```

### 6.2 上書き判定

同一の `id` を持つファイルが存在する場合、Obsidian API 経由で上書きされる。
これにより、同じタイトルの Deep Research レポートは常に最新版で上書きされる。

---

## 7. テスト計画

### 7.1 ユニットテスト

| テスト項目 | 説明 |
|-----------|------|
| `isDeepResearchVisible()` | パネル表示判定 |
| `getDeepResearchTitle()` | タイトル抽出 |
| `extractDeepResearchContent()` | 本文抽出 |
| `extractDeepResearch()` | 統合抽出 |
| `extract()` | 排他制御（パネル表示時はレポート、非表示時は会話） |

### 7.2 エッジケーステスト

| テスト項目 | シナリオ | 期待結果 |
|-----------|---------|---------|
| パネル表示・コンテンツなし | `deep-research-immersive-panel` 存在、`#extended-response-markdown-content` なし | `success: false`, 警告付きエラー |
| パネル表示・タイトルなし | パネル存在、タイトル要素なし | デフォルトタイトル使用 |
| パネル表示・空コンテンツ | コンテンツ要素存在、innerHTML 空 | `success: false` |
| 通常会話とパネル共存 | 両方存在 | Deep Research のみ抽出 |

### 7.3 テストフィクスチャ

- `test/fixtures/deep-research-sample.html`（作成済み）
- `test/fixtures/dom-helpers.ts` に Deep Research ヘルパーを追加

```typescript
// test/fixtures/dom-helpers.ts に追加

/**
 * Deep Research パネル DOM 構造を作成
 */
export function createDeepResearchDOM(
  title: string,
  content: string
): string {
  return `
    <deep-research-immersive-panel class="ng-star-inserted">
      <toolbar>
        <div class="toolbar has-title">
          <div class="left-panel">
            <h2 class="title-text gds-title-s">${title}</h2>
          </div>
        </div>
      </toolbar>
      <div class="container">
        <response-container>
          <structured-content-container data-test-id="message-content">
            <message-content id="extended-response-message-content">
              <div id="extended-response-markdown-content" 
                   class="markdown markdown-main-panel">
                ${content}
              </div>
            </message-content>
          </structured-content-container>
        </response-container>
      </div>
    </deep-research-immersive-panel>
  `;
}

/**
 * パネルのみ（コンテンツなし）の DOM を作成
 */
export function createEmptyDeepResearchPanel(): string {
  return `
    <deep-research-immersive-panel class="ng-star-inserted">
      <toolbar>
        <div class="toolbar has-title">
          <div class="left-panel">
            <h2 class="title-text gds-title-s">Test Report</h2>
          </div>
        </div>
      </toolbar>
      <div class="container">
        <response-container>
        </response-container>
      </div>
    </deep-research-immersive-panel>
  `;
}
```

---

## 8. 影響範囲

### 8.1 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/types.ts` | `type` フィールド追加 |
| `src/content/extractors/gemini.ts` | Deep Research 抽出メソッド追加、DEEP_RESEARCH_SELECTORS 追加 |
| `src/content/markdown.ts` | Deep Research 用フォーマット処理分岐 |
| `test/fixtures/dom-helpers.ts` | Deep Research ヘルパー追加 |
| `test/extractors/gemini.test.ts` | Deep Research テスト追加 |

### 8.2 変更なしファイル

| ファイル | 理由 |
|---------|------|
| `src/content/index.ts` | ルーティングは extractor 内で完結 |
| `src/background/index.ts` | 変更不要 |
| `src/lib/obsidian-api.ts` | 変更不要 |

### 8.3 後方互換性

- 既存の `ConversationData` に optional な `type` フィールドを追加
- `type` が未設定の場合は従来通り会話として扱う
- 既存のテストは影響を受けない

---

## 9. 今後の拡張可能性

### 9.1 将来対応候補

- thinking-panel（思考過程）の抽出オプション
- 図表・画像の埋め込み対応
- 複数 Deep Research レポートの一括抽出
- レポート内リンクの Obsidian 形式変換

---

## 10. 承認

| 項目 | 状態 |
|------|------|
| 設計レビュー | 完了（v1.1 で指摘対応） |
| 実装承認 | 待機中 |

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-01-11 | 初版作成 |
| 1.1 | 2025-01-11 | レビュー指摘対応: type/source 関係明確化、ルーティングフロー追加、hash 参照修正、エッジケース追加 |

---

*作成日: 2025-01-11*
*バージョン: 1.1*
