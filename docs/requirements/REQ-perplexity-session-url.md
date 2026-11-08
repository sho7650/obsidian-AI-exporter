# REQ: Perplexity の会話 URL が `/session/<uuid>` に変わったことへの追従

## 背景

- 報告: E2E（`nix run .#e2e-selectors`）の Perplexity だけが失敗する。認証は通っている。
- Priority: High（E2E が止まっているうえ、本番の保存も壊れている）
- Scope: Perplexity のみ

### 失敗の出力（2026-11-08）

```
[G2O Auth] perplexity: test_data_missing — expected /^https:\/\/www\.perplexity\.ai\/search\//,
  got: https://www.perplexity.ai/session/bd1ba34a-f750-487b-8640-d2491123fcbb
Error: perplexity: authenticated but the conversation URL did not open
  (https://www.perplexity.ai/search/amerikate-macbook-womai-tutaho-vRujSvdQSHuGQNJJESP8uw) — the pinned
  test conversation is gone or its URL is invalid; refresh the *_CONV_URL / *_DR_URL value in e2e/.env.local
```

## 調査結果（2026-11-08 実測。CDP デーモンの Chrome で計測）

`/search/<slug>` を開いたときの結果は次のとおり。

| 項目 | 実測値 |
|---|---|
| 遷移の経路 | `/search/amerikate-macbook-womai-tutaho-vRujSvdQSHuGQNJJESP8uw` → `/session/bd1ba34a-f750-487b-8640-d2491123fcbb` |
| 着地ページ | 会話が表示される。`document.title` は会話タイトル、`[class*="group/user-bubble"]` 2 件、`[data-renderer="lm"]` 4 件 |
| サイドバーのリンク | すべて `/session/<uuid>`。`/search/` のリンクは 0 件 |
| `link[rel=canonical]` | `https://www.perplexity.ai`（会話を指さない） |
| `meta[property=og:url]` | `https://www.perplexity.ai/` |
| HTML 内の `/search/…` 文字列 | 0 件 |

結論:

- **会話が開く URL の正式な形は `/session/<uuid>` になった。** 旧 `/search/<slug>` は転送されるだけ。
- **`/session/` のページから旧 slug を取り出す手段はない**（DOM、canonical、og:url のどれにも残っていない）。
- `e2e/.env.local` に書かれていた値は `…/search/<slug>#bd1ba34a-…` だった。dotenv v17 は引用符のない値を `#` で切る（`node_modules/dotenv/lib/main.js:38` の `[^#\r\n]+`）ため、テストには `#` より前だけが渡っていた。`#` の後ろの UUID は転送先の UUID と同じ。

### 壊れている箇所

1. **E2E の判定**: `e2e/selectors/auth-check.ts:32` の `AUTH_URL_PATTERNS.perplexity` が `/search/` しか受け付けない。そのため、正常に会話が開いても `test_data_missing` と判定される。
2. **本番の ID 取得**: `src/content/extractors/perplexity.ts:234` の `getConversationId()` が `/\/search\/([^/]+)$/` しか見ない。`/session/` では `null` になり、`src/content/extractors/base.ts:135` で `perplexity-${Date.now()}` が代わりに使われる。結果は次のとおり。
   - 保存のたびに ID が変わり、別ファイルになる（ノートの重複）
   - 追記モードが既存ノートを見つけられない（`src/lib/append-utils.ts` の照合は frontmatter の `id` で行う）
   - 会話の切り替え検知（`src/content/conversation-watcher.ts`）が ID を比較できない

## 要件

### 必須

- R1. `/session/<uuid>` の会話で、`getConversationId()` が UUID を返す。
- R2. 旧 `/search/<slug>` の URL でも、これまでどおり slug を返す（転送前の一瞬や、旧形式のまま残るページのため）。
- R3. `/session/`（ID なし）や会話以外のパス（`/`、`/hub` など）では `null` を返す。
- R4. E2E の認証判定が `/session/<id>` を `authenticated` とする。`/session/` だけ（ID なし）は `test_data_missing` のままにする。
- R5. `e2e/.env.local.example` が新しい URL 形式を示し、URL に `#` を書くと切り捨てられることを注記する。
- R6. 同じ会話を `/session/` で 2 回保存すると、同じノートに保存される（上書き、または追記）。

### 受け入れ条件

- 上の R1〜R4 を unit テストで確認できる。
- `npm run lint && npm run format:check && npm run test:coverage && npm run build` がすべて通る。
- `.env.local` を `/session/<uuid>` に変えたうえで、`nix run .#e2e-selectors` の Perplexity が通る。

### 既知の影響（受け入れる）

- 既存の Perplexity ノートの frontmatter `id` は `perplexity_<slug>` である。新しい ID は UUID なので、既存ノートには追記されず、会話ごとに新しいファイルが 1 回だけできる。slug をページから復元できない以上、これは避けられない。

### スコープ外

- 既存ノートの ID を UUID に書き換える移行処理
- Perplexity 以外のプラットフォーム
- セレクタの変更（実測でユーザー発言・回答のセレクタは一致している。必要かどうかは E2E が通った後の baseline で判断する）
