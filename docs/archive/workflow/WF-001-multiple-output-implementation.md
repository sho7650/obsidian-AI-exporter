# WF-001: 複数出力オプション実装ワークフロー

**関連設計書**: [DES-001-multiple-output-options](../design/DES-001-multiple-output-options.md)  
**作成日**: 2026-01-13  
**実装優先度**: ファイルダウンロード → クリップボード → 複数同時出力

---

## 概要

DES-001 設計書に基づく実装ワークフロー。6フェーズ構成で依存関係順に実装を進める。

```
Phase 1: 基盤 (型定義・設定・権限)
    ↓
Phase 2: ファイルダウンロード機能 [Priority 1]
    ↓
Phase 3: クリップボード機能 [Priority 2]
    ↓
Phase 4: マルチ出力オーケストレーション [Priority 3]
    ↓
Phase 5: UI統合
    ↓
Phase 6: テスト・検証
```

---

## Phase 1: 基盤

**目的**: 他のフェーズが依存する型定義・権限・デフォルト設定を整備

### Task 1.1: 型定義追加

**ファイル**: `src/lib/types.ts`  
**依存**: なし  
**複雑度**: 低

```typescript
// 追加する型定義
export type OutputDestination = 'obsidian' | 'file' | 'clipboard';

export interface OutputOptions {
  obsidian: boolean;
  file: boolean;
  clipboard: boolean;
}

export interface OutputResult {
  destination: OutputDestination;
  success: boolean;
  error?: string;
}

export interface MultiOutputResponse {
  results: OutputResult[];
  allSuccessful: boolean;
  anySuccessful: boolean;
}

export interface OutputValidationResult {
  isValid: boolean;
  errors: string[];
}

// SyncSettings 拡張
export interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
  outputOptions: OutputOptions;  // 追加
}

// ExtensionMessage 拡張
export type ExtensionMessage =
  | { action: 'saveToObsidian'; data: ObsidianNote }
  | { action: 'saveToOutputs'; data: ObsidianNote; outputs: OutputDestination[] }
  | { action: 'getExistingFile'; fileName: string; vaultPath: string }
  | { action: 'getSettings' }
  | { action: 'testConnection' };
```

**完了条件**:
- [ ] 型定義追加
- [ ] 既存の ValidationResult と名前衝突なし
- [ ] TypeScript コンパイル成功

---

### Task 1.2: マニフェスト権限追加

**ファイル**: `src/manifest.json`  
**依存**: なし  
**複雑度**: 低

```json
{
  "permissions": [
    "storage",
    "activeTab",
    "downloads",
    "clipboardWrite",
    "offscreen"
  ]
}
```

**注意**: `offscreen.html` は `web_accessible_resources` への登録不要

**完了条件**:
- [ ] permissions 配列に3権限追加
- [ ] マニフェスト JSON 構文エラーなし

---

### Task 1.3: デフォルト設定追加

**ファイル**: `src/lib/storage.ts`  
**依存**: Task 1.1  
**複雑度**: 低

```typescript
const DEFAULT_OUTPUT_OPTIONS: OutputOptions = {
  obsidian: true,
  file: false,
  clipboard: false
};

// DEFAULT_SYNC_SETTINGS に追加
const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  // ... existing fields
  outputOptions: DEFAULT_OUTPUT_OPTIONS
};
```

**完了条件**:
- [ ] デフォルト値追加
- [ ] 既存設定との互換性維持

---

### Task 1.4: i18n メッセージ追加

**ファイル**: 
- `src/_locales/en/messages.json`
- `src/_locales/ja/messages.json`

**依存**: なし  
**複雑度**: 低

**English**:
```json
{
  "settings_outputDestinations": {
    "message": "Output Destinations"
  },
  "settings_outputHelp": {
    "message": "Select where to save conversations"
  },
  "settings_outputObsidian": {
    "message": "Obsidian (API)"
  },
  "settings_outputFile": {
    "message": "Download File"
  },
  "settings_outputClipboard": {
    "message": "Copy to Clipboard"
  },
  "success_allOutputs": {
    "message": "Saved to all destinations"
  },
  "error_noOutputSelected": {
    "message": "Please select at least one output destination"
  },
  "error_allOutputsFailed": {
    "message": "Failed to save"
  },
  "error_partialSuccess": {
    "message": "Partial success: $DETAILS$",
    "placeholders": {
      "DETAILS": {
        "content": "$1",
        "example": "Obsidian ✓, File ✗"
      }
    }
  },
  "error_apiKeyRequired": {
    "message": "API key is required for Obsidian output"
  },
  "error_portRequired": {
    "message": "Port number is required for Obsidian output"
  }
}
```

**Japanese**:
```json
{
  "settings_outputDestinations": {
    "message": "出力先"
  },
  "settings_outputHelp": {
    "message": "会話の保存先を選択"
  },
  "settings_outputObsidian": {
    "message": "Obsidian (API)"
  },
  "settings_outputFile": {
    "message": "ファイルをダウンロード"
  },
  "settings_outputClipboard": {
    "message": "クリップボードにコピー"
  },
  "success_allOutputs": {
    "message": "すべての出力先に保存しました"
  },
  "error_noOutputSelected": {
    "message": "出力先を1つ以上選択してください"
  },
  "error_allOutputsFailed": {
    "message": "保存に失敗しました"
  },
  "error_partialSuccess": {
    "message": "一部成功: $DETAILS$",
    "placeholders": {
      "DETAILS": {
        "content": "$1",
        "example": "Obsidian ✓, File ✗"
      }
    }
  },
  "error_apiKeyRequired": {
    "message": "Obsidian出力にはAPIキーが必要です"
  },
  "error_portRequired": {
    "message": "Obsidian出力にはポート番号が必要です"
  }
}
```

**完了条件**:
- [ ] 英語メッセージ追加
- [ ] 日本語メッセージ追加
- [ ] JSON 構文エラーなし

---

## Phase 2: ファイルダウンロード機能 [Priority 1]

**目的**: Chrome Downloads API を使用したファイル保存機能

### Task 2.1: handleDownloadToFile 実装

**ファイル**: `src/background/index.ts`  
**依存**: Phase 1  
**複雑度**: 低

```typescript
import type { ObsidianNote, OutputResult, ExtensionSettings } from '../lib/types';

async function handleDownloadToFile(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const content = generateNoteContent(note, settings);
    const filename = `${note.fileName}.md`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve) => {
      chrome.downloads.download(
        {
          url,
          filename,
          saveAs: false,
          conflictAction: 'uniquify'
        },
        (downloadId) => {
          URL.revokeObjectURL(url);
          if (chrome.runtime.lastError) {
            resolve({
              destination: 'file',
              success: false,
              error: chrome.runtime.lastError.message
            });
          } else {
            resolve({ destination: 'file', success: true });
          }
        }
      );
    });
  } catch (error) {
    return {
      destination: 'file',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
```

**完了条件**:
- [ ] 関数実装
- [ ] Blob 作成・URL 生成
- [ ] ダウンロード呼び出し
- [ ] URL クリーンアップ
- [ ] エラーハンドリング

---

## Phase 3: クリップボード機能 [Priority 2]

**目的**: Offscreen Document を使用したクリップボードコピー機能

### Task 3.1: Offscreen HTML 作成

**ファイル**: `src/offscreen/offscreen.html` (新規作成)  
**依存**: Task 1.2 (offscreen 権限)  
**複雑度**: 低

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Offscreen Document</title>
</head>
<body>
  <script src="offscreen.js"></script>
</body>
</html>
```

**完了条件**:
- [ ] ファイル作成
- [ ] offscreen.js 読み込み

---

### Task 3.2: Offscreen Script 作成

**ファイル**: `src/offscreen/offscreen.ts` (新規作成)  
**依存**: Task 3.1  
**複雑度**: 低

```typescript
chrome.runtime.onMessage.addListener(
  (
    message: { action: string; content?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { success: boolean; error?: string }) => void
  ) => {
    if (message.action === 'clipboardWrite' && message.content) {
      navigator.clipboard
        .writeText(message.content)
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          })
        );
      return true; // async response
    }
    return false;
  }
);
```

**完了条件**:
- [ ] メッセージリスナー実装
- [ ] clipboard.writeText 呼び出し
- [ ] 成功/失敗レスポンス

---

### Task 3.3: handleCopyToClipboard 実装

**ファイル**: `src/background/index.ts`  
**依存**: Task 3.1, 3.2  
**複雑度**: 中

```typescript
const OFFSCREEN_TIMEOUT_MS = 5000;
let offscreenCloseTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleOffscreenClose(): void {
  if (offscreenCloseTimer) {
    clearTimeout(offscreenCloseTimer);
  }
  offscreenCloseTimer = setTimeout(async () => {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // already closed or doesn't exist
    }
    offscreenCloseTimer = null;
  }, OFFSCREEN_TIMEOUT_MS);
}

async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });
  
  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Copy markdown content to clipboard'
  });
}

async function handleCopyToClipboard(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const content = generateNoteContent(note, settings);
    
    await ensureOffscreenDocument();
    
    const response = await chrome.runtime.sendMessage({
      action: 'clipboardWrite',
      content
    });
    
    scheduleOffscreenClose();
    
    if (response.success) {
      return { destination: 'clipboard', success: true };
    } else {
      return {
        destination: 'clipboard',
        success: false,
        error: response.error
      };
    }
  } catch (error) {
    return {
      destination: 'clipboard',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
```

**完了条件**:
- [ ] ensureOffscreenDocument 実装
- [ ] handleCopyToClipboard 実装
- [ ] 5秒タイマーによる自動クローズ
- [ ] エラーハンドリング

---

## Phase 4: マルチ出力オーケストレーション [Priority 3]

**目的**: 複数出力先への並列実行とエラー集約

### Task 4.1: executeOutput ディスパッチャ

**ファイル**: `src/background/index.ts`  
**依存**: Phase 2, 3  
**複雑度**: 低

```typescript
async function executeOutput(
  dest: OutputDestination,
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  switch (dest) {
    case 'obsidian':
      return handleSaveToObsidian(note, settings);
    case 'file':
      return handleDownloadToFile(note, settings);
    case 'clipboard':
      return handleCopyToClipboard(note, settings);
  }
}
```

**注意**: `handleSaveToObsidian` は既存の `handleSave` をラップして OutputResult 形式で返す必要あり

**完了条件**:
- [ ] ディスパッチャ実装
- [ ] 既存 Obsidian ハンドラとの統合

---

### Task 4.2: handleMultiOutput コーディネータ

**ファイル**: `src/background/index.ts`  
**依存**: Task 4.1  
**複雑度**: 中

```typescript
async function handleMultiOutput(
  note: ObsidianNote,
  outputs: OutputDestination[],
  settings: ExtensionSettings
): Promise<MultiOutputResponse> {
  const promises = outputs.map((dest) => executeOutput(dest, note, settings));
  
  const settled = await Promise.allSettled(promises);
  
  const results: OutputResult[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        destination: outputs[index],
        success: false,
        error: String(result.reason)
      };
    }
  });

  return {
    results,
    allSuccessful: results.every((r) => r.success),
    anySuccessful: results.some((r) => r.success)
  };
}
```

**完了条件**:
- [ ] Promise.allSettled による並列実行
- [ ] 結果集約
- [ ] allSuccessful/anySuccessful 計算

---

### Task 4.3: メッセージハンドラ更新

**ファイル**: `src/background/index.ts`  
**依存**: Task 4.2  
**複雑度**: 低

```typescript
// 既存の chrome.runtime.onMessage.addListener 内に追加
case 'saveToOutputs': {
  const { data, outputs } = message;
  const settings = await getSettings();
  const response = await handleMultiOutput(data, outputs, settings);
  sendResponse(response);
  return true;
}
```

**完了条件**:
- [ ] 新アクション追加
- [ ] 非同期レスポンス処理

---

## Phase 5: UI統合

**目的**: Popup UI と Content Script の更新

### Task 5.1: Popup HTML 更新

**ファイル**: `src/popup/index.html`  
**依存**: Phase 1 i18n  
**複雑度**: 低

```html
<!-- API設定セクションの後に追加 -->
<section class="settings-section">
  <h2 data-i18n="settings_outputDestinations">Output Destinations</h2>
  <p class="help" data-i18n="settings_outputHelp">Select where to save conversations</p>
  <div class="checkbox-grid">
    <label class="checkbox-label">
      <input type="checkbox" id="outputObsidian" />
      <span data-i18n="settings_outputObsidian">Obsidian (API)</span>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" id="outputFile" />
      <span data-i18n="settings_outputFile">Download File</span>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" id="outputClipboard" />
      <span data-i18n="settings_outputClipboard">Copy to Clipboard</span>
    </label>
  </div>
</section>

<!-- CSS追加 -->
<style>
.checkbox-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.settings-section.disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
```

**完了条件**:
- [ ] チェックボックスUI追加
- [ ] スタイル追加

---

### Task 5.2: Popup TypeScript 更新

**ファイル**: `src/popup/index.ts`  
**依存**: Task 5.1  
**複雑度**: 中

```typescript
// 要素参照追加
const outputObsidian = document.getElementById('outputObsidian') as HTMLInputElement;
const outputFile = document.getElementById('outputFile') as HTMLInputElement;
const outputClipboard = document.getElementById('outputClipboard') as HTMLInputElement;

// 設定読み込み時
function loadSettings(settings: ExtensionSettings): void {
  // ... existing code
  outputObsidian.checked = settings.outputOptions.obsidian;
  outputFile.checked = settings.outputOptions.file;
  outputClipboard.checked = settings.outputOptions.clipboard;
  updateObsidianSettingsState(settings.outputOptions.obsidian);
}

// Obsidian設定の有効/無効切り替え
function updateObsidianSettingsState(enabled: boolean): void {
  const obsidianSection = document.querySelector('.obsidian-settings');
  if (obsidianSection) {
    obsidianSection.classList.toggle('disabled', !enabled);
  }
  // 入力フィールドも無効化
  apiKeyInput.disabled = !enabled;
  portInput.disabled = !enabled;
  vaultPathInput.disabled = !enabled;
}

// イベントリスナー
outputObsidian.addEventListener('change', () => {
  updateObsidianSettingsState(outputObsidian.checked);
});

// 設定保存時
function getSettingsFromForm(): Partial<ExtensionSettings> {
  return {
    // ... existing fields
    outputOptions: {
      obsidian: outputObsidian.checked,
      file: outputFile.checked,
      clipboard: outputClipboard.checked
    }
  };
}
```

**完了条件**:
- [ ] チェックボックス読み込み/保存
- [ ] Obsidian設定の動的有効/無効
- [ ] 視覚的フィードバック

---

### Task 5.3: バリデーション追加

**ファイル**: `src/lib/validation.ts` または `src/popup/index.ts` 内  
**依存**: Phase 1 型定義  
**複雑度**: 低

```typescript
import type { ExtensionSettings, OutputDestination, OutputValidationResult } from './types';

export function validateSettingsForOutputs(
  settings: ExtensionSettings,
  outputs: OutputDestination[]
): OutputValidationResult {
  const errors: string[] = [];

  if (outputs.includes('obsidian')) {
    if (!settings.obsidianApiKey) {
      errors.push(chrome.i18n.getMessage('error_apiKeyRequired'));
    }
    if (!settings.obsidianPort) {
      errors.push(chrome.i18n.getMessage('error_portRequired'));
    }
  }

  // file, clipboard は追加バリデーション不要

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function getEnabledOutputs(options: OutputOptions): OutputDestination[] {
  const outputs: OutputDestination[] = [];
  if (options.obsidian) outputs.push('obsidian');
  if (options.file) outputs.push('file');
  if (options.clipboard) outputs.push('clipboard');
  return outputs;
}
```

**完了条件**:
- [ ] validateSettingsForOutputs 実装
- [ ] getEnabledOutputs 実装

---

### Task 5.4: Content Script 更新

**ファイル**: `src/content/index.ts`  
**依存**: Phase 4, Task 5.3  
**複雑度**: 中

```typescript
import { getEnabledOutputs, validateSettingsForOutputs } from '../lib/validation';
import type { MultiOutputResponse } from '../lib/types';

async function handleSaveClick(): Promise<void> {
  const settings = await getSettings();
  const outputs = getEnabledOutputs(settings.outputOptions);

  if (outputs.length === 0) {
    showToast('error', chrome.i18n.getMessage('error_noOutputSelected'));
    return;
  }

  const validation = validateSettingsForOutputs(settings, outputs);
  if (!validation.isValid) {
    showToast('error', validation.errors.join(', '));
    return;
  }

  const note = conversationToNote(result.data, settings.templateOptions);
  
  const response: MultiOutputResponse = await chrome.runtime.sendMessage({
    action: 'saveToOutputs',
    data: note,
    outputs
  });

  // 結果に応じたフィードバック
  if (response.allSuccessful) {
    showToast('success', chrome.i18n.getMessage('success_allOutputs'));
  } else if (response.anySuccessful) {
    const details = formatPartialSuccess(response.results);
    showToast('warning', chrome.i18n.getMessage('error_partialSuccess', [details]));
  } else {
    showToast('error', chrome.i18n.getMessage('error_allOutputsFailed'));
  }
}

function formatPartialSuccess(results: OutputResult[]): string {
  return results
    .map((r) => `${r.destination} ${r.success ? '✓' : '✗'}`)
    .join(', ');
}
```

**完了条件**:
- [ ] saveToOutputs アクション使用
- [ ] バリデーション呼び出し
- [ ] 部分成功のトースト表示

---

## Phase 6: テスト・検証

**目的**: 機能の動作確認と品質保証

### Task 6.1: ビルド検証

```bash
npm run lint
npm run build
```

**完了条件**:
- [ ] ESLint エラーなし
- [ ] TypeScript コンパイル成功
- [ ] ビルド成功

---

### Task 6.2: 手動テスト

**テストシナリオ**:

| # | シナリオ | 期待結果 |
|---|----------|----------|
| 1 | Obsidianのみ有効 → 保存 | Obsidianに保存成功 |
| 2 | ファイルのみ有効 → 保存 | ダウンロードフォルダに保存 |
| 3 | クリップボードのみ有効 → 保存 | クリップボードにコピー |
| 4 | 全て有効 → 保存 | 3箇所すべてに保存 |
| 5 | Obsidian無効時 → API設定欄 | グレーアウト表示 |
| 6 | 出力先未選択 → 保存 | エラーメッセージ表示 |
| 7 | Obsidian有効・API未設定 → 保存 | バリデーションエラー |
| 8 | ファイル保存時に同名ファイル存在 | uniquify で連番付与 |
| 9 | 部分的失敗（Obsidian接続エラー） | 黄色トースト with 詳細 |

**完了条件**:
- [ ] 全シナリオ合格

---

## 依存関係グラフ

```
Phase 1 (基盤)
├── Task 1.1 types.ts ─────────────────────────────┐
├── Task 1.2 manifest.json ────────────────────────┤
├── Task 1.3 storage.ts (depends: 1.1) ────────────┤
└── Task 1.4 i18n ─────────────────────────────────┤
                                                   │
Phase 2 (ファイル) ←───────────────────────────────┤
└── Task 2.1 handleDownloadToFile                  │
                                                   │
Phase 3 (クリップボード) ←─────────────────────────┤
├── Task 3.1 offscreen.html                        │
├── Task 3.2 offscreen.ts (depends: 3.1)           │
└── Task 3.3 handleCopyToClipboard (depends: 3.2)  │
                                                   │
Phase 4 (オーケストレーション) ←───────────────────┘
├── Task 4.1 executeOutput (depends: Phase 2, 3)
├── Task 4.2 handleMultiOutput (depends: 4.1)
└── Task 4.3 message handler (depends: 4.2)
                                                   
Phase 5 (UI) ←─────────────────────────────────────
├── Task 5.1 popup HTML (depends: Phase 1 i18n)
├── Task 5.2 popup TS (depends: 5.1)
├── Task 5.3 validation (depends: Phase 1 types)
└── Task 5.4 content script (depends: Phase 4, 5.3)

Phase 6 (テスト) ←─────────────────────────────────
└── Task 6.1-6.2 (depends: all above)
```

---

## チェックリスト

### Phase 1: 基盤
- [ ] Task 1.1: 型定義追加
- [ ] Task 1.2: マニフェスト権限追加
- [ ] Task 1.3: デフォルト設定追加
- [ ] Task 1.4: i18n メッセージ追加

### Phase 2: ファイルダウンロード
- [ ] Task 2.1: handleDownloadToFile 実装

### Phase 3: クリップボード
- [ ] Task 3.1: offscreen.html 作成
- [ ] Task 3.2: offscreen.ts 作成
- [ ] Task 3.3: handleCopyToClipboard 実装

### Phase 4: マルチ出力
- [ ] Task 4.1: executeOutput 実装
- [ ] Task 4.2: handleMultiOutput 実装
- [ ] Task 4.3: メッセージハンドラ更新

### Phase 5: UI
- [ ] Task 5.1: Popup HTML 更新
- [ ] Task 5.2: Popup TypeScript 更新
- [ ] Task 5.3: バリデーション追加
- [ ] Task 5.4: Content Script 更新

### Phase 6: テスト
- [ ] Task 6.1: ビルド検証
- [ ] Task 6.2: 手動テスト全シナリオ合格

---

## 見積もり

| Phase | タスク数 | 複雑度 |
|-------|---------|--------|
| Phase 1 | 4 | 低 |
| Phase 2 | 1 | 低 |
| Phase 3 | 3 | 中 |
| Phase 4 | 3 | 中 |
| Phase 5 | 4 | 中 |
| Phase 6 | 2 | 低 |
| **合計** | **17** | **中程度** |
