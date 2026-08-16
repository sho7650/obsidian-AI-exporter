Gemini、Claude、ChatGPT、Perplexity、Gemini Notebook の AI 会話をワンクリックで Obsidian に保存。

🎯 できること
Google Gemini（gemini.google.com）、Claude AI（claude.ai）、ChatGPT（chatgpt.com）、Perplexity（www.perplexity.ai）、Gemini Notebook／旧 NotebookLM（notebook.google.com）から会話を抽出し、美しく整形された Markdown ノートとしてエクスポートします。

☕ 3つのエクスポート方法
• Obsidian：Local REST API プラグイン経由で vault に直接保存
• ファイル：.md ファイルとしてダウンロード
• クリップボード：整形済み Markdown をコピーしてどこにでも貼り付け

✨ 主な機能
• Gemini、Claude、ChatGPT、Perplexity、Gemini Notebook の会話をワンクリックでエクスポート
• YAML フロントマター付きの整形された Markdown
• Q&A ブロックに Obsidian コールアウト構文（正しい AI 名を表示）
• Deep Research（Gemini、Perplexity）と Extended Thinking / Artifacts（Claude）に対応
• ソース引用 - Gemini Notebook のチャット引用を footnote 形式でエクスポート
• 画像エクスポート - Gemini 生成画像を vault に埋め込み・ファイルとしてダウンロード・クリップボードでは除去
• フロントマター日時のタイムゾーン設定
• LaTeX 数式の保存（$$...$$・$...$）- 全プラットフォーム対応
• 入れ子のコードブロック - コードブロック内のコードブロックもそのまま保存
• Web 検索結果を折りたたみ可能なコールアウトとして保存（Claude）
• 追記モード - 既存ノートに新しいメッセージのみ追加
• 質問見出し（`## `）オプション - 長い会話で目次ナビゲーション可能
• 長い会話の自動スクロール - 仮想化（ウィンドウ化）された Claude・ChatGPT スレッドにも対応、タイムアウトは設定可能
• ファイル名スキーム - title-id（デフォルト）または title-date を選択、衝突時の上書き防止付き。読み込み途中の内容で完全なノートを置き換えることもしません
• 長大コールアウトの平坦化 - 非常に長いメッセージをプレーンテキストで保存し Obsidian の描画を軽快に保つ
• {platform} テンプレート変数によるプラットフォーム別整理
• Obsidian REST API への HTTPS 接続をサポート
• API URL、保存先パス、メッセージ形式、フロントマターフィールドをカスタマイズ可能
• 英語・日本語 UI 対応
• アカウント登録・クラウドサービス不要

🔒 プライバシー重視
• すべての処理はお使いの端末上で実行
• 解析・テレメトリ・データ収集は一切なし - 会話は処理してあなたの端末に保存するだけ
• 会話の送信先はあなた自身の Obsidian vault のみ
• 画像エクスポートは Google の画像 CDN から画像を取得 - AI のページが既に使用しているホストと同じ
• API キーはローカルストレージに安全に保存
• オープンソース：https://github.com/sho7650/obsidian-AI-exporter

💻 必要なもの
Obsidian 連携の場合：
• Obsidian に「Local REST API」プラグインをインストール・有効化
• Local REST API プラグイン設定から API キーを取得

ファイルダウンロードとクリップボードは設定不要で利用可能。

🚀 使い方

1. gemini.google.com、claude.ai、chatgpt.com、www.perplexity.ai、notebook.google.com で会話を開く
2. ページに表示される紫色の「Sync」ボタンをクリック
3. エクスポート方法を選択：Obsidian、ファイル、またはクリップボード
4. 完了！会話が Markdown として保存されます

研究者、学生、AI との会話から個人のナレッジベースを構築したいすべての方に最適です。
