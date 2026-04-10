# WF-002: Gemini Auto-Scroll Implementation Workflow

| Field | Value |
|-------|-------|
| **Document ID** | WF-002 |
| **Date** | 2026-02-20 |
| **Issue** | [#49](https://github.com/sho7650/obsidian-AI-exporter/issues/49) |
| **ADR** | [ADR-002](../adr/002-gemini-auto-scroll.md) |
| **Design Spec** | [DES-002](../design/002-gemini-auto-scroll.md) |

---

## Dependency Graph

```
Phase 0: Branch
    │
    ▼
Phase 1: Constants ─────────────────────┐
    │                                    │
    ▼                                    ▼
Phase 2: GeminiExtractor          Phase 3: Test Helpers
    │                                    │
    └──────────┬─────────────────────────┘
               ▼
         Phase 4: Tests
               │
               ▼
         Phase 5: Verification
               │
               ▼
         Phase 6: Documentation
```

Phase 1 と Phase 3 は互いに依存しないため並行実行可能。
Phase 4 は Phase 2 と Phase 3 の両方に依存する。

---

## Phase 0: Branch Creation

| Step | Action | Validation |
|------|--------|------------|
| 0.1 | `git checkout -b feature/gemini-auto-scroll` | `git branch --show-current` → `feature/gemini-auto-scroll` |

---

## Phase 1: Constants

**File**: `src/lib/constants.ts`

| Step | Action | Detail |
|------|--------|--------|
| 1.1 | Existing `// Security Constants` セクションの後に新セクション追加 | DES-002 §4.2 参照 |
| 1.2 | `SCROLL_POLL_INTERVAL = 1000` 追加 | |
| 1.3 | `SCROLL_TIMEOUT = 30000` 追加 | |
| 1.4 | `SCROLL_STABILITY_THRESHOLD = 3` 追加 | |

**Checkpoint 1**:
```bash
npm run build   # TypeScript compilation: 0 errors
npm run lint    # ESLint: 0 errors, 0 warnings
```

---

## Phase 2: GeminiExtractor Implementation

**File**: `src/content/extractors/gemini.ts`

### Step 2.1: Import 追加

```
import 文に SCROLL_TIMEOUT, SCROLL_POLL_INTERVAL, SCROLL_STABILITY_THRESHOLD を追加
```

**依存**: Phase 1 完了

### Step 2.2: SELECTORS に scrollContainer 追加

```
SELECTORS object に scrollContainer エントリーを追加 (DES-002 §4.3)
```

### Step 2.3: ScrollResult interface 追加

```
GeminiExtractor class 定義の直前に module-private interface を追加 (DES-002 §4.1)
```

### Step 2.4: delay() method 追加

```
GeminiExtractor class に private delay(ms) method を追加 (DES-002 §5.3)
```

### Step 2.5: countConversationElements() method 追加

```
GeminiExtractor class に private countConversationElements() method を追加 (DES-002 §5.2)
```

### Step 2.6: ensureAllMessagesLoaded() method 追加

```
GeminiExtractor class に private async ensureAllMessagesLoaded() を追加 (DES-002 §5.1)
アルゴリズム: scrollTo loop → stability check → timeout
```

**これが最も複雑なステップ。DES-002 §5.1 のアルゴリズムに厳密に従うこと。**

### Step 2.7: extract() method 修正

```
1. Deep Research check 後に ensureAllMessagesLoaded() 呼び出しを挿入
2. buildConversationResult() の戻り値を変数に受ける
3. timeout warning の追加ロジックを挿入
(DES-002 §9 の After コード参照)
```

**Checkpoint 2**:
```bash
npm run build   # TypeScript compilation: 0 errors
npm run lint    # ESLint: 0 errors, 0 warnings
npm test        # 既存テスト全パス (scroll container がないため skip path を通る)
```

---

## Phase 3: Test Helpers

**File**: `test/fixtures/dom-helpers.ts`

| Step | Action | Detail |
|------|--------|--------|
| 3.1 | `createGeminiScrollableDOM()` 関数追加 | DES-002 §11.2 参照 |
| 3.2 | `mockScrollContainer()` 関数追加 | DES-002 §11.2 参照 |
| 3.3 | 両関数を export に追加 | 既存の export パターンに合わせる |

**Checkpoint 3**:
```bash
npm run build   # TypeScript compilation: 0 errors
```

---

## Phase 4: Tests

**File**: `test/extractors/gemini.test.ts`

**依存**: Phase 2 + Phase 3 完了

### Step 4.1: Import 追加

```
- createGeminiScrollableDOM, mockScrollContainer を dom-helpers から import
- SCROLL_POLL_INTERVAL, SCROLL_TIMEOUT を constants から import
```

### Step 4.2: describe('ensureAllMessagesLoaded') ブロック追加

既存の `describe('extract')` ブロックの後に追加。

### Step 4.3: Test Case 1 — skip: scrollTop === 0

```
Setup: createGeminiScrollableDOM + mockScrollContainer(0)
Assert: extract() 成功、warning なし、遅延なし
```

### Step 4.4: Test Case 2 — skip: no scroll container

```
Setup: createGeminiConversationDOM のみ (#chat-history なし)
Assert: extract() 成功 (既存動作と同じ)
```

### Step 4.5: Test Case 3 — stabilization

```
Setup: mockScrollContainer(1000, onScrollTo)
  onScrollTo: 最初の 2 回は turn を追加、以降は何もしない
Timer: vi.useFakeTimers() + vi.advanceTimersByTimeAsync()
Assert: fullyLoaded = true, 全メッセージ抽出
```

### Step 4.6: Test Case 4 — timeout

```
Setup: mockScrollContainer(1000, onScrollTo)
  onScrollTo: 毎回 1 turn 追加 (安定しない)
Timer: SCROLL_TIMEOUT まで advance
Assert: result.warnings に timeout メッセージが含まれる
```

### Step 4.7: Test Case 5 — Deep Research bypass

```
Setup: Deep Research panel + scrollContainer(scrollTop > 0)
Assert: extractDeepResearch() の結果が返る、scroll 未実行
```

### Step 4.8: Test Case 6 — full integration

```
Setup: 2 initial turns + mockScrollContainer(500, adds 3 more turns)
Assert: result.data.messages.length === 10 (5 turns × 2 messages)
```

### Step 4.9: Test Case 7 — warning merge

```
Setup: timeout 発生 + buildConversationResult が独自 warning を生成する条件
Assert: result.warnings.length >= 2
```

**Checkpoint 4**:
```bash
npm test        # 全テストパス (既存 + 新規 7 件)
```

---

## Phase 5: Full Verification

| Step | Command | Expected |
|------|---------|----------|
| 5.1 | `npm run lint` | 0 errors, 0 warnings |
| 5.2 | `npm run build` | TypeScript + Vite build: 0 errors |
| 5.3 | `npm test` | 全テストパス |
| 5.4 | `npm test -- --coverage` | Coverage thresholds met (85% stmts, 75% branch) |

全ステップがパスすれば実装完了。

---

## Phase 6: Documentation Update

| Step | Action | File |
|------|--------|------|
| 6.1 | ADR status を `Proposed` → `Accepted` に更新 | `docs/adr/002-gemini-auto-scroll.md` |
| 6.2 | Design spec status を `Draft` → `Final` に更新 | `docs/design/002-gemini-auto-scroll.md` |
| 6.3 | Commit hash を ADR に記載 | `docs/adr/002-gemini-auto-scroll.md` |

---

## Checklist Summary

```
[ ] Phase 0: Branch created
[ ] Phase 1: Constants added
    [ ] Checkpoint 1: build + lint pass
[ ] Phase 2: GeminiExtractor modified
    [ ] 2.1 Imports
    [ ] 2.2 SELECTORS.scrollContainer
    [ ] 2.3 ScrollResult interface
    [ ] 2.4 delay()
    [ ] 2.5 countConversationElements()
    [ ] 2.6 ensureAllMessagesLoaded()
    [ ] 2.7 extract() modified
    [ ] Checkpoint 2: build + lint + existing tests pass
[ ] Phase 3: Test helpers added
    [ ] 3.1 createGeminiScrollableDOM()
    [ ] 3.2 mockScrollContainer()
    [ ] Checkpoint 3: build pass
[ ] Phase 4: Tests added
    [ ] 4.3-4.9 Test cases 1-7
    [ ] Checkpoint 4: all tests pass
[ ] Phase 5: Full verification
    [ ] 5.1 lint
    [ ] 5.2 build
    [ ] 5.3 test
    [ ] 5.4 coverage
[ ] Phase 6: Documentation updated
```
