# REQ-084: Tool-Use / Intermediate Content Opt-in

## Issue

- GitHub: #84 — Not all of Claude's output is being saved
- Priority: High (ユーザー体験に直接影響)

## Background

各AIプラットフォームにはツール使用時の中間コンテンツ（Web検索結果、コード実行結果、ファイル分析等）がある。これらは意図的に保存対象外としていたが、ユーザーからの要望により opt-in 設定で保存可能にする。

### 各プラットフォームの中間コンテンツ

| Platform | Intermediate Content | DOM特徴 |
|----------|---------------------|---------|
| **Claude** | Web Search結果、ファイル分析、Code Interpreter | 親divにクラスなし、子要素に `font-claude-response-body`、折りたたみ可能なサマリーボタン |
| **ChatGPT** | Web Browsing、DALL-E生成、Code Interpreter、Canvasツール | 調査要 |
| **Gemini** | Google Search統合、Extensions連携 | 調査要 |
| **Perplexity** | ソース検索・引用パネル | 調査要 |

## Solution Approach

Advanced Settings に単一グローバルトグルを追加し、中間コンテンツの保存を制御する。

## Functional Requirements

### FR-1: Advanced Settings トグル追加

- 設定名: `enableToolContent` (仮)
- ラベル: "Include tool/search results" (i18n対応)
- 位置: Advanced Settings パネル内、既存のMessage Format セクションの上または下
- デフォルト: OFF (既存動作を維持)
- UIパターン: 既存の `role="switch"` トグルスイッチに準拠

### FR-2: 設定の永続化

- `SyncSettings` に `enableToolContent: boolean` を追加
- `chrome.storage.sync` に保存（既存パターンに準拠）
- デフォルト値: `false`

### FR-3: Claude — ツール使用応答の抽出

- `enableToolContent: true` の場合:
  - 現在のセレクタ (`font-claude-response`) に加え、ツール使用応答のDOM構造も抽出対象にする
  - ツール使用応答の特徴: 親divにクラスなし、`grid grid-rows-[auto_auto]` レイアウト、子要素に `font-claude-response-body`
  - 折りたたみサマリー（「Gathered API documentation...」等）の処理方針を決定する（含める or フィルタする）
- `enableToolContent: false` の場合:
  - 現在の動作を維持（ツール使用応答をスキップ）

### FR-4: queryAllWithFallback の改善

- 現在の「最初にマッチしたセレクタで全結果を返す」設計では、通常応答とツール使用応答が混在する場合に後者が漏れる
- `enableToolContent: true` 時は、全セレクタの結果を集約し、DOM順にソートして重複排除する方式を検討
- 既存の挙動（`enableToolContent: false`）は変更しない

### FR-5: 他プラットフォーム対応（段階的）

- Phase 1: Claude のツール使用応答対応（本 issue）
- Phase 2: ChatGPT, Gemini, Perplexity の中間コンテンツ対応（各プラットフォームのDOM調査後に別issueで対応）
- トグルの仕組みは共通だが、各プラットフォームのextractor改修は段階的に行う

### FR-6: 設定の Content Script への伝達

- Content Script は `getSettings()` メッセージで Background Worker から設定を取得する（既存フロー）
- `enableToolContent` を extractor に渡す方法:
  - `extract()` メソッドのオプション引数として渡す、または
  - extractor のコンストラクタ/セッターで設定する

## Non-Functional Requirements

- トグルOFF時の既存動作に一切影響しないこと
- トグル切替後、次回の同期操作から反映されること（ページリロード不要）

## Acceptance Criteria

1. Advanced Settings に "Include tool/search results" トグルが表示される
2. トグルOFF: Claude のツール使用応答が保存されない（現行動作）
3. トグルON: Claude のツール使用応答が通常の応答と同様に保存される
4. トグルON: 通常の応答 + ツール使用応答が DOM 順に正しく保存される
5. 設定がブラウザ再起動後も保持される

## Affected Files

| File | Change |
|------|--------|
| `src/lib/types.ts` | `SyncSettings` に `enableToolContent` 追加 |
| `src/lib/storage.ts` | デフォルト値追加 |
| `src/popup/index.html` | トグルUI追加 |
| `src/popup/index.ts` | トグルのイベントハンドリング追加 |
| `src/content/extractors/claude.ts` | ツール使用応答セレクタ追加、条件分岐 |
| `src/content/extractors/base.ts` | `queryAllWithFallback` の拡張（検討） |
| `src/content/index.ts` | 設定をextractorに渡すフロー追加 |
| `test/extractors/claude.test.ts` | ツール使用応答のテストケース追加 |

## Open Questions

1. Claude のツール使用応答内の折りたたみサマリーテキスト（「Gathered API documentation...」）は保存に含めるか、フィルタするか？
   1. 保存しない
2. ChatGPT / Gemini / Perplexity の中間コンテンツの具体的なDOM構造（Phase 2 で調査）
   1. 
