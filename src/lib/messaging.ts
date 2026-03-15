/**
 * Chrome Runtime Messaging utility
 * Promise-based wrapper for chrome.runtime.sendMessage
 */

import type {
  ExtensionMessage,
  ExtensionSettings,
  SaveResponse,
  MultiOutputResponse,
} from './types';

/** User-friendly message for extension context invalidation */
const CONTEXT_INVALIDATED_MESSAGE = 'Extension context invalidated. Please reload the page.';

/**
 * Message response type mapping
 */
interface MessageResponseMap {
  getSettings: ExtensionSettings;
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
export function sendMessage<K extends keyof MessageResponseMap>(
  message: ExtensionMessage & { action: K }
): Promise<MessageResponseMap[K]> {
  return new Promise((resolve, reject) => {
    // Guard against extension context invalidation (e.g. after extension reload/update)
    // Content scripts survive extension reloads but lose access to chrome.runtime
    if (!chrome.runtime?.sendMessage) {
      reject(new Error(CONTEXT_INVALIDATED_MESSAGE));
      return;
    }

    chrome.runtime.sendMessage(message, response => {
      // Guard against context invalidation during in-flight message
      if (!chrome.runtime) {
        reject(new Error(CONTEXT_INVALIDATED_MESSAGE));
        return;
      }
      if (chrome.runtime.lastError) {
        // Replace Chrome's terse "Extension context invalidated." with actionable message
        const errorMsg = chrome.runtime.lastError.message ?? 'Unknown error';
        const isContextInvalidated = errorMsg.includes('Extension context invalidated');
        reject(new Error(isContextInvalidated ? CONTEXT_INVALIDATED_MESSAGE : errorMsg));
        return;
      }
      // Type assertion is safe: background validates all messages before responding
      // See: src/background/index.ts validateMessageContent()
      resolve(response as MessageResponseMap[K]);
    });
  });
}
