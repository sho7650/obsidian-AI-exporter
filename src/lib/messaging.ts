/**
 * Chrome Runtime Messaging utility
 * Promise-based wrapper for chrome.runtime.sendMessage
 */

import type {
  ExtensionMessage,
  ContentScriptSettings,
  ErrorResponse,
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
  /**
   * Either the save result or the worker's rejection envelope. The union is
   * deliberate: a caller has to narrow with {@link isMultiOutputResponse}
   * before touching `results`, which is what stops a rejected message from
   * crashing the toast code (issue #467).
   */
  saveToOutputs: MultiOutputResponse | ErrorResponse;
}

/**
 * Whether a `saveToOutputs` answer is the real save result.
 *
 * The background replies `{ success: false, error }` — no `results` — when the
 * sender is unauthorized, the message fails validation, the action is unknown,
 * or the handler throws. The content script used to cast that envelope to a
 * save result and die on `results.map` (issue #467).
 */
export function isMultiOutputResponse(value: unknown): value is MultiOutputResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MultiOutputResponse>;
  return (
    Array.isArray(candidate.results) &&
    typeof candidate.allSuccessful === 'boolean' &&
    typeof candidate.anySuccessful === 'boolean'
  );
}

/**
 * The user-facing text for a `saveToOutputs` answer that is not a save result:
 * the worker's own error when it sent one, a generic line otherwise.
 */
export function describeUnexpectedResponse(value: unknown): string {
  const error = (value as Partial<ErrorResponse> | null | undefined)?.error;
  return typeof error === 'string' && error.length > 0
    ? error
    : 'Unexpected response from the extension background';
}

/**
 * Type-safe message sending
 *
 * The response type is the map entry for the action. Messages and replies stay
 * inside one extension, and the worker validates every incoming message
 * (validateMessageContent()), so the cast covers the success path. It does NOT
 * cover the worker's *rejection* envelope — that is why `saveToOutputs` is
 * typed as a union the caller must narrow (issue #467).
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
