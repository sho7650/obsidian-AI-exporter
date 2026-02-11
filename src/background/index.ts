/**
 * Background Service Worker
 * Handles HTTP communication with Obsidian REST API
 */

import { ObsidianApiClient } from '../lib/obsidian-api';
import { extractErrorMessage, getErrorMessage } from '../lib/error-utils';
import { getSettings, migrateSettings } from '../lib/storage';
import { generateNoteContent } from '../lib/note-generator';
import {
  MAX_CONTENT_SIZE,
  MAX_FILENAME_LENGTH,
  MAX_FRONTMATTER_TITLE_LENGTH,
  MAX_TAGS_COUNT,
  ALLOWED_ORIGINS,
  VALID_MESSAGE_ACTIONS,
  VALID_OUTPUT_DESTINATIONS,
  VALID_SOURCES,
} from '../lib/constants';
import type {
  ExtensionMessage,
  ObsidianNote,
  SaveResponse,
  ExtensionSettings,
  OutputDestination,
  OutputResult,
  MultiOutputResponse,
} from '../lib/types';

// Run settings migration on service worker startup (C-01)
// Note: top-level await not available in service workers, use .catch() for error handling
migrateSettings().catch(error => {
  console.error('[G2O Background] Settings migration failed:', error);
});

// ALLOWED_ORIGINS imported from constants.ts

/**
 * Validate message sender (M-02)
 *
 * Security: Only accept messages from:
 * - Popup (same extension)
 * - Content scripts from allowed origins
 */
function validateSender(sender: chrome.runtime.MessageSender): boolean {
  // Allow messages from popup (same extension)
  if (sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    return true;
  }

  // Validate content script origin
  if (sender.tab?.url) {
    try {
      const url = new URL(sender.tab.url);
      return ALLOWED_ORIGINS.some(origin => url.origin === origin);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Validate message content (M-02)
 *
 * Security: Content scripts are less trustworthy.
 * Validate and sanitize all input per Chrome extension best practices.
 */
function validateMessageContent(message: ExtensionMessage): boolean {
  // Validate action against whitelist (using centralized constants)
  if (!VALID_MESSAGE_ACTIONS.includes(message.action as (typeof VALID_MESSAGE_ACTIONS)[number])) {
    return false;
  }

  // Detailed validation for saveToObsidian action
  if (message.action === 'saveToObsidian' && message.data) {
    if (!validateNoteData(message.data)) {
      return false;
    }
  }

  // Detailed validation for saveToOutputs action
  if (message.action === 'saveToOutputs') {
    if (!validateNoteData(message.data)) {
      return false;
    }
    // Validate outputs array (using centralized constants)
    if (!Array.isArray(message.outputs) || message.outputs.length === 0) {
      return false;
    }
    if (
      !message.outputs.every(o =>
        VALID_OUTPUT_DESTINATIONS.includes(o as (typeof VALID_OUTPUT_DESTINATIONS)[number])
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validate note data structure
 */
function validateNoteData(note: ObsidianNote): boolean {
  // Required field validation
  if (typeof note.fileName !== 'string' || typeof note.body !== 'string') {
    return false;
  }

  // File name length limits (filesystem constraints)
  if (note.fileName.length === 0 || note.fileName.length > MAX_FILENAME_LENGTH) {
    return false;
  }

  // Content size limit (DoS prevention)
  if (note.body.length > MAX_CONTENT_SIZE) {
    return false;
  }

  // Frontmatter validation
  if (note.frontmatter) {
    if (
      typeof note.frontmatter.title !== 'string' ||
      note.frontmatter.title.length > MAX_FRONTMATTER_TITLE_LENGTH
    ) {
      return false;
    }
    if (
      typeof note.frontmatter.source !== 'string' ||
      !VALID_SOURCES.includes(note.frontmatter.source as (typeof VALID_SOURCES)[number])
    ) {
      return false;
    }
    if (!Array.isArray(note.frontmatter.tags) || note.frontmatter.tags.length > MAX_TAGS_COUNT) {
      return false;
    }
  }

  return true;
}

/**
 * Handle incoming messages from content script and popup
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    // Ignore messages targeted at offscreen document
    // These are handled by the offscreen document's own listener
    if (
      message &&
      typeof message === 'object' &&
      'target' in message &&
      message.target === 'offscreen'
    ) {
      return false;
    }

    // Sender validation (M-02)
    if (!validateSender(sender)) {
      console.warn('[G2O Background] Rejected message from unauthorized sender');
      sendResponse({ success: false, error: 'Unauthorized' });
      return false;
    }

    // Message content validation (M-02)
    if (!validateMessageContent(message)) {
      console.warn('[G2O Background] Invalid message content');
      sendResponse({ success: false, error: 'Invalid message content' });
      return false;
    }

    handleMessage(message)
      .then(sendResponse)
      .catch(error => {
        console.error('[G2O Background] Error handling message:', error);
        sendResponse({ success: false, error: getErrorMessage(error) });
      });
    return true; // Indicates async response
  }
);

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  const settings = await getSettings();

  switch (message.action) {
    case 'saveToObsidian':
      return handleSave(settings, message.data);

    case 'saveToOutputs':
      return handleMultiOutput(message.data, message.outputs, settings);

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

/**
 * Save note to Obsidian vault
 */
async function handleSave(settings: ExtensionSettings, note: ObsidianNote): Promise<SaveResponse> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured. Please check settings.' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);

  try {
    // Construct full path
    const fullPath = settings.vaultPath ? `${settings.vaultPath}/${note.fileName}` : note.fileName;

    // Check if file exists for append mode detection
    const existingContent = await client.getFile(fullPath);
    const isNewFile = existingContent === null;

    // Generate note content
    const content = generateNoteContent(note, settings);

    // Save to Obsidian
    await client.putFile(fullPath, content);

    return {
      success: true,
      isNewFile,
    };
  } catch (error) {
    console.error('[G2O Background] Save failed:', error);
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Get existing file content from Obsidian
 */
async function handleGetFile(
  settings: ExtensionSettings,
  fileName: string,
  vaultPath?: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);

  try {
    const path = vaultPath ? `${vaultPath}/${fileName}` : fileName;
    const content = await client.getFile(path);

    if (content === null) {
      return { success: true, content: undefined };
    }

    return { success: true, content };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Test connection to Obsidian REST API
 */
async function handleTestConnection(
  settings: ExtensionSettings
): Promise<{ success: boolean; error?: string }> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);
  const result = await client.testConnection();

  if (!result.reachable) {
    return {
      success: false,
      error: result.error ?? 'Cannot reach Obsidian. Is it running?',
    };
  }

  if (!result.authenticated) {
    return {
      success: false,
      error: result.error ?? 'Invalid API key. Please check your settings.',
    };
  }

  return { success: true };
}

// ============================================================================
// Multi-Output Handlers
// ============================================================================

/** Offscreen document close timeout (milliseconds) */
const OFFSCREEN_TIMEOUT_MS = 5000;

/** Timer for auto-closing offscreen document */
let offscreenCloseTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule auto-close of offscreen document
 * Resets timer on consecutive operations for efficient reuse
 */
function scheduleOffscreenClose(): void {
  if (offscreenCloseTimer) {
    clearTimeout(offscreenCloseTimer);
  }

  offscreenCloseTimer = setTimeout(async () => {
    try {
      await chrome.offscreen.closeDocument();
    } catch (error) {
      // Already closed or doesn't exist - safe to ignore
      console.debug('[G2O Background] Offscreen close skipped:', extractErrorMessage(error));
    }
    offscreenCloseTimer = null;
  }, OFFSCREEN_TIMEOUT_MS);
}

/**
 * Ensure offscreen document exists for clipboard operations
 */
async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Copy markdown content to clipboard',
  });
}

/**
 * Save to Obsidian and return OutputResult
 */
async function handleSaveToObsidian(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const result = await handleSave(settings, note);
    return {
      destination: 'obsidian',
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      destination: 'obsidian',
      success: false,
      error: extractErrorMessage(error),
    };
  }
}

/**
 * Download note as file
 */
/**
 * Convert string to base64 with proper Unicode handling
 * Service Worker doesn't support Blob/URL.createObjectURL
 */
function stringToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Download note as file
 */
async function handleDownloadToFile(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const content = generateNoteContent(note, settings);
    const filename = note.fileName;

    // Use data URL (Service Worker doesn't support Blob/URL.createObjectURL)
    const base64Content = stringToBase64(content);
    const dataUrl = `data:text/markdown;charset=utf-8;base64,${base64Content}`;

    return new Promise(resolve => {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename,
          saveAs: false,
          conflictAction: 'uniquify',
        },
        downloadId => {
          if (chrome.runtime.lastError) {
            resolve({
              destination: 'file',
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else if (downloadId === undefined) {
            resolve({
              destination: 'file',
              success: false,
              error: 'Download failed',
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
      error: extractErrorMessage(error),
    };
  }
}

/**
 * Copy note content to clipboard via offscreen document
 */
async function handleCopyToClipboard(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const content = generateNoteContent(note, settings);

    await ensureOffscreenDocument();

    const response = await chrome.runtime.sendMessage({
      action: 'clipboardWrite',
      target: 'offscreen',
      content,
    });

    scheduleOffscreenClose();

    if (response?.success) {
      return { destination: 'clipboard', success: true };
    } else {
      return {
        destination: 'clipboard',
        success: false,
        error: response?.error || 'Clipboard write failed',
      };
    }
  } catch (error) {
    return {
      destination: 'clipboard',
      success: false,
      error: extractErrorMessage(error),
    };
  }
}

/**
 * Execute output to specific destination
 */
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

/**
 * Handle multi-output operation
 * Executes all outputs in parallel, aggregates results
 */
async function handleMultiOutput(
  note: ObsidianNote,
  outputs: OutputDestination[],
  settings: ExtensionSettings
): Promise<MultiOutputResponse> {
  const promises = outputs.map(dest => executeOutput(dest, note, settings));

  // Promise.allSettled: one failure does not block others
  const settled = await Promise.allSettled(promises);

  const results: OutputResult[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        destination: outputs[index],
        success: false,
        error: String(result.reason),
      };
    }
  });

  return {
    results,
    allSuccessful: results.every(r => r.success),
    anySuccessful: results.some(r => r.success),
  };
}

// Log when service worker starts
console.info('[G2O Background] Service worker started');
