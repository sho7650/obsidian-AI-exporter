# REQ-083: Angle Bracket Escape in Markdown Output

## Issue

- GitHub: #83 — `<m` causes MD interpreter to choke
- Priority: High (全プラットフォームに影響)

## Background

AI会話にはPythonトレースバック (`<module>`)、TypeScript型 (`<Generic<T>>`)、HTMLタグ名 (`<div>`) など、角括弧を含むテキストが頻繁に登場する。現在、これらがMarkdown出力でエスケープされず、ObsidianがHTMLタグとして解釈してしまう。Reading mode で内容が消失し、後続のフォーマットも崩壊する。

## Root Cause

2つのコードパスで角括弧がエスケープされていない:

1. **Assistantメッセージ** (`markdown.ts:372`): Turndownが `&lt;` を `<` にデコードするが、Markdown用の `\<` エスケープをしない
2. **Userメッセージ** (`markdown.ts:372`): `.textContent` で取得したテキストがそのまま出力される

## Solution Approach

バックスラッシュエスケープ (`\<`, `\>`) を採用する。

- CommonMark仕様 (Section 2.4) 準拠
- obsidian-importer公式プロジェクトと同一手法 (commit `866eada`)
- callout内・Reading mode・Live Preview mode すべてで動作
- 通常テキストのスタイルを保持（inline codeにならない）

## Functional Requirements

### FR-1: Assistantメッセージの角括弧エスケープ

- `htmlToMarkdown()` の出力に対し、コードブロック・インラインコード外の `<` を `\<` に、`>` を `\>` にエスケープする
- フェンスドコードブロック (` ``` `) 内のテキストはエスケープしない
- インラインコード (`` ` ``) 内のテキストはエスケープしない
- Markdown構文としての `>` (blockquote) はエスケープしない

### FR-2: Userメッセージの角括弧エスケープ

- `formatMessage()` に渡される前に、userメッセージのコンテンツ内の `<` / `>` をエスケープする
- userメッセージ内のインラインコードは保護する

### FR-3: 全プラットフォーム共通

- Gemini, Claude, ChatGPT, Perplexity の全4プラットフォームに適用
- 処理は `markdown.ts` 内に集約し、各extractor側の変更は不要とする

## Non-Functional Requirements

- 既存のMarkdown出力テストが壊れないこと
- パフォーマンスに有意な影響がないこと（1回のRegex処理で完了）

## Acceptance Criteria

1. `<module>` を含むassistantメッセージ → `\<module\>` として出力
2. `<Generic<T>>` を含むuserメッセージ → `\<Generic\<T\>\>` として出力
3. フェンスドコードブロック内の `<div>` → エスケープされない
4. インラインコード内の `<span>` → エスケープされない
5. Obsidian Reading mode でリテラルテキストとして正しく表示される

## Affected Files

| File | Change |
|------|--------|
| `src/content/markdown.ts` | `escapeAngleBrackets()` ユーティリティ追加、`htmlToMarkdown()` と `formatMessage()` に適用 |
| `test/content/markdown.test.ts` | 角括弧エスケープのテストケース追加 |

## Open Questions

なし
