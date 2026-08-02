# Obsidian AI Exporter

Google Gemini、Claude AI、ChatGPT、Perplexity、Gemini Notebook（旧 NotebookLM）の会話を Obsidian に保存する Chrome 拡張機能です。Local REST API を使用してローカル環境で動作します。

[English version](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue)](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

## 機能

- **マルチプラットフォーム対応**: Google Gemini、Claude AI、ChatGPT、Perplexity、Gemini Notebook（旧 NotebookLM）からエクスポート
- **ワンクリック保存**: 対応 AI ページに表示される「Sync」ボタンで即座に保存
- **複数の出力オプション**: Obsidian への保存、ファイルダウンロード、クリップボードへコピー
- **Deep Research 対応**: Gemini Deep Research、Claude Extended Thinking、Perplexity Deep Research レポートを保存
- **Artifact 対応**: Claude Artifacts をインライン引用とソース付きで抽出
- **画像エクスポート**: Gemini が生成した画像を会話と一緒に保存 — vault への埋め込み、ファイルダウンロード、クリップボード時は除去
- **ソース引用**: Gemini Notebook のチャット引用を footnote 形式でエクスポート
- **自動スクロール**: 長い会話で全メッセージを自動的に読み込み。仮想化（windowing）された Claude・ChatGPT のスレッドにも対応
- **追記モード**: 既存ノートには新しいメッセージのみを追加
- **ファイル名スキーム**: エクスポートするノートの命名を `title-id`（デフォルト）または `title-date` から選択
- **Vault パステンプレート**: `{platform}` と日付トークン（`{YYYY}`、`{MM}` など）で自動分類
- **ファイル名衝突対策**: 別の会話に属するノートを絶対に上書きしない
- **ツールコンテンツ対応**: Claude の Web 検索結果やツール活動を折りたたみ可能な `[!ABSTRACT]` コールアウトとして保存（オプション）
- **質問見出し（オプション）**: 長い会話で目次から飛べるように、各ユーザーメッセージの前に `## ` 見出し（質問冒頭60文字）を追加
- **長大コールアウトの平坦化**: Obsidian 保存時に非常に長いメッセージをプレーンテキスト化し、レンダラーの遅延を回避（オプション）。しきい値の行数は設定可能（デフォルト 200 行）
- **タイムゾーン設定**: フロントマターの日時（created/modified）にタイムゾーンを指定可能
- **数式の保存**: LaTeX 数式（`$...$`・`$$...$$`）を全プラットフォームで保持し、Obsidian の数式レンダラーで表示
- **Obsidian コールアウト**: `[!QUESTION]` と `[!NOTE]` による見やすいフォーマット
- **YAML フロントマター**: タイトル、ソース、URL、日時、タグなどのメタデータを自動生成
- **カスタマイズ可能**: 保存先パス、テンプレート、フロントマターの設定が可能
- **多言語対応**: 英語・日本語 UI をサポート

## 必要なもの

- Google Chrome 96 以降（または Chromium ベースのブラウザ）
- [Obsidian](https://obsidian.md/)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグイン

## インストール

### Chrome ウェブストアから

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
   - **API URL**: デフォルトは `http://127.0.0.1:27123`（HTTPS にも対応 — [HTTPS 設定](#https-設定オプション)を参照）
   - **Vault Path**: 保存先のフォルダパス（例: `AI/{platform}` でソース別に自動整理）

## 使い方

### Gemini

1. [gemini.google.com](https://gemini.google.com) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. 選択した出力方法に応じて会話がエクスポートされます：
   - **Obsidian**（デフォルト）: Local REST API 経由で vault に直接保存
   - **ファイル**: Markdown ファイルとしてダウンロード
   - **クリップボード**: クリップボードにコピー（どこにでも貼り付け可能）

Gemini が生成した画像は自動的に捕捉・エクスポートされます（[画像エクスポート](#画像エクスポート)を参照）。

### Claude

1. [claude.ai](https://claude.ai) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力オプションで会話がエクスポートされます

> **長い会話では自動スクロールを有効にしてください。** Claude は一度に一部のターンしか DOM に保持せず、画面外のターンは破棄されます。自動スクロールが無効だと、その時点で表示されているターンしかエクスポートできません。

### ChatGPT

1. [chatgpt.com](https://chatgpt.com) で会話を開く（通常のチャットと `/g/` URL のカスタム GPT の両方に対応）
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力オプションで会話がエクスポートされます

> **長い会話では自動スクロールを有効にしてください。** ChatGPT は一度に一部のターンしか DOM に保持せず、画面外のターンは破棄されます。自動スクロールが無効だと、その時点で表示されているターンしかエクスポートできません。

### Perplexity

1. [www.perplexity.ai](https://www.perplexity.ai) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力オプションで会話がエクスポートされます

### Gemini Notebook（旧 NotebookLM）

1. [notebook.google.com](https://notebook.google.com) でノートブックを開く（旧 `notebooklm.google.com` のリンクも Google がリダイレクトするため引き続き利用可能）
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. チャット会話がソース引用（footnote 形式）付きでエクスポートされます

### Deep Research / Extended Thinking の保存

**Gemini Deep Research:**

1. Deep Research パネルを開く（展開表示）
2. 「Sync」ボタンをクリック
3. レポート全体が見出し構造を維持したまま保存されます

**Claude Extended Thinking（Artifacts）:**

1. Artifact を含む会話を開く
2. 「Sync」ボタンをクリック
3. インライン引用とソース付きで Artifact の内容が抽出されます

**Perplexity Deep Research:**

1. Deep Research レポートを含む Perplexity の会話を開く
2. 「Sync」ボタンをクリック
3. レポート内容が通常の会話メッセージとともに抽出されます

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

## Vault パスとファイル名

### Vault パステンプレート

**Vault Path** 設定は保存時に解決されるテンプレートトークンに対応しており、ノートを自動整理できます。デフォルトは `AI/{platform}` です。

| トークン     | 解決される値                                                          |
| ------------ | --------------------------------------------------------------------- |
| `{platform}` | ソース名（`gemini`、`claude`、`chatgpt`、`perplexity`、`notebooklm`） |
| `{YYYY}`     | 4桁の年（ローカル時間、例: `2026`）                                   |
| `{YY}`       | 2桁の年（ローカル時間、例: `26`）                                     |
| `{MM}`       | 2桁のゼロ埋め月（例: `07`）                                           |
| `{DD}`       | 2桁のゼロ埋め日（例: `08`）                                           |

例: `AI/{platform}/{YYYY}/{MM}` は月別フォルダにノートを振り分けます。日付トークンはローカルのタイムゾーンを使用します。追記モードでは、月をまたいでも既存の会話は元のファイルを更新し続けます。

注意: Gemini Notebook の `{platform}` はリブランド後も `notebooklm` のままです。そのため、既存ノートと同じフォルダに保存され続けます。

### ファイル名スキーム

エクスポートするノートのファイル名の組み立て方を選べます（詳細設定 → **ファイル名スキーム**）:

- **`title-id`**（デフォルト）: `{title}-{会話ID}.md` — 会話タイトルが変わっても安定。
- **`title-date`**: `{title}-{YYYY}-{MM}-{DD}.md` — ローカルの保存日を使用。

意図したファイル名が**別の**会話に既に使われている場合、拡張機能は上書きせず安全な代替名で保存します。

## 画像エクスポート

Gemini が生成した画像は会話と一緒にエクスポートされます（デフォルトで有効。詳細設定の **画像をエクスポート** で切り替え）。各画像は base64 として捕捉され、出力先ごとに解決されます:

- **Obsidian**: 画像は **画像フォルダ**（デフォルト `AI/{platform}/images`、vault パスと同じテンプレートトークンに対応）配下の vault に書き込まれ、本文は `![[filename]]` ウィキリンクで埋め込みます。
- **ファイルダウンロード**: Markdown ファイルと各画像を別々のファイルとしてダウンロードします。
- **クリップボード**: 画像プレースホルダは除去されます（バイナリはコピーされません）。

Gemini は生成画像を、ページ側でしか読めない `blob:` URL か、Google の画像 CDN（`googleusercontent.com`）のいずれかで配信します。本拡張機能は `blob:` URL をページ内で読み取り、CDN 上の画像はバックグラウンドワーカーでダウンロードします（ブラウザがページからの直接取得をブロックするため）。`googleusercontent.com` へのアクセス権限を要求しているのはこのためで、あなたがエクスポートを指示した画像のダウンロードにのみ使用します。

ガード: 1ノートあたり最大20画像、1画像あたり最大10MB。追記モードでは画像プレースホルダを除去します（追記モードでの画像処理は今後対応）。画像を保存できなかった場合もノート自体は書き込まれ、スキップした画像名が警告として表示されます。

## 開発

開発環境は Nix が管理します（[ADR-010](docs/adr/010-nix-only-dev-environment.md) 参照）。`direnv` + `nix-direnv` を入れていればディレクトリ移動時に自動で環境が読み込まれます。そうでない場合は `nix develop` を実行してください。

すべてのワークフローに Nix エントリポイント（正規）と `npm run` エイリアス（互換）があります。詳細は [ADR-011](docs/adr/011-nix-task-surface.md) を参照。

| ワークフロー                   | Nix（正規）                                     | npm（エイリアス）              |
| ------------------------------ | ----------------------------------------------- | ------------------------------ |
| 開発サーバー（HMR）            | `nix run .#dev`                                 | `npm run dev`                  |
| プロダクションビルド           | `nix run .#build`                               | `npm run build`                |
| ビルド + ストア用 zip          | `nix run .#build-zip`                           | `npm run build:zip`            |
| リント                         | `nix run .#lint`                                | `npm run lint`                 |
| プラットフォーム整合性チェック | `nix run .#lint-platforms`                      | `npm run lint:platforms`       |
| フォーマット（書き込み）       | `nix run .#format`                              | `npm run format`               |
| フォーマット（チェック）       | `nix run .#format-check`                        | `npm run format:check`         |
| テスト                         | `nix run .#test`                                | `npm test`                     |
| テスト（watch）                | `nix run .#test-watch`                          | `npm run test:watch`           |
| カバレッジ付きテスト           | `nix run .#test-coverage`                       | `npm run test:coverage`        |
| E2E 認証セットアップ           | `nix run .#e2e-auth`                            | `npm run e2e:auth`             |
| E2E セレクター検証             | `nix run .#e2e-selectors`                       | `npm run e2e:selectors`        |
| E2E セレクター（headed）       | `nix run .#e2e-selectors-headed`                | `npm run e2e:selectors:headed` |
| CDP デーモン                   | `nix run .#e2e-daemon -- <start\|stop\|status>` | `npm run e2e:daemon:<sub>`     |

> [!NOTE]
> Nix の属性名にはコロンが使えないため、`e2e:auth` のような名前は `e2e-auth` にマッピングされます。CDP デーモンはサブコマンドを引数で渡します: `nix run .#e2e-daemon -- start`。

`node_modules/` が無い状態で Nix エントリポイントを起動するとエラーになり、`npm ci` を実行するよう案内されます。依存関係の自動インストールは意図的に行いません。

## アーキテクチャ

```
Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai, notebook.google.com + legacy notebooklm.google.com)
    ↓ 会話 / Deep Research / Artifacts を抽出
Background Service Worker
    ↓ Obsidian に送信
Obsidian Local REST API (デフォルト: http://127.0.0.1:27123)
```

### 主要コンポーネント

| コンポーネント                         | 説明                                              |
| -------------------------------------- | ------------------------------------------------- |
| `src/content/`                         | DOM 抽出と UI 用のコンテンツスクリプト            |
| `src/content/extractors/gemini.ts`     | Gemini 会話 & Deep Research 抽出                  |
| `src/content/extractors/claude.ts`     | Claude 会話 & Artifact 抽出                       |
| `src/content/extractors/chatgpt.ts`    | ChatGPT 会話抽出                                  |
| `src/content/extractors/perplexity.ts` | Perplexity 会話抽出                               |
| `src/content/extractors/notebooklm.ts` | Gemini Notebook チャット & ソース引用抽出         |
| `src/content/image-capture.ts`         | Gemini 生成画像をページコンテキストで base64 捕捉 |
| `src/background/`                      | API 通信用のサービスワーカー                      |
| `src/lib/image-output.ts`              | 出力先ごとに画像プレースホルダを解決              |
| `src/popup/`                           | 設定 UI                                           |
| `src/lib/`                             | 共有ユーティリティと型定義                        |

## HTTPS 設定（オプション）

Obsidian Local REST API への HTTPS 接続をサポートしています。以下のような場合に便利です:

- Local REST API が HTTPS（自己署名証明書）で構成されている場合
- ローカルネットワーク（LAN）上の Obsidian インスタンスに接続したい場合

### macOS

1. Obsidian REST API から**証明書を取得**:

   ```bash
   openssl s_client -connect 127.0.0.1:27124 -showcerts \
     </dev/null 2>/dev/null | openssl x509 -outform PEM > obsidian-cert.pem
   ```

2. macOS キーチェーンに**信頼されたルート証明書として登録**:

   ```bash
   sudo security add-trusted-cert -d -r trustRoot \
     -k /Library/Keychains/System.keychain obsidian-cert.pem
   ```

3. **Chrome を完全に再起動**（Cmd+Q → 再起動）。タブの再読み込みでは不十分です。

4. 拡張機能のポップアップで **API URL** に HTTPS エンドポイントを設定（例: `https://127.0.0.1:27124`）。

> **注意**: Obsidian が証明書を再生成した場合（プラグインアップデート後など）、新しい証明書を再取得・再登録する必要があります。Chrome 拡張機能はOS レベルの証明書信頼を要求します。ブラウザで「詳細設定 → アクセスする」から例外的にアクセスした証明書は、拡張機能の Service Worker には適用されません。

### Windows / Linux

OS の証明書ストアに証明書をインポートし、Chrome を再起動してください。基本的なアプローチは同じです — 証明書はブラウザレベルではなく、OS レベルで信頼される必要があります。

## セキュリティ

- **安全なストレージ**: API キーは `chrome.storage.local` に保存（クラウド同期なし）
- **入力検証**: メッセージ内容とファイル名を検証
- **パストラバーサル対策**: ディレクトリトラバーサル攻撃からの保護
- **送信元検証**: 信頼されたオリジンからのメッセージのみ受け入れ
- **CSP**: 拡張機能ページに Content Security Policy を設定
- **YAML エスケープ**: フロントマター値を適切にエスケープ

## プライバシー

この拡張機能は:

- データ収集を**行わず**、解析・テレメトリの送信も一切**行いません**
- 会話の送信先は Obsidian インスタンスのみ（デフォルト: 127.0.0.1、LAN アクセス用に設定変更可能）
- 画像エクスポート有効時は、Google の画像 CDN（`googleusercontent.com`）から生成画像をダウンロードします — AI のページが既に画像を読み込んでいるのと同じホストで、対象はエクスポート中の会話に含まれる画像のみです
- API キーはブラウザにローカル保存（クラウド同期なし）

詳細は[プライバシーポリシー](https://sho7650.github.io/obsidian-AI-exporter/privacy.html)をご覧ください。

## ライセンス

MIT

## コントリビュート

コントリビューションを歓迎します！開発ガイドラインについては [CLAUDE.md](CLAUDE.md) をご覧ください。
