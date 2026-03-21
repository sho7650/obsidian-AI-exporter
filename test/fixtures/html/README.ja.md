# HTMLフィクスチャ管理ガイド

## 概要

このディレクトリには、E2Eテスト用の実HTMLフィクスチャを格納します。
各フィクスチャは対応するAIプラットフォームから手動で取得します。

## フィクスチャ一覧

| プラットフォーム | ファイル | 説明 |
|-----------------|---------|------|
| Gemini | `gemini/chat-simple.html` | 基本的なQ&A会話 |
| Gemini | `gemini/deep-research.html` | Deep Researchレポート（引用付き） |
| Claude | `claude/chat-simple.html` | 基本的な会話 |
| Claude | `claude/artifacts.html` | Artifacts/Deep Research |
| ChatGPT | `chatgpt/chat-simple.html` | 基本的な会話 |
| ChatGPT | `chatgpt/chat-code.html` | コードブロック付き会話 |

## フィクスチャ取得手順

### 1. 対象プラットフォームにアクセス

対応するAIサービスにログインし、テスト用の会話を作成または選択します。

### 2. DevToolsでHTML取得

1. `F12` または `Cmd+Option+I` でDevToolsを開く
2. Elements タブを選択
3. 会話コンテナ要素を選択
   - **Gemini**: `.conversation-thread` または `deep-research-immersive-panel`
   - **Claude**: `.conversation-thread` または `#markdown-artifact`
   - **ChatGPT**: `section[data-testid^="conversation-turn"]` の親要素（レガシー: `article`）
4. 右クリック → Copy → Copy outerHTML

### 3. ファイル保存

取得したHTMLを以下のテンプレートで保存:

```html
<!--
  Fixture: {platform}/{name}.html
  Captured: YYYY-MM-DD
  URL Pattern: https://{domain}/...

  Description: {何をテストするか}
  Messages: {N} user, {M} assistant

  Update Trigger: セレクタ変更またはDOM構造変更時
-->

{取得したHTML}
```

### 4. プライバシー配慮

- 個人情報や機密情報を含む会話は使用しない
- 必要に応じてテスト用の会話内容に置き換え
- URLやID等の識別子は汎用的な値に変更可

## フィクスチャ更新フロー

```
CIテスト失敗
    ↓
エラー内容確認
    ↓
┌─────────────────────────┐
│ スナップショット差分?    │
│    ↓                    │
│ 意図的変更? → vitest -u │
│    ↓                    │
│ 非意図的 → 調査必要     │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ 構造的アサーション失敗?  │
│    ↓                    │
│ セレクタ変更の可能性     │
│    ↓                    │
│ HTMLを再取得して検証     │
└─────────────────────────┘
```

## サイズ制限

- 推奨: 500KB以下/ファイル
- 上限: 1MB/ファイル
- 不要な属性やスタイルは削除可能
