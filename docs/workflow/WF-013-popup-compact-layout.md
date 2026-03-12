# WF-013: Popup UI コンパクト化 実装ワークフロー

**Design**: [DES-013](../design/DES-013-popup-compact-layout.md)
**Scope**: `src/popup/styles.css`, `src/popup/index.html`
**JS変更**: なし
**テスト変更**: なし

---

## Pre-flight

- [ ] `main` ブランチ最新を確認
- [ ] `feature/popup-compact-layout` ブランチを作成

---

## Step 1: CSS — Sticky Footer レイアウト

**File**: `src/popup/styles.css`

### 1.1 body の高さ制約

```css
/* Before */
body {
  width: 380px;
  min-height: 480px;
  ...
}

/* After */
body {
  width: 380px;
  max-height: 600px;
  overflow: hidden;
  ...
}
```

- `min-height: 480px` → 削除
- `max-height: 600px` → 追加（Chrome拡張ポップアップ上限）
- `overflow: hidden` → 追加（body自体はスクロールさせない）

### 1.2 container の高さ指定

```css
/* Before */
.container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* After */
.container {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 600px;
}
```

### 1.3 flex-shrink 追加

```css
/* 追加 */
.header {
  ...
  flex-shrink: 0;
}
```

```css
/* 追加 */
.actions {
  ...
  flex-shrink: 0;
}
```

```css
/* 追加 */
.status {
  ...
  flex-shrink: 0;
}
```

### 1.4 settings の min-height

```css
/* 追加 */
.settings {
  ...
  min-height: 0;
}
```

> `min-height: 0` は flex子要素の `overflow-y: auto` を正しく動作させるために必須。

### 1.5 subtitle CSS の整理（任意）

`.header .subtitle` ルールは HTML から要素を削除するため不要になる。削除しても残しても動作に影響なし。コード品質のため削除推奨。

### Checkpoint 1

```bash
npm run build && npm run lint
```

- [ ] ビルド成功
- [ ] lint 0 errors

---

## Step 2: HTML — subtitle 削除

**File**: `src/popup/index.html`

### 2.1 subtitle 行を削除

```html
<!-- 削除 -->
<p class="subtitle" data-i18n="extDescription">Export AI conversations to Obsidian</p>
```

ヘッダーは以下のみ残る:

```html
<header class="header">
  <h1>
    <img src="/icons/icon24.png" alt="" class="logo" width="24" height="24" />
    <span data-i18n="extName">Obsidian AI Exporter</span>
  </h1>
</header>
```

### Checkpoint 2

```bash
npm run build
```

- [ ] ビルド成功（HTML変更のみなので lint 不要）

---

## Step 3: HTML — Extraction セクション再編

**File**: `src/popup/index.html`

### 3.1 Extraction から Auto-scroll と Tool Content を切り出す

現在の Extraction セクション（3つのtoggle-row）から、以下2つの `<label class="toggle-row">` ブロックを**カット**する:

1. `id="enableAutoScroll"` を含む toggle-row（L63-75）
2. `id="enableToolContent"` を含む toggle-row（L89-101）

Extraction セクションには `id="enableAppendMode"` のみ残る。

### 3.2 Advanced Settings の先頭に Extraction セクションを追加

`<div class="advanced-content">` の直後、既存の `<section id="obsidianSettings">` の前に、新しい section を挿入:

```html
<div class="advanced-content">
  <!-- Extraction (Advanced) -->
  <section class="section">
    <h2 data-i18n="settings_extraction">Extraction</h2>
    <div class="toggle-list">
      <!-- Step 3.1 で切り出した Auto-scroll toggle-row -->
      <!-- Step 3.1 で切り出した Tool Content toggle-row -->
    </div>
  </section>

  <!-- Obsidian API Settings (既存・変更なし) -->
  <section class="section" id="obsidianSettings">
    ...
```

### 3.3 確認事項

- [ ] 全ての `id` 属性が重複なく保持されている
- [ ] `data-i18n` 属性がそのまま維持されている
- [ ] toggle-row の構造（icon, label, sublabel, switch）が崩れていない

### Checkpoint 3

```bash
npm run build && npm run lint
```

- [ ] ビルド成功
- [ ] lint 0 errors

---

## Step 4: 自動テスト

```bash
npm test
```

- [ ] 全テスト通過
- [ ] popup テスト含め regression なし

---

## Step 5: 目視検証（Chrome 拡張）

```bash
npm run build
```

Chrome で `dist/` フォルダをリロードし、以下を確認:

### 5.1 折りたたみ時（デフォルト）

- [ ] ヘッダーにタイトルとアイコンのみ表示（subtitle なし）
- [ ] Output Destinations: 3つのトグルが表示
- [ ] Extraction: Append Mode のみ表示
- [ ] Advanced Settings: 折りたたみ状態
- [ ] **Test Connection / Save Settings ボタンが画面内に見えている**

### 5.2 展開時（Advanced 開放）

- [ ] Advanced 内の先頭に Auto-scroll と Tool Content が表示
- [ ] その下に API Key, Port, Vault Path, Message Format, Frontmatter が表示
- [ ] **main 部分がスクロール可能**
- [ ] **フッターのボタンが固定表示されている**

### 5.3 機能確認

- [ ] 全トグルの ON/OFF が動作する
- [ ] Save Settings で全設定が保存される
- [ ] ページリロード後、保存した設定が復元される
- [ ] Test Connection が動作する
- [ ] Obsidian トグル OFF 時に API Settings セクションが disabled になる

### 5.4 テーマ確認

- [ ] ライトテーマ: ボタンが見える、スクロール正常
- [ ] ダークテーマ: 同上

---

## Step 6: コミット & PR

```bash
git add src/popup/index.html src/popup/styles.css
git commit -m "fix(popup): compact layout with sticky footer and reorganized settings

Move Auto-scroll and Tool Content toggles to Advanced Settings.
Remove header subtitle. Fix footer always visible with flex layout."
```

- [ ] コミット成功
- [ ] PR 作成
