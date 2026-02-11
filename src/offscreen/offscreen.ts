/**
 * Offscreen Document Script
 * Handles clipboard operations that require DOM access
 *
 * Note: Offscreen documents can only use chrome.runtime API
 *
 * Implementation uses document.execCommand('copy') instead of navigator.clipboard.writeText()
 * because offscreen documents cannot be focused, and navigator.clipboard requires focus.
 * See: https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
 * See: https://github.com/GoogleChrome/developer.chrome.com/issues/4660
 */

import { extractErrorMessage } from '../lib/error-utils';

interface ClipboardWriteMessage {
  action: 'clipboardWrite';
  target: 'offscreen';
  content: string;
}

interface ClipboardWriteResponse {
  success: boolean;
  error?: string;
}

/**
 * Handle clipboard write request using document.execCommand
 *
 * This is the Chrome-recommended approach for clipboard operations in offscreen documents.
 * navigator.clipboard.writeText() fails with "Document is not focused" error
 * because offscreen documents cannot receive focus by design.
 */
function handleClipboardWrite(content: string): boolean {
  const textarea = document.querySelector('#clipboard-textarea') as HTMLTextAreaElement | null;

  if (!textarea) {
    throw new Error('Clipboard textarea element not found');
  }

  textarea.value = content;
  textarea.select();

  // execCommand is deprecated but is the only working method in offscreen documents
  const success = document.execCommand('copy');

  // Clear the textarea after copy
  textarea.value = '';

  return success;
}

/**
 * Message listener for clipboard operations
 */
chrome.runtime.onMessage.addListener(
  (
    message: ClipboardWriteMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ClipboardWriteResponse) => void
  ) => {
    // Only handle messages targeted at offscreen document
    if (message.action === 'clipboardWrite' && message.target === 'offscreen') {
      try {
        const success = handleClipboardWrite(message.content);
        if (success) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'execCommand copy failed' });
        }
      } catch (error) {
        sendResponse({
          success: false,
          error: extractErrorMessage(error),
        });
      }
      return true; // Indicates async response
    }
    return false;
  }
);

console.info('[G2O Offscreen] Document loaded');
