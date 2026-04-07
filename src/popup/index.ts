/**
 * Popup Settings Script
 * Manages extension settings UI
 */

import { getSettings, saveSettings } from '../lib/storage';
import type { ExtensionSettings, TemplateOptions, OutputOptions } from '../lib/types';
import {
  validateCalloutType,
  validateVaultPath,
  validateApiKey,
  validateObsidianUrl,
} from '../lib/validation';
import { DEFAULT_OBSIDIAN_URL, VALID_MESSAGE_FORMATS } from '../lib/constants';
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
  obsidianUrl: getElement<HTMLInputElement>('obsidianUrl'),
  vaultPath: getElement<HTMLInputElement>('vaultPath'),
  messageFormat: getElement<HTMLSelectElement>('messageFormat'),
  userCallout: getElement<HTMLInputElement>('userCallout'),
  assistantCallout: getElement<HTMLInputElement>('assistantCallout'),
  includeQuestionHeaders: getElement<HTMLInputElement>('includeQuestionHeaders'),
  includeId: getElement<HTMLInputElement>('includeId'),
  includeTitle: getElement<HTMLInputElement>('includeTitle'),
  includeTags: getElement<HTMLInputElement>('includeTags'),
  includeSource: getElement<HTMLInputElement>('includeSource'),
  includeDates: getElement<HTMLInputElement>('includeDates'),
  includeMessageCount: getElement<HTMLInputElement>('includeMessageCount'),
  enableAutoScroll: getElement<HTMLInputElement>('enableAutoScroll'),
  enableAppendMode: getElement<HTMLInputElement>('enableAppendMode'),
  enableToolContent: getElement<HTMLInputElement>('enableToolContent'),
  timezone: getElement<HTMLSelectElement>('timezone'),
  timezoneGroup: getElement<HTMLElement>('timezoneGroup'),
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
  elements.enableToolContent.checked = settings.enableToolContent ?? false;

  // Update Obsidian settings section visibility
  updateObsidianSettingsVisibility();

  // Obsidian API settings
  elements.apiKey.value = settings.obsidianApiKey || '';
  elements.obsidianUrl.value = settings.obsidianUrl || DEFAULT_OBSIDIAN_URL;
  elements.vaultPath.value = settings.vaultPath || '';

  const { templateOptions } = settings;
  elements.messageFormat.value = templateOptions.messageFormat || 'callout';
  elements.userCallout.value = templateOptions.userCalloutType || 'QUESTION';
  elements.assistantCallout.value = templateOptions.assistantCalloutType || 'NOTE';
  elements.includeQuestionHeaders.checked = templateOptions.includeQuestionHeaders ?? false;

  elements.includeId.checked = templateOptions.includeId ?? true;
  elements.includeTitle.checked = templateOptions.includeTitle ?? true;
  elements.includeTags.checked = templateOptions.includeTags ?? true;
  elements.includeSource.checked = templateOptions.includeSource ?? true;
  elements.includeDates.checked = templateOptions.includeDates ?? true;
  elements.includeMessageCount.checked = templateOptions.includeMessageCount ?? true;

  // Populate timezone dropdown and set value
  populateTimezoneOptions();
  elements.timezone.value = templateOptions.timezone ?? 'UTC';
  updateTimezoneVisibility();

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

  // Show/hide timezone when includeDates changes
  elements.includeDates.addEventListener('change', updateTimezoneVisibility);

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
 * Populate timezone select with IANA timezone names
 * Groups by region for easier navigation
 */
function populateTimezoneOptions(): void {
  const select = elements.timezone;
  // Only populate once
  if (select.options.length > 1) return;

  // Intl.supportedValuesOf is available in Chrome 99+
  // Falls back to UTC-only if unavailable (Chrome 96-98)
  let timezones: string[];
  try {
    timezones = Intl.supportedValuesOf('timeZone');
  } catch {
    // Chrome < 99: leave dropdown with just UTC
    return;
  }
  // Clear default UTC option, rebuild with full list
  select.innerHTML = '';

  const utcOption = document.createElement('option');
  utcOption.value = 'UTC';
  utcOption.textContent = 'UTC';
  select.appendChild(utcOption);

  for (const tz of timezones) {
    if (tz === 'UTC') continue;
    const option = document.createElement('option');
    option.value = tz;
    option.textContent = tz.replace(/_/g, ' ');
    select.appendChild(option);
  }
}

/**
 * Show/hide timezone dropdown based on includeDates checkbox
 */
function updateTimezoneVisibility(): void {
  const group = elements.timezoneGroup;
  if (elements.includeDates.checked) {
    group.style.display = '';
  } else {
    group.style.display = 'none';
  }
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

/**
 * Collect settings from form
 * Normalizes all values at collection time to avoid downstream mutation
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
    userCalloutType: validateCalloutType(elements.userCallout.value || 'QUESTION', 'QUESTION'),
    assistantCalloutType: validateCalloutType(elements.assistantCallout.value || 'NOTE', 'NOTE'),
    includeQuestionHeaders: elements.includeQuestionHeaders.checked,
    includeId: elements.includeId.checked,
    includeTitle: elements.includeTitle.checked,
    includeTags: elements.includeTags.checked,
    includeSource: elements.includeSource.checked,
    includeDates: elements.includeDates.checked,
    includeMessageCount: elements.includeMessageCount.checked,
    timezone: elements.timezone.value || undefined,
  };

  const outputOptions = collectOutputOptions();

  return {
    obsidianApiKey: elements.apiKey.value.trim(),
    obsidianUrl: elements.obsidianUrl.value.trim() || DEFAULT_OBSIDIAN_URL,
    vaultPath: elements.vaultPath.value.trim(),
    templateOptions,
    outputOptions,
    enableAutoScroll: elements.enableAutoScroll.checked,
    enableAppendMode: elements.enableAppendMode.checked,
    enableToolContent: elements.enableToolContent.checked,
  };
}

/**
 * Result of Obsidian settings validation (DES-014 H-4: pure return, no mutation)
 */
interface ObsidianValidationResult {
  error: string | null;
  normalizedApiKey: string;
  normalizedUrl: string;
  normalizedVaultPath: string;
}

/**
 * Run a throwing validator and return the result or error message.
 */
function tryValidate(
  fn: () => string,
  fallbackMessage: string
): { ok: true; value: string } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : fallbackMessage };
  }
}

/**
 * Validate Obsidian-specific settings (API key, URL, vault path)
 * Returns normalized values without mutating the input (DES-014 H-4)
 */
function validateObsidianSettings(settings: ExtensionSettings): ObsidianValidationResult {
  const defaults = {
    normalizedApiKey: settings.obsidianApiKey,
    normalizedUrl: settings.obsidianUrl,
    normalizedVaultPath: settings.vaultPath,
  };

  const apiKey = tryValidate(() => validateApiKey(settings.obsidianApiKey), 'Invalid API key');
  if (!apiKey.ok) return { error: apiKey.error, ...defaults };

  const url = tryValidate(() => validateObsidianUrl(settings.obsidianUrl), 'Invalid URL');
  if (!url.ok) return { error: url.error, ...defaults, normalizedApiKey: apiKey.value };

  const vaultPath = tryValidate(() => validateVaultPath(settings.vaultPath), 'Invalid vault path');
  if (!vaultPath.ok) {
    return {
      error: vaultPath.error,
      ...defaults,
      normalizedApiKey: apiKey.value,
      normalizedUrl: url.value,
    };
  }

  return {
    error: null,
    normalizedApiKey: apiKey.value,
    normalizedUrl: url.value,
    normalizedVaultPath: vaultPath.value,
  };
}

/**
 * Validate and normalize Obsidian settings (API key, URL, vault path).
 * Returns normalized settings or an error message.
 */
function normalizeObsidianSettings(
  settings: ExtensionSettings
): { ok: true; settings: ExtensionSettings } | { ok: false; error: string } {
  const validation = validateObsidianSettings(settings);
  if (validation.error) {
    return { ok: false, error: validation.error };
  }
  return {
    ok: true,
    settings: {
      ...settings,
      obsidianApiKey: validation.normalizedApiKey,
      obsidianUrl: validation.normalizedUrl,
      vaultPath: validation.normalizedVaultPath,
    },
  };
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
    let settingsToSave = settings;
    if (settings.outputOptions.obsidian) {
      const result = normalizeObsidianSettings(settings);
      if (!result.ok) {
        showStatus(result.error, 'error');
        return;
      }
      settingsToSave = result.settings;
    }

    await saveSettings(settingsToSave);
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

    // Validate Obsidian settings before saving (same as handleSave)
    const result = normalizeObsidianSettings(settings);
    if (!result.ok) {
      showStatus(result.error, 'error');
      elements.testBtn.disabled = false;
      return;
    }

    // Save validated and normalized settings for the test
    await saveSettings(result.settings);

    // Send test connection message to background script
    const response = await sendMessage({ action: 'testConnection' });

    if (response.success) {
      showStatus(getMessage('status_connectionSuccess'), 'success');
    } else {
      showStatus(response.error ?? getMessage('toast_error_connectionFailed'), 'error');
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
