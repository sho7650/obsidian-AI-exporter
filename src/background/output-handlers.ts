/**
 * Output handlers for background service worker
 *
 * Handles file download, clipboard copy, and multi-output orchestration
 */

import { extractErrorMessage } from '../lib/error-utils';
import { generateNoteContent } from '../lib/note-generator';
import { handleSave } from './obsidian-handlers';
import type {
  ClipboardWriteResponse,
  ExtensionSettings,
  ObsidianNote,
  OutputDestination,
  OutputResult,
  MultiOutputResponse,
} from '../lib/types';

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
 * Save to Obsidian and return OutputResult with optional messagesAppended
 */
async function handleSaveToObsidian(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult & { messagesAppended?: number }> {
  try {
    const result = await handleSave(settings, note);
    return {
      destination: 'obsidian',
      success: result.success,
      error: result.error,
      messagesAppended: result.messagesAppended,
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

    const response = (await chrome.runtime.sendMessage({
      action: 'clipboardWrite',
      target: 'offscreen',
      content,
    })) as ClipboardWriteResponse | undefined;

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
export async function handleMultiOutput(
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

  // Extract messagesAppended from obsidian result (append mode)
  let messagesAppended: number | undefined;
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && outputs[index] === 'obsidian') {
      const obsidianResult = result.value as OutputResult & { messagesAppended?: number };
      messagesAppended = obsidianResult.messagesAppended;
    }
  });

  return {
    results,
    allSuccessful: results.every(r => r.success),
    anySuccessful: results.some(r => r.success),
    messagesAppended,
  };
}
