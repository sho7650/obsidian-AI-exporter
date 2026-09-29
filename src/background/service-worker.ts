/**
 * Background Service Worker
 * Handles HTTP communication with Obsidian REST API
 */

import { getErrorMessage } from '../lib/error-utils';
import { getSettings, migrateSettings } from '../lib/storage';
import { validateSender, validateMessageContent } from './validation';
import { handleTestConnection } from './obsidian-handlers';
import { handleMultiOutput } from './output-handlers';
import { handleFetchImage } from './image-fetch';
import type { ExtensionMessage, ContentScriptSettings, ExtensionSettings } from '../lib/types';

// Run settings migration on service worker startup (C-01)
// Note: top-level await not available in service workers, use .catch() for error handling
migrateSettings().catch(error => {
  console.error('[G2O Background] Settings migration failed:', error);
});

/**
 * Messages targeted at the offscreen document are handled by its own
 * listener, not here.
 */
function isOffscreenMessage(message: unknown): boolean {
  return (
    message !== null &&
    typeof message === 'object' &&
    'target' in message &&
    message.target === 'offscreen'
  );
}

/**
 * Why a message must be refused, or null when it may be handled (M-02).
 */
function rejectionFor(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): string | null {
  if (!validateSender(sender)) {
    console.warn('[G2O Background] Rejected message from unauthorized sender');
    return 'Unauthorized';
  }

  // A throw here would otherwise escape the listener and leave the sender
  // hanging without a response, so treat it as invalid content
  try {
    if (!validateMessageContent(message)) {
      console.warn('[G2O Background] Invalid message content');
      return 'Invalid message content';
    }
  } catch (error) {
    console.warn('[G2O Background] Message validation threw:', getErrorMessage(error));
    return 'Invalid message content';
  }
  return null;
}

/** Reply to the sender, which may have gone away while we worked. */
function respondSafely(sendResponse: (response: unknown) => void, response: unknown): void {
  try {
    sendResponse(response);
  } catch {
    /* sender disconnected */
  }
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
    if (isOffscreenMessage(message)) {
      return false;
    }

    const rejection = rejectionFor(message, sender);
    if (rejection) {
      sendResponse({ success: false, error: rejection });
      return false;
    }

    handleMessage(message, sender)
      .then(response => respondSafely(sendResponse, response))
      .catch(error => {
        console.error('[G2O Background] Error handling message:', error);
        respondSafely(sendResponse, { success: false, error: getErrorMessage(error) });
      });
    return true; // Indicates async response
  }
);

/**
 * Check if sender is a content script (tab) vs extension page (popup)
 */
function isContentScriptSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.tab !== undefined;
}

/**
 * Redact sensitive settings for content scripts.
 * Content scripts only need to know IF an API key is configured, not the key itself.
 */
function redactSettingsForContentScript(settings: ExtensionSettings): ContentScriptSettings {
  const { obsidianApiKey, ...syncSettings } = settings;
  return {
    ...syncSettings,
    isApiKeyConfigured: obsidianApiKey.length > 0,
  };
}

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const settings = await getSettings();

  switch (message.action) {
    case 'saveToOutputs':
      return handleMultiOutput(message.data, message.outputs, settings);

    case 'testConnection':
      return handleTestConnection(settings);

    case 'fetchImage':
      // Remote images the content script cannot fetch itself (CORS, issue #376).
      return handleFetchImage(message.url);

    case 'getSettings':
      // Security: Redact API key for content scripts (they run on third-party pages)
      return isContentScriptSender(sender) ? redactSettingsForContentScript(settings) : settings;

    default:
      return { success: false, error: 'Unknown action' };
  }
}

// Log when service worker starts
console.info('[G2O Background] Service worker started');
