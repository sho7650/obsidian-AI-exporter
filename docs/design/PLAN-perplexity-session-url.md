# 実装計画: Perplexity の `/session/<uuid>` URL への追従

- 要件: [REQ-perplexity-session-url](../requirements/REQ-perplexity-session-url.md)
- ブランチ: `fix/perplexity-session-url`（`main` から作成済み）

## 方針

URL から ID を取る正規表現を、旧 `/search/<slug>` と新 `/session/<uuid>` の両方に対応させる。E2E 側の判定パターンも同じ 2 形式を受け付ける。ID の値はパスの最後のセグメントをそのまま使う（`/session/` なら UUID、`/search/` なら slug）。

### ID の形式が変わることの影響（確認済み）

| 仕組み | 実装 | UUID になった場合 |
|---|---|---|
| frontmatter `id` | `src/content/markdown.ts:84` `${source}_${id}` | `perplexity_<uuid>` になる |
| ファイル名の末尾 | `src/content/markdown.ts:63` id の先頭 `FILENAME_ID_SUFFIX_LENGTH`（8）文字 | UUID の先頭 8 桁（16 進）。旧 slug はタイトル由来で重複しやすかった（#327）が、UUID ではその原因がなくなる |
| 衝突時の別名 | `src/lib/filename-collision.ts:19` id のハッシュ | 影響なし |
| 追記の照合 | `src/lib/append-utils.ts:197` ファイル名の末尾で候補を絞り、frontmatter の `id` で確定 | 新しいノート同士では正しく照合される。旧 slug のノートとは照合されない（REQ の既知の影響） |
| 会話の切り替え検知 | `src/content/conversation-watcher.ts` は `getKey()` の値を比較するだけ | ID が取れるようになるので、正しく動く |

## 手順

### 1. extractor の ID 取得（TDD）

1. `test/fixtures/dom-helpers.ts:885` 付近に `setPerplexitySessionLocation(uuid)` を追加する（`/session/${uuid}` を設定）。既存の `setPerplexityLocation(slug)` は残す。
2. `test/extractors/perplexity.test.ts` の `Conversation ID Extraction` にテストを追加する。
   - `/session/<uuid>` → UUID を返す
   - `/session/<uuid>/`（末尾スラッシュ）→ UUID を返す
   - `/session/` → `null`
   - 既存テスト（`/search/<slug>` → slug、`/hub` → `null`）はそのまま回帰テストとして残す
3. テストを実行し、新しいテストが落ちることを確認する（RED）。
4. `src/content/extractors/perplexity.ts:233` の `getConversationId()` を次の正規表現に変える。`window.location.pathname` を見るので、クエリ文字列と `#` は対象外になる。

   ```ts
   const CONVERSATION_PATH = /^\/(?:search|session)\/([^/]+)\/?$/;
   ```

   定数はファイル冒頭のセレクタ定義の近くに置き、コメントで 2 形式がある理由（2026-11 に `/session/` へ移行、旧 URL は転送される）を書く。メソッドの JSDoc の URL 例も 2 形式に直す。
5. テストが通ることを確認する（GREEN）。

### 2. E2E の認証判定（TDD）

1. `e2e/selectors/__tests__/auth-check.test.ts` にテストを追加する。
   - `https://www.perplexity.ai/session/<uuid>` → `authenticated`
   - `https://www.perplexity.ai/search/<slug>` → `authenticated`（回帰）
   - `https://www.perplexity.ai/session/` → `test_data_missing`
   - `https://www.perplexity.ai/` → `test_data_missing`
2. RED を確認する。
3. `e2e/selectors/auth-check.ts:32` を次に変える。

   ```ts
   perplexity: /^https:\/\/www\.perplexity\.ai\/(?:search|session)\/[^/?#]+/,
   ```

   ファイル冒頭の JSDoc にある「各パターンは拡張が扱う URL の形をすべて受け付けること」の箇条書きに、Perplexity の 2 形式を追記する。
4. GREEN を確認する。

### 3. E2E の設定例

- `e2e/.env.local.example:17` を `PERPLEXITY_CONV_URL=https://www.perplexity.ai/session/YOUR_SESSION_UUID` に変える。
- その上に、URL に `#` 以降を書くと dotenv が切り捨てる旨のコメントを 1 行足す。
- ユーザーの `e2e/.env.local` は編集しない。ユーザーに `PERPLEXITY_CONV_URL=https://www.perplexity.ai/session/bd1ba34a-f750-487b-8640-d2491123fcbb` への変更を依頼する。

### 4. ドキュメント

- `CLAUDE.md` の Supported Platforms にある Perplexity の行に、会話 URL が `/session/<uuid>`（旧 `/search/<slug>` は転送される）であることを追記する。
- `docs/adr/045-perplexity-session-url-id.md` を作る。内容は次のとおり。
  - 決定: ID は URL の最後のセグメント（新 = UUID、旧 = slug）
  - 理由: `/session/` ページから slug を復元できない（REQ の実測表）
  - 影響: 旧 slug のノートには追記されず、会話ごとに新しいファイルが 1 回できる
  - 却下した案: タイトルでの照合（タイトルは変わりうるうえ、#327 の同名問題を再発させる）

### 5. 検証

1. `npm run lint && npm run format:check && npm run test:coverage && npm run build`（CI と同じ順序）
2. ユーザーが `.env.local` を更新した後、`nix run .#e2e-selectors` で Perplexity が通ることを確認する。baseline が `degraded` などを出した場合は、内容を報告してから対応を決める（baseline の更新はユーザーの判断）。
3. 拡張機能を `dist/` から読み込み、`/session/` の会話を 2 回保存して、同じファイルに保存されることをユーザーに確認してもらう（Chrome での拡張機能の操作は自動化できないため）。

## 変更するファイル

- `src/content/extractors/perplexity.ts`
- `test/extractors/perplexity.test.ts`
- `test/fixtures/dom-helpers.ts`
- `e2e/selectors/auth-check.ts`
- `e2e/selectors/__tests__/auth-check.test.ts`
- `e2e/.env.local.example`
- `CLAUDE.md`
- `docs/adr/045-perplexity-session-url-id.md`（新規）

## リスク

- `/session/` 以外にも新しい会話 URL の形（共有リンクなど）があるかもしれない。今回は実測できた 2 形式だけに対応し、それ以外は `null`（従来どおりの代替 ID）になる。
- Deep Research の会話も `/session/` になっているかは未確認。Perplexity の E2E には Deep Research 用の URL がない（`smoke-test.spec.ts:472` は `PERPLEXITY_CONV_URL` だけ）ので、手順 5 の手動確認で Deep Research の会話も 1 件保存してもらう。
