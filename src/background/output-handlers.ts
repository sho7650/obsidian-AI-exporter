/**
 * Output handlers for background service worker
 *
 * Handles file download, clipboard copy, and multi-output orchestration
 */

import { extractErrorMessage } from '../lib/error-utils';
import { BYTES_PER_MIB, DEFAULT_NOTE_SIZE_MIB } from '../lib/constants';
import { generateNoteContent } from '../lib/note-generator';
import { handleSave } from './obsidian-handlers';
import { resolveImagesForFile, stripImagePlaceholders } from '../lib/image-output';
import type {
  ExtensionSettings,
  ObsidianNote,
  OutputDestination,
  OutputResult,
  MultiOutputResponse,
  OffscreenClipboardMessage,
} from '../lib/types';

/** Note filename without its `.md` extension — the base for image filenames. */
function noteBaseName(fileName: string): string {
  return fileName.replace(/\.md$/i, '');
}

/** Runtime type guard for offscreen clipboard response */
function isClipboardWriteResponse(value: unknown): value is { success: boolean; error?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as Record<string, unknown>).success === 'boolean'
  );
}

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

/** Singleton promise to prevent concurrent offscreen document creation */
let offscreenCreationPromise: Promise<void> | null = null;

/**
 * Ensure offscreen document exists for clipboard operations.
 * Uses a singleton promise to prevent race conditions when
 * multiple clipboard operations are triggered concurrently.
 */
async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenCreationPromise) {
    return offscreenCreationPromise;
  }

  offscreenCreationPromise = (async () => {
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
  })();

  try {
    await offscreenCreationPromise;
  } finally {
    offscreenCreationPromise = null;
  }
}

/**
 * Save to Obsidian and return OutputResult with optional messagesAppended
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
      messagesAppended: result.messagesAppended,
      savedAs: result.savedAs,
      warning: result.warning,
    };
  } catch (error) {
    return {
      destination: 'obsidian',
      success: false,
      error: extractErrorMessage(error),
    };
  }
}

/** Chunk size for base64 conversion — bounds String.fromCharCode argument count. */
const BASE64_CHUNK_SIZE = 8192;

/**
 * Convert string to base64 with proper Unicode handling
 * Service Worker doesn't support Blob/URL.createObjectURL.
 * Converts in chunks: per-byte concatenation is quadratic on MB-sized notes,
 * while a single spread of the whole array would overflow the call stack.
 */
function stringToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE)));
  }
  return btoa(parts.join(''));
}

/**
 * Download a data URL as a file. Resolves with an error message on failure,
 * or null on success.
 */
function downloadDataUrl(url: string, filename: string): Promise<string | null> {
  return new Promise(resolve => {
    chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' }, id => {
      if (chrome.runtime.lastError) {
        resolve(chrome.runtime.lastError.message ?? 'Download failed');
      } else if (id === undefined) {
        resolve('Download failed');
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Download note as a file, plus each captured image as a separate file.
 * The markdown references images by filename only (issue #186).
 */
async function handleDownloadToFile(
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  try {
    const images = settings.enableImageExport ? (note.images ?? []) : [];
    const { body, files } =
      images.length > 0
        ? resolveImagesForFile(note.body, images, noteBaseName(note.fileName))
        : { body: stripImagePlaceholders(note.body), files: [] };

    const content = generateNoteContent({ ...note, body }, settings);
    const mdError = await downloadDataUrl(
      `data:text/markdown;charset=utf-8;base64,${stringToBase64(content)}`,
      note.fileName
    );
    if (mdError) {
      return { destination: 'file', success: false, error: mdError };
    }

    for (const file of files) {
      const imgError = await downloadDataUrl(
        `data:${file.mimeType};base64,${file.data}`,
        file.fileName
      );
      if (imgError) {
        return {
          destination: 'file',
          success: false,
          error: `Image download failed (${file.fileName}): ${imgError}`,
        };
      }
    }

    return { destination: 'file', success: true };
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
    // Clipboard output never references images: strip any placeholders so the
    // copied markdown stays clean (issue #186).
    const clipboardNote = { ...note, body: stripImagePlaceholders(note.body) };
    const content = generateNoteContent(clipboardNote, settings);

    await ensureOffscreenDocument();

    const clipboardMessage: OffscreenClipboardMessage = {
      action: 'clipboardWrite',
      target: 'offscreen',
      content,
    };
    const response: unknown = await chrome.runtime.sendMessage(clipboardMessage);

    scheduleOffscreenClose();

    if (isClipboardWriteResponse(response) && response.success) {
      return { destination: 'clipboard', success: true };
    } else {
      const error = isClipboardWriteResponse(response)
        ? (response.error ?? 'Clipboard write failed')
        : 'Clipboard write failed';
      return { destination: 'clipboard', success: false, error };
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
 * Handle multi-output operation
 * Executes all outputs in parallel, aggregates results
 */
/**
 * Every requested destination fails with the same message.
 *
 * A real save result rather than the worker's rejection envelope, so the
 * content script's toast and badge render it like any other failure — and, as
 * ADR-032 does for the scroll deadlines, the text names the setting to raise
 * (issue #467).
 */
function rejectOversizedNote(
  note: ObsidianNote,
  outputs: OutputDestination[],
  capMiB: number
): MultiOutputResponse {
  const sizeMiB = (note.body.length / BYTES_PER_MIB).toFixed(1);
  const error =
    `Note is ${sizeMiB} MiB, above the ${capMiB} MiB limit. ` +
    'Raise "Maximum note size" in Settings and sync again.';
  return {
    results: outputs.map(destination => ({ destination, success: false, error })),
    allSuccessful: false,
    anySuccessful: false,
  };
}

export async function handleMultiOutput(
  note: ObsidianNote,
  outputs: OutputDestination[],
  settings: ExtensionSettings
): Promise<MultiOutputResponse> {
  const capMiB = settings.maxNoteSizeMiB ?? DEFAULT_NOTE_SIZE_MIB;
  if (note.body.length > capMiB * BYTES_PER_MIB) {
    return rejectOversizedNote(note, outputs, capMiB);
  }

  const promises = outputs.map(dest => {
    switch (dest) {
      case 'obsidian':
        return handleSaveToObsidian(note, settings);
      case 'file':
        return handleDownloadToFile(note, settings);
      case 'clipboard':
        return handleCopyToClipboard(note, settings);
    }
  });

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
  const messagesAppended = results.find(r => r.destination === 'obsidian')?.messagesAppended;

  return {
    results,
    allSuccessful: results.every(r => r.success),
    anySuccessful: results.some(r => r.success),
    messagesAppended,
  };
}
