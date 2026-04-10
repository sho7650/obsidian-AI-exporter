# Gemini to Obsidian - Implementation Workflow

## Workflow Overview

| Attribute | Value |
|-----------|-------|
| **Strategy** | Systematic (Phase-based) |
| **Total Phases** | 6 |
| **MVP Scope** | Phase 1 |
| **Estimated Tasks** | 32 |
| **Dependencies** | Vite, TypeScript, Turndown.js, Chrome Extension MV3 |

---

## Phase 1: MVP (P0) - Core Functionality

### 1.1 Project Setup

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 1.1.1 Initialize npm project | None | `package.json` | `npm install` succeeds |
| 1.1.2 Configure TypeScript | 1.1.1 | `tsconfig.json` | `tsc --noEmit` passes |
| 1.1.3 Configure Vite + CRXJS | 1.1.2 | `vite.config.ts` | `npm run build` succeeds |
| 1.1.4 Setup ESLint + Prettier | 1.1.1 | `eslint.config.js`, `.prettierrc` | `npm run lint` passes |
| 1.1.5 Create manifest.json | 1.1.3 | `src/manifest.json` | Valid MV3 manifest |
| 1.1.6 Create directory structure | 1.1.1 | Folders created | All paths exist |

#### Task Details

**1.1.1 Initialize npm project**
```bash
npm init -y
```

**Files to create:**
- `package.json` with dependencies from plan

**1.1.2 Configure TypeScript**
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["chrome"]
  },
  "include": ["src/**/*"]
}
```

**1.1.3 Configure Vite + CRXJS**
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html'
      }
    }
  }
});
```

**1.1.5 Create manifest.json**
```json
// src/manifest.json
{
  "manifest_version": 3,
  "name": "Gemini to Obsidian",
  "version": "0.1.0",
  "description": "Save Gemini conversations to Obsidian",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://gemini.google.com/*",
    "http://127.0.0.1:27123/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://gemini.google.com/*"],
    "js": ["src/content/index.ts"]
  }],
  "action": {
    "default_popup": "src/popup/index.html"
  }
}
```

---

### 1.2 Shared Library

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 1.2.1 Create TypeScript types | 1.1.2 | `src/lib/types.ts` | TypeScript compiles |
| 1.2.2 Create storage wrapper | 1.2.1 | `src/lib/storage.ts` | Unit tests pass |
| 1.2.3 Create Obsidian API client | 1.2.1 | `src/lib/obsidian-api.ts` | Connection test works |

#### Task Details

**1.2.1 Create TypeScript types**
- File: `src/lib/types.ts`
- Content: All interfaces from DESIGN.md Section 4.1

**1.2.2 Create storage wrapper**
```typescript
// src/lib/storage.ts
import type { ExtensionSettings } from './types';

const DEFAULT_SETTINGS: ExtensionSettings = {
  obsidianApiKey: '',
  obsidianPort: 27123,
  vaultPath: 'AI/Gemini',
  templateOptions: {
    includeId: true,
    includeTitle: true,
    includeTags: true,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE'
  }
};

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({ settings: { ...current, ...settings } });
}
```

**1.2.3 Create Obsidian API client**
- File: `src/lib/obsidian-api.ts`
- Content: ObsidianApiClient class from DESIGN.md Section 5.3

---

### 1.3 Background Service Worker

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 1.3.1 Create message handler | 1.2.3 | `src/background/index.ts` | Messages received |
| 1.3.2 Implement saveToObsidian | 1.3.1 | Save function | File created in vault |
| 1.3.3 Implement testConnection | 1.3.1 | Test function | Returns true/false |

#### Task Details

**1.3.1 Create message handler**
```typescript
// src/background/index.ts
import { ObsidianApiClient } from '../lib/obsidian-api';
import { getSettings } from '../lib/storage';
import type { ExtensionMessage, SaveResponse } from '../lib/types';

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    handleMessage(message).then(sendResponse);
    return true; // Async response
  }
);

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  const settings = await getSettings();
  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);

  switch (message.action) {
    case 'saveToObsidian':
      return handleSave(client, settings, message.data);
    case 'testConnection':
      return client.testConnection();
    case 'getSettings':
      return settings;
    default:
      return { success: false, error: 'Unknown action' };
  }
}
```

---

### 1.4 Content Script

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 1.4.1 Create content entry | 1.1.5 | `src/content/index.ts` | Script loads on Gemini |
| 1.4.2 Create UI components | 1.4.1 | `src/content/ui.ts` | Button visible |
| 1.4.3 Create base extractor | 1.2.1 | `src/content/extractors/base.ts` | Interface defined |
| 1.4.4 Create Gemini extractor | 1.4.3 | `src/content/extractors/gemini.ts` | Extracts messages |
| 1.4.5 Create markdown converter | 1.4.4 | `src/content/markdown.ts` | HTML→MD works |
| 1.4.6 Wire up sync button | 1.4.2, 1.4.5 | Button click handler | Full flow works |

#### Task Details

**1.4.2 Create UI components**
```typescript
// src/content/ui.ts
export function injectSyncButton(onClick: () => void): void {
  const button = document.createElement('button');
  button.id = 'gemini2obsidian-sync';
  button.innerHTML = '📥 Sync';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    padding: 12px 20px;
    background: #7c3aed;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  button.addEventListener('click', onClick);
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
  });
  document.body.appendChild(button);
}

export function showToast(message: string, type: 'success' | 'error' | 'warning'): void {
  const toast = document.createElement('div');
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b'
  };
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 10001;
    padding: 12px 20px;
    background: ${colors[type]};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
```

**1.4.4 Create Gemini extractor**
```typescript
// src/content/extractors/gemini.ts
import type { IConversationExtractor, ExtractionResult, ConversationMessage } from '../../lib/types';

const SELECTORS = {
  conversationContainer: '.conversation-container',
  userQuery: '.user-query-container',
  userQueryText: '.query-text-line',
  modelResponse: '.model-response-text',
  modelResponseContent: '.markdown.markdown-main-panel',
  conversationTitle: '.conversation-title.gds-label-l',
  fallback: {
    userQuery: '[class*="user-query"]',
    modelResponse: '[class*="model-response"]',
    markdown: '[class*="markdown"]'
  }
};

export class GeminiExtractor implements IConversationExtractor {
  readonly platform = 'gemini' as const;

  canExtract(): boolean {
    return window.location.hostname === 'gemini.google.com';
  }

  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/app\/([a-f0-9]+)/);
    return match ? match[1] : null;
  }

  getTitle(): string {
    const firstQuery = document.querySelector(SELECTORS.userQueryText);
    if (firstQuery?.textContent) {
      return firstQuery.textContent.trim().substring(0, 100);
    }
    return 'Untitled Conversation';
  }

  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    const container = document.querySelector(SELECTORS.conversationContainer);

    if (!container) {
      console.warn('[G2O] No conversation container found');
      return messages;
    }

    // Extract user queries
    const userQueries = container.querySelectorAll(SELECTORS.userQuery);
    const modelResponses = container.querySelectorAll(SELECTORS.modelResponse);

    userQueries.forEach((query, index) => {
      const textEl = query.querySelector(SELECTORS.userQueryText);
      if (textEl?.textContent) {
        messages.push({
          id: `user-${index}`,
          role: 'user',
          content: textEl.textContent.trim(),
          index: messages.length
        });
      }

      // Get corresponding response
      if (modelResponses[index]) {
        const responseContent = modelResponses[index].querySelector(SELECTORS.modelResponseContent);
        if (responseContent) {
          messages.push({
            id: `assistant-${index}`,
            role: 'assistant',
            content: responseContent.innerHTML,
            htmlContent: responseContent.innerHTML,
            index: messages.length
          });
        }
      }
    });

    return messages;
  }

  async extract(): Promise<ExtractionResult> {
    try {
      const messages = this.extractMessages();

      if (messages.length === 0) {
        return {
          success: false,
          error: 'No messages found in conversation',
          warnings: ['Primary selectors may have changed']
        };
      }

      return {
        success: true,
        data: {
          id: this.getConversationId() || `gemini-${Date.now()}`,
          title: this.getTitle(),
          url: window.location.href,
          source: 'gemini',
          messages,
          extractedAt: new Date(),
          metadata: {
            messageCount: messages.length,
            userMessageCount: messages.filter(m => m.role === 'user').length,
            assistantMessageCount: messages.filter(m => m.role === 'assistant').length,
            hasCodeBlocks: messages.some(m => m.content.includes('<code'))
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error'
      };
    }
  }

  validate(result: ExtractionResult) {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!result.data?.messages.length) {
      errors.push('No messages extracted');
    }

    if (result.data && result.data.messages.length < 2) {
      warnings.push('Very few messages extracted - selectors may need updating');
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors
    };
  }
}
```

---

### 1.5 Popup Settings

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 1.5.1 Create popup HTML | 1.1.5 | `src/popup/index.html` | Popup opens |
| 1.5.2 Create popup styles | 1.5.1 | `src/popup/styles.css` | UI styled |
| 1.5.3 Create popup script | 1.5.1, 1.2.2 | `src/popup/index.ts` | Settings save/load |
| 1.5.4 Add connection test | 1.5.3 | Test button | Shows connection status |

#### Task Details

**1.5.1 Create popup HTML**
```html
<!-- src/popup/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemini to Obsidian Settings</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>⚙️ Settings</h1>

    <div class="form-group">
      <label for="apiKey">Obsidian API Key</label>
      <input type="password" id="apiKey" placeholder="Enter API key">
    </div>

    <div class="form-group">
      <label for="port">API Port</label>
      <input type="number" id="port" value="27123" min="1024" max="65535">
    </div>

    <div class="form-group">
      <label for="vaultPath">Vault Path</label>
      <input type="text" id="vaultPath" placeholder="AI/Gemini">
    </div>

    <div class="actions">
      <button id="testBtn" class="secondary">Test Connection</button>
      <button id="saveBtn" class="primary">Save</button>
    </div>

    <div id="status" class="status"></div>
  </div>
  <script type="module" src="index.ts"></script>
</body>
</html>
```

---

### 1.6 Integration & Testing

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 1.6.1 Build extension | All above | `dist/` folder | Build succeeds |
| 1.6.2 Load in Chrome | 1.6.1 | Extension loaded | No console errors |
| 1.6.3 Manual test checklist | 1.6.2 | Test results | All tests pass |

---

## Phase 2: DOM Validation (P1)

### 2.1 Robust Selectors

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 2.1.1 Add fallback selector chain | Phase 1 | Updated extractor | Fallbacks work |
| 2.1.2 Add empty content detection | 2.1.1 | Warning system | Warns on empty |
| 2.1.3 Add selector versioning | 2.1.2 | Version config | Selectors updateable |

### 2.2 Extraction Quality

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 2.2.1 Add validation layer | 2.1.1 | ValidationResult | Validates output |
| 2.2.2 Add error reporting | 2.2.1 | Error log | Errors logged |
| 2.2.3 Add quality metrics | 2.2.2 | Metrics output | Quality measured |

---

## Phase 3: Append Mode (P1)

### 3.1 File Operations

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 3.1.1 Implement GET existing | Phase 1 | getFile function | Retrieves files |
| 3.1.2 Parse existing messages | 3.1.1 | Parse function | Extracts messages |
| 3.1.3 Calculate diff | 3.1.2 | Diff function | New messages only |

### 3.2 Append Logic

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 3.2.1 Preserve frontmatter | 3.1.3 | Merge function | Frontmatter intact |
| 3.2.2 Append new messages | 3.2.1 | Append function | Messages added |
| 3.2.3 Handle edge cases | 3.2.2 | Edge case handlers | No data loss |

---

## Phase 4: Template Customization (P2)

### 4.1 Settings Extension

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 4.1.1 Add frontmatter toggles | Phase 3 | UI controls | Toggles work |
| 4.1.2 Add format selection | 4.1.1 | Format dropdown | Formats apply |
| 4.1.3 Add preview | 4.1.2 | Preview panel | Shows output |

### 4.2 Template Engine

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 4.2.1 Create template system | 4.1.1 | Template engine | Substitutes fields |
| 4.2.2 Add callout options | 4.2.1 | Callout config | Callouts work |

---

## Phase 5: LLM Tagging (P3)

### 5.1 OpenAI Integration

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 5.1.1 Add OpenAI client | Phase 4 | API client | API calls work |
| 5.1.2 Create tag prompt | 5.1.1 | Prompt template | Tags generated |
| 5.1.3 Parse response | 5.1.2 | Parser function | Tags extracted |

### 5.2 Tag UI

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 5.2.1 Add suggestion UI | 5.1.3 | Tag component | Shows suggestions |
| 5.2.2 Add accept/reject | 5.2.1 | Action buttons | User can modify |

---

## Phase 6: Multi-AI Support (P3)

### 6.1 Additional Extractors

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 6.1.1 Create Claude extractor | Phase 5 | ClaudeExtractor | Extracts from Claude |
| 6.1.2 Create Perplexity extractor | 6.1.1 | PerplexityExtractor | Extracts from Perplexity |

### 6.2 Site Detection

| Task | Dependencies | Output | Validation |
|------|--------------|--------|------------|
| 6.2.1 Add URL detection | 6.1.2 | Detector function | Selects extractor |
| 6.2.2 Update manifest | 6.2.1 | manifest.json | Permissions added |
| 6.2.3 Add per-site settings | 6.2.2 | Settings UI | Site configs saved |

---

## Dependency Graph

```
Phase 1 (MVP)
├── 1.1 Project Setup
│   ├── 1.1.1 npm init
│   ├── 1.1.2 TypeScript ← 1.1.1
│   ├── 1.1.3 Vite ← 1.1.2
│   ├── 1.1.4 ESLint ← 1.1.1
│   ├── 1.1.5 manifest ← 1.1.3
│   └── 1.1.6 dirs ← 1.1.1
├── 1.2 Shared Library ← 1.1
│   ├── 1.2.1 types
│   ├── 1.2.2 storage ← 1.2.1
│   └── 1.2.3 obsidian-api ← 1.2.1
├── 1.3 Background ← 1.2
│   ├── 1.3.1 handler
│   ├── 1.3.2 save ← 1.3.1
│   └── 1.3.3 test ← 1.3.1
├── 1.4 Content ← 1.2
│   ├── 1.4.1 entry
│   ├── 1.4.2 ui ← 1.4.1
│   ├── 1.4.3 base-extractor
│   ├── 1.4.4 gemini-extractor ← 1.4.3
│   ├── 1.4.5 markdown ← 1.4.4
│   └── 1.4.6 wiring ← 1.4.2, 1.4.5
├── 1.5 Popup ← 1.2
│   ├── 1.5.1 HTML
│   ├── 1.5.2 CSS ← 1.5.1
│   ├── 1.5.3 script ← 1.5.1
│   └── 1.5.4 test-btn ← 1.5.3
└── 1.6 Integration ← 1.3, 1.4, 1.5
    ├── 1.6.1 build
    ├── 1.6.2 load ← 1.6.1
    └── 1.6.3 test ← 1.6.2

Phase 2 (DOM Validation) ← Phase 1
Phase 3 (Append Mode) ← Phase 1
Phase 4 (Templates) ← Phase 3
Phase 5 (LLM Tags) ← Phase 4
Phase 6 (Multi-AI) ← Phase 5
```

---

## Execution Order (Phase 1)

### Parallel Group A (No dependencies)
1. 1.1.1 Initialize npm project

### Sequential Group B (← Group A)
2. 1.1.2 Configure TypeScript
3. 1.1.3 Configure Vite + CRXJS
4. 1.1.5 Create manifest.json

### Parallel Group C (← 1.1.1)
5. 1.1.4 Setup ESLint + Prettier
6. 1.1.6 Create directory structure

### Sequential Group D (← 1.1.2)
7. 1.2.1 Create TypeScript types

### Parallel Group E (← 1.2.1)
8. 1.2.2 Create storage wrapper
9. 1.2.3 Create Obsidian API client

### Parallel Group F (← Group E)
10. 1.3.1 Create message handler (Background)
11. 1.4.1 Create content entry (Content)
12. 1.5.1 Create popup HTML (Popup)

### Continue sequentially within each component...

---

## Quality Gates

### Phase 1 Completion Criteria
- [ ] `npm run build` succeeds with no errors
- [ ] Extension loads in Chrome (chrome://extensions)
- [ ] "Sync Now" button appears on gemini.google.com
- [ ] Settings popup opens and saves
- [ ] Connection test shows success/failure
- [ ] Save creates file in Obsidian vault
- [ ] Toast notifications display correctly

### Phase 2 Completion Criteria
- [ ] Fallback selectors activate when primary fail
- [ ] Empty content shows warning toast
- [ ] Validation results logged to console

### Phase 3 Completion Criteria
- [ ] Existing file is retrieved before save
- [ ] Only new messages are appended
- [ ] Frontmatter is preserved
- [ ] modified date is updated

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| DOM selectors change | High | High | Fallback selectors, version config |
| Obsidian API unavailable | Medium | High | Clear error messages, setup guide |
| CRXJS build issues | Medium | Medium | Pin version, fallback to manual config |
| Chrome MV3 limitations | Low | Medium | Thorough MV3 documentation review |

---

## Commands Reference

```bash
# Development
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run format       # Run Prettier

# Testing
npm run test         # Run unit tests (future)

# Deployment
npm run package      # Create .zip for Chrome Web Store
```

---

## Next Steps

**To begin implementation, execute in order:**

1. Run `npm init -y` in project directory
2. Install dependencies from package.json
3. Create configuration files (tsconfig, vite.config, etc.)
4. Create directory structure
5. Implement shared library (types, storage, API client)
6. Implement background service worker
7. Implement content script with extractor
8. Implement popup settings
9. Build and test
