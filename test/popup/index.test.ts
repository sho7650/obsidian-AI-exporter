/**
 * Popup application tests
 *
 * Drives the REAL src/popup/app.ts module: initPopup() queries a fixture DOM,
 * populates it from mocked storage, and wires the save/test flows. The
 * index.ts entry shim stays a DOMContentLoaded one-liner.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionSettings } from '../../src/lib/types';

vi.mock('../../src/lib/storage', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock('../../src/lib/messaging', () => ({
  sendMessage: vi.fn(),
}));

import { getSettings, saveSettings } from '../../src/lib/storage';
import { sendMessage } from '../../src/lib/messaging';
import { initPopup } from '../../src/popup/app';

const VALID_API_KEY = 'a'.repeat(32);

const storedSettings: ExtensionSettings = {
  obsidianApiKey: VALID_API_KEY,
  obsidianUrl: 'http://127.0.0.1:27123',
  vaultPath: 'AI/Gemini',
  enableAutoScroll: true,
  enableAppendMode: false,
  enableToolContent: false,
  outputOptions: { obsidian: true, file: false, clipboard: true },
  templateOptions: {
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
    includeQuestionHeaders: false,
    includeId: true,
    includeTitle: true,
    includeTags: false,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    timezone: 'UTC',
  },
};

const SWITCH_IDS = [
  'outputObsidian',
  'outputFile',
  'outputClipboard',
  'includeQuestionHeaders',
  'includeId',
  'includeTitle',
  'includeTags',
  'includeSource',
  'includeDates',
  'includeMessageCount',
  'enableAutoScroll',
  'enableAppendMode',
  'enableToolContent',
];

function buildPopupDom(): void {
  const switches = SWITCH_IDS.map(
    id => `<input type="checkbox" id="${id}" role="switch" aria-checked="false" />`
  ).join('\n');

  document.body.innerHTML = `
    <section id="obsidianSettings">
      <div class="api-key-wrapper">
        <input type="password" id="apiKey" />
      </div>
      <input type="text" id="obsidianUrl" />
      <input type="text" id="vaultPath" />
    </section>
    ${switches}
    <select id="messageFormat">
      <option value="callout">callout</option>
      <option value="plain">plain</option>
      <option value="blockquote">blockquote</option>
    </select>
    <div id="calloutSettingsGroup">
      <input type="text" id="userCallout" />
      <input type="text" id="assistantCallout" />
    </div>
    <div id="timezoneGroup">
      <select id="timezone"><option value="UTC">UTC</option></select>
    </div>
    <button id="testBtn"></button>
    <button id="saveBtn"></button>
    <div id="status" class="status"></div>
  `;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function statusEl(): HTMLDivElement {
  return el<HTMLDivElement>('status');
}

async function initWithDefaults(): Promise<void> {
  buildPopupDom();
  vi.mocked(getSettings).mockResolvedValue(storedSettings);
  await initPopup();
}

describe('popup/app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initPopup', () => {
    it('populates the form from stored settings', async () => {
      await initWithDefaults();

      expect(el<HTMLInputElement>('apiKey').value).toBe(VALID_API_KEY);
      expect(el<HTMLInputElement>('obsidianUrl').value).toBe('http://127.0.0.1:27123');
      expect(el<HTMLInputElement>('vaultPath').value).toBe('AI/Gemini');
      expect(el<HTMLInputElement>('outputObsidian').checked).toBe(true);
      expect(el<HTMLInputElement>('outputClipboard').checked).toBe(true);
      expect(el<HTMLInputElement>('outputFile').checked).toBe(false);
      expect(el<HTMLInputElement>('enableAutoScroll').checked).toBe(true);
      expect(el<HTMLInputElement>('includeTags').checked).toBe(false);
      expect(el<HTMLSelectElement>('messageFormat').value).toBe('callout');
    });

    it('populates the timezone dropdown with IANA zones', async () => {
      await initWithDefaults();

      const timezone = el<HTMLSelectElement>('timezone');
      expect(timezone.options.length).toBeGreaterThan(1);
      expect(timezone.value).toBe('UTC');
    });

    it('syncs aria-checked with the populated checkbox state', async () => {
      await initWithDefaults();

      expect(el<HTMLInputElement>('outputObsidian').getAttribute('aria-checked')).toBe('true');
      expect(el<HTMLInputElement>('outputFile').getAttribute('aria-checked')).toBe('false');
    });

    it('keeps aria-checked in sync when a switch changes', async () => {
      await initWithDefaults();

      const toggle = el<HTMLInputElement>('outputFile');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(toggle.getAttribute('aria-checked')).toBe('true');
    });

    it('applies defaults when stored settings have missing optional fields', async () => {
      buildPopupDom();
      const partial = {
        ...storedSettings,
        obsidianApiKey: '',
        obsidianUrl: '',
        outputOptions: undefined,
        enableAutoScroll: undefined,
        enableAppendMode: undefined,
        enableToolContent: undefined,
        templateOptions: { messageFormat: '', userCalloutType: '', assistantCalloutType: '' },
      } as unknown as ExtensionSettings;
      vi.mocked(getSettings).mockResolvedValue(partial);

      await initPopup();

      expect(el<HTMLInputElement>('outputObsidian').checked).toBe(true); // default on
      expect(el<HTMLInputElement>('outputFile').checked).toBe(false);
      expect(el<HTMLInputElement>('enableAutoScroll').checked).toBe(false);
      expect(el<HTMLInputElement>('obsidianUrl').value).toBe('http://127.0.0.1:27123');
      expect(el<HTMLSelectElement>('messageFormat').value).toBe('callout');
      expect(el<HTMLInputElement>('userCallout').value).toBe('QUESTION');
      expect(el<HTMLInputElement>('assistantCallout').value).toBe('NOTE');
      expect(el<HTMLInputElement>('includeId').checked).toBe(true); // ?? true default
      expect(el<HTMLSelectElement>('timezone').value).toBe('UTC');
    });

    it('translates data-i18n elements when a translation exists', async () => {
      buildPopupDom();
      document.body.insertAdjacentHTML(
        'beforeend',
        '<span id="i18nLabel" data-i18n="settings_title"></span>' +
          '<input id="i18nInput" data-i18n-placeholder="settings_apiKeyPlaceholder" />'
      );
      // Ensure the data-i18n title is the FIRST <title> the app queries
      document.querySelectorAll('title').forEach(t => t.remove());
      document.head.insertAdjacentHTML('beforeend', '<title data-i18n="extName"></title>');
      vi.mocked(chrome.i18n.getMessage).mockImplementation((key: string) => `T_${key}`);
      vi.mocked(getSettings).mockResolvedValue(storedSettings);

      try {
        await initPopup();

        expect(document.getElementById('i18nLabel')!.textContent).toBe('T_settings_title');
        expect((document.getElementById('i18nInput') as HTMLInputElement).placeholder).toBe(
          'T_settings_apiKeyPlaceholder'
        );
        expect(document.title).toBe('T_extName');
      } finally {
        vi.mocked(chrome.i18n.getMessage).mockImplementation((key: string) => key);
        document.head.querySelector('title[data-i18n]')?.remove();
      }
    });

    it('rejects when a required element is missing from the DOM', async () => {
      buildPopupDom();
      document.getElementById('saveBtn')!.remove();
      vi.mocked(getSettings).mockResolvedValue(storedSettings);

      await expect(initPopup()).rejects.toThrow('Missing element: #saveBtn');
    });

    it('does not repopulate the timezone dropdown on re-init', async () => {
      await initWithDefaults();
      const countAfterFirst = el<HTMLSelectElement>('timezone').options.length;

      await initPopup(); // same DOM, second run hits the early-return guard

      expect(el<HTMLSelectElement>('timezone').options.length).toBe(countAfterFirst);
    });

    it('shows an error status when settings cannot be loaded', async () => {
      buildPopupDom();
      vi.mocked(getSettings).mockRejectedValue(new Error('storage down'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await initPopup();

      expect(statusEl().textContent).toBe('toast_error_connectionFailed');
      expect(statusEl().className).toBe('status error');
      errorSpy.mockRestore();
    });
  });

  describe('section visibility', () => {
    it('disables the Obsidian section when Obsidian output is off', async () => {
      buildPopupDom();
      vi.mocked(getSettings).mockResolvedValue({
        ...storedSettings,
        outputOptions: { obsidian: false, file: true, clipboard: false },
      });
      await initPopup();

      expect(el('obsidianSettings').classList.contains('disabled')).toBe(true);
    });

    it('re-enables the Obsidian section when the toggle is switched on', async () => {
      buildPopupDom();
      vi.mocked(getSettings).mockResolvedValue({
        ...storedSettings,
        outputOptions: { obsidian: false, file: true, clipboard: false },
      });
      await initPopup();

      const toggle = el<HTMLInputElement>('outputObsidian');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));

      expect(el('obsidianSettings').classList.contains('disabled')).toBe(false);
    });

    it('hides callout settings for non-callout formats', async () => {
      await initWithDefaults();

      const format = el<HTMLSelectElement>('messageFormat');
      format.value = 'plain';
      format.dispatchEvent(new Event('change'));

      expect(el('calloutSettingsGroup').style.display).toBe('none');
    });

    it('hides the timezone group when dates are excluded', async () => {
      await initWithDefaults();

      const includeDates = el<HTMLInputElement>('includeDates');
      includeDates.checked = false;
      includeDates.dispatchEvent(new Event('change'));

      expect(el('timezoneGroup').style.display).toBe('none');
    });
  });

  describe('API key visibility toggle', () => {
    it('appends a toggle button that reveals and hides the key', async () => {
      await initWithDefaults();

      const toggleBtn = document.querySelector<HTMLButtonElement>('.api-key-toggle');
      expect(toggleBtn).not.toBeNull();

      const apiKey = el<HTMLInputElement>('apiKey');
      expect(apiKey.type).toBe('password');

      toggleBtn!.click();
      expect(apiKey.type).toBe('text');

      toggleBtn!.click();
      expect(apiKey.type).toBe('password');
    });
  });

  describe('save flow', () => {
    it('saves collected settings and shows a success status', async () => {
      await initWithDefaults();
      vi.mocked(saveSettings).mockResolvedValue(undefined);

      el<HTMLInputElement>('vaultPath').value = '  AI/Claude  ';
      el<HTMLButtonElement>('saveBtn').click();

      await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());
      expect(saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          obsidianApiKey: VALID_API_KEY,
          vaultPath: 'AI/Claude',
          outputOptions: { obsidian: true, file: false, clipboard: true },
        })
      );
      expect(statusEl().textContent).toBe('status_settingsSaved');
      expect(statusEl().className).toBe('status success');
      expect(el<HTMLButtonElement>('saveBtn').disabled).toBe(false);
    });

    it('rejects saving when no output destination is selected', async () => {
      await initWithDefaults();

      for (const id of ['outputObsidian', 'outputFile', 'outputClipboard']) {
        el<HTMLInputElement>(id).checked = false;
      }
      el<HTMLButtonElement>('saveBtn').click();

      await vi.waitFor(() => expect(statusEl().textContent).toBe('error_noOutputSelected'));
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it('rejects an API key shorter than the security minimum', async () => {
      await initWithDefaults();

      el<HTMLInputElement>('apiKey').value = 'short';
      el<HTMLButtonElement>('saveBtn').click();

      await vi.waitFor(() => expect(statusEl().className).toBe('status error'));
      expect(statusEl().textContent).toContain('too short');
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it('skips Obsidian validation when Obsidian output is disabled', async () => {
      buildPopupDom();
      vi.mocked(getSettings).mockResolvedValue({
        ...storedSettings,
        obsidianApiKey: '',
        outputOptions: { obsidian: false, file: true, clipboard: false },
      });
      vi.mocked(saveSettings).mockResolvedValue(undefined);
      await initPopup();

      el<HTMLButtonElement>('saveBtn').click();

      await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());
      expect(statusEl().textContent).toBe('status_settingsSaved');
    });

    it('shows an error status when persisting settings fails', async () => {
      await initWithDefaults();
      vi.mocked(saveSettings).mockRejectedValue(new Error('quota exceeded'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      el<HTMLButtonElement>('saveBtn').click();

      await vi.waitFor(() => expect(statusEl().className).toBe('status error'));
      expect(statusEl().textContent).toBe('toast_error_saveFailed');
      expect(el<HTMLButtonElement>('saveBtn').disabled).toBe(false);
      errorSpy.mockRestore();
    });
  });

  describe('test connection flow', () => {
    it('saves settings then reports a successful connection', async () => {
      await initWithDefaults();
      vi.mocked(saveSettings).mockResolvedValue(undefined);
      vi.mocked(sendMessage).mockResolvedValue({ success: true });

      el<HTMLButtonElement>('testBtn').click();

      await vi.waitFor(() => expect(statusEl().textContent).toBe('status_connectionSuccess'));
      expect(saveSettings).toHaveBeenCalled();
      expect(sendMessage).toHaveBeenCalledWith({ action: 'testConnection' });
      expect(el<HTMLButtonElement>('testBtn').disabled).toBe(false);
    });

    it('reports the backend error when the connection test fails', async () => {
      await initWithDefaults();
      vi.mocked(saveSettings).mockResolvedValue(undefined);
      vi.mocked(sendMessage).mockResolvedValue({ success: false, error: 'Invalid API key' });

      el<HTMLButtonElement>('testBtn').click();

      await vi.waitFor(() => expect(statusEl().textContent).toBe('Invalid API key'));
      expect(statusEl().className).toBe('status error');
    });

    it('warns and skips the test when no API key is entered', async () => {
      await initWithDefaults();

      el<HTMLInputElement>('apiKey').value = '';
      el<HTMLButtonElement>('testBtn').click();

      await vi.waitFor(() => expect(statusEl().textContent).toBe('toast_error_noApiKey'));
      expect(statusEl().className).toBe('status warning');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('rejects invalid Obsidian settings before testing', async () => {
      await initWithDefaults();

      el<HTMLInputElement>('obsidianUrl').value = 'ftp://example.com';
      el<HTMLButtonElement>('testBtn').click();

      await vi.waitFor(() => expect(statusEl().className).toBe('status error'));
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('shows the thrown message when the test itself errors', async () => {
      await initWithDefaults();
      vi.mocked(saveSettings).mockResolvedValue(undefined);
      vi.mocked(sendMessage).mockRejectedValue(new Error('port closed'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      el<HTMLButtonElement>('testBtn').click();

      await vi.waitFor(() => expect(statusEl().textContent).toBe('port closed'));
      expect(statusEl().className).toBe('status error');
      errorSpy.mockRestore();
    });
  });
});
