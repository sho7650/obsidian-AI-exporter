/**
 * Content Script Entry Point
 * Initializes on Gemini pages and handles sync operations
 */

import { GeminiExtractor } from './extractors/gemini';
import { ClaudeExtractor } from './extractors/claude';
import { ChatGPTExtractor } from './extractors/chatgpt';
import { PerplexityExtractor } from './extractors/perplexity';
import { extractErrorMessage } from '../lib/error-utils';
import type { IConversationExtractor } from '../lib/types';
import { conversationToNote } from './markdown';
import {
  injectSyncButton,
  setButtonLoading,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showToast,
} from './ui';
import { sendMessage } from '../lib/messaging';
import {
  AUTO_SAVE_CHECK_INTERVAL,
  EVENT_THROTTLE_DELAY,
  INFO_TOAST_DURATION,
} from '../lib/constants';
import type {
  ExtensionSettings,
  ObsidianNote,
  OutputDestination,
  OutputResult,
  MultiOutputResponse,
} from '../lib/types';

/**
 * Throttle function (NEW-06)
 * Executes immediately on first call, then blocks for `limit` ms
 */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/** Debounce delay for MutationObserver callback (milliseconds) */
const MUTATION_DEBOUNCE_DELAY = 100;

/** Platform-specific main content container selectors for optimized observation */
const PLATFORM_ROOT_SELECTORS: Record<string, string[]> = {
  'gemini.google.com': ['main', '#app-container', 'body'],
  'claude.ai': ['main', '#__next', 'body'],
  'chatgpt.com': ['main', '#__next', 'body'],
  'www.perplexity.ai': ['main', '#__next', 'body'],
};

/** Conversation container selectors to detect when content is ready */
const CONVERSATION_CONTAINER_SELECTOR =
  '.conversation-container, [class*="conversation"], article[data-turn-id], div[class*="threadContentWidth"]';

/**
 * Get the optimal observation root for the current platform
 * Falls back to document.body if no platform-specific root is found
 */
function getObservationRoot(): Element {
  const hostname = window.location.hostname;
  const selectors = PLATFORM_ROOT_SELECTORS[hostname];

  if (selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && selector !== 'body') {
        console.debug(`[G2O] Using optimized observation root: ${selector}`);
        return element;
      }
    }
  }

  return document.body;
}

/**
 * Wait for conversation container to appear (L-03)
 * Uses MutationObserver with debouncing instead of fixed timeout
 *
 * Performance optimizations:
 * - Observes platform-specific root instead of document.body (P-1)
 * - Debouncing prevents excessive DOM queries during rapid mutation bursts
 */
function waitForConversationContainer(): Promise<void> {
  return new Promise(resolve => {
    // Check if already exists
    const existing = document.querySelector(CONVERSATION_CONTAINER_SELECTOR);
    if (existing) {
      resolve();
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Debounced check function
    const checkForContainer = (obs: MutationObserver) => {
      const container = document.querySelector(CONVERSATION_CONTAINER_SELECTOR);
      if (container) {
        obs.disconnect();
        if (debounceTimer) {
          window.clearTimeout(debounceTimer);
        }
        resolve();
      }
    };

    // Use MutationObserver to watch for container with debouncing
    const observer = new MutationObserver((_mutations, obs) => {
      // Clear previous debounce timer
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      // Schedule check after debounce delay
      debounceTimer = setTimeout(() => checkForContainer(obs), MUTATION_DEBOUNCE_DELAY);
    });

    // P-1: Observe platform-specific root instead of document.body for better performance
    const observationRoot = getObservationRoot();
    observer.observe(observationRoot, {
      childList: true,
      subtree: true,
    });

    // Fallback timeout
    setTimeout(() => {
      observer.disconnect();
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      resolve();
    }, AUTO_SAVE_CHECK_INTERVAL);
  });
}

/**
 * Get the appropriate extractor for the current page
 *
 * Uses strict hostname comparison to prevent subdomain attacks
 * @see CodeQL: js/incomplete-url-substring-sanitization
 */
function getExtractor(): IConversationExtractor | null {
  const hostname = window.location.hostname;

  // Strict comparison prevents attacks like "evil-gemini.google.com.attacker.com"
  if (hostname === 'gemini.google.com') {
    return new GeminiExtractor();
  }
  if (hostname === 'claude.ai') {
    return new ClaudeExtractor();
  }
  if (hostname === 'chatgpt.com') {
    return new ChatGPTExtractor();
  }
  if (hostname === 'www.perplexity.ai') {
    return new PerplexityExtractor();
  }

  return null;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

/**
 * Initialize the content script
 */
async function initialize(): Promise<void> {
  console.info('[G2O] Content script initializing on:', window.location.href);

  // Check if we have a valid extractor for this page
  const extractor = getExtractor();
  if (!extractor) {
    console.info('[G2O] No extractor available for this page, skipping initialization');
    return;
  }

  console.info(`[G2O] Using ${extractor.platform} extractor`);

  // Wait for conversation container (L-03)
  await waitForConversationContainer();

  // Apply throttle to sync handler (NEW-06)
  const throttledHandleSync = throttle(handleSync, EVENT_THROTTLE_DELAY);
  injectSyncButton(throttledHandleSync);
  console.info('[G2O] Sync button injected');
}

/**
 * Get enabled output destinations from settings
 */
function getEnabledOutputs(settings: ExtensionSettings): OutputDestination[] {
  const outputs: OutputDestination[] = [];
  const { outputOptions } = settings;

  if (outputOptions?.obsidian) outputs.push('obsidian');
  if (outputOptions?.file) outputs.push('file');
  if (outputOptions?.clipboard) outputs.push('clipboard');

  return outputs;
}

/**
 * Validate output configuration before sync
 * @returns error message if invalid, null if valid
 */
async function validateOutputConfig(
  settings: ExtensionSettings,
  enabledOutputs: OutputDestination[]
): Promise<string | null> {
  if (enabledOutputs.length === 0) {
    return 'Please select at least one output destination in settings';
  }

  if (enabledOutputs.includes('obsidian')) {
    if (!settings.obsidianApiKey) {
      return 'Please configure your Obsidian API key in the extension settings';
    }

    const connectionTest = await testConnection();
    if (!connectionTest.success) {
      return connectionTest.error || 'Cannot connect to Obsidian';
    }
  }

  return null;
}

/**
 * Display save results to the user via toasts
 */
function displaySaveResults(
  saveResult: MultiOutputResponse,
  fileName: string,
  extractionWarnings?: string[]
): void {
  if (saveResult.allSuccessful) {
    showSuccessToast(fileName, true);
  } else if (saveResult.anySuccessful) {
    const successList = saveResult.results
      .filter((r: OutputResult) => r.success)
      .map((r: OutputResult) => r.destination)
      .join(', ');
    const failedList = saveResult.results
      .filter((r: OutputResult) => !r.success)
      .map((r: OutputResult) => `${r.destination}: ${r.error}`)
      .join('; ');
    showWarningToast(`Saved to: ${successList}. Failed: ${failedList}`);
  } else {
    const errorMsg = saveResult.results
      .map((r: OutputResult) => r.error)
      .filter(Boolean)
      .join('; ');
    showErrorToast(errorMsg || 'Failed to save');
  }

  if (extractionWarnings && extractionWarnings.length > 0 && saveResult.anySuccessful) {
    setTimeout(() => {
      showWarningToast(extractionWarnings.join('. '));
    }, INFO_TOAST_DURATION);
  }
}

/**
 * Handle sync button click
 */
async function handleSync(): Promise<void> {
  console.info('[G2O] Sync initiated');
  setButtonLoading(true);

  try {
    // Get settings first (L-01: use type-safe messaging)
    const settings = await getSettings();
    const enabledOutputs = getEnabledOutputs(settings);

    // Validate output configuration
    const configError = await validateOutputConfig(settings, enabledOutputs);
    if (configError) {
      showErrorToast(configError);
      return;
    }

    // Extract conversation using appropriate extractor
    const extractor = getExtractor();
    if (!extractor || !extractor.canExtract()) {
      showErrorToast('Not on a valid conversation page');
      return;
    }

    showToast('Extracting conversation...', 'info', INFO_TOAST_DURATION);
    const result = await extractor.extract();

    // Validate extraction
    const validation = extractor.validate(result);
    if (!validation.isValid) {
      showErrorToast(validation.errors.join(', ') || 'Extraction failed');
      return;
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        console.warn('[G2O] Warning:', warning);
      });
    }

    if (!result.data) {
      showErrorToast('No conversation data extracted');
      return;
    }

    // Convert to Obsidian note
    const note = conversationToNote(result.data, settings.templateOptions);

    console.info('[G2O] Generated note:', {
      fileName: note.fileName,
      messageCount: result.data.messages.length,
      outputs: enabledOutputs,
    });

    // Save to enabled outputs
    showToast('Saving...', 'info', INFO_TOAST_DURATION);
    const saveResult = await saveToOutputs(note, enabledOutputs);

    displaySaveResults(saveResult, note.fileName, result.warnings);
  } catch (error) {
    console.error('[G2O] Sync error:', error);
    showErrorToast(extractErrorMessage(error));
  } finally {
    setButtonLoading(false);
  }
}

/**
 * Get extension settings from background script (L-01)
 * Uses type-safe messaging utility
 */
function getSettings(): Promise<ExtensionSettings> {
  return sendMessage({ action: 'getSettings' });
}

/**
 * Test connection to Obsidian (L-01)
 * Uses type-safe messaging utility
 */
function testConnection(): Promise<{ success: boolean; error?: string }> {
  return sendMessage({ action: 'testConnection' });
}

/**
 * Save note to multiple outputs via background script
 * Uses type-safe messaging utility
 */
function saveToOutputs(
  note: ObsidianNote,
  outputs: OutputDestination[]
): Promise<MultiOutputResponse> {
  return sendMessage({ action: 'saveToOutputs', data: note, outputs });
}
