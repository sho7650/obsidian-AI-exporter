# REQ-515: ChatGPT 2026-09 DOM への追従

## Issue

- GitHub: #515 — ChatGPTで「No messages found in conversation」となり同期できない（v2.12.4、v2.14.4 でも同じ）
- 追加報告: macOS Chrome でも再現（Claude は正常）
- Priority: High（ChatGPT の保存が全面的に停止している）
- Scope: ChatGPT のみ

## 症状

chatgpt.com のすべての会話で保存に失敗し、`No messages found in conversation` と表示される。E2E（`e2e-selectors`）も FAIL する。

## 調査結果（2026-09-26 実測）

実測の経路は2つ。CDP daemon（幅 800px）と、ユーザーの Chrome（Personal Chrome、幅 2880px）である。どちらでも構造は同じだった。

### セレクタ

`SELECTORS`（`selectors/chatgpt.ts`）の5グループは、すべて一致数が 0 件である。

| 用途 | 旧 | 新（実測） |
|---|---|---|
| ターン | `section[data-turn-id]` / `section[data-testid^="conversation-turn"]` | `div[data-turn-key=<uuid>]`。**1ターンに質問と回答の組が1つ入る** |
| 発言者 | `data-turn` / `[data-message-author-role]` | user: `[data-user-message-bubble]`、assistant: `[data-conversation-role="assistant"]`（`h4.sr-only`） |
| ユーザー発言 | `[data-message-author-role="user"] .whitespace-pre-wrap` | `[data-user-message-bubble] .whitespace-pre-wrap` |
| 回答本文 | `.markdown.prose` / `.markdown-new-styling` | `div[data-markdown-text-style="assistant-message"]` |
| スクロール領域 | `[data-scroll-root]` / `[class*="not-print:overflow-y-auto"]` | `div[data-app-action-timeline-scroll]`（サイドバーの囮 `[data-app-action-sidebar-scroll]` がまだ存在する） |
| 順序番号 | `data-testid="conversation-turn-N"` | **なくなった** |

補足:

- `data-content-search-turn-key="fallback-turn-N"` は、**表示中の範囲に対する番号**である。同じターンが、ある時点では 4、別の時点では 9 になった。順序にも基準値にも使えない。
- `data-chatgpt-search-unit-key="fallback-turn-N:i:role"` は、画像だけの回答ユニットには付いていない。発言者の判定に使えない。
- 複数ブロックの回答は、`data-chatgpt-search-message-ids` に複数の id が空白区切りで入る（#281 と同じ種類）。
- ターンの先頭に日付の区切り `div[role=separator]` が入ることがある。

### スクロール

- スクロール領域が `flex-direction: column-reverse` になった。`scrollTop=0` が**下端**で、上へ行くほど負の値になる。
- 仮想化はある。同時に表示されるのは3〜6ターンで、それ以外は外される。上端に着くと古いターンを追加で読み込み、`scrollHeight` が増える。
- `data-turn-key` は、スクロールで外されて付け直されても値が変わらない。
- 今の `scroll-manager.ts` は `scrollTop===0` を上端、またはスクロール不要と解釈する（`:480`、`:619`）。そのため、直近の表示範囲だけを保存し、完全なノートを一部だけで上書きするおそれがある（#449 型）。

### 生成画像

- `[class*="imagegen-image"] img` は 0 件。現在は `[data-testid="generated-image-preview"] img`（`alt="Generated image N"`）である。
- `src` が `blob:https://chatgpt.com/…` になった。ページの main world から fetch すると PNG を取得できた（1.4MB / 2.1MB）。
- `image-<uuid>` の widget id はなくなった。

### 影響を受ける箇所

`conversationTurn` はターン検出以外でも使われており、次の箇所も壊れている。

- ready 待機（`selectors/ready.ts` の `conversationTurn[0]`）
- 蓄積キー（`data-turn-id` / `data-message-id`）
- 並び順（`turnOrdinal`、#353）
- 未同期バッジ（`getMessageWatermark`、#465）
- 画像マーカー id のフォールバック（`chatgpt.ts:445`）
- E2E の `smoke-test.spec.ts:69`（ready セレクタを直書きしている）

## 決定事項

| # | 論点 | 決定 |
|---|---|---|
| D1 | 用語 | Turn は各プラットフォームの呼び方のまま。プラットフォームをまたぐ処理は Message 単位で考える（`CONTEXT.md`） |
| D2 | 範囲 | 上記の影響箇所を #515 でまとめて直す |
| D3 | 旧 DOM | `SELECTORS` からは外し、extractor 内の private なフォールバックとして当面残す（#464 型） |
| D4 | 分け方 | 1ターンを最大2メッセージ（user 1件、assistant 1件）に分ける。複数ブロックの回答は1件に結合する。日付の区切りは除外する |
| D5 | 逆向きスクロール | `scroll-manager` に「上端からの距離」への換算を入れ、どのプラットフォームでも扱えるようにする。ADR を書く |
| D6 | キーと順序 | キーは `data-turn-key` の値に `:user` または `:assistant` を付けたもの。順序は `mergeWindow` で重なる位置からつなげる（`order` は付けない）。発言者はバブルと `data-conversation-role` で判定する |
| D7 | 未同期バッジ | ChatGPT の `getMessageWatermark()` は `null` を返す。代わりの仕組みは #470 で扱う |
| D8 | 生成画像 | content script で blob を base64 として取り込む（Gemini と同じ方式）。id はメッセージ id と連番から作る。旧 https 経路は private なフォールバックとして残す。ADR-041 を更新する |
| D9 | 先頭の判定 | 上端に着いてから一定時間（`topSettleMs`、実測で決める）は完了としない。上端にいた反復で `scrollHeight` が増えたら、進捗として idle 期限をリセットする。待っても読み込みが来ないまま idle 期限に達した場合は `idle-timeout` で終わり、#449 のガードに任せる。2026-09-26 改訂: 当初は「終了は idle 期限に任せる」としていたが、それでは毎回 `idle-timeout` になり、上書きが常に止まるため改めた |
| D10 | 報告者への返信 | 修正を出荷するときに、自動スクロールを ON にする案内を添える。既定の OFF では、表示中のターンしか保存されないため |
| D11 | 旧 DOM の ready 待機 | 旧 DOM の利用者は、同期ボタンが出るまで最大 10 秒待つ。許容する（Perplexity #518 と同じ扱い） |

## 受け入れ条件

1. 新しい DOM の会話を、全ターンの user と assistant を含めて、正しい順序で保存できる（表示範囲の外にあるターンも含む）。
2. `column-reverse` のスクロール領域で、スクロール不要と誤判定しない。
3. 生成画像（blob）を Obsidian に書き出せる。
4. 旧 DOM のフィクスチャで、既存のテストが通る。
5. `nix run .#e2e-baseline-update` と `nix run .#e2e-selectors` が ChatGPT で緑になる。
6. ユーザーの実機 Chrome で、長い会話と画像付きの会話を手動で確認する（拡張の自動スモークはできないため）。

## 未検証（実装の最初に確かめる）

- content script の isolated world から、ページの blob URL を取得できるか
- 長い会話で先頭まで到達したときの挙動（今回の測定では到達できていない）
