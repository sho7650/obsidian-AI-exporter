/**
 * Chrome Runtime Messaging utility
 * Promise-based wrapper for chrome.runtime.sendMessage
 */

import type {
  ExtensionMessage,
  ContentScriptSettings,
  SaveResponse,
  MultiOutputResponse,
} from './types';

/** User-friendly message for extension context invalidation */
const CONTEXT_INVALIDATED_MESSAGE = 'Extension context invalidated. Please reload the page.';

/**
 * Message response type mapping
 */
interface MessageResponseMap {
  getSettings: ContentScriptSettings;
  testConnection: { success: boolean; error?: string };
  saveToObsidian: SaveResponse;
  saveToOutputs: MultiOutputResponse;
  getExistingFile: string | null;
}

/**
 * Type-safe message sending
 *
 * Design Decision: Runtime validation is intentionally omitted here because:
 * 1. Messages originate from and are handled within the same extension
 * 2. The background service worker (src/background/index.ts) performs
 *    comprehensive validation via validateMessageContent() before processing
 * 3. Adding redundant validation would impact performance without security benefit
 *
 * The type assertion below is safe under these controlled conditions.
 */
/**
 * Check if the extension context is still valid.
 * After extension reload/update, content scripts survive but chrome.runtime.id
 * becomes undefined and API calls throw synchronously.
 */
function isExtensionContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export function sendMessage<K extends keyof MessageResponseMap>(
  message: ExtensionMessage & { action: K }
): Promise<MessageResponseMap[K]> {
  return new Promise((resolve, reject) => {
    // Guard against extension context invalidation (e.g. after extension reload/update)
    // Content scripts survive extension reloads but lose access to chrome.runtime.
    // chrome.runtime.id becomes undefined when context is invalidated, even though
    // chrome.runtime.sendMessage still exists as a function reference.
    if (!isExtensionContextValid()) {
      reject(new Error(CONTEXT_INVALIDATED_MESSAGE));
      return;
    }

    try {
      chrome.runtime.sendMessage(message, response => {
        // Guard against context invalidation during in-flight message
        if (!isExtensionContextValid()) {
          reject(new Error(CONTEXT_INVALIDATED_MESSAGE));
          return;
        }
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message ?? 'Unknown error';
          const isContextError = errorMsg.includes('Extension context invalidated');
          reject(new Error(isContextError ? CONTEXT_INVALIDATED_MESSAGE : errorMsg));
          return;
        }
        // Type assertion is safe: background validates all messages before responding
        // See: src/background/index.ts validateMessageContent()
        resolve(response as MessageResponseMap[K]);
      });
    } catch (error) {
      // chrome.runtime.sendMessage() can throw synchronously when context is invalidated
      const message = error instanceof Error ? error.message : String(error);
      const isContextError = message.includes('Extension context invalidated');
      reject(new Error(isContextError ? CONTEXT_INVALIDATED_MESSAGE : message));
    }
  });
}
