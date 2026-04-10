# Implementation Plan: Multiple Output Options for gemini2obsidian

## Executive Summary

Add support for multiple output destinations beyond Obsidian API:
1. **File Download** (Priority 1): Save markdown via Chrome Downloads API
2. **Clipboard Copy** (Priority 2): Copy markdown content to clipboard
3. **Multiple Selection** (Priority 3): Allow simultaneous outputs

## Architecture Decision Record

### ADR-001: Output Handler Architecture

**Context**: Need to support multiple output destinations with potential for future expansion.

**Decision**: Use a unified message-based approach with the background service worker handling all outputs.

**Rationale**:
- Chrome Downloads API works best from service workers
- Clipboard API in content scripts requires user gesture; service worker approach is more reliable
- Maintains current separation of concerns
- Background already has settings access and content generation logic

**Consequences**:
- All output handlers centralized in `src/background/index.ts`
- Content script sends single request with selected outputs
- Independent error handling per output

### ADR-002: Settings Structure

**Context**: Need to store user preferences for output destinations.

**Decision**: Use multi-boolean structure: `outputOptions: { obsidian: boolean, file: boolean, clipboard: boolean }`

**Rationale**:
- Supports multiple simultaneous outputs (explicit requirement)
- Extensible for future output types
- Clear UI mapping to checkbox controls

**Consequences**:
- Default: `obsidian: true` (preserves current behavior), others `false`
- At least one output must be enabled (validation required)

### ADR-003: Execution Strategy

**Context**: When multiple outputs are selected, how should they execute?

**Decision**: Use `Promise.allSettled()` for parallel execution with independent error handling.

**Rationale**:
- Outputs are independent operations
- Faster than sequential execution
- One failure should not block others
- `allSettled` returns all results regardless of individual success/failure

**Consequences**:
- Need aggregated result type to report per-output status
- UI must handle partial success scenarios

## Type Definitions

### New Types (src/lib/types.ts)

```typescript
/**
 * Available output destinations for conversation export
 */
export type OutputDestination = 'obsidian' | 'file' | 'clipboard';

/**
 * User preferences for output destinations
 */
export interface OutputOptions {
  obsidian: boolean;
  file: boolean;
  clipboard: boolean;
}

/**
 * Result of a single output operation
 */
export interface OutputResult {
  destination: OutputDestination;
  success: boolean;
  error?: string;
  details?: string; // e.g., downloaded file path, "Copied to clipboard"
}

/**
 * Combined result for multi-output operations
 */
export interface MultiOutputResponse {
  results: OutputResult[];
  allSuccessful: boolean;
  anySuccessful: boolean;
}
```

### Updated Types

```typescript
// Update SyncSettings
export interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
  outputOptions: OutputOptions;  // NEW
}

// Update ExtensionMessage union
export type ExtensionMessage =
  | { action: 'saveToObsidian'; data: ObsidianNote }
  | { action: 'saveToOutputs'; data: ObsidianNote; outputs: OutputDestination[] }  // NEW
  | { action: 'getExistingFile'; fileName: string; vaultPath: string }
  | { action: 'getSettings' }
  | { action: 'testConnection' };
```

## Implementation Steps

### Phase 1: Foundation (Types and Storage)

#### Step 1.1: Update src/lib/types.ts

Add the new types as defined above. Update `SyncSettings` and `ExtensionMessage`.

#### Step 1.2: Update src/lib/storage.ts

```typescript
// Add new default
export const DEFAULT_OUTPUT_OPTIONS: OutputOptions = {
  obsidian: true,  // Preserve current default behavior
  file: false,
  clipboard: false,
};

// Update DEFAULT_SYNC_SETTINGS
export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  obsidianPort: DEFAULT_OBSIDIAN_PORT,
  vaultPath: 'AI/Gemini',
  templateOptions: DEFAULT_TEMPLATE_OPTIONS,
  outputOptions: DEFAULT_OUTPUT_OPTIONS,  // NEW
};
```

Update `migrateSettings()` function to handle migration for existing users (ensure `outputOptions` defaults are applied).

### Phase 2: Manifest Update

#### Step 2.1: Update src/manifest.json

```json
{
  "permissions": [
    "storage",
    "activeTab",
    "downloads",
    "clipboardWrite"
  ],
  // ... rest unchanged
}
```

**Note**: `clipboardWrite` permission may require user action context. If issues arise in service worker, will need offscreen document approach.

### Phase 3: Background Service Worker

#### Step 3.1: Add File Download Handler

```typescript
/**
 * Download markdown content as a file
 */
async function handleDownloadToFile(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const content = generateNoteContent(note, settings);
    
    // Create data URL for download
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const dataUrl = URL.createObjectURL(blob);
    
    // Trigger download
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: note.fileName,
      saveAs: false, // Use default Downloads folder
    });
    
    // Clean up blob URL after download starts
    setTimeout(() => URL.revokeObjectURL(dataUrl), 1000);
    
    return {
      destination: 'file',
      success: true,
      details: note.fileName,
    };
  } catch (error) {
    return {
      destination: 'file',
      success: false,
      error: getErrorMessage(error),
    };
  }
}
```

#### Step 3.2: Add Clipboard Handler

```typescript
/**
 * Copy markdown content to clipboard
 * Note: Service workers may need offscreen document for clipboard
 */
async function handleCopyToClipboard(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const content = generateNoteContent(note, settings);
    
    // Option 1: Direct clipboard API (may not work in service worker)
    await navigator.clipboard.writeText(content);
    
    return {
      destination: 'clipboard',
      success: true,
      details: 'Copied to clipboard',
    };
  } catch (error) {
    // Fallback: Use content script injection or offscreen document
    return {
      destination: 'clipboard',
      success: false,
      error: getErrorMessage(error),
    };
  }
}
```

**Technical Note**: If `navigator.clipboard` doesn't work in service worker, implement using:
```typescript
// Create offscreen document for clipboard access
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: [chrome.offscreen.Reason.CLIPBOARD],
  justification: 'Copy markdown content to clipboard',
});
// Then message the offscreen document to perform clipboard write
```

#### Step 3.3: Add Multi-Output Coordinator

```typescript
/**
 * Execute multiple output operations in parallel
 */
async function handleSaveToOutputs(
  settings: ExtensionSettings,
  note: ObsidianNote,
  outputs: OutputDestination[]
): Promise<MultiOutputResponse> {
  const operations: Promise<OutputResult>[] = [];
  
  for (const output of outputs) {
    switch (output) {
      case 'obsidian':
        operations.push(
          handleSave(settings, note).then(result => ({
            destination: 'obsidian' as const,
            success: result.success,
            error: result.error,
            details: result.isNewFile ? 'Created' : 'Updated',
          }))
        );
        break;
      case 'file':
        operations.push(handleDownloadToFile(note, settings));
        break;
      case 'clipboard':
        operations.push(handleCopyToClipboard(note, settings));
        break;
    }
  }
  
  const results = await Promise.allSettled(operations);
  
  const outputResults: OutputResult[] = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      destination: outputs[index],
      success: false,
      error: result.reason?.message ?? 'Unknown error',
    };
  });
  
  return {
    results: outputResults,
    allSuccessful: outputResults.every(r => r.success),
    anySuccessful: outputResults.some(r => r.success),
  };
}
```

#### Step 3.4: Update Message Handler

```typescript
async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  const settings = await getSettings();

  switch (message.action) {
    case 'saveToObsidian':
      return handleSave(settings, message.data);
    
    case 'saveToOutputs':  // NEW
      return handleSaveToOutputs(settings, message.data, message.outputs);

    case 'getExistingFile':
      return handleGetFile(settings, message.fileName, message.vaultPath);

    case 'testConnection':
      return handleTestConnection(settings);

    case 'getSettings':
      return settings;

    default:
      return { success: false, error: 'Unknown action' };
  }
}
```

### Phase 4: Content Script

#### Step 4.1: Update handleSync() in src/content/index.ts

```typescript
async function handleSync(): Promise<void> {
  console.info('[G2O] Sync initiated');
  setButtonLoading(true);

  try {
    const settings = await getSettings();
    
    // Determine enabled outputs
    const enabledOutputs: OutputDestination[] = [];
    if (settings.outputOptions.obsidian) enabledOutputs.push('obsidian');
    if (settings.outputOptions.file) enabledOutputs.push('file');
    if (settings.outputOptions.clipboard) enabledOutputs.push('clipboard');
    
    if (enabledOutputs.length === 0) {
      showErrorToast('No output destination selected. Please configure in settings.');
      setButtonLoading(false);
      return;
    }
    
    // Only validate Obsidian connection if Obsidian is selected
    if (settings.outputOptions.obsidian) {
      if (!settings.obsidianApiKey) {
        showErrorToast('Please configure your Obsidian API key in the extension settings');
        setButtonLoading(false);
        return;
      }
      
      const connectionTest = await testConnection();
      if (!connectionTest.success) {
        showErrorToast(connectionTest.error || 'Cannot connect to Obsidian');
        setButtonLoading(false);
        return;
      }
    }
    
    // Extract conversation (unchanged)
    const extractor = new GeminiExtractor();
    if (!extractor.canExtract()) {
      showErrorToast('Not on a valid Gemini conversation page');
      setButtonLoading(false);
      return;
    }

    showToast('Extracting conversation...', 'info', INFO_TOAST_DURATION);
    const result = await extractor.extract();
    
    // ... validation logic unchanged ...
    
    const note = conversationToNote(result.data, settings.templateOptions);
    
    // Execute all selected outputs
    showToast('Saving...', 'info', INFO_TOAST_DURATION);
    const multiResult = await saveToOutputs(note, enabledOutputs);
    
    // Show aggregated results
    if (multiResult.allSuccessful) {
      showMultiSuccessToast(multiResult.results);
    } else if (multiResult.anySuccessful) {
      showPartialSuccessToast(multiResult.results);
    } else {
      showMultiErrorToast(multiResult.results);
    }
    
  } catch (error) {
    // ... error handling unchanged ...
  } finally {
    setButtonLoading(false);
  }
}

/**
 * Save to multiple outputs via background script
 */
function saveToOutputs(
  note: ObsidianNote,
  outputs: OutputDestination[]
): Promise<MultiOutputResponse> {
  return sendMessage({ action: 'saveToOutputs', data: note, outputs });
}
```

#### Step 4.2: Add New Toast Functions in src/content/ui.ts

```typescript
export function showMultiSuccessToast(results: OutputResult[]): void {
  const details = results
    .filter(r => r.success)
    .map(r => `${getOutputLabel(r.destination)}: ✓`)
    .join(', ');
  showToast(`Success: ${details}`, 'success', SUCCESS_TOAST_DURATION);
}

export function showPartialSuccessToast(results: OutputResult[]): void {
  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);
  
  const successPart = successes.map(r => `${getOutputLabel(r.destination)}: ✓`).join(', ');
  const failPart = failures.map(r => `${getOutputLabel(r.destination)}: ✗`).join(', ');
  
  showToast(`Partial: ${successPart}; Failed: ${failPart}`, 'warning', WARNING_TOAST_DURATION);
}

function getOutputLabel(dest: OutputDestination): string {
  switch (dest) {
    case 'obsidian': return 'Obsidian';
    case 'file': return 'File';
    case 'clipboard': return 'Clipboard';
  }
}
```

### Phase 5: Popup UI

#### Step 5.1: Update src/popup/index.html

Add new section after the "Message Format" section:

```html
<section class="section">
  <h2 data-i18n="settings_outputDestinations">Output Destinations</h2>
  <p class="help" data-i18n="settings_outputHelp">Select where to save exported conversations</p>
  <div class="checkbox-grid">
    <label class="checkbox-label">
      <input type="checkbox" id="outputObsidian" checked />
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
```

#### Step 5.2: Update src/popup/index.ts

Add elements:
```typescript
const elements = {
  // ... existing elements ...
  outputObsidian: document.getElementById('outputObsidian') as HTMLInputElement,
  outputFile: document.getElementById('outputFile') as HTMLInputElement,
  outputClipboard: document.getElementById('outputClipboard') as HTMLInputElement,
};
```

Update `populateForm()`:
```typescript
function populateForm(settings: ExtensionSettings): void {
  // ... existing code ...
  
  // Output options
  elements.outputObsidian.checked = settings.outputOptions?.obsidian ?? true;
  elements.outputFile.checked = settings.outputOptions?.file ?? false;
  elements.outputClipboard.checked = settings.outputOptions?.clipboard ?? false;
}
```

Update `collectSettings()`:
```typescript
function collectSettings(): ExtensionSettings {
  return {
    // ... existing fields ...
    outputOptions: {
      obsidian: elements.outputObsidian.checked,
      file: elements.outputFile.checked,
      clipboard: elements.outputClipboard.checked,
    },
  };
}
```

Add validation in `handleSave()`:
```typescript
async function handleSave(): Promise<void> {
  const settings = collectSettings();
  
  // Validate at least one output selected
  if (!settings.outputOptions.obsidian && 
      !settings.outputOptions.file && 
      !settings.outputOptions.clipboard) {
    showStatus('Please select at least one output destination', 'error');
    return;
  }
  
  // ... rest of save logic ...
}
```

### Phase 6: i18n

#### Step 6.1: Update src/_locales/en/messages.json

```json
{
  "settings_outputDestinations": {
    "message": "Output Destinations",
    "description": "Section title for output options"
  },
  "settings_outputHelp": {
    "message": "Select where to save exported conversations",
    "description": "Help text for output options"
  },
  "settings_outputObsidian": {
    "message": "Obsidian (API)",
    "description": "Label for Obsidian output option"
  },
  "settings_outputFile": {
    "message": "Download File",
    "description": "Label for file download option"
  },
  "settings_outputClipboard": {
    "message": "Copy to Clipboard",
    "description": "Label for clipboard option"
  },
  "toast_success_multi": {
    "message": "Success: $RESULTS$",
    "description": "Success message for multiple outputs",
    "placeholders": {
      "results": {
        "content": "$1",
        "example": "Obsidian: ✓, File: ✓"
      }
    }
  },
  "toast_partial_success": {
    "message": "Partial success: $SUCCESS$; Failed: $FAILED$",
    "description": "Message for partial success",
    "placeholders": {
      "success": {
        "content": "$1"
      },
      "failed": {
        "content": "$2"
      }
    }
  },
  "toast_success_file": {
    "message": "Downloaded: $FILE$",
    "description": "Success message for file download",
    "placeholders": {
      "file": {
        "content": "$1"
      }
    }
  },
  "toast_success_clipboard": {
    "message": "Copied to clipboard",
    "description": "Success message for clipboard copy"
  },
  "toast_error_noOutput": {
    "message": "No output destination selected. Please configure in settings.",
    "description": "Error when no output is selected"
  },
  "error_noOutputSelected": {
    "message": "Please select at least one output destination",
    "description": "Error for validation in settings"
  }
}
```

#### Step 6.2: Update src/_locales/ja/messages.json

Add corresponding Japanese translations.

## UI Mockup Description

### Popup Settings - Output Destinations Section

```
┌─────────────────────────────────────┐
│ OUTPUT DESTINATIONS                  │
│ ─────────────────────────────────── │
│ Select where to save exported       │
│ conversations                        │
│                                      │
│ ┌─────────────┐ ┌─────────────────┐ │
│ │ ☑ Obsidian  │ │ ☐ Download File │ │
│ │   (API)     │ │                 │ │
│ └─────────────┘ └─────────────────┘ │
│ ┌─────────────────┐                  │
│ │ ☐ Copy to       │                  │
│ │   Clipboard     │                  │
│ └─────────────────┘                  │
└─────────────────────────────────────┘
```

Uses existing `checkbox-grid` CSS class for consistent 2-column layout.

## Error Handling Strategy

### Per-Output Error Isolation
- Each output operation wrapped in try-catch
- `Promise.allSettled()` ensures all outputs attempted
- Individual results aggregated for user feedback

### User Feedback Matrix

| Scenario | Toast Type | Example Message |
|----------|------------|-----------------|
| All success | Success (green) | "Success: Obsidian: ✓, File: ✓, Clipboard: ✓" |
| Partial success | Warning (amber) | "Partial: Obsidian: ✓; Failed: Clipboard: ✗" |
| All failed | Error (red) | "Failed: Obsidian: Connection error, File: Permission denied" |
| No output selected | Error (red) | "No output destination selected" |

### Validation Rules

1. **Settings Save**: At least one output must be enabled
2. **Sync Execution**: 
   - If only Obsidian selected: Require API key and connection test
   - If File/Clipboard only: No connection requirements
   - If mixed: Validate Obsidian only if enabled

## Potential Challenges and Mitigations

### Challenge 1: Clipboard API in Service Worker

**Problem**: `navigator.clipboard` may not be available in service workers.

**Mitigation Options**:
1. **Offscreen Document** (Chrome 109+):
   - Create `src/background/offscreen.html` and `offscreen.ts`
   - Use `chrome.offscreen.createDocument()` for clipboard access
   
2. **Content Script Injection**:
   - Inject script into active tab to perform clipboard write
   - Requires `activeTab` permission (already present)

**Recommendation**: Try direct API first, implement offscreen fallback if needed.

### Challenge 2: Downloads API Blob Handling

**Problem**: Service workers have limited access to DOM APIs for blob creation.

**Mitigation**: 
- Use `URL.createObjectURL()` if available
- Fallback to base64 data URL encoding

### Challenge 3: Settings Migration

**Problem**: Existing users don't have `outputOptions` in storage.

**Mitigation**: 
- `migrateSettings()` already handles missing fields
- Add `outputOptions: DEFAULT_OUTPUT_OPTIONS` spread in migration

## Testing Checklist

### Unit Tests
- [ ] `OutputOptions` type validation
- [ ] `generateNoteContent()` produces valid markdown
- [ ] Settings migration adds default `outputOptions`

### Integration Tests
- [ ] Obsidian-only output (current behavior preserved)
- [ ] File download creates `.md` file in Downloads
- [ ] Clipboard copy contains complete markdown with frontmatter
- [ ] Multi-output executes all selected destinations
- [ ] Partial failure shows correct status per output

### Manual Tests
- [ ] New install: defaults to Obsidian only
- [ ] Existing install: preserves settings, adds new options
- [ ] UI checkbox states persist after reload
- [ ] Cannot save settings with zero outputs selected
- [ ] Sync button disabled while processing
- [ ] Toast messages accurate for each scenario

## Critical Files for Implementation

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | Core type definitions for output options |
| `src/lib/storage.ts` | Default settings and migration |
| `src/background/index.ts` | Output handlers (file, clipboard, coordinator) |
| `src/content/index.ts` | Sync flow with multi-output logic |
| `src/popup/index.html` | Output destination checkboxes |
| `src/popup/index.ts` | Settings form for output options |
| `src/manifest.json` | Downloads and clipboard permissions |
| `src/_locales/*/messages.json` | i18n strings |

## Implementation Order (Recommended)

1. **src/lib/types.ts** - Foundation types
2. **src/lib/storage.ts** - Defaults and migration
3. **src/manifest.json** - Permissions
4. **src/background/index.ts** - Core handlers
5. **src/_locales/*/messages.json** - i18n (can parallel with #4)
6. **src/popup/index.html** - UI structure
7. **src/popup/index.ts** - UI logic
8. **src/content/index.ts** - Sync flow integration
9. **src/content/ui.ts** - Toast functions (if needed)

Total estimated effort: ~4-6 hours for full implementation with testing.
