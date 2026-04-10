# DOM実装の再設計計画

## 問題の概要

`test/sample.md`の出力結果に以下の問題が発生:
1. **同じ質問が3回重複**: 最初の`> [!QUESTION]`が3回出力されている
2. **質問内容の欠落**: 複数行の質問のうち、最初の1行のみ抽出
3. **会話が不完全**: HTMLには複数往復の会話があるはずだが、最初の1往復のみ出力

## 根本原因分析

### 実際のGemini DOM構造 (element-sample.htmlより)

```
<div class="conversation-container">
  <user-query>
    <user-query-content>
      <div class="query-text">
        <p class="query-text-line">行1</p>
        <p class="query-text-line">行2</p>
        ...
      </div>
    </user-query-content>
  </user-query>
  <model-response>
    <structured-content-container class="model-response-text">
      <message-content>
        <div class="markdown markdown-main-panel">
          ...レスポンスのHTML...
        </div>
      </message-content>
    </structured-content-container>
  </model-response>
</div>
```

### 現在の実装の問題点

1. **セレクタの不正確さ**: `gemini.ts`のセレクタがGeminiの現在のDOM構造と不一致
2. **複数行テキストの結合不足**: `.query-text-line`が複数ある場合、最初の1つだけ取得
3. **会話コンテナの認識不足**: `.conversation-container`ごとに1往復を認識する設計になっていない

## 修正計画

### Step 1: SELECTORSの更新

```typescript
const SELECTORS = {
  // 会話の単位（1往復ごと）
  conversationTurn: [
    '.conversation-container',
    '[class*="conversation-container"]',
  ],

  // ユーザー質問要素
  userQuery: [
    'user-query',
    '[_nghost-ng-c2049895193]', // Angular component selector
  ],

  // 質問テキストのコンテナ（複数のquery-text-lineを含む）
  queryTextContainer: [
    '.query-text',
    '[class*="query-text"]:not(.query-text-line)',
  ],

  // 質問テキストの各行
  queryTextLine: [
    '.query-text-line',
    'p[class*="query-text-line"]',
  ],

  // モデル回答要素
  modelResponse: [
    'model-response',
    '[_nghost-ng-c1516615472]',
  ],

  // 回答のマークダウンコンテナ
  modelResponseContent: [
    '.markdown.markdown-main-panel',
    '.markdown-main-panel',
    'message-content .markdown',
  ],

  // 会話タイトル
  conversationTitle: [
    '.conversation-title.gds-title-m',
    '.conversation-title',
  ],
};
```

### Step 2: extractMessages()の再設計

```typescript
extractMessages(): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  // 各conversation-containerを順番に処理
  const turns = document.querySelectorAll('.conversation-container');

  turns.forEach((turn, index) => {
    // ユーザー質問を抽出
    const userQuery = turn.querySelector('user-query');
    if (userQuery) {
      const content = this.extractUserQueryContent(userQuery);
      if (content) {
        messages.push({
          id: `user-${index}`,
          role: 'user',
          content,
          index: messages.length,
        });
      }
    }

    // モデル回答を抽出
    const modelResponse = turn.querySelector('model-response');
    if (modelResponse) {
      const content = this.extractModelResponseContent(modelResponse);
      if (content) {
        messages.push({
          id: `assistant-${index}`,
          role: 'assistant',
          content,
          htmlContent: content,
          index: messages.length,
        });
      }
    }
  });

  return messages;
}
```

### Step 3: ユーザー質問の複数行対応

```typescript
private extractUserQueryContent(element: Element): string {
  // 全ての.query-text-line要素を取得して結合
  const lines = element.querySelectorAll('.query-text-line');

  if (lines.length > 0) {
    const textParts: string[] = [];
    lines.forEach(line => {
      const text = line.textContent?.trim();
      if (text) {
        textParts.push(text);
      }
    });
    return textParts.join('\n');
  }

  // フォールバック: 全テキスト取得
  return this.sanitizeText(element.textContent || '');
}
```

### Step 4: モデル回答の抽出改善

```typescript
private extractModelResponseContent(element: Element): string {
  // .markdown.markdown-main-panel 内のHTMLを取得
  const markdownEl = element.querySelector('.markdown.markdown-main-panel');
  if (markdownEl) {
    return markdownEl.innerHTML;
  }

  // フォールバック
  const structuredContent = element.querySelector('.model-response-text');
  if (structuredContent) {
    return structuredContent.innerHTML;
  }

  return element.innerHTML;
}
```

## 修正ファイル

1. **[src/content/extractors/gemini.ts](src/content/extractors/gemini.ts)** - 主な修正対象
   - SELECTORS定義の更新
   - extractMessages()メソッドの再実装
   - extractUserQueryContent()メソッドの追加
   - extractModelResponseContent()メソッドの改善

## 期待される結果

修正後の`sample.md`出力:

```markdown
---
id: gemini_cf29fd5979da0c35
title: "Gemini のチャット記録を Obsidian へ残す方法はありませんか？"
...
message_count: 2
---

> [!QUESTION] User
> Gemini のチャット記録を Obsidian へ残す方法はありませんか？
> Obsidian Local REST API は使っています。 https://github.com/...
>
> - 自動的に Obsidian へ連携してほしい
> - 1つのチャットの記録をできるだけチャット形式であることが分かるように記録してほしい
> - 1チャット → 1ファイル
> - 更新があったら、更新分も同じファイルで更新し続けてほしい
>
> このようなツールがなければ開発することもいとわない

> [!NOTE] Gemini
> ご希望の要件（自動連携、チャット形式の維持、...）をすべて満たす...
```

## 検証方法

1. `element-sample.html`をブラウザで開いてコンソールで新しいセレクタをテスト
2. 修正後にChrome拡張として実際のGeminiページでテスト
3. 出力された`sample.md`が期待通りか確認
