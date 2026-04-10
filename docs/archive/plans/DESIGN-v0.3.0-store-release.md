# Obsidian AI Exporter v0.3.0 - Chrome Web Store Release Design

## Document Info

| Item | Value |
|------|-------|
| Version | 0.3.0 |
| Status | Ready for Implementation |
| Created | 2025-01-10 |
| Updated | 2025-01-10 |
| Author | Claude Code Design Session |
| Review | [REVIEW-v0.3.0-store-release.md](../reviews/REVIEW-v0.3.0-store-release.md) |

## 1. Overview

### 1.1 Purpose

This design document describes the implementation plan for releasing "Obsidian AI Exporter" (formerly "Gemini to Obsidian") to Chrome Web Store with international support, test coverage, and improved documentation.

### 1.2 Scope

| Component | In Scope | Out of Scope |
|-----------|----------|--------------|
| i18n (internationalization) | Yes | - |
| Unit Tests (Vitest) | Yes | E2E tests |
| Privacy Policy & Documentation | Yes | - |
| Code Improvements | Yes | Major refactoring |
| Claude/Perplexity Extractors | No | Future release |
| Bundle Optimization | No | Future release |

### 1.3 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Extension Name | Obsidian AI Exporter | Future Claude/Perplexity support |
| Default Language | English | Global market |
| Secondary Language | Japanese | Developer's primary market |
| Test Framework | Vitest | Vite compatibility, modern API |
| Privacy Policy Host | GitHub Pages | Free, maintainable with repo |
| Store Visibility | Unlisted | Initial limited release |

### 1.4 Repository Information

- **GitHub**: https://github.com/sho7650/obsidian-AI-exporter
- **Privacy Policy URL**: https://sho7650.github.io/obsidian-AI-exporter/privacy.html
- **Chrome Web Store**: (Pending publication)

---

## 2. i18n Design

### 2.1 Architecture

```
src/
├── _locales/
│   ├── en/
│   │   └── messages.json    # Default (English)
│   └── ja/
│       └── messages.json    # Japanese
├── manifest.json            # Uses __MSG_* placeholders
├── popup/
│   └── index.html           # Uses data-i18n attributes
├── content/
│   └── ui.ts                # Uses chrome.i18n.getMessage()
└── background/
    └── index.ts             # Uses chrome.i18n.getMessage()
```

### 2.2 Message Keys Structure

```typescript
// Message key naming convention
interface MessageKeyConvention {
  // manifest.json keys
  "extName": string;           // Extension name
  "extDescription": string;    // Extension description

  // UI Labels
  "ui_syncButton": string;
  "ui_syncing": string;
  "ui_settings": string;

  // Popup Settings
  "settings_apiKey": string;
  "settings_apiKeyPlaceholder": string;
  "settings_port": string;
  "settings_vaultPath": string;
  "settings_vaultPathPlaceholder": string;
  "settings_messageFormat": string;
  "settings_testConnection": string;
  "settings_save": string;

  // Toast Messages
  "toast_success_created": string;
  "toast_success_updated": string;
  "toast_error_noApiKey": string;
  "toast_error_connectionFailed": string;
  "toast_error_extractionFailed": string;
  "toast_error_saveFailed": string;
  "toast_info_extracting": string;
  "toast_info_saving": string;
  "toast_warning_partial": string;

  // Error Messages
  "error_invalidApiKey": string;
  "error_apiKeyTooShort": string;
  "error_invalidVaultPath": string;
  "error_pathTraversal": string;
  "error_connectionTimeout": string;
  "error_obsidianNotRunning": string;
}
```

### 2.3 _locales/en/messages.json

```json
{
  "extName": {
    "message": "Obsidian AI Exporter",
    "description": "Extension name shown in browser"
  },
  "extDescription": {
    "message": "Export AI conversations from Gemini to Obsidian via Local REST API",
    "description": "Extension description shown in browser and store"
  },

  "ui_syncButton": {
    "message": "Sync to Obsidian",
    "description": "Text on the floating sync button"
  },
  "ui_syncing": {
    "message": "Syncing...",
    "description": "Text shown while syncing"
  },

  "settings_title": {
    "message": "Settings",
    "description": "Settings page title"
  },
  "settings_apiKey": {
    "message": "Obsidian API Key",
    "description": "Label for API key input"
  },
  "settings_apiKeyPlaceholder": {
    "message": "Enter your Local REST API key",
    "description": "Placeholder for API key input"
  },
  "settings_port": {
    "message": "Port",
    "description": "Label for port input"
  },
  "settings_vaultPath": {
    "message": "Vault Path",
    "description": "Label for vault path input"
  },
  "settings_vaultPathPlaceholder": {
    "message": "e.g., AI/Gemini",
    "description": "Placeholder for vault path input"
  },
  "settings_messageFormat": {
    "message": "Message Format",
    "description": "Label for message format select"
  },
  "settings_format_callout": {
    "message": "Callout (Recommended)",
    "description": "Callout format option"
  },
  "settings_format_blockquote": {
    "message": "Blockquote",
    "description": "Blockquote format option"
  },
  "settings_format_plain": {
    "message": "Plain",
    "description": "Plain format option"
  },
  "settings_userCallout": {
    "message": "User Callout Type",
    "description": "Label for user callout type"
  },
  "settings_assistantCallout": {
    "message": "Assistant Callout Type",
    "description": "Label for assistant callout type"
  },
  "settings_frontmatter": {
    "message": "Frontmatter Options",
    "description": "Section title for frontmatter options"
  },
  "settings_includeId": {
    "message": "Include ID",
    "description": "Checkbox label for include ID"
  },
  "settings_includeTitle": {
    "message": "Include Title",
    "description": "Checkbox label for include title"
  },
  "settings_includeTags": {
    "message": "Include Tags",
    "description": "Checkbox label for include tags"
  },
  "settings_includeSource": {
    "message": "Include Source & URL",
    "description": "Checkbox label for include source"
  },
  "settings_includeDates": {
    "message": "Include Dates",
    "description": "Checkbox label for include dates"
  },
  "settings_includeMessageCount": {
    "message": "Include Message Count",
    "description": "Checkbox label for include message count"
  },
  "settings_testConnection": {
    "message": "Test Connection",
    "description": "Test connection button text"
  },
  "settings_save": {
    "message": "Save Settings",
    "description": "Save button text"
  },

  "toast_success_created": {
    "message": "Created: $FILE$",
    "description": "Success message when file is created",
    "placeholders": {
      "file": {
        "content": "$1",
        "example": "conversation-abc123.md"
      }
    }
  },
  "toast_success_updated": {
    "message": "Updated: $FILE$",
    "description": "Success message when file is updated",
    "placeholders": {
      "file": {
        "content": "$1",
        "example": "conversation-abc123.md"
      }
    }
  },
  "toast_error_noApiKey": {
    "message": "Please configure your Obsidian API key in the extension settings",
    "description": "Error when API key is not set"
  },
  "toast_error_connectionFailed": {
    "message": "Cannot connect to Obsidian. Is it running?",
    "description": "Error when connection fails"
  },
  "toast_error_extractionFailed": {
    "message": "Failed to extract conversation",
    "description": "Error when extraction fails"
  },
  "toast_error_saveFailed": {
    "message": "Failed to save: $ERROR$",
    "description": "Error when save fails",
    "placeholders": {
      "error": {
        "content": "$1",
        "example": "Network error"
      }
    }
  },
  "toast_info_extracting": {
    "message": "Extracting conversation...",
    "description": "Info message during extraction"
  },
  "toast_info_saving": {
    "message": "Saving to Obsidian...",
    "description": "Info message during save"
  },
  "toast_warning_partial": {
    "message": "Some content may not have been extracted",
    "description": "Warning when partial extraction"
  },

  "error_invalidApiKey": {
    "message": "Invalid API key format",
    "description": "Error for invalid API key"
  },
  "error_apiKeyTooShort": {
    "message": "API key is too short (minimum 16 characters)",
    "description": "Error for short API key"
  },
  "error_apiKeyRequired": {
    "message": "API key is required",
    "description": "Error when API key is empty"
  },
  "error_invalidVaultPath": {
    "message": "Vault path contains invalid characters",
    "description": "Error for invalid vault path"
  },
  "error_pathTraversal": {
    "message": "Path traversal detected in vault path",
    "description": "Error for path traversal attempt"
  },
  "error_vaultPathTooLong": {
    "message": "Vault path is too long (max 200 characters)",
    "description": "Error for long vault path"
  },
  "error_connectionTimeout": {
    "message": "Connection timed out. Please check your settings.",
    "description": "Error for connection timeout"
  },
  "error_obsidianNotRunning": {
    "message": "Obsidian REST API is not running. Please ensure Obsidian is open and the Local REST API plugin is enabled.",
    "description": "Error when Obsidian is not running"
  },
  "error_invalidPort": {
    "message": "Port must be between 1024 and 65535",
    "description": "Error for invalid port"
  },

  "status_connectionSuccess": {
    "message": "Connection successful!",
    "description": "Success status for connection test"
  },
  "status_settingsSaved": {
    "message": "Settings saved successfully!",
    "description": "Success status for settings save"
  },
  "status_testing": {
    "message": "Testing connection...",
    "description": "Status while testing connection"
  }
}
```

### 2.4 _locales/ja/messages.json

```json
{
  "extName": {
    "message": "Obsidian AI Exporter"
  },
  "extDescription": {
    "message": "Gemini の AI 会話を Obsidian へエクスポート（Local REST API 経由）"
  },

  "ui_syncButton": {
    "message": "Obsidian に同期"
  },
  "ui_syncing": {
    "message": "同期中..."
  },

  "settings_title": {
    "message": "設定"
  },
  "settings_apiKey": {
    "message": "Obsidian API キー"
  },
  "settings_apiKeyPlaceholder": {
    "message": "Local REST API のキーを入力"
  },
  "settings_port": {
    "message": "ポート"
  },
  "settings_vaultPath": {
    "message": "保存先パス"
  },
  "settings_vaultPathPlaceholder": {
    "message": "例: AI/Gemini"
  },
  "settings_messageFormat": {
    "message": "メッセージ形式"
  },
  "settings_format_callout": {
    "message": "コールアウト（推奨）"
  },
  "settings_format_blockquote": {
    "message": "引用ブロック"
  },
  "settings_format_plain": {
    "message": "プレーン"
  },
  "settings_userCallout": {
    "message": "ユーザーのコールアウト種類"
  },
  "settings_assistantCallout": {
    "message": "アシスタントのコールアウト種類"
  },
  "settings_frontmatter": {
    "message": "フロントマター設定"
  },
  "settings_includeId": {
    "message": "ID を含める"
  },
  "settings_includeTitle": {
    "message": "タイトルを含める"
  },
  "settings_includeTags": {
    "message": "タグを含める"
  },
  "settings_includeSource": {
    "message": "ソースと URL を含める"
  },
  "settings_includeDates": {
    "message": "日付を含める"
  },
  "settings_includeMessageCount": {
    "message": "メッセージ数を含める"
  },
  "settings_testConnection": {
    "message": "接続テスト"
  },
  "settings_save": {
    "message": "設定を保存"
  },

  "toast_success_created": {
    "message": "作成しました: $FILE$",
    "placeholders": {
      "file": { "content": "$1" }
    }
  },
  "toast_success_updated": {
    "message": "更新しました: $FILE$",
    "placeholders": {
      "file": { "content": "$1" }
    }
  },
  "toast_error_noApiKey": {
    "message": "拡張機能の設定で Obsidian API キーを設定してください"
  },
  "toast_error_connectionFailed": {
    "message": "Obsidian に接続できません。起動していますか？"
  },
  "toast_error_extractionFailed": {
    "message": "会話の抽出に失敗しました"
  },
  "toast_error_saveFailed": {
    "message": "保存に失敗しました: $ERROR$",
    "placeholders": {
      "error": { "content": "$1" }
    }
  },
  "toast_info_extracting": {
    "message": "会話を抽出中..."
  },
  "toast_info_saving": {
    "message": "Obsidian に保存中..."
  },
  "toast_warning_partial": {
    "message": "一部のコンテンツが抽出できなかった可能性があります"
  },

  "error_invalidApiKey": {
    "message": "API キーの形式が無効です"
  },
  "error_apiKeyTooShort": {
    "message": "API キーが短すぎます（16文字以上必要）"
  },
  "error_apiKeyRequired": {
    "message": "API キーは必須です"
  },
  "error_invalidVaultPath": {
    "message": "保存先パスに無効な文字が含まれています"
  },
  "error_pathTraversal": {
    "message": "保存先パスにパストラバーサルが検出されました"
  },
  "error_vaultPathTooLong": {
    "message": "保存先パスが長すぎます（最大200文字）"
  },
  "error_connectionTimeout": {
    "message": "接続がタイムアウトしました。設定を確認してください。"
  },
  "error_obsidianNotRunning": {
    "message": "Obsidian REST API が起動していません。Obsidian を開き、Local REST API プラグインが有効になっていることを確認してください。"
  },
  "error_invalidPort": {
    "message": "ポートは 1024 から 65535 の間で指定してください"
  },

  "status_connectionSuccess": {
    "message": "接続に成功しました！"
  },
  "status_settingsSaved": {
    "message": "設定を保存しました！"
  },
  "status_testing": {
    "message": "接続をテスト中..."
  }
}
```

### 2.5 manifest.json Updates

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "version": "0.3.0",
  "default_locale": "en",
  "minimum_chrome_version": "88",
  ...
}
```

> **Note**: `minimum_chrome_version: "88"` is required as Manifest V3 is only supported from Chrome 88+. See [Section 10.3](#103-manifestjson-updates) for full manifest requirements.

### 2.6 Implementation Pattern

#### UI Component (ui.ts)

```typescript
// Helper function for i18n
function getMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// Usage in UI
button.innerHTML = `
  <span class="icon">📥</span>
  <span class="text">${getMessage('ui_syncButton')}</span>
`;

// With placeholders
showToast(getMessage('toast_success_created', fileName), 'success');
```

#### Popup HTML (index.html)

```html
<!-- Use data-i18n for static text -->
<label data-i18n="settings_apiKey">Obsidian API Key</label>

<!-- Use data-i18n-placeholder for placeholders -->
<input type="password" id="apiKey" data-i18n-placeholder="settings_apiKeyPlaceholder">

<!-- Initialization script -->
<script>
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
  });
</script>
```

### 2.7 Files to Modify

| File | Changes |
|------|---------|
| `src/manifest.json` | Add `default_locale`, replace strings with `__MSG_*__` |
| `src/popup/index.html` | Add `data-i18n` attributes |
| `src/popup/index.ts` | Add i18n initialization |
| `src/content/ui.ts` | Replace hardcoded strings with `chrome.i18n.getMessage()` |
| `src/background/index.ts` | Replace error messages with i18n keys |
| `src/lib/obsidian-api.ts` | Replace error messages with i18n keys |
| `src/lib/validation.ts` | Replace error messages with i18n keys |

---

## 3. Test Design

### 3.1 Test Architecture

```
test/
├── setup.ts                    # Test setup and mocks
├── mocks/
│   ├── chrome.ts               # Chrome API mocks
│   └── dom.ts                  # DOM fixtures
├── lib/
│   ├── sanitize.test.ts        # HTML sanitization tests
│   ├── path-utils.test.ts      # Path security tests
│   ├── yaml-utils.test.ts      # YAML escaping tests
│   ├── validation.test.ts      # Input validation tests
│   └── hash.test.ts            # Hash utility tests (new)
├── extractors/
│   ├── base.test.ts            # Base extractor tests
│   └── gemini.test.ts          # Gemini extractor tests
├── content/
│   └── markdown.test.ts        # Markdown conversion tests
└── fixtures/
    └── gemini-dom.html         # Sample Gemini DOM for testing
```

### 3.2 Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/popup/index.ts',  // UI integration
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
```

### 3.3 Test Setup

```typescript
// test/setup.ts
import { vi } from 'vitest';

// Mock chrome API
const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: null,
    id: 'test-extension-id',
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
  },
};

vi.stubGlobal('chrome', chromeMock);

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
```

### 3.4 Test Cases

#### 3.4.1 Security Tests (High Priority)

```typescript
// test/lib/sanitize.test.ts
describe('sanitizeHtml', () => {
  it('removes script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('script');
    expect(result).toContain('<p>Hello</p>');
  });

  it('removes event handlers', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
  });

  it('removes style tags', () => {
    const input = '<style>body{display:none}</style><p>Text</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('style');
  });

  it('preserves safe attributes', () => {
    const input = '<a href="https://example.com" class="link">Link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href');
    expect(result).toContain('class');
  });

  it('removes data attributes', () => {
    const input = '<div data-secret="value">Text</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('data-secret');
  });
});

// test/lib/path-utils.test.ts
describe('containsPathTraversal', () => {
  it('detects ../ patterns', () => {
    expect(containsPathTraversal('../etc/passwd')).toBe(true);
    expect(containsPathTraversal('foo/../bar')).toBe(true);
    expect(containsPathTraversal('foo/bar/..')).toBe(true);
  });

  it('detects absolute paths', () => {
    expect(containsPathTraversal('/etc/passwd')).toBe(true);
    expect(containsPathTraversal('C:\\Windows')).toBe(true);
  });

  it('detects URL-encoded traversal', () => {
    expect(containsPathTraversal('%2e%2e%2f')).toBe(true);
    expect(containsPathTraversal('%2e%2e/')).toBe(true);
  });

  it('allows safe paths', () => {
    expect(containsPathTraversal('AI/Gemini')).toBe(false);
    expect(containsPathTraversal('foo..bar')).toBe(false);
    expect(containsPathTraversal('notes/ai-chat')).toBe(false);
  });
});

// test/lib/yaml-utils.test.ts
describe('escapeYamlValue', () => {
  it('escapes special characters', () => {
    expect(escapeYamlValue('hello: world')).toBe('"hello: world"');
    expect(escapeYamlValue('test\nline')).toBe('"test\\nline"');
  });

  it('escapes YAML reserved words', () => {
    expect(escapeYamlValue('true')).toBe('"true"');
    expect(escapeYamlValue('null')).toBe('"null"');
    expect(escapeYamlValue('yes')).toBe('"yes"');
  });

  it('handles empty strings', () => {
    expect(escapeYamlValue('')).toBe('""');
  });

  it('preserves safe strings', () => {
    expect(escapeYamlValue('hello world')).toBe('hello world');
    expect(escapeYamlValue('simple')).toBe('simple');
  });

  it('escapes strings starting with numbers', () => {
    expect(escapeYamlValue('123abc')).toBe('"123abc"');
  });
});
```

#### 3.4.2 Validation Tests

```typescript
// test/lib/validation.test.ts
describe('validateApiKey', () => {
  it('accepts valid SHA-256 hex keys', () => {
    const key = 'a'.repeat(64);
    expect(() => validateApiKey(key)).not.toThrow();
  });

  it('rejects empty keys', () => {
    expect(() => validateApiKey('')).toThrow('API key is required');
  });

  it('rejects short keys', () => {
    expect(() => validateApiKey('abc')).toThrow('too short');
  });

  it('warns on non-hex characters', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    validateApiKey('x'.repeat(64));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('non-hexadecimal')
    );
  });
});

describe('validateVaultPath', () => {
  it('accepts valid paths', () => {
    expect(validateVaultPath('AI/Gemini')).toBe('AI/Gemini');
    expect(validateVaultPath('  notes  ')).toBe('notes');
  });

  it('accepts empty paths', () => {
    expect(validateVaultPath('')).toBe('');
    expect(validateVaultPath('   ')).toBe('');
  });

  it('rejects path traversal', () => {
    expect(() => validateVaultPath('../secrets')).toThrow('invalid characters');
  });

  it('rejects long paths', () => {
    expect(() => validateVaultPath('a'.repeat(201))).toThrow('too long');
  });
});

describe('validateCalloutType', () => {
  it('accepts valid callout types', () => {
    expect(validateCalloutType('NOTE', 'NOTE')).toBe('NOTE');
    expect(validateCalloutType('question', 'NOTE')).toBe('QUESTION');
  });

  it('returns default for invalid types', () => {
    expect(validateCalloutType('INVALID', 'NOTE')).toBe('NOTE');
  });
});
```

#### 3.4.3 Extractor Tests

```typescript
// test/extractors/gemini.test.ts
import { GeminiExtractor } from '../../src/content/extractors/gemini';
import geminiDomFixture from '../fixtures/gemini-dom.html?raw';

describe('GeminiExtractor', () => {
  let extractor: GeminiExtractor;

  beforeEach(() => {
    document.body.innerHTML = geminiDomFixture;
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'gemini.google.com',
        pathname: '/app/abc123def456',
        href: 'https://gemini.google.com/app/abc123def456',
      },
      writable: true,
    });
    extractor = new GeminiExtractor();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('canExtract', () => {
    it('returns true on gemini.google.com', () => {
      expect(extractor.canExtract()).toBe(true);
    });

    it('returns false on other domains', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
      });
      expect(extractor.canExtract()).toBe(false);
    });
  });

  describe('getConversationId', () => {
    it('extracts ID from URL', () => {
      expect(extractor.getConversationId()).toBe('abc123def456');
    });

    it('returns null for invalid URL', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/other/path' },
      });
      expect(extractor.getConversationId()).toBeNull();
    });
  });

  describe('extractMessages', () => {
    it('extracts user and assistant messages', () => {
      const messages = extractor.extractMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some(m => m.role === 'user')).toBe(true);
      expect(messages.some(m => m.role === 'assistant')).toBe(true);
    });

    it('preserves message order', () => {
      const messages = extractor.extractMessages();
      for (let i = 0; i < messages.length; i++) {
        expect(messages[i].index).toBe(i);
      }
    });

    it('sanitizes HTML content', () => {
      const messages = extractor.extractMessages();
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      assistantMessages.forEach(m => {
        expect(m.content).not.toContain('<script>');
        expect(m.content).not.toContain('onclick');
      });
    });
  });

  describe('extract', () => {
    it('returns success with valid data', async () => {
      const result = await extractor.extract();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.source).toBe('gemini');
    });

    it('returns error on invalid page', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com' },
      });
      const result = await extractor.extract();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
```

#### 3.4.4 Markdown Conversion Tests

```typescript
// test/content/markdown.test.ts
import { htmlToMarkdown, generateFileName, generateContentHash } from '../../src/content/markdown';

describe('htmlToMarkdown', () => {
  it('converts code blocks with language', () => {
    const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```javascript');
    expect(md).toContain('const x = 1;');
    expect(md).toContain('```');
  });

  it('converts inline code', () => {
    const html = '<p>Use <code>npm install</code> to install</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('`npm install`');
  });

  it('converts tables', () => {
    const html = `
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain('| A | B |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
  });

  it('preserves line breaks', () => {
    const html = '<p>Line 1<br>Line 2</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('Line 1');
    expect(md).toContain('Line 2');
  });
});

describe('generateFileName', () => {
  it('sanitizes title', () => {
    const result = generateFileName('How to: use "quotes"?', 'abc123');
    expect(result).toMatch(/^how-to-use-quotes-[a-f0-9]+\.md$/);
  });

  it('handles Japanese characters', () => {
    const result = generateFileName('日本語のタイトル', 'abc123');
    expect(result).toContain('日本語のタイトル');
    expect(result).toEndWith('.md');
  });

  it('truncates long titles', () => {
    const longTitle = 'a'.repeat(100);
    const result = generateFileName(longTitle, 'abc123');
    expect(result.length).toBeLessThan(70); // 50 + 8 + 4
  });

  it('handles empty title', () => {
    const result = generateFileName('', 'abc123');
    expect(result).toMatch(/^conversation-[a-f0-9]+\.md$/);
  });
});

describe('generateContentHash', () => {
  it('returns consistent hash', () => {
    const content = 'Hello World';
    const hash1 = generateContentHash(content);
    const hash2 = generateContentHash(content);
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different content', () => {
    const hash1 = generateContentHash('Hello');
    const hash2 = generateContentHash('World');
    expect(hash1).not.toBe(hash2);
  });

  it('returns 8-character hex string', () => {
    const hash = generateContentHash('test');
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });
});
```

### 3.5 Test Commands

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:watch": "vitest --watch"
  }
}
```

### 3.6 Coverage Targets

| Category | Target | Priority |
|----------|--------|----------|
| Security utilities | 90%+ | Critical |
| Validation | 80%+ | High |
| Extractor logic | 70%+ | High |
| Markdown conversion | 70%+ | Medium |
| Overall | 70%+ | Required |

---

## 4. Documentation Design

### 4.1 Privacy Policy

```markdown
<!-- docs/privacy.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Obsidian AI Exporter</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { border-bottom: 2px solid #7c3aed; padding-bottom: 10px; }
    h2 { color: #5b21b6; margin-top: 30px; }
    .update-date { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="update-date">Last updated: January 2025</p>

  <h2>Overview</h2>
  <p>Obsidian AI Exporter is a Chrome extension that exports AI conversations to Obsidian. This policy explains how we handle your data.</p>

  <h2>Data Collection</h2>
  <h3>Data We Collect</h3>
  <ul>
    <li><strong>Obsidian API Key</strong>: Stored locally on your device only (not synced)</li>
    <li><strong>Extension Settings</strong>: Vault path, template preferences (synced across your Chrome browsers)</li>
    <li><strong>Conversation Content</strong>: Temporarily processed in memory, not stored by the extension</li>
  </ul>

  <h3>Data We Do NOT Collect</h3>
  <ul>
    <li>Personal information</li>
    <li>Browsing history</li>
    <li>Analytics or telemetry</li>
    <li>Any data sent to external servers</li>
  </ul>

  <h2>Data Storage</h2>
  <table>
    <tr><th>Data</th><th>Storage Location</th><th>Synced?</th></tr>
    <tr><td>API Key</td><td>chrome.storage.local</td><td>No</td></tr>
    <tr><td>Settings</td><td>chrome.storage.sync</td><td>Yes</td></tr>
    <tr><td>Conversations</td><td>Your Obsidian vault only</td><td>N/A</td></tr>
  </table>

  <h2>Data Transmission</h2>
  <p>This extension only communicates with:</p>
  <ul>
    <li><strong>gemini.google.com</strong>: To extract conversation content (read-only)</li>
    <li><strong>127.0.0.1 (localhost)</strong>: To save files to your local Obsidian vault</li>
  </ul>
  <p>No data is ever sent to external servers or third parties.</p>

  <h2>Permissions Explained</h2>
  <table>
    <tr><th>Permission</th><th>Purpose</th></tr>
    <tr><td>storage</td><td>Save your settings locally</td></tr>
    <tr><td>activeTab</td><td>Read the current Gemini conversation</td></tr>
    <tr><td>Host: gemini.google.com</td><td>Inject the sync button on Gemini pages</td></tr>
    <tr><td>Host: 127.0.0.1</td><td>Communicate with Obsidian's local API</td></tr>
  </table>

  <h2>Your Rights</h2>
  <p>You can:</p>
  <ul>
    <li>Clear all stored data by uninstalling the extension</li>
    <li>View stored data in Chrome DevTools (Application > Storage)</li>
    <li>Use the extension without any external account</li>
  </ul>

  <h2>Changes to This Policy</h2>
  <p>We will update this page if our data practices change. The "Last updated" date at the top indicates when the policy was last revised.</p>

  <h2>Remote Code</h2>
  <p>This extension does not execute remotely hosted code. All functionality is contained within the extension package. In compliance with Manifest V3 requirements, no external scripts are loaded or executed.</p>

  <h2>Children's Privacy</h2>
  <p>This extension is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us through GitHub.</p>

  <h2>Contact</h2>
  <p>For questions about this privacy policy, please open an issue on our <a href="https://github.com/sho7650/obsidian-AI-exporter">GitHub repository</a>.</p>
</body>
</html>
```

### 4.2 LICENSE File

```
MIT License

Copyright (c) 2025 sho7650

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 4.3 CHANGELOG.md

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2025-01-XX

### Added
- International support (English and Japanese)
- Unit tests with Vitest
- Privacy policy documentation
- GitHub Pages hosting for documentation

### Changed
- Renamed extension from "Gemini to Obsidian" to "Obsidian AI Exporter"
- Improved error messages with localization support

### Fixed
- ESLint configuration updated for flat config format

## [0.2.0] - 2025-01-08

### Added
- Security hardening: API key storage separation (local vs sync)
- Input validation for vault paths and API keys
- Path traversal protection
- YAML injection prevention
- Message sender validation
- Content size limits

### Changed
- API key now stored in chrome.storage.local (not synced)
- Improved error messages

## [0.1.0] - 2025-01-05

### Added
- Initial release
- Gemini conversation extraction
- Obsidian Local REST API integration
- Floating sync button
- Toast notifications
- Configurable frontmatter and callout styles
- Support for code blocks, tables, and lists
```

### 4.4 Chrome Web Store Listing

#### English Description

```markdown
# Obsidian AI Exporter

Export your AI conversations from Gemini to Obsidian with one click.

## Features

✨ **One-Click Export** - Floating "Sync" button on Gemini pages
📝 **Obsidian Callouts** - Beautiful formatting with [!QUESTION] and [!NOTE]
🔄 **Append Mode** - Only new messages are added to existing notes
📋 **YAML Frontmatter** - Metadata including title, source, URL, dates, and tags
⚙️ **Customizable** - Configure vault path, template options, and more

## Requirements

- [Obsidian](https://obsidian.md/) with [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin

## How to Use

1. Install this extension
2. Enable the Local REST API plugin in Obsidian
3. Copy your API key from the plugin settings
4. Click the extension icon and enter your API key
5. Open a Gemini conversation and click "Sync to Obsidian"

## Privacy

- No data collection or analytics
- All data stays on your device
- Only communicates with localhost (your Obsidian)

## Coming Soon

- Claude.ai support
- Perplexity.ai support
- Custom templates

---

Made with ❤️ for the Obsidian community
```

#### Japanese Description

```markdown
# Obsidian AI Exporter

Gemini の AI 会話をワンクリックで Obsidian にエクスポート。

## 機能

✨ **ワンクリックエクスポート** - Gemini ページに表示される「同期」ボタン
📝 **Obsidian コールアウト** - [!QUESTION] と [!NOTE] で美しく整形
🔄 **追記モード** - 新しいメッセージのみを既存のノートに追加
📋 **YAML フロントマター** - タイトル、ソース、URL、日付、タグなどのメタデータ
⚙️ **カスタマイズ可能** - 保存先パス、テンプレートオプションなどを設定

## 必要なもの

- [Obsidian](https://obsidian.md/) と [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグイン

## 使い方

1. この拡張機能をインストール
2. Obsidian で Local REST API プラグインを有効化
3. プラグイン設定から API キーをコピー
4. 拡張機能アイコンをクリックして API キーを入力
5. Gemini の会話を開いて「Obsidian に同期」をクリック

## プライバシー

- データ収集やアナリティクスなし
- すべてのデータはお使いの端末に保存
- 通信先は localhost（あなたの Obsidian）のみ

## 今後の予定

- Claude.ai 対応
- Perplexity.ai 対応
- カスタムテンプレート

---

Obsidian コミュニティのために ❤️ を込めて
```

### 4.5 GitHub Pages Setup

```yaml
# .github/workflows/docs.yml
name: Deploy Documentation

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'docs'
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## 5. Code Improvements Design

### 5.1 ESLint Configuration Fix

```javascript
// eslint.config.js (updated)
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      globals: {
        chrome: 'readonly',
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        HTMLElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTableElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeListOf: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        DOMException: 'readonly',
        TypeError: 'readonly',
        MutationObserver: 'readonly',
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }]
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts', 'test/**']
  }
];
```

```json
// package.json scripts update
{
  "scripts": {
    "lint": "eslint src",
    "lint:fix": "eslint src --fix"
  }
}
```

### 5.2 Hash Utility Extraction

```typescript
// src/lib/hash.ts (new file)
/**
 * Simple hash function for content deduplication
 * Uses djb2 algorithm for fast, consistent hashing
 */
export function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
```

Files to update:
- `src/content/extractors/base.ts` - Import from `src/lib/hash.ts`
- `src/content/markdown.ts` - Import from `src/lib/hash.ts`

### 5.3 API Key Masking

```typescript
// src/popup/index.ts (updates)

// Add toggle visibility button
function setupApiKeyToggle(): void {
  const apiKeyInput = elements.apiKey;
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'api-key-toggle';
  toggleBtn.textContent = '👁️';
  toggleBtn.setAttribute('aria-label', 'Toggle API key visibility');

  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '👁️';
    }
  });

  apiKeyInput.parentElement?.appendChild(toggleBtn);
}
```

```css
/* src/popup/styles.css (additions) */
.api-key-container {
  position: relative;
  display: flex;
  align-items: center;
}

.api-key-toggle {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
}

.api-key-toggle:hover {
  opacity: 0.7;
}

#apiKey {
  padding-right: 36px;
}
```

---

## 6. Implementation Checklist

### 6.1 Phase 1: Project Setup & Documentation

- [ ] Create LICENSE file
- [ ] Create CHANGELOG.md
- [ ] Create docs/privacy.html
- [ ] Create docs/store/description_en.md
- [ ] Create docs/store/description_ja.md
- [ ] Setup GitHub Pages workflow
- [ ] Enable GitHub Pages in repository settings

### 6.2 Phase 2: i18n Implementation

- [ ] Create src/_locales/en/messages.json
- [ ] Create src/_locales/ja/messages.json
- [ ] Update src/manifest.json with default_locale
- [ ] Update src/popup/index.html with data-i18n attributes
- [ ] Update src/popup/index.ts with i18n initialization
- [ ] Update src/content/ui.ts with chrome.i18n.getMessage()
- [ ] Update src/background/index.ts error messages
- [ ] Update src/lib/obsidian-api.ts error messages
- [ ] Update src/lib/validation.ts error messages
- [ ] Test both languages in Chrome

### 6.3 Phase 3: Test Implementation

- [ ] Install Vitest and dependencies
- [ ] Create vitest.config.ts
- [ ] Create test/setup.ts with mocks
- [ ] Create test/mocks/chrome.ts
- [ ] Create test/fixtures/gemini-dom.html
- [ ] Implement test/lib/sanitize.test.ts
- [ ] Implement test/lib/path-utils.test.ts
- [ ] Implement test/lib/yaml-utils.test.ts
- [ ] Implement test/lib/validation.test.ts
- [ ] Implement test/extractors/gemini.test.ts
- [ ] Implement test/content/markdown.test.ts
- [ ] Achieve 70%+ coverage

### 6.4 Phase 4: Code Improvements

- [ ] Update eslint.config.js
- [ ] Update package.json lint script
- [ ] Create src/lib/hash.ts
- [ ] Update base.ts to use hash.ts
- [ ] Update markdown.ts to use hash.ts
- [ ] Add API key toggle to popup

### 6.5 Phase 5: Final Preparation & Store Submission

#### Assets Preparation
- [ ] Capture Screenshot 1: Sync button on Gemini page (1280x800px)
- [ ] Capture Screenshot 2: Settings popup (1280x800px)
- [ ] Capture Screenshot 3: Saved result in Obsidian (1280x800px)
- [ ] Capture Screenshot 4: Toast notification (optional, 1280x800px)
- [ ] Capture Screenshot 5: Japanese UI (optional, 1280x800px)
- [ ] Create Small Promo Tile (optional, 440x280px)

#### Code & Build
- [ ] Update README.md with new name
- [ ] Update manifest.json version to 0.3.0
- [ ] Add minimum_chrome_version: "88" to manifest.json
- [ ] Run full test suite (`npm test`)
- [ ] Build production bundle (`npm run build`)
- [ ] Verify no console errors in production

#### Store Submission (See Section 10 for details)
- [ ] Complete Developer Account setup ($5 fee)
- [ ] Fill Store Listing Tab (name, description, screenshots)
- [ ] Fill Privacy Tab (permissions, data usage, certifications)
- [ ] Set Distribution to "Unlisted"
- [ ] Submit for review

---

## 7. File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| **Documentation** | | |
| `LICENSE` | Create | MIT license |
| `CHANGELOG.md` | Create | Version history |
| `docs/privacy.html` | Create | Privacy policy (includes remote code & children's privacy) |
| `docs/store/description_en.md` | Create | English store listing |
| `docs/store/description_ja.md` | Create | Japanese store listing |
| `.github/workflows/docs.yml` | Create | GitHub Pages deployment |
| `README.md` | Modify | Update name, badges |
| **i18n** | | |
| `src/_locales/en/messages.json` | Create | English translations |
| `src/_locales/ja/messages.json` | Create | Japanese translations |
| **Manifest & Config** | | |
| `src/manifest.json` | Modify | Add i18n, version, minimum_chrome_version: "88" |
| `eslint.config.js` | Modify | Fix flat config |
| `package.json` | Modify | Add test scripts, fix lint |
| `vitest.config.ts` | Create | Vitest configuration |
| **Popup** | | |
| `src/popup/index.html` | Modify | Add data-i18n attributes |
| `src/popup/index.ts` | Modify | Add i18n init, API key toggle |
| `src/popup/styles.css` | Modify | Add API key toggle styles |
| **Content Scripts** | | |
| `src/content/ui.ts` | Modify | Add i18n getMessage |
| `src/content/extractors/base.ts` | Modify | Use shared hash |
| `src/content/markdown.ts` | Modify | Use shared hash |
| **Background** | | |
| `src/background/index.ts` | Modify | i18n error messages |
| **Library** | | |
| `src/lib/obsidian-api.ts` | Modify | i18n error messages |
| `src/lib/validation.ts` | Modify | i18n error messages |
| `src/lib/hash.ts` | Create | Extract hash utility |
| **Tests** | | |
| `test/setup.ts` | Create | Test setup |
| `test/mocks/chrome.ts` | Create | Chrome API mock |
| `test/fixtures/gemini-dom.html` | Create | DOM fixture |
| `test/lib/*.test.ts` | Create | Unit tests |
| `test/extractors/*.test.ts` | Create | Extractor tests |
| `test/content/*.test.ts` | Create | Content tests |
| **Store Assets** | | |
| `docs/store/screenshots/` | Create | 3-5 screenshots (1280x800px) |
| `docs/store/promo-tile.png` | Create | Optional promo tile (440x280px) |

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| i18n breaks existing functionality | Medium | High | Comprehensive testing |
| Test coverage slows development | Low | Medium | Focus on critical paths |
| Chrome Web Store rejection | Low | Medium | Follow all guidelines |
| GitHub Pages setup issues | Low | Low | Alternative hosting available |
| Translation quality | Low | Medium | Native speaker review |

---

## 9. Success Criteria

### Code Quality
- [ ] All tests pass with 70%+ coverage
- [ ] ESLint passes with no errors
- [ ] No console errors in production build
- [ ] TypeScript compiles without errors

### i18n
- [ ] Extension works in English (default)
- [ ] Extension works in Japanese
- [ ] All user-facing strings are localized

### Documentation
- [ ] Privacy policy live at GitHub Pages URL
- [ ] Privacy policy includes remote code section
- [ ] Privacy policy includes children's privacy section
- [ ] CHANGELOG.md up to date

### Chrome Web Store
- [ ] All required assets prepared (icon, 3+ screenshots)
- [ ] Store listing complete (name, description, screenshots)
- [ ] Privacy tab complete (permissions, data usage, certifications)
- [ ] Extension submitted and approved (unlisted)
- [ ] Extension installable via direct URL

---

## 10. Chrome Web Store Submission Guide

> **Reference**: Based on [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies), [Prepare to Publish](https://developer.chrome.com/docs/webstore/prepare), and [Privacy Tab Requirements](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

### 10.1 Required Assets

| Asset | Size | Format | Status | Notes |
|-------|------|--------|--------|-------|
| Extension Icon | 128x128px | PNG | ✅ Ready | `public/icons/icon128.png` |
| Screenshot 1 | 1280x800px | PNG/JPEG | ⬜ TODO | Sync button on Gemini page |
| Screenshot 2 | 1280x800px | PNG/JPEG | ⬜ TODO | Settings popup |
| Screenshot 3 | 1280x800px | PNG/JPEG | ⬜ TODO | Saved result in Obsidian |
| Screenshot 4 | 1280x800px | PNG/JPEG | ⬜ Optional | Toast notification |
| Screenshot 5 | 1280x800px | PNG/JPEG | ⬜ Optional | Japanese UI |
| Small Promo Tile | 440x280px | PNG/JPEG | ⬜ Optional | Store visibility |

#### Screenshot Guidelines

- **Dimensions**: 1280x800px (preferred) or 640x400px (alternative)
- **Count**: Minimum 1, maximum 5
- **Format**: Full bleed, square corners, no padding
- **Content**: Must demonstrate actual user experience and core features

### 10.2 Dashboard Privacy Tab Input

#### 10.2.1 Single Purpose Description

**English**:
```
Export Gemini AI conversations to local Obsidian vault via Local REST API
```

**Japanese**:
```
Gemini AI の会話を Local REST API 経由でローカル Obsidian vault にエクスポート
```

#### 10.2.2 Permission Justifications

| Permission | Justification |
|------------|---------------|
| `storage` | Store user settings locally. API key is stored in local storage (not synced) for security. User preferences are synced across Chrome browsers. |
| `activeTab` | Read the current Gemini conversation page to extract conversation content when user clicks the sync button. |
| `host_permissions: gemini.google.com/*` | Inject content script to display the floating sync button and extract conversation data from Gemini AI pages. |
| `host_permissions: 127.0.0.1:27123/*` | Communicate with user's local Obsidian REST API to save extracted conversations. No external server communication. |

#### 10.2.3 Remote Code Declaration

**Answer**: **No**

**Justification**:
- All code is bundled within the extension package
- No external script loading
- Manifest V3 prohibits remote code execution
- All dependencies are compiled via Vite at build time

#### 10.2.4 Data Collection Disclosure

| Category | Collected? | Reason |
|----------|------------|--------|
| Personally identifiable information | ❌ No | - |
| Health information | ❌ No | - |
| Financial and payment information | ❌ No | - |
| Authentication information | ❌ No | API Key is for Obsidian, not personal authentication |
| Personal communications | ✅ Yes | AI conversation content is processed for export |
| Location | ❌ No | - |
| Web history | ❌ No | - |
| User activity | ❌ No | - |
| Website content | ✅ Yes | Gemini page content is extracted for export |

#### 10.2.5 Limited Use Certifications

All three certifications must be checked:

- [x] **No sale or transfer to third parties**: I do not sell or transfer user data to third parties, outside of approved use cases
- [x] **No unrelated purpose use**: I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] **No creditworthiness use**: I do not use or transfer user data to determine creditworthiness or for lending purposes

### 10.3 Manifest.json Updates

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "version": "0.3.0",
  "default_locale": "en",
  "minimum_chrome_version": "88",
  ...
}
```

**Changes**:
- Add `"minimum_chrome_version": "88"` (MV3 minimum support)
- Update `version` to `"0.3.0"`
- Add `default_locale` and i18n message placeholders

### 10.4 Developer Account Setup

#### Prerequisites

1. **Google Account** with 2-step verification enabled
2. **One-time registration fee**: $5 USD
3. **Developer Agreement** acceptance required

#### Registration Steps

1. Navigate to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
2. Sign in with Google Account
3. Pay $5 registration fee
4. Accept Developer Agreement
5. Complete email verification
6. Account activation may take up to 24 hours

### 10.5 Pre-Submission Checklist

#### Code & Build
- [ ] All tests passing (`npm test`)
- [ ] Production build successful (`npm run build`)
- [ ] ESLint passes with no errors (`npm run lint`)
- [ ] No console errors in production build

#### Assets
- [ ] Extension icon 128x128px verified
- [ ] 3-5 screenshots prepared (1280x800px)
- [ ] Privacy policy live at GitHub Pages URL

#### Dashboard - Store Listing Tab
- [ ] Extension name entered
- [ ] Summary (132 chars max) entered
- [ ] Description (English) entered
- [ ] Description (Japanese) entered
- [ ] Category selected
- [ ] Language(s) selected
- [ ] Screenshots uploaded
- [ ] Store icon uploaded

#### Dashboard - Privacy Tab
- [ ] Single purpose description entered
- [ ] All permission justifications provided
- [ ] Remote code declaration: "No"
- [ ] Data collection checkboxes completed
- [ ] Limited use certifications checked
- [ ] Privacy policy URL entered

#### Dashboard - Distribution Tab
- [ ] Visibility: "Unlisted" (for initial release)
- [ ] Countries/regions selected

### 10.6 Review Timeline

| Scenario | Expected Duration |
|----------|-------------------|
| Standard review | Within 24 hours |
| 90% of submissions | Within 3 days |
| Extended review (new developer) | 1-2 weeks |
| Extended review (sensitive permissions) | Up to several weeks |

**Extended Review Triggers**:
- New developer account
- Host permissions to third-party sites
- Significant code changes
- Sensitive permission requests

**If review exceeds 3 weeks**: Contact [One Stop Support](https://support.google.com/chrome_webstore/contact/one_stop_support)

### 10.7 Post-Submission Actions

1. **Monitor email** for review status updates
2. **If rejected**:
   - Review violation details in Developer Console
   - Fix identified issues
   - Resubmit with corrections
3. **If approved**:
   - Verify extension is accessible via direct URL
   - Test installation on clean Chrome profile
   - Consider switching to "Public" after validation

### 10.8 Unlisted Publishing Details

**Characteristics**:
- Extension accessible only via direct URL
- Not shown in Chrome Web Store search results
- Store page exists (URL holders can access)
- Can be changed to "Public" after testing

**Use Cases**:
- Limited beta testing
- Internal distribution
- Pre-release validation
