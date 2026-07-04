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
    const lookup = await lookupExistingFile(
      client,
      fullPath,
      resolvedPath,
      note,
      searchBasePath,
      appendPathMemo.get(note.frontmatter.id)
    );
    if (!lookup.found) return null;
    rememberAppendPath(note.frontmatter.id, lookup.path);

    const appendResult = buildAppendContent(lookup.content, note, settings);
    if (appendResult !== null) {
      await client.putFile(lookup.path, appendResult.content);
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

    const appendResult = await tryAppendMode(
      client,
      settings,
      note,
      fullPath,
      resolvedPath,
      searchBasePath
    );
    if (appendResult) return appendResult;

    const existingContent = await client.getFile(fullPath);
    const isNewFile = existingContent === null;
    const content = generateNoteContent(note, settings);
    await client.putFile(fullPath, content);

    return { success: true, isNewFile };
  } catch (error) {
    console.error('[G2O Background] Save failed:', error);
    return { success: false, error: getErrorMessage(error) };
  }
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
