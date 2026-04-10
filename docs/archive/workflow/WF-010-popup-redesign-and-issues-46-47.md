# WF-010: Implementation Workflow

**Design**: [DES-010](../design/DES-010-popup-redesign-and-issues-46-47.md)
**Issues**: #46, #47
**Date**: 2026-02-21

---

## Execution Summary

```
Phase 1 (Issue #47)  ──→  Phase 2 (Issue #46)  ──→  Phase 3 (UI Redesign)
  Branch: feature/       Branch: feature/           Branch: feature/
  gemini-title-fallback  vault-path-template        popup-ui-redesign
  ~30 min                ~45 min                    ~60 min
```

3つの Phase を順次実行。各 Phase は独立ブランチで PR を作成する。

---

## Phase 1: Gemini Title Extraction (Issue #47)

### Step 1.1: Branch 作成

```
git checkout main && git pull
git checkout -b feature/gemini-title-fallback
```

### Step 1.2: 定数追加 + getTitle() 変更

**File**: `src/content/extractors/gemini.ts`

| Action | Detail |
|--------|--------|
| 追加 | `GEMINI_TITLE_SUFFIX_PATTERN` 定数（SELECTORS の後、class の前） |
| 変更 | `getTitle()` — `document.title` チェックを先頭に追加 |

**Ref**: DES-010 §2.4.1, §2.4.2

### Step 1.3: テスト追加

**File**: `test/extractors/gemini.test.ts`

`getTitle` describe ブロック (L79-118) に 5 テストケースを追加:

1. `extracts title from document.title with " - Google Gemini" suffix`
2. `extracts title from document.title with " | Gemini" suffix`
3. `skips document.title when it is just "Gemini"`
4. `skips empty document.title`
5. `document.title takes priority over DOM selectors`

**注意**: `document.title` を直接設定（`setGeminiTitle()` は使わない — それは `.conversation-title` も作成するため）

**Ref**: DES-010 §2.5

### Step 1.4: Checkpoint

```bash
npx vitest run test/extractors/gemini.test.ts   # gemini テストのみ
npm run build                                     # TS コンパイル
npm run lint                                      # ESLint
```

- [ ] 新規 5 テスト含め全テストパス
- [ ] ビルドエラーなし
- [ ] lint エラーなし

### Step 1.5: PR 作成

```
git add src/content/extractors/gemini.ts test/extractors/gemini.test.ts
git commit -m "fix: improve Gemini title extraction using document.title (#47)"
git push -u origin feature/gemini-title-fallback
gh pr create --title "fix: improve Gemini title extraction using document.title" --body "Closes #47"
```

---

## Phase 2: Vault Path Template Variables (Issue #46)

### Step 2.1: Branch 作成

```
git checkout main && git pull
git checkout -b feature/vault-path-template
```

### Step 2.2: resolvePathTemplate() 関数追加

**File**: `src/lib/path-utils.ts`

| Action | Detail |
|--------|--------|
| 追加 | `resolvePathTemplate()` 関数をファイル末尾に追加 |

**Ref**: DES-010 §3.3

### Step 2.3: テスト追加 (resolvePathTemplate)

**File**: `test/lib/path-utils.test.ts`

新しい `describe('resolvePathTemplate')` ブロックを追加（6 テストケース）。

**Ref**: DES-010 §3.9

### Step 2.4: Checkpoint (ユニットテスト)

```bash
npx vitest run test/lib/path-utils.test.ts
```

- [ ] resolvePathTemplate テスト全パス

### Step 2.5: Background Worker 変更

**File**: `src/background/index.ts`

| Action | Detail |
|--------|--------|
| 追加 | `import { resolvePathTemplate } from '../lib/path-utils';` |
| 変更 | `handleSave()` L228 — `resolvePathTemplate()` で vaultPath を解決 |

**Ref**: DES-010 §3.4.1, §3.4.2

### Step 2.6: Storage Default 変更

**File**: `src/lib/storage.ts` L42

| Action | Detail |
|--------|--------|
| 変更 | `vaultPath: 'AI/Gemini'` → `vaultPath: 'AI/{platform}'` |

**Ref**: DES-010 §3.5

### Step 2.7: Popup placeholder + ヒント追加

**File**: `src/popup/index.html`

| Action | Detail |
|--------|--------|
| 変更 | L72 `placeholder="AI/Gemini"` → `placeholder="AI/{platform}"` |
| 追加 | Vault Path の `form-group` 内に help テキスト |

**Ref**: DES-010 §3.6

### Step 2.8: i18n キー追加

**Files**: `src/_locales/en/messages.json`, `src/_locales/ja/messages.json`

| Action | Detail |
|--------|--------|
| 追加 | `settings_vaultPathHelp` キー (en + ja) |
| 変更 | `settings_vaultPathPlaceholder` の message 更新 (en + ja) |

**Ref**: DES-010 §3.7

### Step 2.9: Checkpoint

```bash
npx vitest run                   # 全テスト
npm run build                     # TS コンパイル
npm run lint && npm run format    # コード品質
```

- [ ] 全テストパス（storage テストのデフォルト値変更に注意）
- [ ] ビルドエラーなし
- [ ] lint / format クリーン

### Step 2.10: PR 作成

```
git add src/lib/path-utils.ts src/background/index.ts src/lib/storage.ts \
  src/popup/index.html src/_locales/en/messages.json src/_locales/ja/messages.json \
  test/lib/path-utils.test.ts
git commit -m "feat: support {platform} template variable in vault path (#46)"
git push -u origin feature/vault-path-template
gh pr create --title "feat: support {platform} template variable in vault path" --body "Closes #46"
```

---

## Phase 3: Popup UI Redesign

### Step 3.1: Branch 作成

Phase 1, 2 が merge 済みの main から作成:

```
git checkout main && git pull
git checkout -b feature/popup-ui-redesign
```

### Step 3.2: CSS — トグルスイッチスタイル追加

**File**: `src/popup/styles.css`

| Action | Detail |
|--------|--------|
| 追加 | `.toggle-list` レイアウト |
| 追加 | `.toggle-row` / `.toggle-icon` / `.toggle-label` / `.toggle-sublabel` |
| 追加 | `.toggle-switch` / `.slider` / checked / focus-visible スタイル |
| 追加 | `.advanced-settings` / `summary` / `.advanced-arrow` / `.advanced-content` |
| 削除 | `.output-destinations-grid` 関連 (L398-406) |

**Ref**: DES-010 §4.3.2 (CSS), §4.4.2, §4.7

### Step 3.3: HTML — OUTPUT DESTINATIONS セクション変更

**File**: `src/popup/index.html`

既存の OUTPUT DESTINATIONS セクション (L20-37) を置き換え:
- `checkbox-label` → `toggle-row` 構造
- 絵文字アイコン追加 (📦 📄 📋)
- `role="switch"` + `aria-checked` + `aria-hidden` 追加
- `<p class="help">` 削除（トグルスイッチで自明になるため）

**Ref**: DES-010 §4.5

### Step 3.4: HTML — EXTRACTION セクション変更

**File**: `src/popup/index.html`

既存の EXTRACTION セクション (L105-116) を置き換え:
- 絵文字アイコン追加 (🔄)
- サブラベルに説明テキストを移動
- `role="switch"` + `aria-checked` + `aria-hidden` 追加

**Ref**: DES-010 §4.5

### Step 3.5: HTML — Advanced Settings 折りたたみ

**File**: `src/popup/index.html`

既存の3セクション (SETTINGS L39-75, MESSAGE FORMAT L77-103, FRONTMATTER L118-146) を `<details class="advanced-settings">` でラップ:

```html
<details class="advanced-settings">
  <summary>
    <span class="advanced-arrow">▶</span>
    <span data-i18n="settings_advancedSettings">Advanced Settings</span>
  </summary>
  <div class="advanced-content">
    <!-- 既存の3セクションをここに移動 -->
  </div>
</details>
```

**Ref**: DES-010 §4.4.1, §4.5

### Step 3.6: TypeScript — ARIA 同期追加

**File**: `src/popup/index.ts`

| Action | Detail |
|--------|--------|
| 追加 | `setupToggleSwitchAccessibility()` 関数 |
| 変更 | `initialize()` — `setupEventListeners()` の後に呼び出し追加 |
| 変更 | `populateForm()` — 設定反映後に `aria-checked` を同期 |

**Ref**: DES-010 §4.3.2 (Accessibility), §4.6

### Step 3.7: i18n キー追加

**Files**: `src/_locales/en/messages.json`, `src/_locales/ja/messages.json`

| Key | en | ja |
|-----|----|----|
| `settings_advancedSettings` | Advanced Settings | 詳細設定 |
| `settings_extraction` | Extraction | 抽出 |
| `settings_enableAutoScroll` | Auto-scroll | 自動スクロール |
| `settings_autoScrollHelp` | Load all messages in long conversations | 長い会話ですべてのメッセージを読み込む |

**Ref**: DES-010 §4.8

### Step 3.8: Checkpoint (Build + Test)

```bash
npm run build
npm run lint && npm run format
npx vitest run
```

- [ ] ビルドパス
- [ ] lint / format クリーン
- [ ] 全テストパス

### Step 3.9: Checkpoint (Visual + Accessibility)

`npm run dev` で Chrome Extension を読み込み、以下を手動確認:

**Visual**:
- [ ] OUTPUT DESTINATIONS: 絵文字アイコン + トグルスイッチ表示
- [ ] EXTRACTION: 絵文字アイコン + トグルスイッチ + サブラベル表示
- [ ] Advanced Settings: デフォルト閉じ → クリックで展開
- [ ] ダークモード表示確認
- [ ] 幅 380px 内に収まっている

**Functional**:
- [ ] トグルスイッチの ON/OFF が設定に反映される
- [ ] Obsidian OFF → Advanced Settings 内の Obsidian 設定が disabled
- [ ] Save → 設定が正しく保存される
- [ ] 再度 Popup を開く → 保存した設定が復元される

**Accessibility** (DES-010 §6.3):
- [ ] DevTools: `role="switch"` + `aria-checked` がトグルで同期
- [ ] Tab キーでフォーカス移動、Space で切り替え
- [ ] フォーカスリング (`outline`) が表示される
- [ ] OFF 状態のコントラスト比 ≥ 3:1

### Step 3.10: PR 作成

```
git add src/popup/ src/_locales/
git commit -m "feat: redesign popup with toggle switches and collapsible advanced settings"
git push -u origin feature/popup-ui-redesign
gh pr create --title "feat: redesign popup with toggle switches and collapsible settings"
```

---

## Dependency Graph

```
Phase 1 (Issue #47)
  └─ src/content/extractors/gemini.ts
  └─ test/extractors/gemini.test.ts
                    │
                    ▼ (merge to main)
Phase 2 (Issue #46)
  └─ src/lib/path-utils.ts
  └─ src/background/index.ts
  └─ src/lib/storage.ts
  └─ src/popup/index.html (placeholder only)
  └─ src/_locales/*/messages.json
  └─ test/lib/path-utils.test.ts
                    │
                    ▼ (merge to main)
Phase 3 (UI Redesign)
  └─ src/popup/index.html (full rewrite)
  └─ src/popup/styles.css
  └─ src/popup/index.ts
  └─ src/_locales/*/messages.json
```

**Phase 間の依存**:
- Phase 1 → Phase 2: 依存なし（ファイル重複なし）、ただし main への merge 順を保つ
- Phase 2 → Phase 3: `index.html` の placeholder 変更が Phase 3 で上書きされるため、Phase 2 が先に merge 必須
- Phase 3 の i18n 変更は Phase 2 の追加キーと競合しない（異なるキー）

---

## Rollback Plan

各 Phase が独立ブランチのため、問題発生時は該当 PR のみ revert 可能。

| Phase | Revert 影響 |
|-------|------------|
| Phase 1 | `getTitle()` のみ。他機能への影響なし |
| Phase 2 | デフォルト vaultPath が `AI/Gemini` に戻る。既存ユーザーの保存済み設定は影響なし |
| Phase 3 | UI が元のチェックボックスに戻る。機能への影響なし |
