/**
 * Popup Settings Script
 * Manages extension settings UI
 */

import { getSettings, saveSettings } from '../lib/storage';
import type { ExtensionSettings, TemplateOptions, OutputOptions } from '../lib/types';
import { validateCalloutType, validateVaultPath, validateApiKey } from '../lib/validation';
import { DEFAULT_OBSIDIAN_PORT, MIN_PORT, MAX_PORT } from '../lib/constants';
import { getMessage } from '../lib/i18n';
import { sendMessage } from '../lib/messaging';

/**
 * Initialize i18n for all elements with data-i18n attributes
 */
function initializeI18n(): void {
  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (key) {
      const message = getMessage(key);
      if (message && message !== key) {
        element.textContent = message;
      }
    }
  });

  // Translate placeholders with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (key && element instanceof HTMLInputElement) {
      const message = getMessage(key);
      if (message && message !== key) {
        element.placeholder = message;
      }
    }
  });

  // Update document title
  const titleElement = document.querySelector('title');
  if (titleElement) {
    const key = titleElement.getAttribute('data-i18n');
    if (key) {
      const message = getMessage(key);
      if (message && message !== key) {
        document.title = message;
      }
    }
  }
}

/**
 * Type-safe DOM element getter
 * Reduces repetitive getElementById + type assertion boilerplate
 */
function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[G2O Popup] Missing element: #${id}`);
  return el as T;
}

// DOM Elements
const elements = {
  // Output destinations
  outputObsidian: getElement<HTMLInputElement>('outputObsidian'),
  outputFile: getElement<HTMLInputElement>('outputFile'),
  outputClipboard: getElement<HTMLInputElement>('outputClipboard'),
  obsidianSettings: getElement<HTMLElement>('obsidianSettings'),
  // Obsidian settings
  apiKey: getElement<HTMLInputElement>('apiKey'),
  port: getElement<HTMLInputElement>('port'),
  vaultPath: getElement<HTMLInputElement>('vaultPath'),
  messageFormat: getElement<HTMLSelectElement>('messageFormat'),
  userCallout: getElement<HTMLInputElement>('userCallout'),
  assistantCallout: getElement<HTMLInputElement>('assistantCallout'),
  includeId: getElement<HTMLInputElement>('includeId'),
  includeTitle: getElement<HTMLInputElement>('includeTitle'),
  includeTags: getElement<HTMLInputElement>('includeTags'),
  includeSource: getElement<HTMLInputElement>('includeSource'),
  includeDates: getElement<HTMLInputElement>('includeDates'),
  includeMessageCount: getElement<HTMLInputElement>('includeMessageCount'),
  enableAutoScroll: getElement<HTMLInputElement>('enableAutoScroll'),
  enableAppendMode: getElement<HTMLInputElement>('enableAppendMode'),
  testBtn: getElement<HTMLButtonElement>('testBtn'),
  saveBtn: getElement<HTMLButtonElement>('saveBtn'),
  status: getElement<HTMLDivElement>('status'),
};

/**
 * Initialize popup
 */
async function initialize(): Promise<void> {
  try {
    initializeI18n();
    const settings = await getSettings();
    populateForm(settings);
    setupEventListeners();
    setupToggleSwitchAccessibility();
  } catch (error) {
    showStatus(getMessage('toast_error_connectionFailed'), 'error');
    console.error('[G2O Popup] Init error:', error);
  }
}

/**
 * Populate form with current settings
 */
function populateForm(settings: ExtensionSettings): void {
  // Output destinations
  const { outputOptions } = settings;
  elements.outputObsidian.checked = outputOptions?.obsidian ?? true;
  elements.outputFile.checked = outputOptions?.file ?? false;
  elements.outputClipboard.checked = outputOptions?.clipboard ?? false;

  // Extraction options
  elements.enableAutoScroll.checked = settings.enableAutoScroll ?? false;
  elements.enableAppendMode.checked = settings.enableAppendMode ?? false;

  // Update Obsidian settings section visibility
  updateObsidianSettingsVisibility();

  // Obsidian API settings
  elements.apiKey.value = settings.obsidianApiKey || '';
  elements.port.value = String(settings.obsidianPort || DEFAULT_OBSIDIAN_PORT);
  elements.vaultPath.value = settings.vaultPath || '';

  const { templateOptions } = settings;
  elements.messageFormat.value = templateOptions.messageFormat || 'callout';
  elements.userCallout.value = templateOptions.userCalloutType || 'QUESTION';
  elements.assistantCallout.value = templateOptions.assistantCalloutType || 'NOTE';

  elements.includeId.checked = templateOptions.includeId ?? true;
  elements.includeTitle.checked = templateOptions.includeTitle ?? true;
  elements.includeTags.checked = templateOptions.includeTags ?? true;
  elements.includeSource.checked = templateOptions.includeSource ?? true;
  elements.includeDates.checked = templateOptions.includeDates ?? true;
  elements.includeMessageCount.checked = templateOptions.includeMessageCount ?? true;

  // Sync aria-checked for toggle switches after setting checked state
  syncAllAriaChecked();
}

/**
 * Update Obsidian settings section visibility based on output selection
 */
function updateObsidianSettingsVisibility(): void {
  const isObsidianEnabled = elements.outputObsidian.checked;
  const obsidianSection = elements.obsidianSettings;

  if (obsidianSection) {
    if (isObsidianEnabled) {
      obsidianSection.classList.remove('disabled');
      obsidianSection.removeAttribute('data-disabled-reason');
    } else {
      obsidianSection.classList.add('disabled');
      obsidianSection.setAttribute('data-disabled-reason', getMessage('tooltip_obsidianDisabled'));
    }
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  elements.saveBtn.addEventListener('click', handleSave);
  elements.testBtn.addEventListener('click', handleTest);

  // Output destination checkbox listeners
  elements.outputObsidian.addEventListener('change', updateObsidianSettingsVisibility);

  // Enable/disable callout inputs based on message format
  elements.messageFormat.addEventListener('change', () => {
    const isCallout = elements.messageFormat.value === 'callout';
    elements.userCallout.disabled = !isCallout;
    elements.assistantCallout.disabled = !isCallout;
  });

  // Setup API key visibility toggle
  setupApiKeyToggle();
}

/**
 * Setup API key visibility toggle button
 */
function setupApiKeyToggle(): void {
  const apiKeyInput = elements.apiKey;

  // Find the .api-key-wrapper container (defined in HTML)
  const wrapper = apiKeyInput.closest('.api-key-wrapper');
  if (!wrapper) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'api-key-toggle';
  toggleBtn.textContent = '👁️';
  toggleBtn.title = getMessage('settings_showApiKey');

  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '🙈';
      toggleBtn.title = getMessage('settings_hideApiKey');
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '👁️';
      toggleBtn.title = getMessage('settings_showApiKey');
    }
  });

  wrapper.appendChild(toggleBtn);
}

/**
 * Sync aria-checked attribute for all toggle switches with role="switch"
 */
function syncAllAriaChecked(): void {
  document.querySelectorAll<HTMLInputElement>('input[role="switch"]').forEach(input => {
    input.setAttribute('aria-checked', String(input.checked));
  });
}

/**
 * Setup accessibility for toggle switches (W3C APG Switch Pattern)
 * Syncs aria-checked on change events
 */
function setupToggleSwitchAccessibility(): void {
  document.querySelectorAll<HTMLInputElement>('input[role="switch"]').forEach(input => {
    input.addEventListener('change', () => {
      input.setAttribute('aria-checked', String(input.checked));
    });
  });
}

/**
 * Collect output options from form
 */
function collectOutputOptions(): OutputOptions {
  return {
    obsidian: elements.outputObsidian.checked,
    file: elements.outputFile.checked,
    clipboard: elements.outputClipboard.checked,
  };
}

/**
 * Validate that at least one output is selected
 */
function validateOutputOptions(outputOptions: OutputOptions): boolean {
  return outputOptions.obsidian || outputOptions.file || outputOptions.clipboard;
}

const VALID_MESSAGE_FORMATS = ['callout', 'plain', 'blockquote'] as const;

/**
 * Collect settings from form
 */
function collectSettings(): ExtensionSettings {
  const formatValue = elements.messageFormat.value;
  const messageFormat = VALID_MESSAGE_FORMATS.includes(
    formatValue as (typeof VALID_MESSAGE_FORMATS)[number]
  )
    ? (formatValue as (typeof VALID_MESSAGE_FORMATS)[number])
    : 'callout';

  const templateOptions: TemplateOptions = {
    messageFormat,
    userCalloutType: elements.userCallout.value || 'QUESTION',
    assistantCalloutType: elements.assistantCallout.value || 'NOTE',
    includeId: elements.includeId.checked,
    includeTitle: elements.includeTitle.checked,
    includeTags: elements.includeTags.checked,
    includeSource: elements.includeSource.checked,
    includeDates: elements.includeDates.checked,
    includeMessageCount: elements.includeMessageCount.checked,
  };

  const outputOptions = collectOutputOptions();

  return {
    obsidianApiKey: elements.apiKey.value.trim(),
    obsidianPort: parseInt(elements.port.value, 10) || DEFAULT_OBSIDIAN_PORT,
    vaultPath: elements.vaultPath.value.trim(),
    templateOptions,
    outputOptions,
    enableAutoScroll: elements.enableAutoScroll.checked,
    enableAppendMode: elements.enableAppendMode.checked,
  };
}

/**
 * Validate Obsidian-specific settings (API key, port, vault path)
 * @returns error message if invalid, null if valid
 */
function validateObsidianSettings(settings: ExtensionSettings): string | null {
  try {
    settings.obsidianApiKey = validateApiKey(settings.obsidianApiKey);
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid API key';
  }

  if (settings.obsidianPort < MIN_PORT || settings.obsidianPort > MAX_PORT) {
    return getMessage('error_invalidPort');
  }

  try {
    settings.vaultPath = validateVaultPath(settings.vaultPath);
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid vault path';
  }

  return null;
}

/**
 * Handle save button click
 * Input validation using security utilities (NEW-03)
 */
async function handleSave(): Promise<void> {
  elements.saveBtn.disabled = true;
  clearStatus();

  try {
    const settings = collectSettings();

    // Validate output options - at least one must be selected
    if (!validateOutputOptions(settings.outputOptions)) {
      showStatus(getMessage('error_noOutputSelected'), 'error');
      return;
    }

    // Validate Obsidian-specific settings only if Obsidian output is enabled
    if (settings.outputOptions.obsidian) {
      const obsidianError = validateObsidianSettings(settings);
      if (obsidianError) {
        showStatus(obsidianError, 'error');
        return;
      }
    }

    // Validate callout types (NEW-03)
    settings.templateOptions.userCalloutType = validateCalloutType(
      settings.templateOptions.userCalloutType,
      'QUESTION'
    );
    settings.templateOptions.assistantCalloutType = validateCalloutType(
      settings.templateOptions.assistantCalloutType,
      'NOTE'
    );

    await saveSettings(settings);
    showStatus(getMessage('status_settingsSaved'), 'success');
  } catch (error) {
    showStatus(getMessage('toast_error_saveFailed', 'Unknown error'), 'error');
    console.error('[G2O Popup] Save error:', error);
  } finally {
    elements.saveBtn.disabled = false;
  }
}

/**
 * Handle test connection button click
 */
async function handleTest(): Promise<void> {
  elements.testBtn.disabled = true;
  clearStatus();
  showStatus(getMessage('status_testing'), 'info');

  try {
    // First save current settings
    const settings = collectSettings();

    if (!settings.obsidianApiKey) {
      showStatus(getMessage('toast_error_noApiKey'), 'warning');
      elements.testBtn.disabled = false;
      return;
    }

    // Temporarily save settings for the test
    await saveSettings(settings);

    // Send test connection message to background script
    const response = await sendMessage({ action: 'testConnection' });

    if (response.success) {
      showStatus(getMessage('status_connectionSuccess'), 'success');
    } else {
      showStatus(response.error || getMessage('toast_error_connectionFailed'), 'error');
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : getMessage('toast_error_connectionFailed');
    showStatus(message, 'error');
    console.error('[G2O Popup] Test error:', error);
  } finally {
    elements.testBtn.disabled = false;
  }
}

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
}

/**
 * Clear status message
 */
function clearStatus(): void {
  elements.status.textContent = '';
  elements.status.className = 'status';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
