# Obsidian AI Exporter

Google Gemini、Claude AI、ChatGPT、Perplexity、Gemini Notebook（旧 NotebookLM）の会話を Obsidian に保存する Chrome 拡張機能です。Local REST API を使用してローカル環境で動作します。

[English version](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue)](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

## 機能

- **マルチプラットフォーム対応**: Google Gemini、Claude AI、ChatGPT、Perplexity、Gemini Notebook（旧 NotebookLM）からエクスポート
- **ワンクリック保存**: 対応する AI のページに浮かぶ「Sync」ボタンで保存
- **同期ステータスの常設表示**: 同期が終わっても、同期ボタンに ✓ / ! / × のバッジが残ります。クリックすると、ファイル名、保存先ごとの結果、警告、同期した時刻を確認できます。バッジが消えるのは、会話を切り替えたとき、バッジを閉じたとき、Claude と ChatGPT で同期より新しいメッセージが表示されたときです
- **複数の出力オプション**: Obsidian への保存、ファイルとしてダウンロード、クリップボードへのコピー
- **Deep Research 対応**: Gemini Deep Research、Claude Extended Thinking、Perplexity Deep Research のレポートを保存
- **Artifact 対応**: Claude の Artifact を、インライン引用と出典付きで抽出
- **画像エクスポート**: Gemini と ChatGPT が生成した画像を会話と一緒に保存。Obsidian では Vault に埋め込み、ファイル出力では別ファイルとしてダウンロードします。クリップボードにコピーするときは画像を除きます
- **ソース引用**: Gemini Notebook のチャットの引用を脚注としてエクスポート
- **自動スクロール**: 長い会話のメッセージを自動ですべて読み込み。一度に一部のターンだけを読み込む（仮想化された）Claude・ChatGPT のスレッドにも対応します。非常に長い会話に合わせて 2 つのタイムアウト（アイドル: 既定 15 秒／全体: 既定 300 秒）を延長でき、特に長いものではノートサイズの上限（既定 8 MiB、最大 16 MiB）も引き上げられます
- **追記モード**: 既存のノートには新しいメッセージだけを追加
- **ファイル名スキーム**: エクスポートするノートの名前の付け方を `title-id`（既定）か `title-date` から選択
- **Vault パステンプレート**: `{platform}` と日付トークン（`{YYYY}`、`{MM}` など）で保存先のフォルダを自動で振り分け
- **ファイル名衝突対策**: 別の会話のノートは上書きしません。途中までしか読み込めなかった内容で、完全なノートを置き換えることもありません
- **ツールコンテンツ対応**: Claude が実行したステップ（Web 検索、ツール呼び出し）を、折りたたみ可能な `[!ABSTRACT]` コールアウトとして保存（オプション）
- **質問見出し（オプション）**: 長い会話でも目次から各質問に移動できるよう、各ユーザーメッセージの前に `## ` 見出し（質問の冒頭 60 文字）を追加
- **長大コールアウトの平坦化（オプション）**: Obsidian に保存するとき、非常に長いメッセージをプレーンテキストにして、描画が遅くなるのを防ぎます。しきい値の行数は設定でき、既定は 200 行です
- **タイムゾーン設定**: フロントマターの日時（created/modified）に使うタイムゾーンを指定
- **数式の保存**: LaTeX の数式（`$...$`・`$$...$$`）をすべてのプラットフォームで保持し、Obsidian の数式レンダラーで表示
- **入れ子のコードブロック**: コードブロックを含むコードブロックも、内容に合わせてフェンスを調整。Markdown について書かれた回答もそのまま保存できます
- **メッセージ形式**: Obsidian のコールアウト（既定）・引用ブロック・プレーンテキストから選択。`[!QUESTION]` / `[!NOTE]` のコールアウト種類も話者ごとに設定できます
- **YAML フロントマター**: タイトル、ソース、URL、日時、タグなどのメタデータ。タグ名は `{platform}` トークンを使って設定でき、Vault で使っているタグに合わせられます
- **カスタマイズ可能**: 保存先パス、テンプレート、フロントマターの項目を設定可能
- **多言語対応**: 英語と日本語の UI

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
3. Chrome で拡張機能のアイコンをクリックし、次の項目を入力:
   - **Obsidian API キー**: Local REST API の API キー
   - **API URL**: 既定は `http://127.0.0.1:27123`。HTTPS にも対応しています（[HTTPS 設定](#https-設定オプション)を参照）
   - **保存先パス**: Vault 内のフォルダパス（例: `AI/{platform}` にすると、ソースごとに自動で振り分けます）

## 使い方

### Gemini

1. [gemini.google.com](https://gemini.google.com) で会話を開く（通常のチャットと Gem の会話の両方に対応）
2. 右下の紫色の「Sync」ボタンをクリック
3. 選んだ出力先に会話がエクスポートされます:
   - **Obsidian**（既定）: Local REST API 経由で Vault に直接保存
   - **ファイル**: Markdown ファイルとしてダウンロード
   - **クリップボード**: クリップボードにコピー（どこにでも貼り付けられます）

Gemini と ChatGPT が生成した画像も、自動で取り込んでエクスポートします（[画像エクスポート](#画像エクスポート)を参照）。

### Claude

1. [claude.ai](https://claude.ai) で会話を開く
2. 右下の紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力先に会話がエクスポートされます

> **長い会話では、設定の Auto-scroll を有効にしておいてください。** Claude は一度に一部のターンしか読み込まず、画面外のターンは破棄します。自動スクロールが無効だと、その時点で画面に表示されているターンしかエクスポートできません。

> **非常に長い会話では時間が足りないことがあります。** 自動スクロールは、進捗のない状態が 15 秒続くか、合計 300 秒経つと止まります。途中で止まったという警告が出たら、詳細設定の**自動スクロールのアイドル待機時間**か**自動スクロールの上限時間**を大きくして、もう一度同期してください。どちらで止まったかは警告に書かれています。ノート本文の上限は既定で 8 MiB です。同期が「above the … limit」で失敗したら、詳細設定の**ノートの最大サイズ**を大きくしてください（最大 16 MiB）。

### ChatGPT

1. [chatgpt.com](https://chatgpt.com) で会話を開く（通常のチャットと、URL に `/g/` を含むカスタム GPT の両方に対応）
2. 右下の紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力先に会話がエクスポートされます

> **長い会話では、設定の Auto-scroll を有効にしておいてください。** ChatGPT は一度に一部のターンしか読み込まず、画面外のターンは破棄します。自動スクロールが無効だと、その時点で画面に表示されているターンしかエクスポートできません。

> **非常に長い会話では時間が足りないことがあります。** 自動スクロールは、進捗のない状態が 15 秒続くか、合計 300 秒経つと止まります。途中で止まったという警告が出たら、詳細設定の**自動スクロールのアイドル待機時間**か**自動スクロールの上限時間**を大きくして、もう一度同期してください。どちらで止まったかは警告に書かれています。ノート本文の上限は既定で 8 MiB です。同期が「above the … limit」で失敗したら、詳細設定の**ノートの最大サイズ**を大きくしてください（最大 16 MiB）。

> **ChatGPT の Deep Research レポートはエクスポートできません。** [Deep Research / Extended Thinking の保存](#deep-research--extended-thinking-の保存)を参照してください。

### Perplexity

1. [www.perplexity.ai](https://www.perplexity.ai) で会話を開く
2. 右下の紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力先に会話がエクスポートされます

### Gemini Notebook（旧 NotebookLM）

1. [notebook.google.com](https://notebook.google.com) でノートブックを開く（旧 `notebooklm.google.com` のリンクも、Google がリダイレクトするのでそのまま使えます）
2. 右下の紫色の「Sync」ボタンをクリック
3. チャットの会話が、ソースの引用を脚注にした形でエクスポートされます

### Deep Research / Extended Thinking の保存

**Gemini Deep Research:**

1. Deep Research のパネルを開く（展開した状態にする）
2. 「Sync」ボタンをクリック
3. レポート全体が、元の見出し構造のまま保存されます

**Claude Extended Thinking（Artifacts）:**

1. Artifact を含む会話を開く
2. 「Sync」ボタンをクリック
3. Artifact の内容が、インライン引用と出典付きで抽出されます

**Perplexity Deep Research:**

1. Deep Research のレポートを含む Perplexity の会話を開き、レポート自体も開く（カードをクリック）。Perplexity はレポートを開いたときに初めて本文を読み込むので、折りたたんだままのレポートはエクスポートできません
2. 「Sync」ボタンをクリック
3. レポートの内容が、通常の会話メッセージと一緒に抽出されます

**ChatGPT Deep Research: 非対応。**

ChatGPT は Deep Research のレポートを、別オリジン（`*.oaiusercontent.com`）から配信されるサンドボックス化された iframe の中に描画します。ブラウザ拡張機能にはこれを読み取る権限がなく、レポートを展開しても取得できません。プロンプトだけでレポートのないノートを保存してしまわないよう、拡張機能は何が起きたかを知らせます:

- Deep Research のレポートだけの会話は保存せず、理由を表示します。
- 通常のメッセージとレポートが混在する会話では、通常のメッセージを保存し、レポートを飛ばしたことを警告します。

カスタム GPT を含め、通常の ChatGPT の会話には影響しません。対応状況は [issue #283](https://github.com/sho7650/obsidian-AI-exporter/issues/283) で追っています。

## 出力フォーマット

### 会話形式

会話は、YAML フロントマター付きの Markdown ファイルとして保存されます:

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

詳細設定の**メッセージ形式**で、上のコールアウトを引用ブロックやプレーンテキストに切り替えられます。**ユーザーのコールアウト種類**と**アシスタントのコールアウト種類**で、`QUESTION` / `NOTE` のキーワードを変更できます。

**会話のタグ**と **Deep Research のタグ**（詳細設定 → フロントマター設定）で、`tags:` の中身を Vault で使っているタグに合わせられます。どちらもカンマ区切りで入力します。`{platform}` はソース id（`gemini`、`claude`、`chatgpt`、`perplexity`、`notebooklm`）に置き換わり、`ai/chat` のような階層タグも使えます。欄を空にすると既定値（`ai-conversation, {platform}` と `ai-research, deep-research, {platform}`）に戻ります。各項目は Obsidian のタグの規則（文字・数字・`_`・`-`・`/` のみ、空白は不可）に従います。規則に合わない項目が 1 つでもあると、その欄全体が既定値に戻ります。Vault にある既存のノートは書き換えず、追記モードでも `tags:` ブロックはそのまま残ります。

コードブロックのフェンスは、内容に合わせた長さにします。AI に `README.md` やプロンプトを書かせたときのように、ブロックの中にさらにフェンス付きのブロックがあると、外側のフェンスをバッククォート 4 つ以上に伸ばし、内側のフェンスを内容の一部として残します。これは Obsidian のドキュメントにあるネストの書き方です。ページにはレンダリング後のコードしかなく、元のフェンス文字は復元できないため、外側のフェンスは常にバッククォートになります。

### ツールコンテンツ形式（Claude）

「ツール/検索結果を含める」を有効にすると、Claude が回答のために実行したステップ（Web 検索、ツール呼び出し）が、アシスタントの応答の前に折りたたみ可能なコールアウトとして出力されます:

```markdown
> [!ABSTRACT]- Searched the web

> [!NOTE] Claude
> Rust の最新バージョンについて...
```

`[!ABSTRACT]-` の末尾の `-` により、このコールアウトは Obsidian で最初から折りたたまれて表示されます。保存されるのは各ステップのラベルだけです。検索クエリや結果の一覧は Claude のページ上で折りたたまれており、拡張機能はそれをクリックして展開しません。1 つの回答に複数のステップがあるときは、最初のラベルがコールアウトのタイトルになり、残りのラベルはその中に 1 行ずつ並びます。思考（Thinking）のステップはツール活動に含めないので、ここには保存されません。

### Deep Research 形式

Deep Research のレポートには `type` フィールドが加わり、元の構造のまま保存されます:

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

**保存先パス**にはテンプレートトークンを書けます。トークンは保存時に値に置き換わるので、ノートを自動で整理できます。既定値は `AI/{platform}` です。

| トークン     | 置き換わる値                                                          |
| ------------ | --------------------------------------------------------------------- |
| `{platform}` | ソース名（`gemini`、`claude`、`chatgpt`、`perplexity`、`notebooklm`） |
| `{YYYY}`     | 4桁の年（ローカル時間、例: `2026`）                                   |
| `{YY}`       | 2桁の年（ローカル時間、例: `26`）                                     |
| `{MM}`       | 2桁のゼロ埋め月（例: `07`）                                           |
| `{DD}`       | 2桁のゼロ埋め日（例: `08`）                                           |

例: `AI/{platform}/{YYYY}/{MM}` にすると、ノートを月ごとのフォルダに振り分けます。日付トークンはローカルのタイムゾーンで決まります。追記モードでは、月が変わっても、既存の会話は元のファイルを更新し続けます。

注意: Gemini Notebook の `{platform}` は、リブランド後も `notebooklm` のままです。そのため、ノートは既存のノートと同じフォルダに保存され続けます。

### ファイル名スキーム

エクスポートするノートのファイル名の付け方を選べます（詳細設定 → **ファイル名スキーム**）:

- **`title-id`**（既定）: `{title}-{会話ID}.md`。会話のタイトルが変わっても安定します。
- **`title-date`**: `{title}-{YYYY}-{MM}-{DD}.md`。日付はローカルの保存日です。

意図したファイル名がすでに**別の**会話で使われている場合は、上書きせず、安全な別の名前で保存します。

また、自動スクロールが途中で止まったエクスポートは、Vault にある既存のノートのほうがメッセージ数が多い場合、書き込まずに中止します。何も上書きされず、両方の件数がメッセージに表示されます。途中までしか取得できなかった内容が、完全なノートを置き換えることはありません。

## 画像エクスポート

Gemini と ChatGPT が生成した画像は、会話と一緒にエクスポートされます（既定で有効。詳細設定の**画像を書き出す**で切り替えられます）。各画像は base64 として取り込まれ、出力先ごとに次のように扱われます:

- **Obsidian**: 画像は **画像フォルダ**（既定 `AI/{platform}/images`。保存先パスと同じテンプレートトークンが使えます）の下に保存され、本文には `![[filename]]` のウィキリンクで埋め込まれます。
- **ファイルダウンロード**: Markdown ファイルと各画像を、別々のファイルとしてダウンロードします。
- **クリップボード**: 画像のプレースホルダは取り除かれます（画像データはコピーされません）。

Gemini は生成画像を、ページからしか読めない `blob:` URL か、Google の画像 CDN（`googleusercontent.com`）から配信します。拡張機能は、`blob:` URL の画像はページ内で読み取り、CDN の画像はバックグラウンドワーカーでダウンロードします。ブラウザが、ページから CDN の画像を直接取得することをブロックするためです。この CDN はダウンロードを `lh3.google.com` にリダイレクトするので、拡張機能は両方のホストへのアクセス権限を求めます。どちらも、エクスポートを指示した画像のダウンロードにだけ使います。

ChatGPT は生成画像を `chatgpt.com` 自身から配信するので、ページが既存のセッションでそのまま取得します。追加のホスト権限は使いません。ChatGPT の画像のターンには本文がないため、画像だけのメッセージとしてエクスポートされます。

制限: 1 ノートあたり最大 20 枚、1 枚あたり最大 10 MB。追記モードでは画像のプレースホルダを取り除きます（追記モードでの画像の扱いは後回しにしています）。画像を保存できなかった場合もノートは書き込まれ、保存できなかった画像の名前が警告に表示されます。

## 開発

開発環境は Nix で用意します（[ADR-010](docs/adr/010-nix-only-dev-environment.md) を参照）。`direnv` と `nix-direnv` を入れていれば、ディレクトリに移動したときに環境が自動で読み込まれます。入れていない場合は `nix develop` を実行してください。

どのワークフローにも、Nix のエントリポイント（正規）と `npm run` のエイリアス（互換用）があります。詳しくは [ADR-011](docs/adr/011-nix-task-surface.md) を参照してください。

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
> Nix の属性名にはコロン（`:`）を使えないため、`e2e:auth` のような npm スクリプト名は `e2e-auth` に対応させています。CDP デーモンは、サブコマンドを引数として受け取ります: `nix run .#e2e-daemon -- start`。

`node_modules/` がない状態で Nix のラッパーを実行すると、先に `npm ci` を実行するよう案内して終了します。依存関係の自動インストールは、意図して行っていません。

## アーキテクチャ

```
Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai, notebook.google.com + legacy notebooklm.google.com)
    ↓ 会話 / Deep Research / Artifacts を抽出
Background Service Worker
    ↓ Obsidian に送信
Obsidian Local REST API (既定: http://127.0.0.1:27123)
```

### 主要コンポーネント

| コンポーネント                         | 説明                                       |
| -------------------------------------- | ------------------------------------------ |
| `src/content/`                         | DOM 抽出と UI 用のコンテンツスクリプト     |
| `src/content/extractors/gemini.ts`     | Gemini 会話 & Deep Research 抽出           |
| `src/content/extractors/claude.ts`     | Claude 会話 & Artifact 抽出                |
| `src/content/extractors/chatgpt.ts`    | ChatGPT 会話抽出                           |
| `src/content/extractors/perplexity.ts` | Perplexity 会話抽出                        |
| `src/content/extractors/notebooklm.ts` | Gemini Notebook チャット & ソース引用抽出  |
| `src/content/image-capture.ts`         | 生成画像をページコンテキストで base64 捕捉 |
| `src/background/`                      | API 通信用のサービスワーカー               |
| `src/lib/image-output.ts`              | 出力先ごとに画像プレースホルダを置き換え   |
| `src/popup/`                           | 設定 UI                                    |
| `src/lib/`                             | 共有ユーティリティと型定義                 |

## HTTPS 設定（オプション）

Obsidian Local REST API には HTTPS でも接続できます。次のような場合に役立ちます:

- Local REST API を HTTPS（自己署名証明書）で動かしている
- ローカルネットワーク（LAN）上の Obsidian に接続したい

### macOS

1. 起動中の Obsidian REST API から**証明書を取り出す**:

   ```bash
   openssl s_client -connect 127.0.0.1:27124 -showcerts \
     </dev/null 2>/dev/null | openssl x509 -outform PEM > obsidian-cert.pem
   ```

2. 信頼されたルート証明書として **macOS のキーチェーンに登録**:

   ```bash
   sudo security add-trusted-cert -d -r trustRoot \
     -k /Library/Keychains/System.keychain obsidian-cert.pem
   ```

3. **Chrome を完全に再起動**（Cmd+Q で終了してから起動し直す）。タブを再読み込みするだけでは足りません。

4. 拡張機能のポップアップで、**API URL** に HTTPS のエンドポイントを設定（例: `https://127.0.0.1:27124`）。

> **注意**: プラグインの更新などで Obsidian が証明書を作り直した場合は、新しい証明書を取り出して登録し直す必要があります。Chrome 拡張機能が証明書を信頼するには、OS での信頼の設定が必要です。ブラウザの警告画面で「詳細設定 → アクセスする」から進んだ例外は、拡張機能の Service Worker には適用されません。

### Windows / Linux

OS の証明書ストアに証明書をインポートし、Chrome を再起動してください。考え方は macOS と同じで、証明書はブラウザで受け入れるだけでなく、OS で信頼されている必要があります。

## セキュリティ

- **安全なストレージ**: API キーは `chrome.storage.local` に保存（クラウド同期なし）
- **入力検証**: メッセージの内容とファイル名を検証
- **パストラバーサル対策**: ディレクトリトラバーサル攻撃を防ぐよう保存先パスを検査
- **送信元検証**: 信頼できるオリジンからのメッセージだけを受け付け
- **CSP**: 拡張機能のページに Content Security Policy を設定
- **YAML エスケープ**: フロントマターの値を正しくエスケープ
- **ノートに生の HTML を残さない**: Obsidian で生の HTML として描画されるページ由来のテキストは、ノートの書き込み・ダウンロード・コピーの直前にエスケープします。そのため、エクスポートした会話が外部のリソースを読み込んだり、Vault にマークアップを紛れ込ませたりすることはありません

## プライバシー

この拡張機能は:

- データを**収集せず**、解析やテレメトリもどこにも**送信しません**
- 会話を送る先は、あなたの Obsidian だけです（既定: 127.0.0.1。LAN 上の Obsidian に接続するよう変更もできます）
- 生成画像をダウンロードするのは、画像エクスポートが有効なときだけで、対象はエクスポート中の会話にある画像だけです。Gemini の画像は Google の画像 CDN（`googleusercontent.com`。`lh3.google.com` にリダイレクトされます）から、ChatGPT の画像は `chatgpt.com` 自身から取得します。どちらも、AI のページがもともと画像を読み込んでいるのと同じホストです
- API キーはブラウザ内に保存します（クラウドに同期しません）

詳細は[プライバシーポリシー](https://sho7650.github.io/obsidian-AI-exporter/privacy.html)をご覧ください。

## ライセンス

MIT

## コントリビュート

コントリビューションを歓迎します！開発のガイドラインは [CLAUDE.md](CLAUDE.md) を参照してください。

[![Buy Me a Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=sho7650&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/sho7650)
