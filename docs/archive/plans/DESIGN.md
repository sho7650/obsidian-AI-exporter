# Gemini to Obsidian Chrome Extension - Design Document

## 1. Overview

### 1.1 Purpose
Chrome Extension to save Gemini AI chat conversations to Obsidian via Local REST API with manual sync, append mode, and future multi-AI platform support.

### 1.2 Core Features
- Manual "Sync Now" button for conversation export
- Append mode (new messages only) with filename-based deduplication
- Toast notifications for user feedback
- Configurable frontmatter and templates
- Future: LLM-based auto-tagging, Claude/Perplexity support

## 2. Architecture

### 2.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Content    │    │  Background  │    │    Popup     │      │
│  │   Script     │───►│   Service    │◄───│   Settings   │      │
│  │              │    │   Worker     │    │              │      │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘      │
│         │                   │                                    │
│         ▼                   ▼                                    │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │  Extractor   │    │  Obsidian    │                          │
│  │  (Gemini)    │    │  API Client  │                          │
│  └──────────────┘    └──────────────┘                          │
│                             │                                    │
└─────────────────────────────│────────────────────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │  Obsidian Local  │
                    │  REST API        │
                    │  (127.0.0.1:27123)│
                    └──────────────────┘
```

### 2.2 Data Flow

```
1. User clicks "Sync Now" button
         │
         ▼
2. Content Script extracts conversation
   - Query DOM for messages
   - Parse user queries and model responses
   - Extract conversation metadata
         │
         ▼
3. Convert HTML to Markdown (Turndown.js)
   - Process code blocks
   - Handle formatting (bold, italic, lists)
   - Preserve structure
         │
         ▼
4. Generate Obsidian note
   - Create YAML frontmatter
   - Format messages with callouts
   - Calculate content hash for dedup
         │
         ▼
5. Send to Background Service Worker
         │
         ▼
6. Background Worker:
   - GET existing file (if append mode)
   - Calculate diff (new messages only)
   - PUT updated content to Obsidian API
         │
         ▼
7. Toast notification: Success/Error
```

## 3. DOM Structure Analysis

### 3.1 Gemini Page Structure (from elements-sample.html)

Based on actual DOM inspection of gemini.google.com:

#### Conversation Container
```html
<div class="conversation-container message-actions-hover-boundary ng-star-inserted">
  <!-- Individual message turns -->
</div>
```

#### User Query Structure
```html
<div class="user-query-container">
  <div class="user-query-bubble-with-background ng-star-inserted">
    <div class="query-content ng-star-inserted">
      <div class="query-text gds-body-l">
        <span class="query-text-line ng-star-inserted">
          <!-- User's question text -->
        </span>
      </div>
    </div>
  </div>
</div>
```

#### Model Response Structure
```html
<div class="response-container ng-tns-c1822547831-* response-container-with-gpi ng-star-inserted">
  <div class="response-container-content ng-tns-c1822547831-* has-thoughts">
    <div class="model-response-text has-thoughts ng-star-inserted">
      <div class="markdown markdown-main-panel stronger enable-updated-hr-color">
        <!-- Markdown content rendered as HTML -->
      </div>
    </div>
  </div>
</div>
```

### 3.2 CSS Selectors Strategy

```typescript
// Primary selectors (high confidence)
const SELECTORS = {
  // Conversation container
  conversationContainer: '.conversation-container',

  // User queries
  userQuery: '.user-query-container',
  userQueryText: '.query-text-line',
  userQueryContent: '.query-text',

  // Model responses
  modelResponse: '.model-response-text',
  modelResponseContent: '.markdown.markdown-main-panel',
  responseContainer: '.response-container',

  // Conversation list (sidebar)
  conversationTitle: '.conversation-title.gds-label-l',
  conversationItem: '[data-test-id="conversation"]',

  // Fallback selectors
  fallback: {
    userQuery: '[class*="user-query"]',
    modelResponse: '[class*="model-response"]',
    markdown: '[class*="markdown"]'
  }
};
```

### 3.3 Key Observations

| Element | Class Pattern | Notes |
|---------|---------------|-------|
| User Query Container | `user-query-container` | 6 occurrences in sample |
| Query Text | `query-text-line ng-star-inserted` | 5 occurrences |
| Model Response | `model-response-text has-thoughts` | 2 occurrences |
| Response Content | `response-content ng-tns-c*` | Dynamic suffix |
| Markdown Content | `markdown markdown-main-panel` | 2 occurrences |
| Conversation List | `conversation-title gds-label-l` | 72 sidebar items |

### 3.4 Angular-Specific Considerations

Gemini uses Angular framework with dynamic class suffixes:
- `ng-tns-c*-*` pattern indicates component-scoped styles
- `ng-star-inserted` indicates dynamically inserted content
- Classes may change between sessions/updates

**Mitigation Strategy:**
1. Use stable class prefixes (e.g., `[class*="user-query"]`)
2. Implement fallback selector chains
3. Detect empty content and warn user
4. Version selector mappings for updates

## 4. TypeScript Interfaces

### 4.1 Core Types

```typescript
// src/lib/types.ts

/**
 * Represents a single message in a conversation
 */
export interface ConversationMessage {
  id: string;                    // Generated hash or DOM-derived ID
  role: 'user' | 'assistant';
  content: string;               // Markdown content
  htmlContent?: string;          // Original HTML (for debugging)
  timestamp?: Date;              // If available from DOM
  index: number;                 // Position in conversation
}

/**
 * Extracted conversation data
 */
export interface ConversationData {
  id: string;                    // Conversation ID (from URL or generated)
  title: string;                 // First user query or sidebar title
  url: string;                   // Full Gemini URL
  source: 'gemini' | 'claude' | 'perplexity';
  messages: ConversationMessage[];
  extractedAt: Date;
  metadata: ConversationMetadata;
}

/**
 * Additional metadata about the conversation
 */
export interface ConversationMetadata {
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  hasCodeBlocks: boolean;
  estimatedTokens?: number;
}

/**
 * Obsidian note structure
 */
export interface ObsidianNote {
  fileName: string;              // Sanitized filename
  frontmatter: NoteFrontmatter;
  body: string;                  // Markdown body
  contentHash: string;           // For deduplication
}

/**
 * YAML frontmatter fields
 */
export interface NoteFrontmatter {
  id: string;
  title: string;
  source: string;
  url: string;
  created: string;               // ISO date
  modified: string;              // ISO date
  tags: string[];
  message_count: number;
}

/**
 * Extension settings stored in chrome.storage
 */
export interface ExtensionSettings {
  // Obsidian API
  obsidianApiKey: string;
  obsidianPort: number;          // Default: 27123
  vaultPath: string;             // e.g., "AI/Gemini"

  // Template options
  templateOptions: TemplateOptions;

  // Future: LLM tagging
  openaiApiKey?: string;
  enableAutoTags?: boolean;
}

/**
 * Template customization options
 */
export interface TemplateOptions {
  // Frontmatter field toggles
  includeId: boolean;
  includeTitle: boolean;
  includeTags: boolean;
  includeSource: boolean;
  includeDates: boolean;
  includeMessageCount: boolean;

  // Message formatting
  messageFormat: 'callout' | 'plain' | 'blockquote';
  userCalloutType: string;       // e.g., "QUESTION"
  assistantCalloutType: string;  // e.g., "NOTE"

  // Custom fields
  customFrontmatter?: Record<string, string>;
}

/**
 * Message types for chrome.runtime communication
 */
export type ExtensionMessage =
  | { action: 'saveToObsidian'; data: ObsidianNote }
  | { action: 'getExistingFile'; fileName: string }
  | { action: 'getSettings' }
  | { action: 'testConnection' };

/**
 * Response from background service worker
 */
export interface SaveResponse {
  success: boolean;
  error?: string;
  isNewFile?: boolean;
  messagesAppended?: number;
}

/**
 * Extraction result from content script
 */
export interface ExtractionResult {
  success: boolean;
  data?: ConversationData;
  error?: string;
  warnings?: string[];           // e.g., "Some selectors failed"
}
```

### 4.2 Extractor Interface

```typescript
// src/content/extractors/base.ts

/**
 * Interface for AI platform extractors
 * Enables future support for Claude, Perplexity, etc.
 */
export interface IConversationExtractor {
  /**
   * Platform identifier
   */
  readonly platform: 'gemini' | 'claude' | 'perplexity';

  /**
   * Check if this extractor can handle the current page
   */
  canExtract(): boolean;

  /**
   * Extract conversation data from the page
   */
  extract(): Promise<ExtractionResult>;

  /**
   * Get conversation ID from URL or DOM
   */
  getConversationId(): string | null;

  /**
   * Get conversation title
   */
  getTitle(): string;

  /**
   * Extract all messages
   */
  extractMessages(): ConversationMessage[];

  /**
   * Validate extraction quality
   */
  validate(result: ExtractionResult): ValidationResult;
}

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}
```

## 5. Component Specifications

### 5.1 Content Script (src/content/)

#### Entry Point (index.ts)
- Initialize on gemini.google.com pages
- Inject floating "Sync Now" button
- Listen for button clicks
- Coordinate extraction and messaging

#### Gemini Extractor (extractors/gemini.ts)
- Implement `IConversationExtractor`
- Use selector strategy from Section 3.2
- Handle Angular dynamic classes
- Detect and warn on extraction failures

#### Markdown Converter (markdown.ts)
- Configure Turndown.js
- Custom rules for:
  - Code blocks with language detection
  - Tables
  - Lists (ordered/unordered)
  - Links and images
  - Math expressions (if present)

#### UI Components (ui.ts)
- Floating button (fixed position, bottom-right)
- Toast notification system
- Loading spinner during sync
- Error display

### 5.2 Background Service Worker (src/background/)

#### Message Handler (index.ts)
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'saveToObsidian':
      handleSave(message.data).then(sendResponse);
      return true; // Async response

    case 'getExistingFile':
      handleGetFile(message.fileName).then(sendResponse);
      return true;

    case 'testConnection':
      testObsidianConnection().then(sendResponse);
      return true;
  }
});
```

### 5.3 Obsidian API Client (src/lib/obsidian-api.ts)

```typescript
/**
 * Obsidian Local REST API client
 * API docs: https://github.com/coddingtonbear/obsidian-local-rest-api
 */
export class ObsidianApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(port: number, apiKey: string) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.apiKey = apiKey;
  }

  /**
   * Get file content from vault
   */
  async getFile(path: string): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/vault/${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    return response.text();
  }

  /**
   * Create or update file in vault
   */
  async putFile(path: string, content: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/vault/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'text/markdown'
      },
      body: content
    });

    if (!response.ok) {
      throw new Error(`Failed to save: ${response.status}`);
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 5.4 Popup Settings UI (src/popup/)

#### Settings Fields
| Field | Type | Default | Validation |
|-------|------|---------|------------|
| API Key | password | - | Required, min 1 char |
| Port | number | 27123 | Range: 1024-65535 |
| Vault Path | text | "AI/Gemini" | Valid path format |
| Message Format | select | "callout" | enum value |

### 5.5 Storage Schema (chrome.storage.sync)

```typescript
interface StorageSchema {
  settings: ExtensionSettings;
  lastSync: {
    [conversationId: string]: {
      timestamp: number;
      messageCount: number;
      contentHash: string;
    };
  };
}
```

## 6. Output Format

### 6.1 Obsidian Note Template

```markdown
---
id: gemini_abc123def456
title: "How to implement authentication in Node.js"
source: gemini
url: https://gemini.google.com/app/abc123def456
created: 2024-01-15T10:30:00Z
modified: 2024-01-15T11:45:00Z
tags:
  - ai-conversation
  - gemini
message_count: 6
---

> [!QUESTION] User
> How do I implement JWT authentication in Node.js?

> [!NOTE] Gemini
> To implement JWT authentication in Node.js, you'll need to:
>
> 1. Install the required packages:
> ```bash
> npm install jsonwebtoken bcryptjs
> ```
>
> 2. Create a token generation function:
> ```javascript
> const jwt = require('jsonwebtoken');
>
> function generateToken(user) {
>   return jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
>     expiresIn: '24h'
>   });
> }
> ```

> [!QUESTION] User
> How do I verify the token in middleware?

> [!NOTE] Gemini
> Here's how to create authentication middleware...
```

### 6.2 Filename Generation

```typescript
function generateFileName(conversation: ConversationData): string {
  // Sanitize title for filesystem
  const sanitized = conversation.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Add ID suffix for uniqueness
  const idSuffix = conversation.id.substring(0, 8);

  return `${sanitized}-${idSuffix}.md`;
}
```

## 7. Error Handling

### 7.1 Error Categories

| Category | Detection | User Feedback | Technical Action |
|----------|-----------|---------------|------------------|
| API Unavailable | Connection refused | "Obsidian REST API not running" | Show setup instructions |
| Auth Failed | 401/403 response | "Invalid API Key" | Prompt settings check |
| Empty Content | No messages found | "No conversation detected" | Log selector failure |
| Partial Content | Some selectors fail | "Warning: Some content may be missing" | Continue with warning |
| Network Error | Fetch exception | "Connection failed" | Offer retry |
| Rate Limited | 429 response | "Too many requests" | Auto-retry with backoff |

### 7.2 Graceful Degradation

1. **Primary selectors fail** → Try fallback selectors
2. **Fallback fails** → Warn user, show manual instructions
3. **Partial extraction** → Save what's available, note gaps
4. **API timeout** → Retry up to 3 times with exponential backoff

## 8. Security Considerations

### 8.1 API Key Storage
- Store in `chrome.storage.sync` (encrypted by Chrome)
- Never log API keys
- Clear keys on extension uninstall

### 8.2 Content Security
- Sanitize extracted content before display
- Validate Obsidian API responses
- Use HTTPS for all external requests (except localhost)

### 8.3 Permissions
```json
{
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://gemini.google.com/*",
    "http://127.0.0.1:27123/*"
  ]
}
```

## 9. Future Extensibility

### 9.1 Multi-AI Platform Support

```typescript
// Extractor factory pattern
function getExtractor(url: string): IConversationExtractor | null {
  if (url.includes('gemini.google.com')) {
    return new GeminiExtractor();
  }
  if (url.includes('claude.ai')) {
    return new ClaudeExtractor();
  }
  if (url.includes('perplexity.ai')) {
    return new PerplexityExtractor();
  }
  return null;
}
```

### 9.2 LLM Auto-Tagging

```typescript
interface TagSuggestion {
  tags: string[];
  confidence: number;
  reasoning: string;
}

async function suggestTags(content: string): Promise<TagSuggestion> {
  // Call OpenAI API with content summary
  // Return suggested tags for user approval
}
```

### 9.3 Template System

Future support for:
- Custom Handlebars templates
- Per-conversation template selection
- Template marketplace/sharing

## 10. Implementation Phases

### Phase 1: MVP (P0)
- [x] Project setup (Vite + TypeScript)
- [ ] Basic Gemini extraction with validated selectors
- [ ] Obsidian API integration
- [ ] Floating button UI
- [ ] Toast notifications
- [ ] Popup settings

### Phase 2: DOM Validation (P1)
- [ ] Robust selector fallbacks
- [ ] Empty content detection
- [ ] Extraction validation
- [ ] Error reporting

### Phase 3: Append Mode (P1)
- [ ] GET existing files
- [ ] Message diff calculation
- [ ] Preserve frontmatter
- [ ] Handle edge cases

### Phase 4: Template Customization (P2)
- [ ] Frontmatter toggles
- [ ] Message format options
- [ ] Preview in popup

### Phase 5: LLM Tagging (P3)
- [ ] OpenAI integration
- [ ] Tag suggestion UI
- [ ] User approval flow

### Phase 6: Multi-AI (P3)
- [ ] Claude extractor
- [ ] Perplexity extractor
- [ ] Site detection
- [ ] Per-site settings

## 11. Testing Strategy

### 11.1 Manual Testing Checklist

- [ ] Fresh install: Settings empty, button appears
- [ ] Settings persistence across browser restart
- [ ] Save new conversation: Creates file with correct format
- [ ] Save existing conversation: Appends new messages only
- [ ] Empty conversation: Shows warning toast
- [ ] Invalid API key: Shows error toast
- [ ] Obsidian not running: Shows connection error
- [ ] Long conversation (20+ messages): Performance acceptable
- [ ] Code blocks: Properly formatted
- [ ] Multiple tabs: Independent operation

### 11.2 Automated Testing (Future)

```typescript
// Unit tests
describe('GeminiExtractor', () => {
  it('extracts user queries correctly');
  it('extracts model responses correctly');
  it('handles empty conversations');
  it('falls back to alternative selectors');
});

describe('MarkdownConverter', () => {
  it('converts code blocks with language');
  it('preserves list formatting');
  it('handles nested elements');
});

describe('AppendLogic', () => {
  it('calculates new messages correctly');
  it('preserves frontmatter');
  it('handles empty existing file');
});
```

## 12. References

- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Turndown.js](https://github.com/mixmark-io/turndown)
- [Vite Plugin CRXJS](https://crxjs.dev/vite-plugin)
