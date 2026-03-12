# DES-013: Popup UI コンパクト化 — フッター固定 + 設定再配置

## Context

**Problem**: Chrome拡張ポップアップの高さ上限（~600px）に対し、デフォルト表示の要素が多すぎて **Test Connection** / **Save Settings** ボタンが画面外に押し出される。設定項目は一度決めたら頻繁に変えないため、デフォルト表示は最小限でよい。

**Approach**: C（上級者向け設定を Advanced へ移動）+ D（フッター常時固定）の組み合わせ。

## Design Decisions

### 1. フッター常時表示（Sticky Footer）

Chrome拡張ポップアップは `max-height: 600px` の制約がある。Advanced Settings を展開すると総コンテンツ高が 600px を超えるため、フッターをビューポート下部に固定し `main.settings` のみスクロール可能にする。

```
┌──────────────────────┐
│  header (flex-shrink:0)│  ← 固定
├──────────────────────┤
│  main.settings        │  ← flex:1, overflow-y:auto
│  (scrollable)         │
├──────────────────────┤
│  footer (flex-shrink:0)│  ← 固定
│  status (flex-shrink:0)│  ← 固定
└──────────────────────┘
```

**CSS変更**:

```css
body {
  width: 380px;
- min-height: 480px;
+ max-height: 600px;
+ overflow: hidden;
}

.container {
  display: flex;
  flex-direction: column;
- min-height: 100%;
+ height: 100%;
+ max-height: 600px;
}

+ .header {
+   flex-shrink: 0;
+ }

.settings {
  flex: 1;
  overflow-y: auto;
+ min-height: 0;    /* flex子要素のoverflow動作に必須 */
}

+ .actions {
+   flex-shrink: 0;
+ }

+ .status {
+   flex-shrink: 0;
+ }
```

> **Note**: `min-height: 0` は flex 子要素のデフォルト `min-height: auto` を上書きし、`overflow-y: auto` を正しく機能させるために必要。

### 2. ヘッダー subtitle 削除

現在の subtitle（"Export AI conversations from Gemini, Claude, ChatGPT, and Perplexity to Obsidian via Local REST API"）を削除する。拡張名「Obsidian AI Exporter」とアイコンだけで十分識別可能。

**節約**: ~25px

```html
  <header class="header">
    <h1>
      <img src="/icons/icon24.png" alt="" class="logo" width="24" height="24" />
      <span data-i18n="extName">Obsidian AI Exporter</span>
    </h1>
-   <p class="subtitle" data-i18n="extDescription">Export AI conversations to Obsidian</p>
  </header>
```

### 3. Extraction セクション再編

**移動対象**: 上級者向け・プラットフォーム固有の2項目を Advanced Settings へ

| 設定 | 現在の位置 | 移動先 | 理由 |
|------|-----------|--------|------|
| Auto-scroll | Extraction | Advanced | Gemini専用機能、通常は不要 |
| Include tool/search results | Extraction | Advanced | Claude専用機能、上級者向け |
| Append Mode | Extraction | **据え置き** | 全プラットフォーム共通、最も汎用 |

**変更後の Extraction セクション（デフォルト表示）**:

```html
<section class="section">
  <h2 data-i18n="settings_extraction">Extraction</h2>
  <div class="toggle-list">
    <!-- Append Mode のみ残す -->
    <label class="toggle-row">
      <span class="toggle-icon">📎</span>
      <span class="toggle-label">
        <span data-i18n="settings_enableAppendMode">Append Mode</span>
        <span class="toggle-sublabel" data-i18n="settings_appendModeHelp">
          Only add new messages to existing notes
        </span>
      </span>
      <span class="toggle-switch">
        <input type="checkbox" id="enableAppendMode" role="switch" aria-checked="false" />
        <span class="slider" aria-hidden="true"></span>
      </span>
    </label>
  </div>
</section>
```

**変更後の Advanced Settings 内部**:

```html
<details class="advanced-settings">
  <summary>
    <span class="advanced-arrow">▶</span>
    <span data-i18n="settings_advancedSettings">Advanced Settings</span>
  </summary>
  <div class="advanced-content">
    <!-- === 移動してきた Extraction 項目 === -->
    <section class="section">
      <h2 data-i18n="settings_extraction">Extraction</h2>
      <div class="toggle-list">
        <label class="toggle-row">  <!-- Auto-scroll -->
          <span class="toggle-icon">🔄</span>
          <span class="toggle-label">
            <span data-i18n="settings_enableAutoScroll">Auto-scroll</span>
            <span class="toggle-sublabel" data-i18n="settings_autoScrollHelp">
              Load all messages in long conversations
            </span>
          </span>
          <span class="toggle-switch">
            <input type="checkbox" id="enableAutoScroll" role="switch" aria-checked="false" />
            <span class="slider" aria-hidden="true"></span>
          </span>
        </label>
        <label class="toggle-row">  <!-- Tool Content -->
          <span class="toggle-icon">🔍</span>
          <span class="toggle-label">
            <span data-i18n="settings_enableToolContent">Include tool/search results</span>
            <span class="toggle-sublabel" data-i18n="settings_toolContentHelp">
              Save web search and tool results from Claude
            </span>
          </span>
          <span class="toggle-switch">
            <input type="checkbox" id="enableToolContent" role="switch" aria-checked="false" />
            <span class="slider" aria-hidden="true"></span>
          </span>
        </label>
      </div>
    </section>

    <!-- === 既存: Obsidian API Settings === -->
    <section class="section" id="obsidianSettings">
      ...（変更なし）
    </section>

    <!-- === 既存: Message Format === -->
    ...（変更なし）

    <!-- === 既存: Frontmatter Fields === -->
    ...（変更なし）
  </div>
</details>
```

## 変更後の画面構成

### 折りたたみ時（デフォルト表示）

```
┌─────────────────────────────┐
│ 🔮 Obsidian AI Exporter     │
├─────────────────────────────┤
│ OUTPUT DESTINATIONS          │
│  📦 Obsidian (API)    [ON]  │
│  📄 Download File     [OFF] │
│  📋 Copy to Clipboard [ON]  │
│                              │
│ EXTRACTION                   │
│  📎 Append Mode       [ON]  │
│                              │
│ ▶ ADVANCED SETTINGS          │
├─────────────────────────────┤
│ [🔌 Test] [💾 Save Settings]│
└─────────────────────────────┘
```

**推定高さ**: ~420px（600px上限に対して十分な余裕）

### 展開時（Advanced Settings 開放）

```
┌─────────────────────────────┐
│ 🔮 Obsidian AI Exporter     │
├─────────────────────────────┤
│ OUTPUT DESTINATIONS          │  ↑
│  📦 Obsidian (API)    [ON]  │  │
│  📄 Download File     [OFF] │  │
│  📋 Copy to Clipboard [ON]  │  │
│                              │  │ スクロール可能
│ EXTRACTION                   │  │
│  📎 Append Mode       [ON]  │  │
│                              │  │
│ ▼ ADVANCED SETTINGS          │  │
│  EXTRACTION                  │  │
│   🔄 Auto-scroll     [OFF]  │  │
│   🔍 Tool results    [ON]   │  │
│  SETTINGS                    │  │
│   API Key: [****]            │  │
│   Port: [27123] Path: [...]  │  │
│  MESSAGE FORMAT              │  │
│   [Callout ▼]                │  │
│   User: [QUESTION]           │  │
│   Asst: [NOTE]               │  │
│  FRONTMATTER FIELDS          │  │
│   [x]ID  [x]Title            │  ↓
├─────────────────────────────┤
│ [🔌 Test] [💾 Save Settings]│  ← 常に表示
└─────────────────────────────┘
```

**推定高さ**: ~770px（600px超だが main のみスクロール、フッターは固定）

## 変更ファイル一覧

| File | Change | Lines |
|------|--------|-------|
| `src/popup/styles.css` | body max-height、container height、flex-shrink追加、subtitle CSS削除可 | ~10行 |
| `src/popup/index.html` | subtitle 削除、Auto-scroll/Tool Content を Advanced へ移動 | ~20行移動 |

## 変更しないファイル

| File | Reason |
|------|--------|
| `src/popup/index.ts` | `getElementById` はDOM位置に依存しない。全IDは変更なし |
| `src/_locales/*/messages.json` | 既存i18nキーの再利用、新規キー不要 |
| `test/popup/index.test.ts` | validation/storage パターンのテスト、DOM構造に非依存 |

## Verification

1. `npm run build` — TypeScript / Vite ビルド成功
2. `npm run lint` — 0 errors
3. `npm test` — 全テスト通過（popup テストは DOM 構造に非依存）
4. Chrome で拡張を読み込み、以下を目視確認:
   - デフォルト表示で Test Connection / Save Settings ボタンが見える
   - Advanced Settings 展開時に main 部分のみスクロールする
   - フッターが常に画面下部に固定されている
   - 全トグルが正しく動作する（移動した項目含む）
   - 設定の保存・読み込みが正常に動作する
