# Deep Research 抽出機能 - 実装ワークフロー

## 概要

設計書 `docs/design/deep-research-extraction.md` v1.1 に基づく実装ワークフロー。

## 依存関係図

```
Phase 1: 型定義
    │
    ▼
Phase 2: Extractor 実装
    │
    ├── 2.1 セレクタ定義
    │       │
    │       ▼
    ├── 2.2 検出メソッド
    │       │
    │       ▼
    ├── 2.3 抽出メソッド
    │       │
    │       ▼
    └── 2.4 ルーティング統合
            │
            ▼
Phase 3: マークダウン変換
    │
    ▼
Phase 4: テスト実装
    │
    ├── 4.1 テストヘルパー
    │       │
    │       ▼
    └── 4.2 ユニットテスト
            │
            ▼
Phase 5: 検証
```

---

## Phase 1: 型定義の拡張

### タスク 1.1: ConversationData 型拡張

**ファイル**: `src/lib/types.ts`

**変更内容**:
```typescript
export interface ConversationData {
  id: string;
  title: string;
  url: string;
  source: 'gemini' | 'claude' | 'perplexity';
  type?: 'conversation' | 'deep-research';  // 追加
  messages: ConversationMessage[];
  extractedAt: Date;
  metadata: ConversationMetadata;
}
```

**検証方法**:
- TypeScript コンパイルエラーなし
- 既存テスト全てパス

---

### タスク 1.2: NoteFrontmatter 型拡張

**ファイル**: `src/lib/types.ts`

**変更内容**:
```typescript
export interface NoteFrontmatter {
  id: string;
  title: string;
  source: string;
  type?: string;  // 追加
  url: string;
  created: string;
  modified: string;
  tags: string[];
  message_count: number;
}
```

**検証方法**:
- TypeScript コンパイルエラーなし

---

## Phase 2: GeminiExtractor 拡張

### タスク 2.1: DEEP_RESEARCH_SELECTORS 定義

**ファイル**: `src/content/extractors/gemini.ts`

**追加位置**: `SELECTORS` 定義の直後

**変更内容**:
```typescript
const DEEP_RESEARCH_SELECTORS = {
  panel: [
    'deep-research-immersive-panel',
  ],
  title: [
    'deep-research-immersive-panel h2.title-text.gds-title-s',
    'deep-research-immersive-panel .title-text',
    'toolbar h2.title-text',
  ],
  content: [
    '#extended-response-markdown-content',
    'message-content#extended-response-message-content .markdown-main-panel',
    'structured-content-container[data-test-id="message-content"] .markdown-main-panel',
  ],
};
```

**依存**: なし

---

### タスク 2.2: isDeepResearchVisible() 実装

**ファイル**: `src/content/extractors/gemini.ts`

**追加位置**: `GeminiExtractor` クラス内、`canExtract()` の後

**変更内容**:
```typescript
/**
 * Deep Research パネルが表示中かどうかを判定
 */
isDeepResearchVisible(): boolean {
  const panel = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.panel);
  return panel !== null;
}
```

**依存**: タスク 2.1

---

### タスク 2.3: getDeepResearchTitle() 実装

**ファイル**: `src/content/extractors/gemini.ts`

**追加位置**: `isDeepResearchVisible()` の後

**変更内容**:
```typescript
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
```

**依存**: タスク 2.1

---

### タスク 2.4: extractDeepResearchContent() 実装

**ファイル**: `src/content/extractors/gemini.ts`

**追加位置**: `getDeepResearchTitle()` の後

**変更内容**:
```typescript
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
```

**依存**: タスク 2.1

---

### タスク 2.5: extractDeepResearch() 実装

**ファイル**: `src/content/extractors/gemini.ts`

**追加位置**: `extractDeepResearchContent()` の後

**変更内容**:
```typescript
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

  const titleHash = this.generateHashValue(title);
  const conversationId = `deep-research-${titleHash}`;

  return {
    success: true,
    data: {
      id: conversationId,
      title,
      url: window.location.href,
      source: 'gemini',
      type: 'deep-research',
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
```

**依存**: タスク 2.2, 2.3, 2.4, Phase 1

---

### タスク 2.6: extract() メソッド修正

**ファイル**: `src/content/extractors/gemini.ts`

**変更箇所**: 既存の `extract()` メソッド内

**変更内容**: `if (!this.canExtract())` チェックの直後に追加
```typescript
// Deep Research パネルが表示中の場合はレポートを抽出
if (this.isDeepResearchVisible()) {
  console.info('[G2O] Deep Research panel detected, extracting report');
  return this.extractDeepResearch();
}

console.info('[G2O] Extracting normal conversation');
```

**依存**: タスク 2.5

---

## Phase 3: マークダウン変換拡張

### タスク 3.1: conversationToNote() 修正

**ファイル**: `src/content/markdown.ts`

**変更箇所 1**: frontmatter 生成部分
```typescript
const frontmatter: NoteFrontmatter = {
  id: `${data.source}_${data.id}`,
  title: data.title,
  source: data.source,
  ...(data.type && { type: data.type }),  // 追加
  url: data.url,
  created: data.extractedAt.toISOString(),
  modified: now,
  tags: data.type === 'deep-research'     // 変更
    ? ['ai-research', 'deep-research', data.source]
    : ['ai-conversation', data.source],
  message_count: data.messages.length,
};
```

**変更箇所 2**: body 生成部分
```typescript
// Deep Research の場合は本文をそのまま変換
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
```

**依存**: Phase 1

---

## Phase 4: テスト実装

### タスク 4.1: DOM ヘルパー追加

**ファイル**: `test/fixtures/dom-helpers.ts`

**追加位置**: ファイル末尾

**変更内容**:
```typescript
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

**依存**: なし

---

### タスク 4.2: Deep Research テスト追加

**ファイル**: `test/extractors/gemini.test.ts`

**追加位置**: 既存の `describe` ブロックの後

**変更内容**:
```typescript
describe('Deep Research extraction', () => {
  describe('isDeepResearchVisible', () => {
    it('returns true when panel is present', () => {
      setGeminiLocation('test123');
      loadFixture(createDeepResearchDOM('Test Report', '<p>Content</p>'));
      expect(extractor.isDeepResearchVisible()).toBe(true);
    });

    it('returns false when panel is not present', () => {
      setGeminiLocation('test123');
      loadFixture('<div>No panel</div>');
      expect(extractor.isDeepResearchVisible()).toBe(false);
    });
  });

  describe('getDeepResearchTitle', () => {
    it('extracts title from panel', () => {
      setGeminiLocation('test123');
      loadFixture(createDeepResearchDOM('Hawaii Travel Report', '<p>Content</p>'));
      expect(extractor.getDeepResearchTitle()).toBe('Hawaii Travel Report');
    });

    it('returns default title when not found', () => {
      setGeminiLocation('test123');
      loadFixture('<deep-research-immersive-panel></deep-research-immersive-panel>');
      expect(extractor.getDeepResearchTitle()).toBe('Untitled Deep Research Report');
    });
  });

  describe('extractDeepResearchContent', () => {
    it('extracts content from panel', () => {
      setGeminiLocation('test123');
      loadFixture(createDeepResearchDOM('Test', '<h1>Report</h1><p>Content</p>'));
      const content = extractor.extractDeepResearchContent();
      expect(content).toContain('<h1>Report</h1>');
      expect(content).toContain('<p>Content</p>');
    });

    it('returns empty string when content not found', () => {
      setGeminiLocation('test123');
      loadFixture(createEmptyDeepResearchPanel());
      expect(extractor.extractDeepResearchContent()).toBe('');
    });
  });

  describe('extractDeepResearch', () => {
    it('returns successful result with report data', () => {
      setGeminiLocation('test123');
      loadFixture(createDeepResearchDOM('Test Report', '<h1>Title</h1><p>Content</p>'));
      
      const result = extractor.extractDeepResearch();
      
      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('deep-research');
      expect(result.data?.source).toBe('gemini');
      expect(result.data?.title).toBe('Test Report');
      expect(result.data?.messages.length).toBe(1);
      expect(result.data?.messages[0].role).toBe('assistant');
    });

    it('returns error when content is empty', () => {
      setGeminiLocation('test123');
      loadFixture(createEmptyDeepResearchPanel());
      
      const result = extractor.extractDeepResearch();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('content not found');
    });

    it('generates consistent ID from title for overwrite', () => {
      setGeminiLocation('test123');
      loadFixture(createDeepResearchDOM('Same Title', '<p>Content 1</p>'));
      const result1 = extractor.extractDeepResearch();
      
      clearFixture();
      loadFixture(createDeepResearchDOM('Same Title', '<p>Content 2</p>'));
      const result2 = extractor.extractDeepResearch();
      
      expect(result1.data?.id).toBe(result2.data?.id);
    });
  });

  describe('extract routing', () => {
    it('extracts Deep Research when panel is visible', async () => {
      setGeminiLocation('test123');
      loadFixture(createDeepResearchDOM('Report', '<p>Content</p>'));
      
      const result = await extractor.extract();
      
      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('deep-research');
    });

    it('extracts normal conversation when panel is not visible', async () => {
      setGeminiLocation('test123');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      loadFixture(html);
      
      const result = await extractor.extract();
      
      expect(result.success).toBe(true);
      expect(result.data?.type).toBeUndefined();
    });

    it('prioritizes Deep Research when both exist', async () => {
      setGeminiLocation('test123');
      const conversationHtml = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      const deepResearchHtml = createDeepResearchDOM('Report', '<p>Content</p>');
      loadFixture(conversationHtml + deepResearchHtml);
      
      const result = await extractor.extract();
      
      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('deep-research');
    });
  });
});
```

**依存**: タスク 4.1, Phase 2

---

## Phase 5: 検証

### タスク 5.1: 型チェック

**コマンド**:
```bash
npm run build
```

**期待結果**: エラーなし

---

### タスク 5.2: 既存テスト実行

**コマンド**:
```bash
npm run test
```

**期待結果**: 全テストパス（既存テスト + 新規テスト）

---

### タスク 5.3: Lint チェック

**コマンド**:
```bash
npm run lint
```

**期待結果**: エラーなし

---

## 実装順序サマリー

| 順序 | タスク | ファイル | 依存 |
|-----|-------|---------|------|
| 1 | 1.1, 1.2 | `src/lib/types.ts` | なし |
| 2 | 2.1 | `src/content/extractors/gemini.ts` | なし |
| 3 | 2.2, 2.3, 2.4 | `src/content/extractors/gemini.ts` | 2.1 |
| 4 | 2.5 | `src/content/extractors/gemini.ts` | 2.2-2.4, Phase 1 |
| 5 | 2.6 | `src/content/extractors/gemini.ts` | 2.5 |
| 6 | 3.1 | `src/content/markdown.ts` | Phase 1 |
| 7 | 4.1 | `test/fixtures/dom-helpers.ts` | なし |
| 8 | 4.2 | `test/extractors/gemini.test.ts` | 4.1, Phase 2 |
| 9 | 5.1-5.3 | (コマンド実行) | Phase 1-4 |

---

## 並列実行可能なタスク

以下のタスクは並列実行可能:
- タスク 1.1 と 1.2（同一ファイル内だが独立）
- タスク 2.2, 2.3, 2.4（全て 2.1 に依存するが相互依存なし）
- タスク 4.1（他のタスクと独立）

---

## リスクと対策

| リスク | 対策 |
|-------|------|
| セレクタが実際のDOMと一致しない | `test/fixtures/deep-research-sample.html` で事前検証済み |
| 既存テストが失敗する | Phase 1 で optional フィールドのみ追加し後方互換性維持 |
| `extract()` の既存ロジック破壊 | Deep Research 分岐を先に追加し、else で既存処理 |

---

*作成日: 2025-01-11*
*設計書バージョン: v1.1*
