# DES-014: コードレビュー是正 — セキュリティ・品質・テスト改善

## Context

**Problem**: 2026-03-13 の包括的コードレビューにより、HIGH 9件・MEDIUM 12件・LOW 9件の指摘事項が検出された。CRITICAL は 0 件。全体として成熟したコードベースだが、セキュリティ上の隙間、immutability 違反、テスト品質の問題がある。

**Scope**: 全 HIGH 9件を対象。MEDIUM/LOW は優先度の高いものをバッチ処理。

**Current State**:
- Build: PASS, Lint: 0 errors, Tests: 742/742, Coverage: 96.02%
- npm audit: 0 vulnerabilities

---

## Design Decisions

### Phase 1: セキュリティ修正

#### 1.1 — H-1: `note.fileName` パストラバーサル検証の欠落

**ファイル**: `src/background/validation.ts:103-138`

**現状**: `validateNoteData()` は `note.fileName` の長さのみ検証。`containsPathTraversal()` は既に import 済みだが、`getExistingFile` アクションでのみ使用。`saveToObsidian` / `saveToOutputs` の書き込みパスでは未使用。

**リスク**: 悪意のあるコンテンツスクリプトが `fileName: "../../etc/passwd"` を含むメッセージを送信可能。

**変更**:

```typescript
// validation.ts — validateNoteData() 内、line 112 の後に追加
if (containsPathTraversal(note.fileName)) {
  return false;
}
```

**影響範囲**: ゼロ。既存の呼び出し元は `false` を処理済み。

---

#### 1.2 — H-3: ポート値の無条件バリデーション

**ファイル**: `src/popup/index.ts:283, 304`

**現状**: ポート範囲チェックは `validateObsidianSettings()` 内にあり、`outputOptions.obsidian` が true の場合のみ実行。Obsidian 出力を無効にしてポートを変更すると、不正な値が `chrome.storage` に保存される。

**変更**: `collectSettings()` 内でサニタイズ関数を適用し、無条件に正規化。

```typescript
// 新ヘルパー関数
function clampPort(port: number): number {
  if (!Number.isFinite(port) || port < MIN_PORT || port > MAX_PORT) {
    return DEFAULT_OBSIDIAN_PORT;
  }
  return port;
}

// collectSettings() 内 (line 283):
// Before: obsidianPort: parseInt(elements.port.value, 10) || DEFAULT_OBSIDIAN_PORT,
// After:  obsidianPort: clampPort(parseInt(elements.port.value, 10)),
```

**影響範囲**: `validateObsidianSettings` の port チェックは冗長になるが、defense-in-depth として残す。

---

#### 1.3 — H-2: CSP `style-src 'unsafe-inline'` の除去

**ファイル**: `src/manifest.json:29`, `src/offscreen/offscreen.html:10`

**現状**: popup は外部 `styles.css` を使用しており inline `<style>` タグなし。ただし:
- `offscreen.html:10` に `style="position: absolute; left: -9999px"` がある
- `ui.ts:277` の `toast.style.animation` はコンテンツスクリプト内（extension pages CSP 対象外）

**変更**:

```
offscreen.html:  style= 属性を削除、class="offscreen-textarea" に変更
offscreen.css:   .offscreen-textarea { position: absolute; left: -9999px; } を追加
                 (既存の offscreen.html に <link> を追加)
manifest.json:   style-src 'self' 'unsafe-inline' → style-src 'self'
```

**リスク**: CRXJS Vite の HMR が dev モードで inline style を注入する可能性。`npm run dev` で動作確認必要。production build には影響なし。

```
┌─────────────────────────────────────────────┐
│ CSP style-src 変更のスコープ                   │
│                                               │
│  extension_pages CSP が適用されるページ:       │
│    ✓ popup/index.html                         │
│    ✓ offscreen/offscreen.html                 │
│                                               │
│  extension_pages CSP が適用されないスクリプト:  │
│    ✗ content scripts (ui.ts)                  │
│    ✗ background service worker                │
└─────────────────────────────────────────────┘
```

---

### Phase 2: Immutability 修正

#### 2.1 — H-4: `validateObsidianSettings` のパラメータ変異

**ファイル**: `src/popup/index.ts:297-315`

**現状**: `settings.obsidianApiKey` と `settings.vaultPath` を直接書き換え。

**変更**: 正規化された値を含む結果オブジェクトを返す。

```typescript
interface ObsidianValidationResult {
  error: string | null;
  normalizedApiKey: string;
  normalizedVaultPath: string;
}

function validateObsidianSettings(settings: ExtensionSettings): ObsidianValidationResult {
  let normalizedApiKey: string;
  try {
    normalizedApiKey = validateApiKey(settings.obsidianApiKey);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid API key',
      normalizedApiKey: settings.obsidianApiKey,
      normalizedVaultPath: settings.vaultPath,
    };
  }

  if (settings.obsidianPort < MIN_PORT || settings.obsidianPort > MAX_PORT) {
    return {
      error: getMessage('error_invalidPort'),
      normalizedApiKey,
      normalizedVaultPath: settings.vaultPath,
    };
  }

  let normalizedVaultPath: string;
  try {
    normalizedVaultPath = validateVaultPath(settings.vaultPath);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid vault path',
      normalizedApiKey,
      normalizedVaultPath: settings.vaultPath,
    };
  }

  return { error: null, normalizedApiKey, normalizedVaultPath };
}
```

**呼び出し側の変更** (`handleSave()`):

```typescript
const validation = validateObsidianSettings(settings);
if (validation.error) {
  showStatus(validation.error, 'error');
  return;
}
const normalizedSettings: ExtensionSettings = {
  ...settings,
  obsidianApiKey: validation.normalizedApiKey,
  vaultPath: validation.normalizedVaultPath,
};
```

**callout type の変異も同様に修正**: `handleSave()` 内の lines 344-348 を `collectSettings()` 内で正規化。

---

#### 2.2 — H-5: `msg.toolContent` の変異

**ファイル**: `src/content/extractors/claude.ts:258-268`

**現状**: `buildMessagesFromElements` が返したメッセージを for ループで変異。

**変更**: `map` で新オブジェクトを生成。

```typescript
// After buildMessagesFromElements (line 256):
if (toolContentMap.size === 0) return messages;

return messages.map(msg => {
  if (msg.role !== 'assistant') return msg;
  const idx = parseInt(msg.id.split('-')[1], 10);
  const tc = toolContentMap.get(idx);
  return tc ? { ...msg, toolContent: tc } : msg;
});
```

**影響範囲**: ゼロ — 返り値の型は同一、既存テストは behavioral equivalence。

---

#### 2.3 — H-6: `result.warnings` の変異

**ファイル**: `src/content/extractors/gemini.ts:193-207`

**現状**: `result.warnings.push(warning)` / `result.warnings = [warning]` で直接変異。

**変更**: スプレッド構文で新オブジェクトを返す。

```typescript
protected onAfterExtract(result: ExtractionResult): ExtractionResult {
  const sr = this.lastScrollResult;
  this.lastScrollResult = null; // reset before return

  if (sr && !sr.fullyLoaded && !sr.skipped) {
    const warning =
      `Auto-scroll timed out after ${SCROLL_TIMEOUT / 1000}s. ` +
      `Some earlier messages may be missing (${sr.elementCount} turns loaded).`;
    return {
      ...result,
      warnings: [...(result.warnings ?? []), warning],
    };
  }

  return result;
}
```

---

#### 2.4 — H-7: `import type` の欠落

**ファイル**: `src/lib/source-map.ts:8`

**変更**: `import { DeepResearchSource }` → `import type { DeepResearchSource }`

---

### Phase 3: テスト品質修正

#### 3.1 — T-1: リアルタイマーからフェイクタイマーへ

**ファイル**: `test/background/index.test.ts`（`scheduleOffscreenClose` テスト）

**現状**: 実 5 秒の `setTimeout` を `vi.waitFor({ timeout: 7000 })` で待機。テスト所要時間 4.3 秒。CI でフレーキー化のリスク。

**変更**:

```typescript
it('should schedule offscreen close', async () => {
  vi.useFakeTimers();
  // ... trigger scheduleOffscreenClose
  vi.advanceTimersByTime(5001);
  expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
  vi.useRealTimers();
});
```

**効果**: テスト実行時間 4.3 秒 → <100ms。フレーキーリスク排除。

---

#### 3.2 — T-2: `throttle` のテスト可能モジュール化

**ファイル**: `src/content/index.ts:39-51`（現在）→ `src/lib/throttle.ts`（新規）

**現状**: `throttle` 関数は `content/index.ts` の module-internal。テストファイルは独自に再実装したコピーをテスト — 本物のコードはテスト対象外。

**変更**:

```
新規: src/lib/throttle.ts    — export function throttle<T>(...)
新規: test/lib/throttle.test.ts — vi.useFakeTimers() で実装テスト
修正: src/content/index.ts   — import { throttle } from '../lib/throttle'
修正: test/content/index.test.ts — 再実装コピーを削除（or テスト自体を削除）
```

**throttle.ts 仕様**:

```typescript
/**
 * Leading-edge throttle. Executes immediately on first call,
 * then blocks subsequent calls for `limit` ms.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
```

---

### Phase 4: MEDIUM 優先バッチ

| ID | ファイル | 変更内容 |
|----|---------|---------|
| M-3 | `types.ts:194-195` | `openaiApiKey?` と `enableAutoTags?` を削除（未使用） |
| M-4 | `content/index.ts:191` | `window.location.href` → `window.location.hostname` |
| M-7 | `markdown-deep-research.ts:167-169` | `let sourceMap` → `const sourceMap = ... ? ... : new Map()` |
| M-8 | `validation.ts:120` | `if (note.frontmatter)` → `if (!note.frontmatter) return false` |
| L-3 | `popup/index.ts:390`, `output-handlers.ts:178` | `\|\|` → `??` |
| L-4 | `base.ts:203-212` | `sortByDomPosition` を `return [...elements].sort(...)` に |

---

## 依存関係グラフ

```
Phase 1 (セキュリティ) ←── 独立
Phase 2 (immutability) ←── 独立
Phase 3 (テスト品質) ←── Phase 2 完了後（content/index.ts の共有）
Phase 4 (MEDIUM バッチ) ←── 独立

Phase 1 ──┐
Phase 2 ──┼── 並列実行可能
Phase 4 ──┘
              │
              ▼
           Phase 3 ── content/index.ts を Phase 2 と共有
```

---

## テスト戦略

| 変更 | テスト対応 |
|------|-----------|
| H-1 path traversal | `validateNoteData` テストに traversal ケース追加 |
| H-3 port clamp | `collectSettings` テストに NaN/out-of-range ケース追加 |
| H-2 CSP | `npm run dev` / `npm run build` で手動検証 |
| H-4 validation return | 既存テスト + 戻り値の型変更テスト |
| H-5/H-6 immutability | 既存テストが behavioral equivalence で通過 |
| T-1 fake timers | テスト実行時間の短縮を確認 |
| T-2 throttle | 新規テストファイル作成 |
| M-8 frontmatter guard | `validateNoteData` テストに frontmatter 欠落ケース追加 |

**検証基準**: 全変更後に `npm test && npm run lint && npm run build` が PASS であること。

---

## 代替案（却下）

### CSP `unsafe-inline` を残す案
CRXJS の dev モード互換性を優先し `unsafe-inline` を残す案。却下理由: production build には不要であり、CSS injection のリスクを放置することになる。dev モードのみ CSP を緩和する設定が CRXJS で可能かを調査した上で、production CSP から除去する方針とする。

### `validateObsidianSettings` を純関数化せず mutation を許容する案
DOM 操作コードでの mutation は一般的だが、このプロジェクトの coding-style ルールが明示的に禁止しているため却下。
