/**
 * Obsidian API handlers for background service worker
 *
 * Handles save, get, and connection test operations
 */

import { ObsidianApiClient } from '../lib/obsidian-api';
import { getErrorMessage } from '../lib/error-utils';
import { generateNoteContent } from '../lib/note-generator';
import {
  resolvePathTemplate,
  containsPathTraversal,
  getDateVariables,
  getSearchBasePath,
} from '../lib/path-utils';
import { lookupExistingFile, buildAppendContent } from '../lib/append-utils';
import { applyLineEnding } from '../lib/frontmatter-parser';
import { classifyNoteProbe, isSameConversation, type ProbeState } from '../lib/note-identity';
import { evaluateTruncationGuard } from '../lib/truncation-guard';
import { resolveImagesForObsidian, stripImagePlaceholders } from '../lib/image-output';
import { flattenLargeCallouts } from '../lib/callout-flatten';
import { base64ToBytes } from '../lib/image-utils';
import { collisionSuffix, candidateFileName } from '../lib/filename-collision';
import { validateObsidianUrl } from '../lib/validation';
import type { ExtensionSettings, ObsidianNote, SaveResponse } from '../lib/types';

/**
 * Create an ObsidianApiClient if API key is configured.
 * Returns the client or an error object.
 */
function createObsidianClient(settings: ExtensionSettings): ObsidianApiClient | { error: string } {
  if (!settings.obsidianApiKey) {
    return { error: 'API key not configured' };
  }
  // Defence-in-depth: re-validate URL from storage before sending Bearer token
  try {
    validateObsidianUrl(settings.obsidianUrl);
  } catch (error) {
    return { error: `Invalid Obsidian URL: ${getErrorMessage(error)}` };
  }
  return new ObsidianApiClient(settings.obsidianUrl, settings.obsidianApiKey);
}

/**
 * Type guard for client creation error
 */
function isClientError(client: ObsidianApiClient | { error: string }): client is { error: string } {
  return 'error' in client;
}

/**
 * Obsidian-only: flatten oversized callouts to plain text when enabled.
 * A huge single callout can hang Obsidian's renderer; downloaded markdown keeps
 * its callouts, so this runs only on the vault-save path.
 */
function maybeFlatten(content: string, settings: ExtensionSettings): string {
  return settings.flattenLargeCallouts
    ? flattenLargeCallouts(content, settings.maxCalloutLines)
    : content;
}

/**
 * conversationId → vault path where the conversation's note was last found
 * (append mode). Best-effort cache: after a calendar rollover the direct path
 * misses on every save and the fallback directory scan re-runs each time —
 * the memo turns that into a single GET. Service-worker restarts clear it;
 * misses simply fall back to the scan.
 */
const appendPathMemo = new Map<string, string>();

/** Bound memory: far above any realistic number of active conversations */
const APPEND_MEMO_MAX_ENTRIES = 100;

function rememberAppendPath(conversationId: string, path: string): void {
  if (appendPathMemo.size >= APPEND_MEMO_MAX_ENTRIES && !appendPathMemo.has(conversationId)) {
    appendPathMemo.clear();
  }
  appendPathMemo.set(conversationId, path);
}

/**
 * Try to append new messages to an existing file.
 * Returns a SaveResponse on success, or null to fall through to overwrite.
 */
async function tryAppendMode(
  client: ObsidianApiClient,
  settings: ExtensionSettings,
  note: ObsidianNote,
  fullPath: string,
  resolvedPath: string,
  searchBasePath: string
): Promise<SaveResponse | null> {
  if (!settings.enableAppendMode || note.frontmatter.type === 'deep-research') {
    return null;
  }

  try {
    const lookup = await lookupExistingFile(client, fullPath, resolvedPath, note, {
      searchBasePath,
      hintPath: appendPathMemo.get(note.frontmatter.id),
      filenameScheme: settings.templateOptions.filenameScheme,
    });
    if (!lookup.found) {
      // A miss is what sends the save down the fork path, so name the negative
      // rather than letting it vanish (issue #365).
      console.info('[G2O Background] Append lookup found no existing note', {
        id: note.frontmatter.id,
        missReason: lookup.missReason,
        directProbe: lookup.directProbe,
        searched: { direct: fullPath, base: searchBasePath },
      });
      return null;
    }
    rememberAppendPath(note.frontmatter.id, lookup.path);

    const refusal = refuseTruncatedOverwrite(
      note,
      classifyNoteProbe(lookup.content, note.frontmatter.id).messageCount
    );
    if (refusal) return refusal;

    const appendResult = buildAppendContent(lookup.content, note, settings);
    if (appendResult !== null) {
      // Flatten first, restore the file's own line ending last (ADR-026).
      // Reversing these two hands `flattenLargeCallouts()` lines ending in
      // '\r', which its header pattern cannot match past — the callout label
      // was dropped and a raw `[!TYPE] Label` left in the body, which in turn
      // made the message invisible to countExistingMessages() (#406, #407).
      const flattened = maybeFlatten(appendResult.content, settings);
      await client.putFile(lookup.path, applyLineEnding(flattened, appendResult.eol));
      return { success: true, isNewFile: false, messagesAppended: appendResult.messagesAppended };
    }
    return { success: true, isNewFile: false, messagesAppended: 0 };
  } catch (error) {
    console.warn('[G2O Background] Append mode failed, falling back to overwrite:', error);
    return null;
  }
}

/**
 * Save note to Obsidian vault
 *
 * When append mode is enabled and the file already exists,
 * only new messages are appended while preserving existing content.
 * Falls back to full overwrite if append fails.
 */
export async function handleSave(
  settings: ExtensionSettings,
  note: ObsidianNote
): Promise<SaveResponse> {
  const client = createObsidianClient(settings);
  if (isClientError(client)) {
    return { success: false, error: client.error };
  }

  try {
    const templateVariables: Record<string, string> = {
      platform: note.frontmatter.source,
      ...getDateVariables(new Date()),
    };
    const resolvedPath = resolvePathTemplate(settings.vaultPath, templateVariables);
    const searchBasePath = getSearchBasePath(settings.vaultPath, templateVariables);
    const fullPath = resolvedPath ? `${resolvedPath}/${note.fileName}` : note.fileName;

    if (containsPathTraversal(fullPath)) {
      return { success: false, error: 'Invalid file path' };
    }

    // Append mode does not handle images yet (v1): strip any image placeholders
    // from the appended content so no dangling `g2o-image://` tokens are written.
    const appendNote = note.body.includes('g2o-image://')
      ? { ...note, body: stripImagePlaceholders(note.body) }
      : note;
    const appendResult = await tryAppendMode(
      client,
      settings,
      appendNote,
      fullPath,
      resolvedPath,
      searchBasePath
    );
    if (appendResult) return appendResult;

    return await saveFreshNote(client, settings, note, resolvedPath, templateVariables);
  } catch (error) {
    console.error('[G2O Background] Save failed:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Write the note as a fresh (non-append) save: pick a name that does not
 * clobber a different conversation, write any images, then write the note.
 */
async function saveFreshNote(
  client: ObsidianApiClient,
  settings: ExtensionSettings,
  note: ObsidianNote,
  resolvedPath: string,
  templateVariables: Record<string, string>
): Promise<SaveResponse> {
  const target = await resolveCollisionFreePath(client, resolvedPath, note);
  if ('error' in target) {
    return { success: false, error: target.error };
  }
  if (target.renamed) {
    // The canonical name was taken by something we could not identify as ours.
    // This is the moment a duplicate note is born, so say exactly what each
    // rejected candidate held (issue #365).
    console.warn('[G2O Background] Filename collision: saved under an alternative name', {
      expectedId: note.frontmatter.id,
      savedAs: target.fileName,
      probes: target.probes,
    });
  }

  const refusal = refuseTruncatedOverwrite(note, target.existingMessageCount);
  if (refusal) return refusal;

  const { note: saveNote, failedImages } = await prepareNoteImages(
    client,
    settings,
    note,
    templateVariables
  );
  const flattenedBody = maybeFlatten(saveNote.body, settings);
  const content = generateNoteContent({ ...saveNote, body: flattenedBody }, settings);
  await client.putFile(target.path, content);

  const warning = imageWarning(failedImages);
  return {
    success: true,
    isNewFile: target.isNewFile,
    ...(target.renamed && { savedAs: target.fileName }),
    ...(warning && { warning }),
  };
}

/** Outcome of the image-writing pass: the note to save, plus any images lost. */
interface PreparedNote {
  note: ObsidianNote;
  /** File names of images that could not be written (issue #376) */
  failedImages: readonly string[];
}

/**
 * Build the user-facing warning for images that could not be written, or
 * undefined when every image succeeded.
 */
function imageWarning(failedImages: readonly string[]): string | undefined {
  if (failedImages.length === 0) return undefined;
  const noun = failedImages.length === 1 ? 'image' : 'images';
  return `${failedImages.length} ${noun} could not be saved: ${failedImages.join(', ')}`;
}

/**
 * For a fresh (non-append) save, write captured images to the vault and return
 * a note whose body embeds them via `![[filename]]` wikilinks. When image
 * export is disabled or there are no images, image placeholders are stripped.
 *
 * Image-write failures never block the note (DES-017 principle), but they are
 * no longer silent: the failed file names are returned so the caller can
 * surface them to the user (issue #376).
 */
async function prepareNoteImages(
  client: ObsidianApiClient,
  settings: ExtensionSettings,
  note: ObsidianNote,
  templateVariables: Record<string, string>
): Promise<PreparedNote> {
  const images = settings.enableImageExport ? (note.images ?? []) : [];
  if (images.length === 0) {
    const stripped = note.body.includes('g2o-image://')
      ? { ...note, body: stripImagePlaceholders(note.body) }
      : note;
    return { note: stripped, failedImages: [] };
  }

  const baseName = note.fileName.replace(/\.md$/i, '');
  const { body, files } = resolveImagesForObsidian(note.body, images, baseName);

  const imageDir = resolvePathTemplate(settings.imageVaultPath, templateVariables);
  const failedImages: string[] = [];
  for (const file of files) {
    const path = imageDir ? `${imageDir}/${file.fileName}` : file.fileName;
    if (containsPathTraversal(path)) {
      failedImages.push(file.fileName);
      continue;
    }
    try {
      await client.putBinaryFile(path, base64ToBytes(file.data), file.mimeType);
    } catch (error) {
      console.warn('[G2O Background] Image write failed:', file.fileName, error);
      failedImages.push(file.fileName);
    }
  }

  return { note: { ...note, body }, failedImages };
}

/** Probe attempts: original + hash suffix + a few counters for hash collisions */
const MAX_COLLISION_ATTEMPTS = 10;

interface WritableTarget {
  path: string;
  fileName: string;
  isNewFile: boolean;
  /** True when the original name was occupied by a different conversation */
  renamed: boolean;
  /** What each probed candidate name held, in probe order (issue #365). */
  probes: readonly ProbeOutcome[];
  /** `message_count` of the note being replaced, when it had one (#449). */
  existingMessageCount?: number;
}

/** What one candidate file name held when it was probed. */
interface ProbeOutcome {
  attempt: number;
  fileName: string;
  state: ProbeState;
  /** The id actually read from that file, when it had one. */
  foundId?: string;
}

/**
 * Refuse to replace a longer note with a capture that stopped early (#449).
 *
 * Returns the failure to hand back, or null when the write may proceed. Every
 * unknown fails open — see ADR-033 for why uncertainty is not policed here.
 */
function refuseTruncatedOverwrite(
  note: ObsidianNote,
  existingMessageCount: number | undefined
): SaveResponse | null {
  const verdict = evaluateTruncationGuard({
    truncated: note.truncated === true,
    incomingCount: note.frontmatter.message_count,
    existingCount: existingMessageCount,
  });

  if (!verdict.blocked) {
    if (verdict.countDropped) {
      console.info('[G2O Background] Message count dropped but the capture was complete', {
        id: note.frontmatter.id,
        incoming: note.frontmatter.message_count,
        existing: existingMessageCount,
      });
    }
    return null;
  }

  console.warn('[G2O Background] Refused to overwrite a longer note with a partial capture', {
    id: note.frontmatter.id,
    fileName: note.fileName,
    incoming: verdict.incomingCount,
    existing: verdict.existingCount,
  });
  return {
    success: false,
    error:
      `Save cancelled: this sync captured ${verdict.incomingCount} messages but the existing ` +
      `note has ${verdict.existingCount}. Auto-scroll stopped before reaching the top. Raise ` +
      `the auto-scroll timeouts in Settings, or scroll to the top of the conversation ` +
      `manually, then sync again.`,
  };
}

/**
 * Find a path this note may be written to without clobbering a DIFFERENT
 * conversation (issue #327: identically-titled conversations, e.g.
 * Perplexity repeating tasks, silently overwrote each other).
 *
 * A file is writable when it does not exist, or when its frontmatter id
 * matches this note's id (same conversation being re-saved). Files whose
 * frontmatter cannot be parsed are treated as foreign and protected.
 * Alternative names are deterministic per conversation (hash of its id),
 * so re-saves always land on the same file.
 */
async function resolveCollisionFreePath(
  client: ObsidianApiClient,
  resolvedPath: string,
  note: ObsidianNote
): Promise<WritableTarget | { error: string }> {
  const suffix = collisionSuffix(note.frontmatter.id);
  const probes: ProbeOutcome[] = [];

  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt++) {
    const fileName = candidateFileName(note.fileName, suffix, attempt);
    const path = resolvedPath ? `${resolvedPath}/${fileName}` : fileName;

    const existing = await client.getFile(path);
    const probe = classifyNoteProbe(existing, note.frontmatter.id);
    probes.push({ attempt, fileName, ...probe });

    if (probe.state === 'absent') {
      return { path, fileName, isNewFile: true, renamed: attempt > 0, probes };
    }
    if (isSameConversation(probe)) {
      return {
        path,
        fileName,
        isNewFile: false,
        renamed: attempt > 0,
        probes,
        existingMessageCount: probe.messageCount,
      };
    }
    // Occupied by a different conversation, or holding something we cannot
    // identify (empty / unparseable / no id): never overwrite — try the next
    // deterministic candidate. Which of those it was is now recorded, so a
    // duplicate reported from the field can be traced back to its cause.
  }

  console.warn('[G2O Background] Filename collision: no free name found', {
    expectedId: note.frontmatter.id,
    fileName: note.fileName,
    probes,
  });
  return {
    error:
      `filename collision: could not find a free name for '${note.fileName}' ` +
      `after ${MAX_COLLISION_ATTEMPTS} attempts`,
  };
}

/**
 * Test connection to Obsidian REST API
 */
export async function handleTestConnection(
  settings: ExtensionSettings
): Promise<{ success: boolean; error?: string }> {
  const client = createObsidianClient(settings);
  if (isClientError(client)) {
    return { success: false, error: client.error };
  }

  try {
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
  } catch (error) {
    console.error('[G2O Background] Test connection failed:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}
