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
import { generateNoteContent } from './note-generator';
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

/**
 * Look up an existing file for a conversation.
 *
 * Strategy (ordered by cost):
 * 1. Direct path: GET fullPath → verify frontmatter ID
 * 2. ID scan: listFiles(folder) → filter by ID suffix → verify frontmatter ID
 * 3. Not found
 */
export async function lookupExistingFile(
  client: ObsidianApiClient,
  fullPath: string,
  resolvedPath: string,
  note: ObsidianNote
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
  if (idSuffix && resolvedPath) {
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

  // 4. Generate full note content to get formatted new body
  const fullContent = generateNoteContent(note, settings);
  const fullParsed = parseFrontmatter(fullContent);
  if (!fullParsed) return null;

  // 5. Extract tail messages from the full new body
  const newMessages = extractTailMessages(fullParsed.body, existingCount);
  if (!newMessages) return null;

  // 6. Update frontmatter fields
  const timezone = settings.templateOptions.timezone ?? 'UTC';
  const updatedRaw = updateFrontmatter(parsed.raw, {
    modified: formatDateWithTimezone(new Date(), timezone),
    message_count: newTotal,
  });

  // 7. Rebuild: updated frontmatter + existing body + separator + new messages
  const content = updatedRaw + '\n' + parsed.body + '\n\n' + newMessages;

  return {
    content,
    messagesAppended: newTotal - existingCount,
  };
}
