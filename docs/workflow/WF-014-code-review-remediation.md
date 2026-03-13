# コードレビュー是正 実装ワークフロー

**設計書**: [DES-014-code-review-remediation.md](../design/DES-014-code-review-remediation.md)
**作成日**: 2026-03-13
**推定工数**: 2-3時間
**ベースブランチ**: main

---

## 依存関係図

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: セキュリティ修正 (並列可)                            │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│  │ 1.1 path     │ │ 1.2 port     │ │ 1.3 CSP           │   │
│  │ traversal    │ │ validation   │ │ unsafe-inline     │   │
│  └──────┬───────┘ └──────┬───────┘ └────────┬──────────┘   │
│         └────────────────┼──────────────────┘               │
│                          ▼                                   │
│                    テスト・ビルド検証                          │
├─────────────────────────────────────────────────────────────┤
│ Phase 2: Immutability 修正 (順次)                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2.1 validateObsidianSettings → 純関数化              │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2.2 claude.ts msg.toolContent → map で新規生成       │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2.3 gemini.ts result.warnings → スプレッド構文       │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2.4 source-map.ts import type 修正                   │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│                    テスト・ビルド検証                          │
├─────────────────────────────────────────────────────────────┤
│ Phase 3: テスト品質修正 (順次)                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3.1 scheduleOffscreenClose → fake timers             │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3.2 throttle → src/lib/throttle.ts 抽出 + テスト    │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           ▼                                  │
│                    テスト・ビルド検証                          │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: MEDIUM バッチ (並列可)                               │
│  4.1 types.ts → 4.2 index.ts → 4.3 deep-research.ts       │
│  4.4 validation.ts → 4.5 popup + output-handlers           │
│  4.6 base.ts                                                │
│                    テスト・ビルド検証                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: セキュリティ修正

**ブランチ**: `fix/security-review-findings`

### 1.1 パストラバーサル検証追加

**対象**: `src/background/validation.ts`

```
□ validateNoteData() 内、fileName 長さチェックの後に追加:
    if (containsPathTraversal(note.fileName)) {
      return false;
    }
□ テスト追加: test/background/ 内で以下のケースを追加:
    - fileName: "../../etc/passwd" → false
    - fileName: "..%2F..%2Fetc/passwd" → false
    - fileName: "normal-file.md" → true (既存テストで確認)
```

### 1.2 ポート値の無条件バリデーション

**対象**: `src/popup/index.ts`

```
□ clampPort() ヘルパー関数を追加:
    function clampPort(port: number): number {
      if (!Number.isFinite(port) || port < MIN_PORT || port > MAX_PORT) {
        return DEFAULT_OBSIDIAN_PORT;
      }
      return port;
    }
□ collectSettings() 内の obsidianPort 行を変更:
    Before: parseInt(elements.port.value, 10) || DEFAULT_OBSIDIAN_PORT
    After:  clampPort(parseInt(elements.port.value, 10))
□ テスト追加: NaN、0、99999 のポート値で DEFAULT_OBSIDIAN_PORT にフォールバックすることを確認
```

### 1.3 CSP `unsafe-inline` 除去

**対象**: `src/manifest.json`, `src/offscreen/offscreen.html`

```
□ offscreen.html の textarea から style= 属性を削除
□ offscreen.html に <link rel="stylesheet" href="offscreen.css" /> を追加
□ src/offscreen/offscreen.css を新規作成:
    .offscreen-textarea { position: absolute; left: -9999px; }
□ offscreen.html の textarea に class="offscreen-textarea" を追加
□ manifest.json の style-src から 'unsafe-inline' を削除:
    Before: style-src 'self' 'unsafe-inline'
    After:  style-src 'self'
□ npm run build で production build が成功することを確認
□ npm run dev で dev server が動作することを確認
    → HMR で style injection エラーが出る場合、CRXJS の設定を調査
```

### Phase 1 検証

```
□ npm test    → 全テスト PASS
□ npm run lint → 0 errors, 0 warnings
□ npm run build → 成功
```

---

## Phase 2: Immutability 修正

**ブランチ**: `fix/immutability-violations`

### 2.1 `validateObsidianSettings` 純関数化

**対象**: `src/popup/index.ts:297-361`

```
□ ObsidianValidationResult インターフェースを定義
□ validateObsidianSettings() の戻り値を変更:
    Before: string | null (mutation side effect)
    After:  ObsidianValidationResult (pure return)
□ handleSave() の呼び出し側を更新:
    - validation.error をチェック
    - normalizedApiKey, normalizedVaultPath で新しい settings オブジェクトを生成
□ callout type の正規化を collectSettings() 内に移動:
    Before: handleSave() 内で settings.templateOptions を変異
    After:  collectSettings() 内で validateCalloutType() を適用済みの値を返す
□ 既存テストが PASS することを確認
```

### 2.2 `msg.toolContent` の変異除去

**対象**: `src/content/extractors/claude.ts:258-268`

```
□ for ループによる mutation を map + スプレッドに変更:
    if (toolContentMap.size === 0) return messages;
    return messages.map(msg => {
      if (msg.role !== 'assistant') return msg;
      const idx = parseInt(msg.id.split('-')[1], 10);
      const tc = toolContentMap.get(idx);
      return tc ? { ...msg, toolContent: tc } : msg;
    });
□ 既存テスト (test/extractors/claude.test.ts) が PASS することを確認
```

### 2.3 `result.warnings` の変異除去

**対象**: `src/content/extractors/gemini.ts:193-207`

```
□ onAfterExtract() をスプレッド構文で書き直し:
    - this.lastScrollResult = null を return 前に移動
    - result.warnings.push → { ...result, warnings: [...(result.warnings ?? []), warning] }
□ 既存テスト (test/extractors/gemini.test.ts) が PASS することを確認
```

### 2.4 `import type` 修正

**対象**: `src/lib/source-map.ts:8`

```
□ import { DeepResearchSource } → import type { DeepResearchSource }
```

### Phase 2 検証

```
□ npm test    → 全テスト PASS
□ npm run lint → 0 errors, 0 warnings
□ npm run build → 成功
□ git diff で変更がセキュリティに影響しないことを確認
```

---

## Phase 3: テスト品質修正

**ブランチ**: `fix/test-quality`

### 3.1 `scheduleOffscreenClose` フェイクタイマー化

**対象**: `test/background/index.test.ts`

```
□ 該当テストを特定（scheduleOffscreenClose 関連、~line 1058-1078）
□ vi.waitFor({ timeout: 7000 }) を削除
□ vi.useFakeTimers() を beforeEach に追加
□ vi.advanceTimersByTime(5001) で時間を進める
□ vi.useRealTimers() を afterEach に追加
□ テスト実行時間が <500ms に短縮されたことを確認
```

### 3.2 `throttle` のモジュール抽出

**対象**: `src/content/index.ts:39-51` → `src/lib/throttle.ts`

```
□ src/lib/throttle.ts を新規作成:
    - export function throttle<T>(...) をそのまま移動
    - JSDoc コメント付与
□ src/content/index.ts を修正:
    - throttle 関数定義を削除
    - import { throttle } from '../lib/throttle' を追加
□ test/lib/throttle.test.ts を新規作成:
    - vi.useFakeTimers() を使用
    - テストケース:
      □ 初回呼び出しは即座に実行
      □ limit 期間内の2回目は無視
      □ limit 経過後は再度実行可能
      □ 引数が正しく渡される
□ test/content/index.test.ts の throttle 再実装テストを更新:
    - 再実装コピーを削除
    - 実際の throttle 関数を import してテスト（or テストブロックを削除）
```

### Phase 3 検証

```
□ npm test    → 全テスト PASS
□ npm run lint → 0 errors, 0 warnings
□ npm run build → 成功
□ テスト実行時間が改善されたことを確認（~4秒短縮）
```

---

## Phase 4: MEDIUM バッチ

**ブランチ**: `fix/medium-review-findings`

```
□ 4.1 src/lib/types.ts:
    - openaiApiKey?: string を削除
    - enableAutoTags?: boolean を削除
    - 参照がないことを grep で確認
□ 4.2 src/content/index.ts:191:
    - window.location.href → window.location.hostname
□ 4.3 src/content/markdown-deep-research.ts:167-169:
    - let sourceMap = ... を const + ternary に変更:
      const sourceMap = links && links.sources.length > 0
        ? buildSourceMap(links.sources)
        : new Map<number, DeepResearchSource>();
□ 4.4 src/background/validation.ts:120:
    - if (note.frontmatter) { → if (!note.frontmatter) return false;
    - テスト追加: frontmatter が undefined のケースで false を返す
□ 4.5a src/popup/index.ts:390:
    - response.error || getMessage(...) → response.error ?? getMessage(...)
□ 4.5b src/background/output-handlers.ts:178:
    - response?.error || 'Clipboard...' → response?.error ?? 'Clipboard...'
□ 4.6 src/content/extractors/base.ts:203-212:
    - sortByDomPosition を非破壊に変更:
      protected sortByDomPosition(elements: Array<...>): Array<...> {
        return [...elements].sort((a, b) => ...);
      }
    - 呼び出し元を更新（allElements = this.sortByDomPosition(allElements)）
```

### Phase 4 検証

```
□ npm test    → 全テスト PASS
□ npm run lint → 0 errors, 0 warnings
□ npm run build → 成功
```

---

## 最終チェックリスト

```
□ 全 Phase の変更を main にマージ
□ npm test && npm run lint && npm run build が PASS
□ カバレッジが 96% 以上を維持
□ テスト数が 742 以上（新規テスト追加分）
□ MEMORY.md のテスト数を更新（631 → 742+）
```

---

## PR 戦略

| Phase | ブランチ名 | PR タイトル |
|-------|-----------|------------|
| 1 | `fix/security-review-findings` | `security: add path traversal check, port validation, remove CSP unsafe-inline` |
| 2 | `fix/immutability-violations` | `refactor: eliminate mutation patterns in extractors and popup` |
| 3 | `fix/test-quality` | `test: use fake timers, extract throttle to testable module` |
| 4 | `fix/medium-review-findings` | `fix: address medium priority code review findings` |

**マージ順序**: Phase 1 → 2 → 3 → 4（Phase 3 は Phase 2 の content/index.ts 変更後）
