# REQ-545: DOMPurify の更新と NotebookLM の予備セレクタ消失（2026-10）

## Issue

- GitHub: #545 — [Security] Update DOMPurify to >= 3.4.17 to fix high and critical XSS CVEs（報告者 sh1dwo、2026-10-23）
- 追加: E2E `NotebookLM › conversation selectors` が baseline 契約違反で FAIL（2026-10-24 のローカル実行）
- Priority: High（Web Store 版が脆弱性スキャナに検出されるバージョンを同梱している）
- Scope: 依存関係（`dompurify`）と NotebookLM のセレクタだけ。DES-019（#539〜#541）とは別に先に出す

## 1. DOMPurify（#545）

### 事実（2026-10-24 確認）

| 項目 | 値 | 根拠 |
|---|---|---|
| `package.json` の指定 | `^3.4.13` | `package.json:32` |
| 実際に入っているもの | `3.4.16` | `package-lock.json` の `node_modules/dompurify` |
| 呼び出し箇所 | 1 か所 | `src/lib/sanitize.ts` `sanitizeHtml()` |
| 設定 | `USE_PROFILES: { html: true }`、`FORBID_TAGS: ['style']` | 同上 |
| フック | `uponSanitizeAttribute` だけ（属性を残すか決めるだけで、ノードは消さない） | 同上 |
| 入力 | 文字列、または `preprocessKatexToNode()` が返すノード。`IN_PLACE` は使わない | 同上 |
| CI の `npm audit` | なし | `.github/workflows/ci.yml` |

### Advisory と、この拡張機能での成立可否

| Advisory | 深刻度 | 成立に必要な条件 | 本拡張 |
|---|---|---|---|
| GHSA-cg2g-xh64-v4q7 | Critical | `SAFE_FOR_TEMPLATES: true` と DOM を返すモード（`RETURN_DOM` / `RETURN_DOM_FRAGMENT` / `IN_PLACE`）の両方、shadow root を持つノードの入力、さらに出力をテンプレートとして評価すること | 条件を満たさない |
| GHSA-mrv2-3pqr-j5jr | High | `IN_PLACE: true` で、要素系または `*SanitizeAttributes` のフックが、呼ばれたノード以外のノードを消すこと | 条件を満たさない |
| GHSA-c6gr-qvv4-5v3f | Low | `PARSER_MEDIA_TYPE: 'application/xhtml+xml'` で、`animate` / `set` と `attributeName` を許可していること（advisory も「既定設定と text/html は影響なし」と明記） | 条件を満たさない |

影響範囲は3件とも `<= 3.4.16`、修正版は `3.4.17` である。本拡張では悪用できないが、同梱バージョンが影響範囲に入っており、報告者からも更新を求められているので、更新する。

### 要求

- R545-1: `dompurify` を `^3.4.17` 以上に上げる。`package.json` の指定の下限も上げ、lockfile を作り直しても 3.4.16 以下に戻らないようにする。
- R545-2: 変えるのは `dompurify` だけにし、ほかの依存の解決結果は変えない（lockfile の差分は `dompurify` のエントリだけ）。
- R545-3: 既存のテスト（特に `sanitize` 系）と CI 一式（lint → format:check → test:coverage → build）がそのまま通ること。
- R545-4: 報告者には英語でお礼を伝え、上の表の内容（本拡張では3件とも成立しないが更新した）を返答する。返答の文面は、投稿前にユーザーの確認を受ける。
- R545-5: 本拡張としての Security Advisory は出さない（悪用できないため。出すと深刻度を過大に伝える）。
- R545-6: CI への `npm audit` 追加は今回やらず、別 issue として起票する。

## 2. NotebookLM の予備セレクタ消失

### 事実（`e2e/results/report-2026-10-24.json`）

| `SELECTORS.citationMarker` | baseline（2026-10-07） | 2026-10-24 |
|---|---|---|
| `button.citation-marker:not(:has(mat-icon))`（主セレクタ） | 31 / 中身あり 31 | 31 / 中身あり 31 |
| `.xap-inline-dialog.citation-marker`（予備） | 31 / 中身あり 31 | **0 / 0（lost）** |

- ほかの NotebookLM セレクタは、すべて baseline と同じ件数で通っている。
- 抽出側は `COMPUTED_SELECTORS.citationButton`（`'button.citation-marker'`）を使い、予備のセレクタは参照しない（`src/content/extractors/selectors/notebooklm.ts`、`notebooklm.ts` の `hasCitations` / `collectFootnotes`）。今の抽出が壊れていないことは、件数からは言える。
- 引用ボタンの中身（番号の書き方など）が変わったかどうかは、件数からは分からない。

### 要求

- RNB-1: 実ページ（CDP デーモン）で、引用ボタン1つの outerHTML と、メッセージ1件の抽出結果（脚注 `[^…]` とその定義行）を確認する。番号の書き方や構造が変わっていたら、そこで止めて相談する。
- RNB-2: 予備 `.xap-inline-dialog.citation-marker` を `SELECTORS.citationMarker` から削除する（#401 と同じ扱い。使われなくなった予備は消す）。代わりの予備は探さない。
- RNB-3: baseline はユーザーの環境で `nix run .#e2e-baseline-update` を実行して作り直す。セレクタを消すだけなので件数は下がらず、`ACCEPT_DEGRADED` は不要。
- RNB-4: 作り直した後に `nix run .#e2e-selectors` が NotebookLM で通ること。

## 3. 出し方

| 決定 | 内容 |
|---|---|
| D1 | #545 は DES-019 の PR に入れない。main から別ブランチで出す |
| D2 | `package.json` の指定は `^3.4.17` に上げる |
| D3 | 報告者への返答と PR の `Closes #545` で閉じる。本拡張としての advisory は出さない |
| D4 | `npm audit` の CI 追加は別 issue |
| D5 | NotebookLM は予備を削除する（代わりは探さない） |
| D6 | PR は2本（`fix(deps)` と `fix(notebooklm)`）。両方をマージしてからリリース PR をマージし、Web Store には1回で出す |
| D7 | NotebookLM は実ページで追加確認する。そのためにサンドボックス外で CDP デーモンを動かす |

DES-019 の PR は、この2本がマージされた後に main へ rebase して出す。
