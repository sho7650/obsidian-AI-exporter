# Phase 3: Append Mode — Requirements Specification

**Document ID:** REQ-003
**Status:** Draft
**Created:** 2026-02-25

## 1. Background

### Current Behavior

- Sync button saves the entire conversation as a new Obsidian note
- If the file already exists, it is **completely overwritten**
- `SaveResponse.messagesAppended` field exists in types but is unused
- `handleSave()` already calls `getFile()` to detect `isNewFile`, but does nothing with the existing content

### Problem

- Users who continue a conversation and re-sync lose the ability to keep only new messages
- Users who add manual notes, tags, or links in Obsidian lose their edits on re-sync
- No way to incrementally update a note without full replacement

## 2. Goals

1. **Append new messages** to an existing note without touching existing content
2. **Protect user edits** — frontmatter custom fields, body content, and any manual additions are preserved
3. **Update metadata** — `modified` date and `message_count` reflect the latest state
4. **Opt-in** — Append mode is a popup toggle (default OFF), preserving current overwrite behavior

## 3. User Stories

### US-1: Incremental Sync

> As a user, I want to continue a Gemini conversation, click Sync, and have only the new messages appended to my existing Obsidian note.

**Acceptance Criteria:**

- Existing note body is not modified
- New messages appear at the end of the file
- Toast shows "X new messages appended" (or "No new messages" if nothing to add)

### US-2: Protect Manual Edits

> As a user, I want my hand-written notes, tags, and links in the Obsidian file to be preserved when I re-sync.

**Acceptance Criteria:**

- User-added frontmatter fields (e.g., custom tags) are not removed
- Body content (including user-appended sections like `## Notes`) is untouched
- Only `modified` and `message_count` in frontmatter are updated

### US-3: Opt-in Toggle

> As a user, I want to enable/disable append mode in settings, so I can choose between overwrite and incremental sync.

**Acceptance Criteria:**

- Popup settings has an "Append mode" toggle (default: OFF)
- When OFF, behavior is identical to current (full overwrite)
- When ON, existing files trigger append logic

### US-4: File Identification

> As a user, I expect the extension to find the correct existing file for the current conversation, even if the filename doesn't exactly match.

**Acceptance Criteria:**

- Primary lookup: construct expected filename and check that path directly
- Fallback: list files in vault folder, find one whose frontmatter `id` matches `{source}_{conversationId}`
- If no match found, create a new file (normal save)

## 4. Functional Requirements

### FR-1: Append Mode Setting

| Field       | Value                                       |
| ----------- | ------------------------------------------- |
| Storage key | `enableAppendMode` in `ExtensionSettings`   |
| Type        | `boolean`                                   |
| Default     | `false`                                     |
| Location    | Popup settings (Advanced section)           |
| Sync        | `chrome.storage.sync`                       |

### FR-2: File Lookup Strategy

**Step 1 — Direct Path Match:**

1. Generate expected filename: `generateFileName(title, conversationId)` → e.g., `my-chat-abc12345.md`
2. Resolve vault path: `AI/{platform}/my-chat-abc12345.md`
3. `GET /vault/{path}` — if file exists, read frontmatter and verify `id` field matches `{source}_{conversationId}`
4. If verified → proceed to append

**Step 2 — Directory Search (fallback when Step 1 fails):**

1. `GET /vault/{folder}/` — list all `.md` files in the vault folder
2. Filter candidates: files whose name contains the ID suffix (8 chars from conversationId)
3. For each candidate, `GET /vault/{candidate}` and parse frontmatter `id` field
4. If `id === {source}_{conversationId}` → match found, proceed to append
5. If no match after exhausting candidates → treat as new file

**New API Client Method Required:**

```typescript
async listFiles(folderPath: string): Promise<string[]>
```

### FR-3: Message Count Diff

**Algorithm:**

1. Parse existing file to count conversation messages (count `> [!QUESTION]` and `> [!NOTE]` callout headers, or `**User:**` / `**Assistant:**` in plain/blockquote format)
2. Get current DOM message count from extractor
3. `newMessageCount = domMessageCount - existingMessageCount`
4. If `newMessageCount <= 0` → "No new messages", skip append
5. If `newMessageCount > 0` → extract last N messages from DOM, format as markdown, append

**Note:** This is a message-count-based approach. We assume messages are only **added** to the end of a conversation, never edited or deleted mid-stream (which matches how AI chat platforms work).

### FR-4: Append Logic

**When appending:**

1. Read existing file content
2. Parse and update frontmatter:
   - Update `modified` to current ISO timestamp
   - Update `message_count` to new total
   - **Preserve all other fields** (including user-added tags, custom fields)
3. Keep entire existing body as-is (do not modify, reformat, or reorder)
4. Append new messages (formatted per `TemplateOptions`) at the **end of the file**
5. `PUT /vault/{path}` with the combined content

**Frontmatter Update Rules:**

| Field           | Action                             |
| --------------- | ---------------------------------- |
| `id`            | Preserve (never change)            |
| `title`         | Preserve (keep original)           |
| `source`        | Preserve                           |
| `type`          | Preserve                           |
| `url`           | Preserve                           |
| `created`       | Preserve                           |
| `modified`      | **Update** to current timestamp    |
| `tags`          | **Preserve** (keep user additions) |
| `message_count` | **Update** to new total            |
| (user custom)   | **Preserve** (any unknown fields)  |

### FR-5: SaveResponse Enhancement

```typescript
export interface SaveResponse {
  success: boolean;
  error?: string;
  isNewFile?: boolean;
  messagesAppended?: number; // Now actually populated
  appendMode?: boolean;      // Whether append mode was used
}
```

### FR-6: Toast Feedback

| Scenario                          | Toast Message                          |
| --------------------------------- | -------------------------------------- |
| Append: new messages found        | "✓ {N} new messages appended"          |
| Append: no new messages           | "No new messages to append"            |
| Append: file not found (new save) | "✓ Saved as new note"                  |
| Append: frontmatter parse error   | "⚠ Could not parse existing file, saved as overwrite" |
| Append mode OFF (overwrite)       | Current behavior (no change)           |

## 5. Non-Functional Requirements

### NFR-1: Performance

- Directory listing + ID lookup should complete within 3 seconds for folders with up to 500 files
- If listing takes too long, fall back to direct path match only

### NFR-2: Safety

- Append mode must NEVER lose existing content
- If frontmatter parsing fails, fall back to full overwrite with a warning toast
- If message count detection is ambiguous, fall back to full overwrite

### NFR-3: Backwards Compatibility

- Default OFF ensures existing users see no behavior change
- Files created before append mode was enabled can still be appended to (frontmatter ID matching works retroactively)

## 6. Scope: Title Extraction Improvement

**Included in Phase 3 as a related improvement.**

### Current Issue

- Gemini: Gets title from DOM (sidebar/top bar) — good
- Claude, ChatGPT, Perplexity: Use `getFirstMessageTitle()` (first user message text) — not ideal
- `BaseExtractor.getPageTitle()` exists but is not the primary source for non-Gemini platforms

### Change

For Claude, ChatGPT, and Perplexity extractors:

1. **Primary:** Use `document.title` via `getPageTitle()` (strips platform suffix)
2. **Fallback:** Use `getFirstMessageTitle()` (current behavior)
3. **Gemini:** No change (keeps DOM-based title extraction)

This improves filename stability (titles from `document.title` are more stable than first-message extraction), which directly benefits append mode file lookup.

## 7. Out of Scope

- Content-level diffing (editing existing messages)
- Conflict resolution for concurrent edits
- Handlebars template system
- LLM auto-tagging
- Marker-based insertion points (e.g., `<!-- g2o-end -->`)
- File rename tracking (if user renames the file in Obsidian, append mode will not find it and creates a new file)

## 8. Open Questions

1. **Obsidian REST API directory listing** — Does `GET /vault/{folder}/` return a file list? Need to verify the actual API response format.
2. **Callout format detection** — When counting existing messages, should we support all 3 message formats (callout, plain, blockquote) or only the format currently configured?
3. **Deep Research notes** — Should append mode apply to Deep Research reports? These are single-document exports and typically don't have incremental updates.

## 9. Next Steps

After requirements approval:

1. `/sc:design` — Architecture design for append mode (module structure, data flow)
2. `/sc:workflow` — Implementation task breakdown
3. Implementation on a feature branch
