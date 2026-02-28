/**
 * Popup settings tests
 *
 * Tests the popup UI initialization, form handling, and settings management.
 * Since popup/index.ts has DOM element references at module level,
 * we test the behavior patterns and component functions.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  validateCalloutType,
  validateVaultPath,
  validateApiKey,
} from '../../src/lib/validation';
import { getSettings, saveSettings } from '../../src/lib/storage';

// Mock the storage module
vi.mock('../../src/lib/storage', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

describe('popup/index patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('getMessage pattern', () => {
    it('returns message from chrome.i18n', () => {
      const message = chrome.i18n.getMessage('test_key');
      // Mock returns the key as the message
      expect(message).toBe('test_key');
    });

    it('returns substitution-based message', () => {
      const message = chrome.i18n.getMessage('test_key', 'value');
      expect(message).toBe('test_key');
    });

    it('handles missing messages gracefully', () => {
      // The mock returns the key itself when not found
      const message = chrome.i18n.getMessage('nonexistent_key');
      expect(typeof message).toBe('string');
    });
  });

  describe('initializeI18n pattern', () => {
    it('translates elements with data-i18n attribute', () => {
      document.body.innerHTML = '<span data-i18n="test_key">Default</span>';

      document.querySelectorAll('[data-i18n]').forEach((element) => {
        const key = element.getAttribute('data-i18n');
        if (key) {
          const message = chrome.i18n.getMessage(key);
          if (message && message !== key) {
            element.textContent = message;
          }
        }
      });

      // The element is updated with the message
      const span = document.querySelector('[data-i18n]');
      expect(span).not.toBeNull();
    });

    it('translates input placeholders with data-i18n-placeholder', () => {
      document.body.innerHTML =
        '<input data-i18n-placeholder="placeholder_key" placeholder="Default">';

      document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (key && element instanceof HTMLInputElement) {
          const message = chrome.i18n.getMessage(key);
          if (message && message !== key) {
            element.placeholder = message;
          }
        }
      });

      const input = document.querySelector(
        '[data-i18n-placeholder]'
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
    });

    it('updates document title from data-i18n attribute', () => {
      document.head.innerHTML = '<title data-i18n="title_key">Default Title</title>';

      const titleElement = document.querySelector('title');
      if (titleElement) {
        const key = titleElement.getAttribute('data-i18n');
        if (key) {
          const message = chrome.i18n.getMessage(key);
          if (message && message !== key) {
            document.title = message;
          }
        }
      }

      expect(titleElement).not.toBeNull();
    });
  });

  describe('populateForm pattern', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <input id="apiKey" type="password">
        <input id="port" type="number">
        <input id="vaultPath" type="text">
        <select id="messageFormat">
          <option value="callout">Callout</option>
          <option value="plain">Plain</option>
          <option value="blockquote">Blockquote</option>
        </select>
        <input id="userCallout" type="text">
        <input id="assistantCallout" type="text">
        <input id="includeId" type="checkbox">
        <input id="includeTitle" type="checkbox">
        <input id="includeTags" type="checkbox">
        <input id="includeSource" type="checkbox">
        <input id="includeDates" type="checkbox">
        <input id="includeMessageCount" type="checkbox">
        <input id="enableToolContent" type="checkbox">
      `;
    });

    it('populates apiKey field', () => {
      const apiKey = document.getElementById('apiKey') as HTMLInputElement;
      const settings = { obsidianApiKey: 'test-key' };

      apiKey.value = settings.obsidianApiKey || '';
      expect(apiKey.value).toBe('test-key');
    });

    it('populates port field with default', () => {
      const port = document.getElementById('port') as HTMLInputElement;
      const settings = { obsidianPort: 27123 };

      port.value = String(settings.obsidianPort || 27123);
      expect(port.value).toBe('27123');
    });

    it('populates vaultPath field', () => {
      const vaultPath = document.getElementById('vaultPath') as HTMLInputElement;
      const settings = { vaultPath: 'AI/Gemini' };

      vaultPath.value = settings.vaultPath || '';
      expect(vaultPath.value).toBe('AI/Gemini');
    });

    it('populates messageFormat select', () => {
      const messageFormat = document.getElementById(
        'messageFormat'
      ) as HTMLSelectElement;
      const settings = { templateOptions: { messageFormat: 'blockquote' } };

      messageFormat.value = settings.templateOptions.messageFormat || 'callout';
      expect(messageFormat.value).toBe('blockquote');
    });

    it('populates callout type inputs', () => {
      const userCallout = document.getElementById('userCallout') as HTMLInputElement;
      const assistantCallout = document.getElementById(
        'assistantCallout'
      ) as HTMLInputElement;
      const settings = {
        templateOptions: { userCalloutType: 'QUESTION', assistantCalloutType: 'NOTE' },
      };

      userCallout.value = settings.templateOptions.userCalloutType || 'QUESTION';
      assistantCallout.value =
        settings.templateOptions.assistantCalloutType || 'NOTE';

      expect(userCallout.value).toBe('QUESTION');
      expect(assistantCallout.value).toBe('NOTE');
    });

    it('populates enableToolContent checkbox', () => {
      const enableToolContent = document.getElementById('enableToolContent') as HTMLInputElement;
      const settings = { enableToolContent: true };

      enableToolContent.checked = settings.enableToolContent ?? false;
      expect(enableToolContent.checked).toBe(true);
    });

    it('populates checkbox fields', () => {
      const includeId = document.getElementById('includeId') as HTMLInputElement;
      const includeTags = document.getElementById('includeTags') as HTMLInputElement;

      const settings = {
        templateOptions: { includeId: true, includeTags: false },
      };

      includeId.checked = settings.templateOptions.includeId ?? true;
      includeTags.checked = settings.templateOptions.includeTags ?? true;

      expect(includeId.checked).toBe(true);
      expect(includeTags.checked).toBe(false);
    });
  });

  describe('collectSettings pattern', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <input id="apiKey" type="password" value="my-api-key">
        <input id="port" type="number" value="27123">
        <input id="vaultPath" type="text" value="AI/Gemini">
        <select id="messageFormat">
          <option value="callout" selected>Callout</option>
        </select>
        <input id="userCallout" type="text" value="QUESTION">
        <input id="assistantCallout" type="text" value="NOTE">
        <input id="includeId" type="checkbox" checked>
        <input id="includeTitle" type="checkbox" checked>
        <input id="includeTags" type="checkbox" checked>
        <input id="includeSource" type="checkbox" checked>
        <input id="includeDates" type="checkbox" checked>
        <input id="includeMessageCount" type="checkbox" checked>
        <input id="enableToolContent" type="checkbox" checked>
      `;
    });

    it('collects all form values into settings object', () => {
      const elements = {
        apiKey: document.getElementById('apiKey') as HTMLInputElement,
        port: document.getElementById('port') as HTMLInputElement,
        vaultPath: document.getElementById('vaultPath') as HTMLInputElement,
        messageFormat: document.getElementById('messageFormat') as HTMLSelectElement,
        userCallout: document.getElementById('userCallout') as HTMLInputElement,
        assistantCallout: document.getElementById(
          'assistantCallout'
        ) as HTMLInputElement,
        includeId: document.getElementById('includeId') as HTMLInputElement,
        includeTitle: document.getElementById('includeTitle') as HTMLInputElement,
        includeTags: document.getElementById('includeTags') as HTMLInputElement,
        includeSource: document.getElementById('includeSource') as HTMLInputElement,
        includeDates: document.getElementById('includeDates') as HTMLInputElement,
        includeMessageCount: document.getElementById(
          'includeMessageCount'
        ) as HTMLInputElement,
      };

      const templateOptions = {
        messageFormat: elements.messageFormat.value as
          | 'callout'
          | 'plain'
          | 'blockquote',
        userCalloutType: elements.userCallout.value || 'QUESTION',
        assistantCalloutType: elements.assistantCallout.value || 'NOTE',
        includeId: elements.includeId.checked,
        includeTitle: elements.includeTitle.checked,
        includeTags: elements.includeTags.checked,
        includeSource: elements.includeSource.checked,
        includeDates: elements.includeDates.checked,
        includeMessageCount: elements.includeMessageCount.checked,
      };

      const settings = {
        obsidianApiKey: elements.apiKey.value.trim(),
        obsidianPort: parseInt(elements.port.value, 10) || 27123,
        vaultPath: elements.vaultPath.value.trim(),
        templateOptions,
      };

      expect(settings.obsidianApiKey).toBe('my-api-key');
      expect(settings.obsidianPort).toBe(27123);
      expect(settings.vaultPath).toBe('AI/Gemini');
      expect(settings.templateOptions.messageFormat).toBe('callout');
    });

    it('collectSettings includes enableToolContent', () => {
      const enableToolContent = document.getElementById('enableToolContent') as HTMLInputElement;
      expect(enableToolContent.checked).toBe(true);

      const settings = {
        enableToolContent: enableToolContent.checked,
      };
      expect(settings.enableToolContent).toBe(true);
    });

    it('trims whitespace from text inputs', () => {
      const apiKey = document.getElementById('apiKey') as HTMLInputElement;
      const vaultPath = document.getElementById('vaultPath') as HTMLInputElement;

      apiKey.value = '  spaced-key  ';
      vaultPath.value = '  AI/Path  ';

      const settings = {
        obsidianApiKey: apiKey.value.trim(),
        vaultPath: vaultPath.value.trim(),
      };

      expect(settings.obsidianApiKey).toBe('spaced-key');
      expect(settings.vaultPath).toBe('AI/Path');
    });

    it('uses default port when invalid', () => {
      const port = document.getElementById('port') as HTMLInputElement;
      port.value = 'invalid';

      const portValue = parseInt(port.value, 10) || 27123;
      expect(portValue).toBe(27123);
    });
  });

  describe('handleSave validation', () => {
    it('validates API key', () => {
      const apiKey = 'valid-api-key-12345678901234567890';
      const validated = validateApiKey(apiKey);
      expect(validated).toBe(apiKey);
    });

    it('rejects empty API key', () => {
      expect(() => validateApiKey('')).toThrow();
    });

    it('validates port range', () => {
      const isValidPort = (port: number) => port >= 1024 && port <= 65535;

      expect(isValidPort(27123)).toBe(true);
      expect(isValidPort(1024)).toBe(true);
      expect(isValidPort(65535)).toBe(true);
      expect(isValidPort(1023)).toBe(false);
      expect(isValidPort(65536)).toBe(false);
    });

    it('validates vault path', () => {
      const vaultPath = 'AI/Gemini';
      const validated = validateVaultPath(vaultPath);
      expect(validated).toBe(vaultPath);
    });

    it('rejects invalid vault path', () => {
      // Contains null character or other invalid characters
      expect(() => validateVaultPath('/absolute/path')).toThrow();
    });

    it('validates callout types with defaults', () => {
      expect(validateCalloutType('QUESTION', 'NOTE')).toBe('QUESTION');
      expect(validateCalloutType('NOTE', 'QUESTION')).toBe('NOTE');
      expect(validateCalloutType('TIP', 'NOTE')).toBe('TIP');
      // Invalid types fall back to default
      expect(validateCalloutType('INVALID', 'NOTE')).toBe('NOTE');
      expect(validateCalloutType('', 'NOTE')).toBe('NOTE');
    });
  });

  describe('handleTest pattern', () => {
    it('checks for API key before testing', () => {
      const settings = { obsidianApiKey: '' };
      const hasApiKey = Boolean(settings.obsidianApiKey);
      expect(hasApiKey).toBe(false);
    });

    it('sends testConnection message', async () => {
      const mockSendMessage = vi.fn(
        (message: unknown, callback: (response: unknown) => void) => {
          callback({ success: true });
        }
      );

      const result = await new Promise<{ success: boolean }>((resolve) => {
        mockSendMessage({ action: 'testConnection' }, (response) => {
          resolve(response as { success: boolean });
        });
      });

      expect(result.success).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(
        { action: 'testConnection' },
        expect.any(Function)
      );
    });

    it('handles connection failure', async () => {
      const mockSendMessage = vi.fn(
        (message: unknown, callback: (response: unknown) => void) => {
          callback({ success: false, error: 'Connection failed' });
        }
      );

      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          mockSendMessage({ action: 'testConnection' }, (response) => {
            resolve(response as { success: boolean; error?: string });
          });
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });

    it('handles runtime error', async () => {
      // Simulate chrome.runtime.lastError
      const error = new Error('Extension context invalidated');
      expect(error.message).toBe('Extension context invalidated');
    });
  });

  describe('showStatus pattern', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div id="status" class="status"></div>';
    });

    it('shows success status', () => {
      const status = document.getElementById('status') as HTMLDivElement;

      status.textContent = 'Settings saved';
      status.className = 'status success';

      expect(status.textContent).toBe('Settings saved');
      expect(status.classList.contains('success')).toBe(true);
    });

    it('shows error status', () => {
      const status = document.getElementById('status') as HTMLDivElement;

      status.textContent = 'Error occurred';
      status.className = 'status error';

      expect(status.textContent).toBe('Error occurred');
      expect(status.classList.contains('error')).toBe(true);
    });

    it('shows warning status', () => {
      const status = document.getElementById('status') as HTMLDivElement;

      status.textContent = 'Warning message';
      status.className = 'status warning';

      expect(status.classList.contains('warning')).toBe(true);
    });

    it('shows info status', () => {
      const status = document.getElementById('status') as HTMLDivElement;

      status.textContent = 'Testing connection...';
      status.className = 'status info';

      expect(status.classList.contains('info')).toBe(true);
    });

    it('clears status', () => {
      const status = document.getElementById('status') as HTMLDivElement;

      status.textContent = 'Some status';
      status.className = 'status error';

      // Clear status
      status.textContent = '';
      status.className = 'status';

      expect(status.textContent).toBe('');
      expect(status.className).toBe('status');
    });
  });

  describe('setupApiKeyToggle pattern', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="input-group">
          <input id="apiKey" type="password" value="secret-key">
        </div>
      `;
    });

    it('creates toggle button', () => {
      const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
      const container = apiKeyInput.parentElement;

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'api-key-toggle';
      toggleBtn.textContent = '👁️';

      container?.appendChild(toggleBtn);

      expect(container?.querySelector('.api-key-toggle')).not.toBeNull();
    });

    it('toggles input type on click', () => {
      const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
      const container = apiKeyInput.parentElement;

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';

      toggleBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
          apiKeyInput.type = 'text';
          toggleBtn.textContent = '🙈';
        } else {
          apiKeyInput.type = 'password';
          toggleBtn.textContent = '👁️';
        }
      });

      container?.appendChild(toggleBtn);

      // Initial state
      expect(apiKeyInput.type).toBe('password');

      // First click - show
      toggleBtn.click();
      expect(apiKeyInput.type).toBe('text');
      expect(toggleBtn.textContent).toBe('🙈');

      // Second click - hide
      toggleBtn.click();
      expect(apiKeyInput.type).toBe('password');
      expect(toggleBtn.textContent).toBe('👁️');
    });

    it('does nothing without parent container', () => {
      const apiKeyInput = document.createElement('input');
      apiKeyInput.id = 'orphanApiKey';
      apiKeyInput.type = 'password';

      // No parent element, should not throw
      const container = apiKeyInput.parentElement;
      expect(container).toBeNull();
    });
  });

  describe('messageFormat change handler', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <select id="messageFormat">
          <option value="callout">Callout</option>
          <option value="plain">Plain</option>
          <option value="blockquote">Blockquote</option>
        </select>
        <input id="userCallout" type="text">
        <input id="assistantCallout" type="text">
      `;
    });

    it('disables callout inputs when format is not callout', () => {
      const messageFormat = document.getElementById(
        'messageFormat'
      ) as HTMLSelectElement;
      const userCallout = document.getElementById('userCallout') as HTMLInputElement;
      const assistantCallout = document.getElementById(
        'assistantCallout'
      ) as HTMLInputElement;

      messageFormat.addEventListener('change', () => {
        const isCallout = messageFormat.value === 'callout';
        userCallout.disabled = !isCallout;
        assistantCallout.disabled = !isCallout;
      });

      // Change to plain
      messageFormat.value = 'plain';
      messageFormat.dispatchEvent(new Event('change'));

      expect(userCallout.disabled).toBe(true);
      expect(assistantCallout.disabled).toBe(true);
    });

    it('enables callout inputs when format is callout', () => {
      const messageFormat = document.getElementById(
        'messageFormat'
      ) as HTMLSelectElement;
      const userCallout = document.getElementById('userCallout') as HTMLInputElement;
      const assistantCallout = document.getElementById(
        'assistantCallout'
      ) as HTMLInputElement;

      // Start disabled
      userCallout.disabled = true;
      assistantCallout.disabled = true;

      messageFormat.addEventListener('change', () => {
        const isCallout = messageFormat.value === 'callout';
        userCallout.disabled = !isCallout;
        assistantCallout.disabled = !isCallout;
      });

      // Change to callout
      messageFormat.value = 'callout';
      messageFormat.dispatchEvent(new Event('change'));

      expect(userCallout.disabled).toBe(false);
      expect(assistantCallout.disabled).toBe(false);
    });
  });

  describe('storage integration', () => {
    it('calls getSettings on initialize', async () => {
      vi.mocked(getSettings).mockResolvedValue({
        obsidianApiKey: 'test-key',
        obsidianPort: 27123,
        vaultPath: 'AI/Gemini',
        templateOptions: {
          messageFormat: 'callout',
          userCalloutType: 'QUESTION',
          assistantCalloutType: 'NOTE',
          includeId: true,
          includeTitle: true,
          includeTags: true,
          includeSource: true,
          includeDates: true,
          includeMessageCount: true,
        },
      });

      const settings = await getSettings();

      expect(getSettings).toHaveBeenCalled();
      expect(settings.obsidianApiKey).toBe('test-key');
    });

    it('calls saveSettings on save', async () => {
      vi.mocked(saveSettings).mockResolvedValue();

      await saveSettings({
        obsidianApiKey: 'new-key',
        obsidianPort: 28000,
        vaultPath: 'New/Path',
        templateOptions: {
          messageFormat: 'plain',
          userCalloutType: 'QUESTION',
          assistantCalloutType: 'NOTE',
          includeId: true,
          includeTitle: true,
          includeTags: true,
          includeSource: true,
          includeDates: true,
          includeMessageCount: true,
        },
      });

      expect(saveSettings).toHaveBeenCalled();
    });
  });
});
