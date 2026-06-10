/**
 * Append mode utilities
 *
 * Core logic for looking up existing files and building appended content.
 * Combines frontmatter-parser, message-counter, and obsidian-api.
 */

import type { ObsidianApiClient } from './obsidian-api';
import type { ObsidianNote, ExtensionSettings } from './types';
import { parseFrontmatter, updateFrontmatter } from './frontmatter-parser';
import { countExistingMessages, extractTailMessages } from './message-counter';
import { formatDateWithTimezone } from './date-utils';

/**
 * Result of file lookup for append mode
 */
interface FileLookupResult {
  found: boolean;
  path: string;
  content: string;
  matchType: 'direct' | 'id-scan' | 'none';
}

/**
 * Result of building appended content
 */
interface AppendResult {
  /** Rebuilt file content (frontmatter + existing body + new messages) */
  content: string;
  /** Number of new messages appended */
  messagesAppended: number;
}

/**
 * Extract ID suffix from filename.
 * Extracts the portion after the last hyphen, excluding ".md" extension.
 *
 * @example extractIdSuffix("my-chat-abc12345.md") → "abc12345"
 * @example extractIdSuffix("conversation.md") → ""
 */
export function extractIdSuffix(fileName: string): string {
  const base = fileName.replace(/\.md$/, '');
  const parts = base.split('-');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** Maximum depth for the recursive ID-scan to bound API calls. */
const RECURSIVE_SCAN_MAX_DEPTH = 6;

/**
 * Look up an existing file for a conversation.
 *
 * Strategy (ordered by cost):
 * 1. Direct path: GET fullPath → verify frontmatter ID
 * 2a. ID scan (flat): listFiles(resolvedPath) → filter by ID suffix → verify frontmatter ID
 * 2b. ID scan (recursive): when {@link searchBasePath} differs from resolvedPath
 *     (i.e. the vault-path template contains date variables), walk subdirectories
 *     from searchBasePath looking for `-{idSuffix}.md` matches. This lets append-mode
 *     find a previous-month file even when the current resolved path points at a
 *     not-yet-existing folder.
 * 3. Not found
 *
 * @param searchBasePath - Optional. When provided AND different from resolvedPath,
 *   triggers the recursive scan. Defaults to resolvedPath (preserves the legacy
 *   flat-scan behaviour for templates without date variables).
 */
export async function lookupExistingFile(
  client: ObsidianApiClient,
  fullPath: string,
  resolvedPath: string,
  note: ObsidianNote,
  searchBasePath: string = resolvedPath
): Promise<FileLookupResult> {
  const expectedId = note.frontmatter.id;

  // Step 1: Direct path match
  const directContent = await client.getFile(fullPath);
  if (directContent !== null) {
    const parsed = parseFrontmatter(directContent);
    if (parsed?.fields.id === expectedId) {
      return { found: true, path: fullPath, content: directContent, matchType: 'direct' };
    }
  }

  // Step 2: ID suffix scan
  const idSuffix = extractIdSuffix(note.fileName);
  if (!idSuffix) return { found: false, path: fullPath, content: '', matchType: 'none' };

  const useRecursive = searchBasePath !== resolvedPath && searchBasePath !== '';

  if (useRecursive) {
    const recursive = await recursiveIdScan(
      client,
      searchBasePath,
      idSuffix,
      expectedId,
      fullPath,
      RECURSIVE_SCAN_MAX_DEPTH
    );
    if (recursive) return recursive;
  } else if (resolvedPath) {
    const files = await client.listFiles(resolvedPath);
    for (const file of files) {
      if (file.endsWith(`-${idSuffix}.md`)) {
        const matchedPath = `${resolvedPath}/${file}`;
        if (matchedPath === fullPath) continue; // Already checked
        const content = await client.getFile(matchedPath);
        if (content !== null) {
          const parsed = parseFrontmatter(content);
          if (parsed?.fields.id === expectedId) {
            return { found: true, path: matchedPath, content, matchType: 'id-scan' };
          }
        }
      }
    }
  }

  // Step 3: Not found
  return { found: false, path: fullPath, content: '', matchType: 'none' };
}

/**
 * Walk subdirectories from baseDir up to maxDepth, looking for any `.md` file
 * whose name ends in `-{idSuffix}.md` and whose frontmatter id matches expectedId.
 * Returns the first match, or null when exhausted.
 */
async function recursiveIdScan(
  client: ObsidianApiClient,
  baseDir: string,
  idSuffix: string,
  expectedId: string,
  skipPath: string,
  maxDepth: number
): Promise<FileLookupResult | null> {
  type Frame = { dir: string; depth: number };
  const queue: Frame[] = [{ dir: baseDir, depth: 0 }];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift() as Frame;
    const entries = await client.listEntries(dir);
    for (const entry of entries) {
      if (entry.endsWith('/')) {
        if (depth + 1 <= maxDepth) {
          const subdir = entry.slice(0, -1);
          queue.push({ dir: `${dir}/${subdir}`, depth: depth + 1 });
        }
        continue;
      }
      if (!entry.endsWith(`-${idSuffix}.md`)) continue;
      const candidatePath = `${dir}/${entry}`;
      if (candidatePath === skipPath) continue;
      const content = await client.getFile(candidatePath);
      if (content === null) continue;
      const parsed = parseFrontmatter(content);
      if (parsed?.fields.id === expectedId) {
        return { found: true, path: candidatePath, content, matchType: 'id-scan' };
      }
    }
  }

  return null;
}

/**
 * Build appended file content.
 * Returns null if no new messages to append or cannot parse existing content.
 */
export function buildAppendContent(
  existingContent: string,
  note: ObsidianNote,
  settings: ExtensionSettings
): AppendResult | null {
  // 1. Parse existing frontmatter
  const parsed = parseFrontmatter(existingContent);
  if (!parsed) return null;

  // 2. Count existing messages
  const existingCount = countExistingMessages(parsed.body);
  if (existingCount === 0) return null; // Cannot detect message boundaries

  // 3. Compare counts
  const newTotal = note.frontmatter.message_count;
  if (newTotal <= existingCount) return null; // No new messages

  // 4. Extract tail messages from the new formatted body
  // (note.body is exactly what generateNoteContent would embed after the frontmatter)
  const newMessages = extractTailMessages(note.body, existingCount);
  if (!newMessages) return null;

  // 5. Update frontmatter fields
  const timezone = settings.templateOptions.timezone ?? 'UTC';
  const updatedRaw = updateFrontmatter(parsed.raw, {
    modified: formatDateWithTimezone(new Date(), timezone),
    message_count: newTotal,
  });

  // 6. Rebuild: updated frontmatter + existing body + separator + new messages
  const content = updatedRaw + '\n' + parsed.body + '\n\n' + newMessages;

  return {
    content,
    messagesAppended: newTotal - existingCount,
  };
}
