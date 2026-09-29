# DES-018: 品質・アーキテクチャ分析に基づく是正計画

| 項目               | 内容                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| **文書ID**         | DES-018                                                                                |
| **作成日**         | 2026-09-29                                                                             |
| **ステータス**     | Approved（2026-09-29。判断事項は §7 のとおり決定）                                     |
| **対象コミット**   | `af49133`（v2.14.5, main）                                                             |
| **分析範囲**       | `src/` 全体（67 ファイル / 12,827 行）。観点は品質とアーキテクチャ                     |
| **関連 ADR**       | [ADR-033](../adr/033-truncated-capture-may-not-overwrite.md), [ADR-036](../adr/036-badge-invalidation-on-new-messages.md), [ADR-032](../adr/032-configurable-scroll-deadlines.md) |

---

## 1. 目的

2026-09-29 に実施した品質・アーキテクチャ分析の結果を、事実と根拠つきで整理する。そのうえで、是正策を
フェーズ単位の実装計画にまとめる。本書は計画であり、実装は承認後にフェーズごとに別ブランチ・別 PR で行う。

---

## 2. 現状の計測値

すべて `af49133` 上で実測した値である。

| 項目                              | 結果                                                         | 計測方法                                       |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| 型検査                            | エラー 0                                                     | `npx tsc --noEmit -p .`                        |
| Lint（ESLint + platform + knip）  | 合格                                                         | `npm run lint`                                 |
| カバレッジ（文 / 分岐 / 関数 / 行） | 96.86% / 88.44% / 99.18% / 97.86%                           | `npx vitest run --coverage`                    |
| 分岐カバレッジ下位                | `extractors/footnotes.ts` 50%、`lib/date-utils.ts` 62.5%     | 同上                                           |
| 50 行超の関数                     | 13 件（§3 M-4）                                              | TypeScript Compiler API で関数ごとの行数を計測 |
| 800 行超のファイル                | 0 件。最大は `popup/app.ts` 697 行                           | `wc -l`                                        |
| `console.log` / `eslint-disable`  | 0 件 / 0 件                                                  | `grep`                                         |

---

## 3. 課題と問題点

重大度は「起きたときの影響」で決め、発生条件は別欄に書く。

### H-1（高）Gemini の打ち切り取得が完全なノートを上書きしうる

**事実**

- ADR-033 の決定 1 は「`ConversationData.truncated` は、人間向けの警告を組み立てる場所で、同じ
  `stopReason` から設定する」と定めている。
- 共通フロー（`BaseExtractor.collectMessages()`）はこれに従う。警告があれば `truncated: true` を返し
  （`src/content/extractors/base.ts:240-241`）、`extract()` がそれを `data` に載せる（`base.ts:130-135`）。
- Gemini は `extract()` を独自に上書きしている（`src/content/extractors/gemini.ts:58-103`）。
  「earlier messages may be missing」警告は組み立てる（`gemini.ts:88-96`）が、`truncated` は設定しない。
  `src/content/extractors/` 内で `truncated` を設定しているのは `base.ts` だけである（`grep` で確認）。
- 背景側のガードは `note.truncated === true` のときだけ上書きを拒否する
  （`src/background/obsidian-handlers.ts:335-336`、`src/lib/truncation-guard.ts:54`）。

**発生条件**（すべて満たすとき）

1. Gemini の会話である
2. 自動スクロールが有効（既定は無効: `src/lib/settings-schema.ts:61`）
3. 自動スクロールが期限（idle / max）で停止した
4. 追記モードが無効（既定は無効: `settings-schema.ts:62`）で、出力先が Obsidian
5. 同じ会話の既存ノートが、今回の取得よりも多くのメッセージを持っている

**影響**: #449 と同じ現象が Gemini で起きる。完全なノートが一部だけのノートで置き換わり、成功として
報告される。警告トーストは出るが数秒で消える。

**補足**: `messageWatermark` を Gemini が設定しないのは意図どおりである。Gemini はスクロールで古い
ターンを遅延読み込みするため、件数は単調な序数にならない（`base.ts:245-256` のコメント、ADR-036）。
本件の対象は `truncated` だけである。

### M-1（中）Gemini の `extract()` が共通フローの複製になっている（H-1 の根本原因）

**事実**

- `gemini.ts:58-103` は `base.ts:109-149` とほぼ同じ手順を再実装している。対象は `canExtract` の
  エラー、Deep Research の短絡、ID の既定値、`buildConversationResult`、警告の追記、`catch` である。
- 共通フローには、Gemini が使っている処理をそのまま受けられるフックがすでにある。
  - `onExtractStart()`（`base.ts:180`）: 抽出ごとの状態リセット
  - `finalizeExtraction()`（`base.ts:189`）: 画像の添付
  - `collectMessages()`（`base.ts:207`）: スクロールとメッセージ収集
- ChatGPT は画像の処理を `onExtractStart` / `finalizeExtraction` で実装済みである
  （`src/content/extractors/chatgpt.ts:153-159`）。Gemini の `images.reset()` と `images.attach()` と
  同じ処理である。
- `extract()` を上書きしている抽出器は Gemini だけである（`grep` で確認）。

**影響**: 共通フローに入った修正が Gemini に届かない。H-1 はその最初の実例である。

### M-2（中）設定の読み込み失敗が「初回起動」と区別できない

**事実**

- `getSettings()` は `chrome.storage` の読み込みで例外が出ると、ログを出したうえで `DEFAULT_SETTINGS`
  を返す（`src/lib/storage.ts:58-61`）。
- そのためポップアップの初期化で失敗を捕捉する `catch`（`src/popup/app.ts:152-155`）には例外が届かず、
  フォームは既定値で埋まる（`app.ts:148-149`）。
- 既定値では Obsidian 出力が有効（`settings-schema.ts:51`）で API キーは空である。空のキーは検証で
  弾かれる（`src/lib/validation.ts:139-141`）ので、そのまま保存すれば拒否され、上書きは起きない。
- しかし利用者が API キーを入力し直して保存すると、`collectSettings()` の値（既定値のまま）で
  `saveSettings()` が呼ばれる（`app.ts:626`）。保管庫パス・テンプレート・タグなどが既定値に戻る。

**外部仕様**: Chrome 公式リファレンスでは、`StorageArea.get()` は「成功時に解決し、失敗時に reject
する Promise」を返す（Chrome 95+）。ただし、どういう条件で失敗するかは記載がない（§4-1）。
したがって発生頻度は見積もれない。

**影響**: 読み込み失敗のあとに保存すると、利用者の設定が警告なしに失われる。

### M-3（中）`base.ts` と `scroll-manager.ts` の凝集度が低い

**事実**

- `src/content/extractors/base.ts`（678 行）には次の責務が同居している。
  - テンプレートメソッドとフック（109-200 行）
  - スクロール制御（207-261 行）
  - 設定の適用（269-285 行付近）
  - Deep Research 結果の構築（295-400 行付近）
  - メッセージの並べ替えと構築（408-445 行付近）
  - 結果の検証とメタデータ（449 行以降）、タイトル・テキスト補助・セレクタのフォールバック
- `src/lib/scroll-manager.ts`（682 行）には、性質の違う 2 つのスクロールエンジンがある。
  - `ensureAllElementsLoaded`（Gemini 用。件数が増えなくなるまで読み込む）
  - `accumulateWhileScrolling`（仮想化された PF 用。ID で蓄積する）
- どちらのファイルも 2026-06 以降に 10 回変更されている（`git log --since=2026-06-01`）。

**影響**: 変更頻度の高いファイルに責務が集まっており、変更のたびに影響範囲の確認が広くなる。
800 行の上限にはまだ達していない。

### M-4（中）50 行を超える関数が 13 件ある

TypeScript Compiler API で計測した（JSDoc を除く、宣言の開始行から終了行まで）。

| 行数 | 場所                                      | 関数                        |
| ---- | ----------------------------------------- | --------------------------- |
| 66   | `src/content/bootstrap.ts:415`            | `handleSync`                |
| 61   | `src/content/markdown.ts:83`              | `conversationToNote`        |
| 60   | `src/lib/append-utils.ts:377`             | `buildAppendContent`        |
| 56   | `src/background/service-worker.ts:24`     | `onMessage` リスナー（無名）|
| 56   | `src/content/ui.ts:352`                   | `showToast`                 |
| 56   | `src/lib/frontmatter-parser.ts:59`        | `parseFrontmatter`          |
| 54   | `src/background/obsidian-handlers.ts:85`  | `tryAppendMode`             |
| 53   | `src/content/ui-badge.ts:134`             | `buildPanel`                |
| 52   | `src/lib/scroll-manager.ts:631`           | `scrollUpUntilStable`       |
| 51   | `src/content/bootstrap.ts:328`            | `displaySaveResults`        |
| 51   | `src/content/markdown-formatting.ts:63`   | `formatMessage`             |
| 51   | `src/lib/obsidian-api.ts:144`             | `testConnection`            |
| 51   | `src/lib/scroll-manager.ts:485`           | `accumulateWhileScrolling`  |

**影響**: 規約（関数 50 行未満）への違反。超過幅は最大 16 行で、どれも手順の切り出しで解消できる。

### M-5（中）ポップアップが既定値を直書きしている

**事実**: `src/popup/app.ts:465` は `'AI/{platform}/images'` を直接書いている。同じ値は
`src/lib/settings-schema.ts:65` の `DEFAULT_SYNC_SETTINGS.imageVaultPath` にある。

**影響**: 既定値を変えるとき、片方だけ直すと食い違う。

### L-1（低）`offscreen/` にレイヤー規則がない

**事実**: `test/arch/layering.test.ts` の規則は `lib` / `content` / `background` / `popup` /
`extractors` の 5 つを起点にしている（26-72 行）。`offscreen/` を起点にした規則はない。
同ファイルの冒頭コメント（8 行）は `offscreen/` を末端（leaf）と説明している。

**影響**: `offscreen/` から `content/` などを import しても、循環しない限りテストは通る。

### L-2（低）DOM に依存するモジュールが共有層 `lib/` にあり、境界の規則がない

**事実**

- `src/lib/scroll-manager.ts` は `document` / `window` を参照する（`grep` で確認）。
- `src/lib/sanitize.ts` は DOMPurify を import する（7 行）。DOMPurify は動作に DOM を必要とする（§4-3）。
- Chrome 公式ドキュメントは「Service Worker には DOM アクセスがない」と明記している（§4-2）。
- 現在これらを import しているのは `src/content/extractors/` だけである（`grep` で確認）。
- `background/` は `lib/` を import してよい規則になっており、これらだけを除外する規則はない。

**影響**: 今は問題ない。将来 `background/` から import されると、テスト（jsdom）では通るのに
実機の Service Worker で失敗する。

### L-3（低）アーキテクチャテストのコメントが実態と合わない

**事実**: `test/arch/layering.test.ts:72` は「extractors depend only on base, selectors, and lib」
と書いている。実際には `claude.ts` が `../markdown-rules` を、`gemini.ts` と `chatgpt.ts` が
`../image-markers` を import している。規則本体は background / popup / offscreen の禁止だけなので
テストは通る。

### L-4（低）重複した値と、暗黙に連動している値

**事実**

- `BASE64_CHUNK_SIZE = 8192` が 2 か所で定義されている（`src/background/output-handlers.ts:125`、
  `src/lib/image-utils.ts:143`）。
- `src/content/ui.ts:404` の `300`（ms）は、同じ関数内の CSS `0.3s`（398 行）と一致する必要がある。
  同じ値がもう 1 か所（86 行）にもある。

### L-5（低）`markdown-rules.ts` に型アサーションが集中している

**事実**: `src/content/markdown-rules.ts` に `as <型>` が 15 件あり、うち 12 件が `as HTMLElement`
である（`grep` で計数）。

### L-6（低）`claude.ts` の補助関数が引数の配列を変更する

**事実**: `extractToolContent()`（`src/content/extractors/claude.ts:399-406`）はローカル配列 `parts`
を 4 つの補助関数に渡し、各関数がそこへ `push` する（412, 427, 450, 462 行）。配列はローカルなので
外部への副作用はないが、規約（不変性）に合わない。

### L-7（低）分岐カバレッジの低いモジュール

**事実**: `src/content/extractors/footnotes.ts` が 50%、`src/lib/date-utils.ts` が 62.5%（§2）。
全体の閾値（分岐 75%）は満たしている。

---

## 4. 外部仕様の確認

| # | 確認事項 | 結果 | 出典 |
| - | -------- | ---- | ---- |
| 4-1 | `chrome.storage.StorageArea.get()` の失敗時の挙動 | 「Promise that resolves with an object containing a key-value map for the requested items, or rejects on failure」（Chrome 95+）。失敗する条件の記載はない | Context7 `/websites/developer_chrome_extensions_reference_api`（出典: developer.chrome.com/docs/extensions/reference/api/storage/StorageArea）、および developer.chrome.com/docs/extensions/reference/api/storage |
| 4-2 | Service Worker で DOM を使えるか | 「Service workers don't have DOM access」 | developer.chrome.com/docs/extensions/reference/api/offscreen |
| 4-3 | DOMPurify の動作要件 | 「DOMPurify needs a DOM. In Node it runs on top of jsdom」 | Context7 `/cure53/dompurify`（github.com/cure53/dompurify wiki） |
| 4-4 | ts-archunit でモジュールの import 先を制限する書き方 | `modules(p).that().resideInFolder(...).should().onlyImportFrom(...)` と `notImportFrom(...)` | Context7 `/nielspeter/ts-archunit`（docs/modules.md） |
| 4-5 | sync ストレージが無効・オフラインのとき | 同期が無効なら `storage.local` と同じ動作。オフライン時はローカルに保存し、復帰後に同期する | developer.chrome.com/docs/extensions/reference/api/storage |

4-5 から、同期の無効化やオフラインは読み込み失敗の原因ではない。M-2 の失敗条件は公式情報からは
特定できない。

---

## 5. 実装計画

### 5.1 進め方の原則

- 1 フェーズ = 1 ブランチ = 1 PR（squash merge、release-please の規約どおり）。
- 各フェーズとも TDD で進める。先に失敗するテストを書き、RED を確認してから実装する。
- 振る舞いを変えないリファクタリング（Phase 6）は、既存テストがすべて通ることを条件にする。
- 各 PR の前に CI と同じ順序で検証する: `nix run .#lint` → `nix run .#format-check` →
  `nix run .#test-coverage` → `nix run .#build`。

### 5.2 フェーズ一覧

| Phase | 対象         | 優先度 | 規模 | 振る舞いの変更 |
| ----- | ------------ | ------ | ---- | -------------- |
| 1     | H-1          | 最優先 | 小   | あり（ガードが Gemini でも働く） |
| 2     | M-1          | 高     | 中   | 警告の並び順のみ（後述）          |
| 3     | M-2          | 中     | 小〜中 | あり（読み込み失敗を表示する）  |
| 4     | M-5, L-3, L-4 | 低    | 小   | なし |
| 5     | L-1, L-2     | 低     | 小   | なし（テストの追加のみ） |
| 6     | M-3, M-4, L-5, L-6 | 低 | 中〜大 | なし |
| 7     | L-7          | 低     | 小   | なし（テストの追加のみ） |

### Phase 1: Gemini の打ち切りに `truncated` を立てる（H-1）

**ブランチ**: `fix/gemini-truncated-flag`

**RED（先に書くテスト）** — `test/extractors/gemini.test.ts`

1. 既存の「times out and adds warning when elements keep growing」（1232 行付近）に
   `expect(result.data?.truncated).toBe(true)` を追加する。
2. idle-timeout で停止する場合も `truncated === true` になるテストを追加する。
3. スクロールが完了した場合（`stopReason: 'complete'`）は `truncated` が `undefined` のままであること。
4. 自動スクロール無効、およびスクロールコンテナなしの場合も `undefined` のままであること。
5. 継ぎ目のテスト: 上記 1 の結果を `conversationToNote()` に通すと `note.truncated === true` になる
   こと（`src/content/markdown.ts:136` がコピーする）。

**GREEN（実装）** — `src/content/extractors/gemini.ts`

- 警告を追記する分岐（`gemini.ts:95-97`）で、`data` に `truncated: true` を載せる。判定は警告の有無、
  つまり同じ `stopReason` から行い、ADR-033 決定 1 の書き方に揃える。

**完了条件**: 追加テストが RED → GREEN になり、既存テストがすべて通る。

**ADR**: 新規 ADR は不要。ADR-033 の決定どおりの実装に戻す修正である。PR の説明に ADR-033 と
本書 H-1 を引用する。

### Phase 2: Gemini を共通フローのフックに移す（M-1）

**ブランチ**: `refactor/gemini-extract-hooks`

**RED**

1. アーキテクチャテスト `test/arch/extractor-extract-hook.test.ts` を追加する。
   「`extract()` を宣言してよいのは `BaseExtractor` だけ」を検査する。書き方は既存の
   `test/arch/extractor-settings-hook.test.ts`（`applySettings` の同種の規則）に合わせる。
   現状の `gemini.ts` で失敗することを確認する。
2. Phase 1 で追加したテストは、そのまま回帰テストとして使う。

**GREEN** — `src/content/extractors/gemini.ts`

| 現在の `extract()` 内の処理                         | 移動先のフック                                   |
| --------------------------------------------------- | ------------------------------------------------ |
| `imageIdCounter = 0` と `images.reset()`（66-68 行） | `onExtractStart()`                               |
| `runAutoScroll()` と `extractMessages()`、警告の組み立て | `collectMessages()` の上書き（`messages` / `warning` / `truncated` を返す） |
| `images.attach()`（84 行）                          | `finalizeExtraction()`                           |

- `extract()` の上書きを削除する。`collectMessages()` の返り値の `watermark` は設定しない
  （Gemini の `getMessageWatermark()` は ADR-036 により `null`）。
- `base.ts` のコメントのうち、Gemini が `extract()` を上書きする前提の記述を更新する。対象は 104-107 行（`extract()` の JSDoc）と 195-196 行（`getScrollConfig()` の JSDoc）。

**振る舞いの変更（1 点）**: 警告の並び順が変わる。

- 現在の Gemini: 画像の警告 → スクロールの警告
- 共通フロー: スクロールの警告 → 画像の警告（`base.ts:137-140` で警告を追記したあとに
  `finalizeExtraction()` が走る）
- 画像警告の既存テスト（`gemini.test.ts:422`）は `join(' ')` で照合しているので、順序に依存しない。
  UI に並び順の前提があるかは実装時に確認する。

**ADR**: ADR-043「抽出器は `extract()` を上書きせず、フックで振る舞いを変える」を新規作成する。
アーキテクチャテストで強制する規則を追加するため。

### Phase 3: 設定の読み込み失敗をポップアップで扱う（M-2）

**ブランチ**: `fix/popup-settings-read-failure`

**設計上の制約**: `getSettings()` は Service Worker でも、すべてのメッセージ処理の最初に呼ばれる
（`src/background/service-worker.ts:108`）。`getSettings()` 自体を例外を投げる仕様に変えると、
保存・接続テストなどのメッセージ処理がすべて失敗に変わる。したがって既存関数の契約は変えない。

**方針案**（§7 の判断事項 D-3）

- 案 A（推奨）: `src/lib/storage.ts` に、失敗時に例外を投げる読み込み関数を追加する。ポップアップの
  初期化だけがこれを使う。失敗したら既存の `catch`（`app.ts:152`）がエラーを表示し、保存ボタンと
  接続テストボタンを無効にする。`getSettings()` と Service Worker の挙動は変えない。
- 案 B: `getSettings()` の返り値に「既定値で代替したか」を示す印を足す。呼び出し元すべて
  （Service Worker、ポップアップ、テスト）に影響する。

**RED（案 A の場合）**

1. `test/lib/storage.test.ts`: `chrome.storage.sync.get` が reject したら、新関数も reject すること。
2. `test/popup/` : 読み込みが失敗したら、エラーが表示され、保存・接続テストが無効になること。
   フォームが既定値で埋まったまま保存できる状態にならないこと。

**対象外**: Service Worker が読み込み失敗時に既定値で処理を続ける挙動（§6）。

### Phase 4: 単一情報源の小修正（M-5, L-3, L-4）

**ブランチ**: `refactor/single-source-defaults`

- M-5: `app.ts:465` の直書きを `DEFAULT_SYNC_SETTINGS.imageVaultPath` に置き換える。
- L-3: `layering.test.ts:72` の `because(...)` を実態に合わせる（extractors が content の兄弟
  モジュールを import することを明記）。
- L-4:
  - `BASE64_CHUNK_SIZE` を `src/lib/constants.ts` に 1 つだけ置き、2 か所から import する。
    `background/` と `lib/` はどちらも `lib/` を import してよい（`layering.test.ts` の規則）。
  - トーストのアニメーション時間を 1 つの定数にし、CSS の `0.3s`（86, 398 行）と `setTimeout` の
    `300`（404 行）をそこから作る。

テストは既存のものが通ることを確認する。値そのものは変えない。

### Phase 5: アーキテクチャ規則の追加（L-1, L-2）

**ブランチ**: `test/arch-offscreen-and-dom-boundary`

1. `layering.test.ts` に「offscreen は lib だけを import する」を追加する（§4-4 の `onlyImportFrom`）。
2. 「background は DOM 依存モジュール（`lib/scroll-manager`、`lib/scroll-axis`、`lib/sanitize`）を
   import しない」を追加する。
3. どちらも、違反する import を一時的に足したときに失敗すること（RED）を確認してから確定する。
   glob は既存テストと同じ `**/dir/**` 形式に合わせる（過去に glob の書き方で規則が空振りした経緯がある）。

**判断事項 D-4**: DOM 依存モジュールを `lib/` から `content/` へ移すかどうか。移せば規則は不要に
なるが、import の書き換えが 10 ファイル以上に及ぶ。本計画では規則の追加だけを既定とする。

### Phase 6: 構造のリファクタリング（M-3, M-4, L-5, L-6）

振る舞いを変えない変更だけで構成する。1 項目 1 PR とし、既存テストと Phase 1〜5 のテストが
すべて通ることを条件にする。

| 項目 | 内容 |
| ---- | ---- |
| M-3a | `base.ts` から Deep Research 結果の構築を別モジュールへ切り出す |
| M-3b | `base.ts` から結果の検証とメタデータ構築を別モジュールへ切り出す |
| M-3c | `scroll-manager.ts` を、期限の解決・読み込み型エンジン・蓄積型エンジン・マージ処理に分割する |
| M-4  | §3 M-4 の 13 関数を 50 行未満にする（手順の切り出し）。`handleSync` から着手する |
| L-5  | `markdown-rules.ts` に `HTMLElement` の型ガードを 1 つ置き、`as HTMLElement` を置き換える |
| L-6  | `claude.ts` の 4 補助関数を `string[]` を返す形にし、呼び出し側で連結する |

M-3 の分割は Phase 2 の完了後に行う（Gemini のフック化で `base.ts` の構成が変わるため）。

### Phase 7: 分岐カバレッジの補強（L-7）

`footnotes.ts` と `date-utils.ts` の未到達分岐（カバレッジ表の未カバー行: `footnotes.ts:46`、
`date-utils.ts:37-50`）にテストを追加する。

---

## 6. 対象外（本計画では扱わない）

次の項目は分析中に気づいたが、本計画の範囲外とする。扱う場合は別途起票する。

| 項目 | 理由 |
| ---- | ---- |
| Service Worker が設定読み込み失敗時に既定値で処理を続ける | すべてのメッセージ処理に関わる。M-2 とは別に設計が要る |
| 自動スクロール無効時の取得が、読み込み済みの範囲だけで終わり、打ち切りの印も付かない | 全 PF 共通の既存挙動で、ADR-033 の想定の外にある。変更には仕様の決定が要る |
| `testConnection` を送信元で制限する、`VALID_MESSAGE_ACTIONS` を型から導出する、正規化済み設定への冗長な `?? DEFAULT_*` | 分析エージェントの指摘で、本書の作成時点では未検証 |

---

## 7. 判断事項

| # | 判断事項 | 選択肢 | 推奨 | 決定（2026-09-29） |
| - | -------- | ------ | ---- | ------------------ |
| D-1 | 着手するフェーズの範囲 | 全フェーズ / Phase 1〜3 のみ / Phase 1 のみ | Phase 1〜3 を先に行い、4〜7 は個別に判断 | 全フェーズを実行 |
| D-2 | Phase 1 と Phase 2 を分けるか | 分ける / 1 PR にまとめる | 分ける（データ損失の修正を小さい差分で先に出す） | 分ける |
| D-3 | Phase 3 の方式 | 案 A / 案 B | 案 A（Service Worker に影響しない） | 案 A |
| D-4 | DOM 依存モジュールの移動 | 規則の追加のみ / `content/` へ移動 | 規則の追加のみ | 規則の追加のみ |

---

## 8. リスク

| リスク | 対策 |
| ------ | ---- |
| Phase 1 で、これまで上書きされていた Gemini のノートが保存拒否になる | 意図した変化（ADR-033 と同じ）。拒否時のメッセージは既存のものを使う。リリースノートに記載する |
| Phase 2 で Gemini の画像添付や警告の挙動が変わる | Phase 1 のテストと既存の画像テストを回帰テストにする。警告の並び順の変化は PR に明記する |
| Gemini の実機での挙動は単体テストで確認しきれない | Phase 1 と 2 のマージ前に、利用者の Chrome で Gemini の長い会話を保存するスモークテストを依頼する（自動化プロファイルには拡張機能が読み込まれないため） |
| Phase 6 の分割で差分が大きくなる | 1 項目 1 PR。振る舞いの変更を含めない |

---

## 9. 根拠一覧

- コード: 本文中の `ファイル:行` はすべて `af49133` 時点のもの。
- 計測コマンド: `npx tsc --noEmit -p .`、`npm run lint`、`npx vitest run --coverage`、TypeScript
  Compiler API による関数行数の計測、`git log --since=2026-06-01 --name-only -- src`。
- 外部仕様: §4 の表を参照。

---

## 10. 実施結果（2026-09-29）

### 10.1 フェーズとブランチ

各ブランチは直前のブランチの上に積んである（スタック）。PR はまだ作成していない。

| Phase | 対象 | ブランチ | 結果 |
| ----- | ---- | -------- | ---- |
| — | 本計画書 | `docs/quality-architecture-remediation-plan` | 完了 |
| 1 | H-1 | `fix/gemini-truncated-flag` | 完了 |
| 2 | M-1 | `refactor/gemini-extract-hooks` | 完了（ADR-043） |
| 3 | M-2 | `fix/popup-settings-read-failure` | 完了 |
| 4 | M-5, L-3, L-4 | `refactor/single-source-defaults` | 完了 |
| 5 | L-1, L-2 | `test/arch-offscreen-and-dom-boundary` | 完了 |
| 6 | L-6 | `refactor/claude-tool-content-parts` | 完了 |
| 6 | L-5 | `refactor/markdown-rules-type-guard` | 完了 |
| 6 | M-3b | `refactor/base-extraction-result` | 完了 |
| 6 | M-3a | `refactor/base-deep-research-builder` | 完了 |
| 6 | M-3c | `refactor/split-scroll-manager` | 完了 |
| 6 | M-4 | `refactor/split-long-functions` | 完了 |
| 7 | L-7 | `test/branch-coverage-footnotes-dates` | 完了 |

### 10.2 計測値の変化

| 項目 | 実施前（`af49133`） | 実施後 |
| ---- | ------------------- | ------ |
| テスト数 | 2,413 | 2,462 |
| カバレッジ（文 / 分岐 / 関数 / 行） | 96.86% / 88.44% / 99.18% / 97.86% | 96.96% / 88.95% / 99.37% / 97.98% |
| 50 行超の関数 | 13 件 | 0 件 |
| `base.ts` の行数 | 678 | 579 |
| `scroll-manager.ts` の行数 | 682 | 分割（最大は `scroll-accumulate.ts` の 311） |
| `markdown-rules.ts` の型アサーション | 15 件 | 1 件（`cloneNode()` の戻り値） |

全フェーズで `lint` → `format:check` → `test:coverage` → `build` を通過した。

### 10.3 計画からの変更点

| 箇所 | 計画 | 実施 | 理由 |
| ---- | ---- | ---- | ---- |
| Phase 1 テスト 2 | idle-timeout でも `truncated` が立つテスト | 追加しない | `truncated` は停止理由ではなく警告の有無で決まり、idle と max は同じ分岐を通る（`describeScrollStop()` は `complete` 以外で必ず警告を返す）。また単体テストで idle を起こすのは難しい。進捗がなければ 1 反復 1.2 秒（`SCROLL_REARM_DELAY` 200ms + `SCROLL_POLL_INTERVAL` 1000ms）× 安定判定 3 回 = 3.6 秒で完了し、idle の最小値 5 秒に届かない。ただし実機では、背景タブでタイマーが間引かれると到達しうる |
| Phase 1 テスト 5 | `conversationToNote()` を通す継ぎ目のテスト | 追加しない | `data.truncated` → `note.truncated` は `test/content/markdown.test.ts:1445` が PF 非依存で検証済み。Phase 1 のテストは `result.data.truncated` を直接検証している |
| Phase 1 否定側 | — | 完了・無効・コンテナなしで `truncated` が立たないことを追加 | 常に立てる変異体で 3 件とも失敗することを確認した |
| Phase 2 アーキテクチャテスト | 戻り値型付きの宣言を検出 | 戻り値型なし・プロパティ代入も検出 | レビューで `async extract() {` が素通りすると指摘された。3 形式の違反と、呼び出し（`this.extract()`）を誤検出しないことを確認した |
| Phase 3 | 既存の `catch` でエラー表示 | 計画どおり。文言は既存の `toast_error_connectionFailed` | 文言の見直しは範囲外（§10.4） |
| Phase 4 L-4 | `BASE64_CHUNK_SIZE` を `constants.ts` に移す | `output-handlers.ts` が `bytesToBase64()` を再利用し、重複したループごと削除 | 定数だけでなく処理そのものが重複していた。多バイト文字がチャンク境界をまたぐ往復テストを先に追加した |
| Phase 5 L-1 | `onlyImportFrom` | `notImportFrom` | 既存の 5 規則と書き方を揃えた。効果は同じ（違反の植え込みで失敗を確認） |
| Phase 6 L-5 | `HTMLElement` の型ガードを追加 | キャストを削除 | `@types/turndown` の `FilterFunction` / `ReplacementFunction` が既に `node: HTMLElement` と型付けしている。キャストは何も主張していなかった |
| Phase 6 M-3c | 4 分割 | 4 分割、再エクスポート用のファサードは置かない。テストファイルを `scroll-accumulate.test.ts` に改名 | 利用側が必要なモジュールを直接 import する |
| Phase 6 の順序 | M-3a → M-3b | M-3b → M-3a | Deep Research の組み立てが `buildMetadata()` に依存するため |
| U-02 | 未確認 | 解消 | UI は警告を `join` するか順に並べるだけで、位置に依存しない（`bootstrap.ts`、`ui-badge.ts`） |
| Q-01 | 「10 ファイル以上」 | 正しくは `src/` 6 ファイル（import 文 10 行）+ テスト 5 ファイル | D-4 は「規則の追加のみ」に決定済みのため、判断への影響はない |

### 10.4 残課題

- **Gemini の実機スモーク**（§8）: 未実施。Phase 1・2 のマージ前に、自動スクロールを有効にした長い会話の保存を利用者の Chrome で確認する必要がある。
- **push と PR 作成**: 未実施。
- **レビューで出た範囲外の指摘**（未着手）:
  - 設定読み込み失敗時の文言が「接続失敗」になっている（`toast_error_connectionFailed`）。
  - `ensureAllElementsLoaded` / `resolveScrollDeadlines` / `describeScrollStop` に直接の単体テストがない（`main` から存在する状態）。
  - 過去の ADR（012, 017, 018, 022, 036, 042）が削除済みの `scroll-manager.ts` / `scroll-manager.test.ts` を参照している。ADR は記録なので書き換えていない。
- **§6 の対象外項目**: 未着手。
