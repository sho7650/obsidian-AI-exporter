# ADR-005: Shared Selector Modules for Live Site Validation

## Status
Accepted (実装済み)

## Context
当プロジェクトは 4 つの AI プラットフォーム (Gemini, Claude, ChatGPT, Perplexity) の DOM からコンテンツを抽出する Chrome 拡張機能である。各 extractor は CSS セレクタ定数 (`SELECTORS`, `DEEP_RESEARCH_SELECTORS` 等) をモジュールレベルの `const` として保持している。

**課題**: 各プラットフォームは頻繁に DOM 構造を変更する (例: ChatGPT の `<article>` → `<section>` 変更, commit `fdd28ed`)。現在の fixture テストは静的 HTML スナップショットに基づいており、ライブサイトの DOM 変更を検知できない。

セレクタの有効性をライブサイト上で自動検証する仕組み (Playwright smoke test) を導入するにあたり、テストコードから各 extractor のセレクタ定義にアクセスする方法が必要となった。

### 制約
- Extractor ファイルは DOMPurify, Chrome API 等のブラウザ固有モジュールを import しており、Playwright (Node.js) 環境から直接 import できない
- テストファイルは現在 SELECTORS を一切参照しておらず、変更影響はない

## Decision
各 extractor のセレクタ定数を **共有定数モジュール** (`src/content/extractors/selectors/`) に抽出し、extractor と smoke test の双方が同一ソースから import する構成とする。

### 構造変更
```
src/content/extractors/
├── selectors/            # NEW: セレクタ定数モジュール
│   ├── gemini.ts         # SELECTORS, DEEP_RESEARCH_SELECTORS, DEEP_RESEARCH_LINK_SELECTORS
│   ├── claude.ts         # SELECTORS, DEEP_RESEARCH_SELECTORS
│   ├── chatgpt.ts        # SELECTORS
│   ├── perplexity.ts     # SELECTORS
│   └── index.ts          # 集約 re-export (smoke test 用)
├── gemini.ts             # import { SELECTORS, ... } from './selectors/gemini'
├── claude.ts             # import { SELECTORS, ... } from './selectors/claude'
├── chatgpt.ts            # import { SELECTORS } from './selectors/chatgpt'
└── perplexity.ts         # import { SELECTORS } from './selectors/perplexity'
```

### COMPUTED_SELECTORS / JOINED_SELECTORS の扱い
- `COMPUTED_SELECTORS` (gemini.ts) と `JOINED_SELECTORS` (claude.ts) は他のセレクタ定数を `.join(',')` して派生する
- これらも selectors モジュール内で定義し、元の定数と共に export する
- 依存関係が同一ファイル内に閉じるため安全

### 乖離防止
セレクタ定義を selectors/ に移動し extractor が import する構成のため、定義は常に単一ソースとなる。追加の同期チェックは不要。

## Alternatives Considered

### A. Extractor から直接 import
テストコードが extractor ファイルを直接 import する方式。
**却下**: Extractor が DOMPurify, Chrome API 等を import しており、Playwright 環境で依存解決不可。テストコードが本番コードパスに直接アクセスすることによるセキュリティリスクもある。

### B. 別ファイルにセレクタ定義をコピー
セレクタ定義を独立ファイルにコピーし、extractor とは別に管理する方式。
**却下**: 手動同期が必要で乖離リスクが高い。セレクタ更新時に 2 箇所を修正する運用負荷がかかる。

### D. Vite ビルドプラグインで manifest.json を自動生成
ビルド時にソースファイルから AST/正規表現でセレクタを抽出し JSON を出力する方式。
**却下**: AST パースが脆弱 (セレクタ定義フォーマットの変更で破綻)。smoke test 実行前に必ずビルドが必要。

### E. Smoke test 実行時にソースを動的パース
テスト実行時に TypeScript ソースを正規表現で解析してセレクタを抽出する方式。
**却下**: 正規表現パースが非常に脆弱。ネスト構造やコメント等で容易に破綻する。

## Consequences

### Positive
- 単一ソース: セレクタ定義の乖離リスクがゼロ
- 環境非依存: 純粋な文字列定数のみで構成、ブラウザ/Node.js 双方で利用可能
- Playwright smoke test から安全にセレクタ定義を参照可能
- 既存テスト 631 件に影響なし (テストは SELECTORS を参照していない)
- セレクタ定義ファイルにメタデータ (stability level 等) を将来追加可能

### Negative
- 4 つの extractor ファイルのリファクタリングが必要 (機械的移動のみ)
- ファイル数が 5 つ増加 (selectors/ 配下)
- import パスが 1 レベル深くなる (`'./selectors/gemini'`)

### Risk
- **LOW**: 純粋な機械的移動であり、ロジック変更なし。CI でビルド + 全テスト通過を確認すれば安全

## Implementation Notes (2026-03-22)

### `as const satisfies` による型互換性

セレクタ定数に `as const satisfies SelectorGroup` を付与したことで、配列が `readonly` になった。
`BaseExtractor` の `queryWithFallback()` / `queryAllWithFallback()` / `getFirstMessageTitle()` のシグネチャを `string[]` → `readonly string[]` に変更して対応。既存テスト 800 件全パス確認済み。

### types.ts の追加

DES-015 設計時は 5 ファイル (4 platforms + index) の予定だったが、型定義 `types.ts` を追加し 6 ファイル構成とした。
