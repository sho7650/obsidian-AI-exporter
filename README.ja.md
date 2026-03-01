# Obsidian AI Exporter

Google Gemini、Claude AI、ChatGPT、Perplexity の会話を Obsidian に保存する Chrome 拡張機能です。Local REST API を使用してローカル環境で動作します。

[English version](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue)](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

## 機能

- **マルチプラットフォーム対応**: Google Gemini、Claude AI、ChatGPT、Perplexity からエクスポート
- **ワンクリック保存**: 対応 AI ページに表示される「Sync」ボタンで即座に保存
- **複数の出力オプション**: Obsidian への保存、ファイルダウンロード、クリップボードへコピー
- **Deep Research 対応**: Gemini Deep Research と Claude Extended Thinking レポートを保存
- **Artifact 対応**: Claude Artifacts をインライン引用とソース付きで抽出
- **ツールコンテンツ対応**: Claude の Web 検索結果やツール活動を折りたたみ可能な `[!ABSTRACT]` コールアウトとして保存（オプション）
- **追記モード**: 既存ノートには新しいメッセージのみを追加
- **Obsidian コールアウト**: `[!QUESTION]` と `[!NOTE]` による見やすいフォーマット
- **YAML フロントマター**: タイトル、ソース、URL、日時、タグなどのメタデータを自動生成
- **自動スクロール**: Gemini の長い会話で全メッセージを自動的に読み込み
- **プラットフォーム別整理**: Vault パスに `{platform}` テンプレートを使用して自動分類
- **カスタマイズ可能**: 保存先パス、テンプレート、フロントマターの設定が可能
- **多言語対応**: 英語・日本語 UI をサポート

## 必要なもの

- Google Chrome 88 以降（または Chromium ベースのブラウザ）
- [Obsidian](https://obsidian.md/)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグイン

## インストール

### Chrome ウェブストアから

> **注意**: 現在審査中です。承認後にリンクが有効になります。

[Chrome ウェブストアからインストール](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

### ソースから

1. リポジトリをクローン:
   ```bash
   git clone https://github.com/sho7650/obsidian-AI-exporter.git
   cd obsidian-AI-exporter
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. 拡張機能をビルド:
   ```bash
   npm run build
   ```

4. Chrome に読み込み:
   - `chrome://extensions` を開く
   - 「デベロッパーモード」を有効にする
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist/` フォルダを選択

### Obsidian の設定

1. Obsidian に [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグインをインストール
2. プラグインを有効化し、API キーをコピー
3. Chrome で拡張機能のアイコンをクリックして以下を入力:
   - **API Key**: Local REST API の API キー
   - **Port**: デフォルトは `27123`
   - **Vault Path**: 保存先のフォルダパス（例: `AI/{platform}` でソース別に自動整理）

## 使い方

### Gemini

1. [gemini.google.com](https://gemini.google.com) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. 選択した出力方法に応じて会話がエクスポートされます：
   - **Obsidian**（デフォルト）: Local REST API 経由で vault に直接保存
   - **ファイル**: Markdown ファイルとしてダウンロード
   - **クリップボード**: クリップボードにコピー（どこにでも貼り付け可能）

### Claude

1. [claude.ai](https://claude.ai) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力オプションで会話がエクスポートされます

### ChatGPT

1. [chatgpt.com](https://chatgpt.com) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力オプションで会話がエクスポートされます

### Perplexity

1. [www.perplexity.ai](https://www.perplexity.ai) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力オプションで会話がエクスポートされます

### Deep Research / Extended Thinking の保存

**Gemini Deep Research:**
1. Deep Research パネルを開く（展開表示）
2. 「Sync」ボタンをクリック
3. レポート全体が見出し構造を維持したまま保存されます

**Claude Extended Thinking（Artifacts）:**
1. Artifact を含む会話を開く
2. 「Sync」ボタンをクリック
3. インライン引用とソース付きで Artifact の内容が抽出されます

## 出力フォーマット

### 会話形式

会話は YAML フロントマター付きの Markdown ファイルとして保存されます:

```markdown
---
id: gemini_abc123
title: "認証の実装方法"
source: gemini
url: https://gemini.google.com/app/abc123
created: 2025-01-10T12:00:00Z
modified: 2025-01-10T12:30:00Z
tags:
  - ai-conversation
  - gemini
message_count: 4
---

> [!QUESTION] User
> JWT 認証の実装方法を教えてください

> [!NOTE] Gemini
> JWT 認証を実装するには...
```

### ツールコンテンツ形式（Claude）

「ツール/検索結果を含める」を有効にすると、Claude の Web 検索やツール活動がアシスタント応答の前に折りたたみコールアウトとして表示されます:

```markdown
> [!ABSTRACT]- Searched the web
> Rust latest version 2026 (10 results)
> - Rust Versions | Rust Changelogs (releases.rs)
> - Rust | endoflife.date (endoflife.date)

> [!NOTE] Claude
> Rust の最新バージョンについて...
```

`[!ABSTRACT]-` コールアウトは Obsidian でデフォルトで折りたたまれます（`-` サフィックス）。

### Deep Research 形式

Deep Research レポートは `type` フィールドが追加され、元の構造が維持されます:

```markdown
---
id: gemini_deep-research-a1b2c3d4
title: "〇〇に関する包括的分析"
source: gemini
type: deep-research
url: https://gemini.google.com/app/xxx
created: 2025-01-11T10:00:00Z
modified: 2025-01-11T10:00:00Z
tags:
  - ai-research
  - deep-research
  - gemini
message_count: 1
---

# レポートタイトル

## 1. はじめに

元の見出し構造を維持したレポート内容...

## 2. 分析

詳細な分析セクション...
```

## 開発

```bash
# HMR 対応の開発サーバー
npm run dev

# プロダクションビルド
npm run build

# リント
npm run lint

# フォーマット
npm run format

# テスト実行
npm test

# カバレッジ付きテスト
npm run test:coverage
```

## アーキテクチャ

```
Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai)
    ↓ 会話 / Deep Research / Artifacts を抽出
Background Service Worker
    ↓ Obsidian に送信
Obsidian Local REST API (127.0.0.1:27123)
```

### 主要コンポーネント

| コンポーネント | 説明 |
|---------------|------|
| `src/content/` | DOM 抽出と UI 用のコンテンツスクリプト |
| `src/content/extractors/gemini.ts` | Gemini 会話 & Deep Research 抽出 |
| `src/content/extractors/claude.ts` | Claude 会話 & Artifact 抽出 |
| `src/content/extractors/chatgpt.ts` | ChatGPT 会話抽出 |
| `src/content/extractors/perplexity.ts` | Perplexity 会話抽出 |
| `src/background/` | API 通信用のサービスワーカー |
| `src/popup/` | 設定 UI |
| `src/lib/` | 共有ユーティリティと型定義 |

## セキュリティ

- **安全なストレージ**: API キーは `chrome.storage.local` に保存（クラウド同期なし）
- **入力検証**: メッセージ内容とファイル名を検証
- **パストラバーサル対策**: ディレクトリトラバーサル攻撃からの保護
- **送信元検証**: 信頼されたオリジンからのメッセージのみ受け入れ
- **CSP**: 拡張機能ページに Content Security Policy を設定
- **YAML エスケープ**: フロントマター値を適切にエスケープ

## プライバシー

この拡張機能は:
- 外部サーバーへのデータ収集・送信を**行いません**
- ローカルの Obsidian インスタンス (127.0.0.1) とのみ通信
- API キーはブラウザにローカル保存（クラウド同期なし）

詳細は[プライバシーポリシー](https://sho7650.github.io/obsidian-AI-exporter/privacy.html)をご覧ください。

## ライセンス

MIT

## コントリビュート

コントリビューションを歓迎します！開発ガイドラインについては [CLAUDE.md](CLAUDE.md) をご覧ください。
