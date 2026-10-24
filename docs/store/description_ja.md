Gemini、Claude、ChatGPT、Perplexity、Gemini Notebook の AI 会話を、ワンクリックで Obsidian に保存。

🎯 できること
Google Gemini（gemini.google.com）、Claude AI（claude.ai）、ChatGPT（chatgpt.com）、Perplexity（www.perplexity.ai）、Gemini Notebook（旧 NotebookLM、notebook.google.com）の会話を抽出し、美しく整形された Markdown ノートとしてエクスポートします。

☕ 3つのエクスポート方法
• Obsidian：Local REST API プラグイン経由で Vault に直接保存
• ファイル：.md ファイルとしてパソコンにダウンロード
• クリップボード：整形済みの Markdown をコピーして、どこにでも貼り付け

✨ 主な機能
• Gemini、Claude、ChatGPT、Perplexity、Gemini Notebook の会話をワンクリックでエクスポート
• 同期ステータスのバッジ - 同期のたびにボタンに ✓ / ! / × が残り、クリックするとファイル名、保存先ごとの結果、同期した時刻を確認できる
• YAML フロントマター付きの整った Markdown
• 質問と回答のブロックに Obsidian のコールアウト構文を使用（AI の名前を正しく表示）
• Deep Research（Gemini、Perplexity）と Extended Thinking / Artifacts（Claude）に対応
• ソース引用 - Gemini Notebook のチャットの引用を脚注としてエクスポート
• 画像エクスポート - Gemini と ChatGPT が生成した画像を、Vault に埋め込むか、ファイルとしてダウンロード（クリップボードでは除去）
• フロントマターの日時に使うタイムゾーンを設定可能
• LaTeX 数式（$$...$$・$...$）をすべてのプラットフォームで保持
• 入れ子のコードブロック - コードブロックの中のコードブロックも崩さず保存
• Claude の Web 検索やツールのステップを、折りたたみ可能なコールアウトとして保存
• 追記モード - 既存のノートには新しいメッセージだけを追加
• 長い会話でも目次から各質問に移動できる `## ` の質問見出し（オプション）
• 長い会話の自動スクロール - 一度に一部のターンだけを読み込む（仮想化された）Claude・ChatGPT のスレッドにも対応。タイムアウトとノートサイズの上限は設定可能
• ファイル名スキーム - title-id（既定）か title-date を選択。上書き防止付きで、名前が衝突しても別の会話のノートを上書きせず、途中までしか読み込めなかった内容で完全なノートを置き換えることもない
• 長大コールアウトの平坦化 - 非常に長いメッセージをプレーンテキストで保存し、Obsidian の動作を軽快に保つ
• {platform} テンプレート変数で、プラットフォームごとにノートを整理
• フロントマターのタグを設定可能 - 既定のタグを、Vault で使っているタグに合わせて変更・削除できる。{platform} トークンにも対応
• Obsidian REST API への HTTPS 接続に対応
• API URL、保存先パス、メッセージ形式、フロントマターの項目をカスタマイズ可能
• 英語・日本語の UI に対応
• アカウント登録もクラウドサービスも不要

🔒 プライバシー重視
• すべての処理はお使いの端末上で実行
• 解析・テレメトリ・データ収集は一切なし - 会話は処理したあと、あなたの端末に保存するだけ
• 会話の送信先は、あなた自身の Obsidian の Vault だけ
• 画像エクスポートで画像を取得するのは、AI のページがもともと画像を読み込んでいるホストだけ（Gemini は Google の画像 CDN、ChatGPT は chatgpt.com）
• API キーはローカルストレージにだけ安全に保存
• オープンソース：https://github.com/sho7650/obsidian-AI-exporter

💻 必要なもの
Obsidian と連携する場合：
• Obsidian に「Local REST API」プラグインをインストールして有効化
• Local REST API プラグインの設定から API キーを取得

ファイルのダウンロードとクリップボードへのコピーは、設定なしで使えます。

🚀 使い方

1. gemini.google.com、claude.ai、chatgpt.com、www.perplexity.ai、notebook.google.com で会話を開く
2. ページに表示される紫色の「Sync」ボタンをクリック
3. エクスポート方法を選ぶ：Obsidian、ファイル、クリップボード
4. 完了！会話が Markdown として保存されます

研究者や学生をはじめ、AI との会話から自分のナレッジベースを作りたいすべての方に最適です。
