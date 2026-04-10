# Phase 3: Append Mode — Architecture Design Document

**Document ID:** DES-003
**Status:** Draft
**Created:** 2026-02-25
**Prereq:** [REQ-003 Requirements](./phase3-append-mode-requirements.md)

## 1. Overview

オプトイン型の Append Mode を実装し、既存ファイルの内容を保護しつつ新しいメッセージだけを末尾に追記する。併せて Claude/ChatGPT/Perplexity のタイトル取得を `document.title` ベースに改善する。

### Design Principles

- **Safety first**: Appendパスで何か失敗すれば、既存の上書きフローにフォールバック。データ損失は絶対に起きない
- **No new dependencies**: YAML パーサーは regex ベースで実装（npm パッケージ不要）
- **Atomic writes**: 1回の PUT で完結（POST append + PATCH frontmatter の2段階操作は不採用）
- **Backward compatible**: デフォルト OFF。既存ユーザーの動作は変わらない

---

## 2. Module Structure

### 2.1 New Files

| File | Purpose |
|------|---------|
| `src/lib/frontmatter-parser.ts` | Regex-based YAML frontmatter parser (no library) |
| `src/lib/message-counter.ts` | Count messages in existing note across all 3 formats |
| `src/lib/append-utils.ts` | File lookup, diff calculation, content rebuilding |
| `test/lib/frontmatter-parser.test.ts` | ~15 tests |
| `test/lib/message-counter.test.ts` | ~15 tests |
| `test/lib/append-utils.test.ts` | ~20 tests |

### 2.2 Modified Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | `enableAppendMode: boolean` を `SyncSettings` に追加 |
| `src/lib/storage.ts` | デフォルト値・get/save に `enableAppendMode` 追加 |
| `src/lib/obsidian-api.ts` | `listFiles(directory)` メソッド追加 |
| `src/lib/constants.ts` | Append関連定数追加 |
| `src/background/obsidian-handlers.ts` | `handleSave()` に Append ブランチ追加 |
| `src/content/index.ts` | Toast 表示改善 (`messagesAppended` 活用) |
| `src/content/extractors/claude.ts` | `getTitle()` → `getPageTitle()` 優先 |
| `src/content/extractors/chatgpt.ts` | 同上 |
| `src/content/extractors/perplexity.ts` | 同上 |
| `src/popup/index.html` | Append Mode トグル追加 |
| `src/popup/index.ts` | トグル連携 |
| `src/_locales/en/messages.json` | i18n 文字列追加 |

---

## 3. Data Flow

### 3.1 Current Overwrite Flow

```
Content Script: handleSync()
  → conversationToNote(data, options)           → ObsidianNote (full)
  → sendMessage({ action: 'saveToOutputs' })

Background: handleSave(settings, note)
  → resolvePathTemplate(vaultPath)              → fullPath
  → client.getFile(fullPath)                    → existingContent | null
  → generateNoteContent(note, settings)         → full markdown
  → client.putFile(fullPath, content)           → HTTP PUT (overwrite)
```

### 3.2 New Append Flow

```
Background: handleSave(settings, note)
  → resolvePathTemplate(vaultPath)              → resolvedPath, fullPath

  IF settings.enableAppendMode AND type !== 'deep-research':
    TRY:
      → lookupExistingFile(client, fullPath, resolvedPath, note)
        Step 1: client.getFile(fullPath)        → direct path match?
        Step 2: client.listFiles(resolvedPath)  → ID suffix scan
        Step 3: getFile(matched) + verify frontmatter ID
      IF found:
        → buildAppendContent(existingContent, note, settings)
          1. parseFrontmatter(existingContent)  → { raw, fields, body }
          2. countExistingMessages(body)         → existingCount
          3. extractTailMessages(note.body, existingCount) → new messages
          4. updateFrontmatter(raw, { modified, message_count })
          5. Rebuild: updatedFrontmatter + existingBody + newMessages
        → client.putFile(foundPath, rebuiltContent)  → atomic PUT
        → return { success, messagesAppended: N }
    CATCH:
      → console.warn → fall through to overwrite

  // Existing overwrite flow (unchanged)
  → generateNoteContent(note, settings)
  → client.putFile(fullPath, content)
```

### 3.3 Why PUT (not POST append + PATCH)

Obsidian REST API は `POST /vault/{path}` (末尾追記) と `PATCH` (見出しベース部分更新) を提供するが、不採用の理由:

1. frontmatter更新（`modified`, `message_count`）はファイル先頭にあり、POST では不可能
2. POST + PATCH の2段階操作はレースコンディションのリスクがある
3. GET → 再構築 → PUT の1回操作が最も安全で決定論的

---

## 4. Component Design

### 4.1 frontmatter-parser.ts

```typescript
export interface ParsedFrontmatter {
  /** Raw frontmatter string including --- delimiters */
  raw: string;
  /** Parsed key-value pairs */
  fields: Record<string, string | string[]>;
  /** Body content after frontmatter */
  body: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Regex-based (no YAML library dependency).
 *
 * Handles: key: value pairs, tags list (  - item), quoted values
 * Returns null if no valid frontmatter found.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter | null;

/**
 * Update specific fields in raw frontmatter string.
 * Preserves all other fields and formatting.
 * Uses escapeYamlValue() from yaml-utils.ts.
 *
 * Only modifies lines matching the update keys.
 * Does NOT add missing keys (respects user's template options).
 */
export function updateFrontmatter(
  rawFrontmatter: string,
  updates: Record<string, string | number>
): string;
```

**Parse Algorithm:**

1. `content` が `---\n` で始まるか確認
2. 2番目の `---\n`（行頭）を探す → frontmatter ブロック分割
3. 各行をパース:
   - `key: value` → `fields[key] = value`（クォート除去）
   - `  - item` → 直前の key のリストに追加
4. `body` = closing `---` 以降（先頭空行を除去）

**Update Algorithm:**

1. frontmatter を行分割
2. 各 update key に対し、マッチする行 (`/^{key}\s*:/`) を新しい値で置換
3. 見つからない key は無視（追加しない）
4. 行を再結合して返す

### 4.2 message-counter.ts

```typescript
/**
 * Count conversation messages in a note body.
 * Supports all 3 message formats generated by formatMessage().
 */
export function countExistingMessages(body: string): number;

/**
 * Extract messages after skipCount from the note body.
 * Returns formatted markdown for only the tail messages.
 */
export function extractTailMessages(fullBody: string, skipCount: number): string;
```

**Detection Patterns** (based on `formatMessage()` output in `markdown.ts:364-398`):

| Format | Start Pattern | Regex |
|--------|--------------|-------|
| Callout | `> [!TYPE] Label` | `/^> \[!\w+\] (?:User\|Gemini\|Claude\|ChatGPT\|Perplexity\|Assistant)\b/gm` |
| Blockquote/Plain | `**Label:**` | `/^\*\*(?:User\|Gemini\|Claude\|ChatGPT\|Perplexity\|Assistant):\*\*/gm` |

**Count Algorithm:**

1. **前処理**: コードブロック（`` ``` ... ``` ``）内のコンテンツを除外する。fenced code block を正規表現 `/^```[^\n]*\n[\s\S]*?^```/gm` で検出し、ブロック内の行をカウント対象から除外する（偽陽性防止）。言語指定（```typescript 等）の行も含めて正確にマッチする
2. 除外済みテキストに対し `CALLOUT_PATTERN` でマッチ数を数える → `calloutCount`
3. `LABEL_PATTERN` でマッチ数を数える → `labelCount`
4. `calloutCount > 0` なら `calloutCount` を返す（callout形式を検出）
5. それ以外は `labelCount` を返す（blockquote/plain形式）

**extractTailMessages Algorithm:**

1. body を行配列に分割
2. 各行を走査し、メッセージ開始パターン（上記regex）にマッチする行のインデックスを記録。**コードブロック内の行はスキップ**する
3. `skipCount` 番目のメッセージ開始位置以降の行をすべて結合して返す
4. メッセージ間の空行（`\n\n` separator）も保持

### 4.3 append-utils.ts

```typescript
export interface FileLookupResult {
  found: boolean;
  path: string;
  content: string;
  matchType: 'direct' | 'id-scan' | 'none';
}

export interface AppendResult {
  content: string;           // 再構築されたファイル全体
  messagesAppended: number;
}

/**
 * Look up an existing file for a conversation.
 *
 * Strategy (ordered by cost):
 * 1. Direct path: GET /vault/{fullPath} → verify frontmatter ID
 * 2. ID scan: listFiles(folder) → filter by ID suffix → verify frontmatter ID
 * 3. Not found
 */
export async function lookupExistingFile(
  client: ObsidianApiClient,
  fullPath: string,
  resolvedPath: string,
  note: ObsidianNote
): Promise<FileLookupResult>;

/**
 * Build appended file content.
 * Returns null if no new messages to append.
 */
export function buildAppendContent(
  existingContent: string,
  note: ObsidianNote,
  settings: ExtensionSettings
): AppendResult | null;

/**
 * Extract ID suffix from filename.
 * Extracts the portion after the last hyphen, excluding ".md" extension.
 * e.g., "my-chat-abc12345.md" → "abc12345"
 * e.g., "conversation-xy.md" → "xy"
 *
 * Implementation: fileName.replace(/\.md$/, '').split('-').pop()
 * Returns empty string if no hyphen found.
 */
export function extractIdSuffix(fileName: string): string;
```

**File Lookup Detail:**

```
Step 1 — Direct Path (1 HTTP request):
  content = getFile(fullPath)
  IF content !== null:
    parsed = parseFrontmatter(content)
    IF parsed?.fields.id === note.frontmatter.id:
      return { found: true, path: fullPath, content, matchType: 'direct' }

Step 2 — ID Scan (2-3 HTTP requests):
  idSuffix = extractIdSuffix(note.fileName)  // 8-char suffix
  files = listFiles(resolvedPath)
  FOR file IN files:
    IF file.endsWith(`-${idSuffix}.md`):
      matchedPath = `${resolvedPath}/${file}`
      content = getFile(matchedPath)
      parsed = parseFrontmatter(content)
      IF parsed?.fields.id === note.frontmatter.id:
        return { found: true, path: matchedPath, content, matchType: 'id-scan' }

Step 3 — Not Found:
  return { found: false, path: fullPath, content: '', matchType: 'none' }
```

**buildAppendContent Detail:**

```
1. parsed = parseFrontmatter(existingContent)
   IF null → return null (cannot parse, caller falls back to overwrite)

2. existingCount = countExistingMessages(parsed.body)
3. IF existingCount === 0 → return null (境界検出不能、caller falls back to overwrite)
4. newTotal = note.frontmatter.message_count

5. IF newTotal <= existingCount → return null (no new messages)

6. newMessages = extractTailMessages(note.body, existingCount)
7. updatedRaw = updateFrontmatter(parsed.raw, {
     modified: new Date().toISOString(),
     message_count: newTotal
   })

8. rebuiltContent = updatedRaw + '\n' + parsed.body + '\n\n' + newMessages
9. return { content: rebuiltContent, messagesAppended: newTotal - existingCount }
```

### 4.4 obsidian-api.ts — listFiles()

**API 確認済み**: [Obsidian Local REST API OpenAPI spec](https://coddingtonbear.github.io/obsidian-local-rest-api/openapi.yaml) にて `GET /vault/{pathToDirectory}/` のレスポンス形式を確認。

```typescript
/**
 * List files in a vault directory.
 * Uses GET /vault/{directory}/ endpoint.
 * Returns empty array if directory doesn't exist (404).
 *
 * API Response (verified):
 *   200: { "files": ["mydocument.md", "somedirectory/"] }
 *   404: { "errorCode": number, "message": string }
 *
 * Note: Empty directories are not included in the response.
 * Subdirectories are denoted with a trailing slash.
 */
async listFiles(directory: string): Promise<string[]> {
  // GET /vault/{encodedDirectory}/
  // Accept: application/json
  // Response: { "files": ["file.md", "subdir/"] }
  // Filter out directories (entries ending with '/')
}
```

---

## 5. Type Changes

### types.ts

```typescript
// SyncSettings に追加 (L164-171)
export interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
  outputOptions: OutputOptions;
  enableAutoScroll: boolean;
  enableAppendMode: boolean;   // ← NEW
}
```

`SaveResponse.messagesAppended` は既に定義済み（L227）。変更不要。

---

## 6. Settings Integration

### storage.ts

```typescript
// DEFAULT_SYNC_SETTINGS (L40-46)
const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  ...existing,
  enableAppendMode: false,  // ← NEW
};

// getSettings() (L66-81) — enableAppendMode 取得追加
// saveSettings() (L94-141) — enableAppendMode 保存追加
```

### popup/index.html

Extraction セクション（Auto-scroll の直後）に Append Mode トグルを追加:

```html
<label class="toggle-row">
  <span class="toggle-icon">📎</span>
  <span class="toggle-label">
    <span data-i18n="settings_enableAppendMode">Append Mode</span>
    <span class="toggle-sublabel" data-i18n="settings_appendModeHelp">
      Only add new messages to existing notes
    </span>
  </span>
  <span class="toggle-switch">
    <input type="checkbox" id="enableAppendMode" role="switch" />
    <span class="slider" aria-hidden="true"></span>
  </span>
</label>
```

### popup/index.ts

- `populateForm()`: `elements.enableAppendMode.checked = settings.enableAppendMode ?? false`
- `collectSettings()`: `enableAppendMode: elements.enableAppendMode.checked`

### i18n (messages.json)

```json
"settings_enableAppendMode": { "message": "Append Mode" },
"settings_appendModeHelp": { "message": "Only add new messages to existing notes" },
"toast_appended": { "message": "$1 new message(s) appended" },
"toast_noNewMessages": { "message": "No new messages to append" }
```

---

## 7. Background Handler Integration

### obsidian-handlers.ts — handleSave()

```typescript
export async function handleSave(
  settings: ExtensionSettings,
  note: ObsidianNote
): Promise<SaveResponse> {
  const client = createObsidianClient(settings);
  if (isClientError(client)) return { success: false, error: client.error };

  const resolvedPath = resolvePathTemplate(settings.vaultPath, {
    platform: note.frontmatter.source,
  });
  const fullPath = resolvedPath ? `${resolvedPath}/${note.fileName}` : note.fileName;

  // === APPEND MODE BRANCH ===
  if (settings.enableAppendMode && note.frontmatter.type !== 'deep-research') {
    try {
      const lookup = await lookupExistingFile(client, fullPath, resolvedPath, note);
      if (lookup.found) {
        const appendResult = buildAppendContent(lookup.content, note, settings);
        if (appendResult !== null) {
          await client.putFile(lookup.path, appendResult.content);
          return {
            success: true,
            isNewFile: false,
            messagesAppended: appendResult.messagesAppended,
          };
        }
        // No new messages
        return { success: true, isNewFile: false, messagesAppended: 0 };
      }
      // File not found → fall through to create new
    } catch (error) {
      console.warn('[G2O Background] Append mode failed, falling back to overwrite:', error);
      // Fall through to overwrite
    }
  }

  // === EXISTING OVERWRITE FLOW (unchanged) ===
  const existingContent = await client.getFile(fullPath);
  const isNewFile = existingContent === null;
  const content = generateNoteContent(note, settings);
  await client.putFile(fullPath, content);
  return { success: true, isNewFile };
}
```

---

## 8. Title Extraction Changes

3つの extractor の `getTitle()` を変更:

```typescript
// Claude (claude.ts:168)
getTitle(): string {
  if (this.isDeepResearchVisible()) return this.getDeepResearchTitle();
  return this.getPageTitle()
    ?? this.getFirstMessageTitle(SELECTORS.userMessage, 'Untitled Claude Conversation');
}

// ChatGPT (chatgpt.ts:93)
getTitle(): string {
  return this.getPageTitle()
    ?? this.getFirstMessageTitle(SELECTORS.userMessage, 'Untitled ChatGPT Conversation');
}

// Perplexity (perplexity.ts:81)
getTitle(): string {
  return this.getPageTitle()
    ?? this.getFirstMessageTitle(SELECTORS.userQuery, 'Untitled Perplexity Conversation');
}
```

`getPageTitle()` (base.ts:365-374): `document.title` からプラットフォームサフィックスを除去し、プラットフォーム名のみの場合は null を返す。

---

## 9. Error Handling & Fallback

| Failure Mode | Behavior | Rationale |
|-------------|----------|-----------|
| Frontmatter parse fails | Fall back to overwrite | ファイル形式不明、安全に追記不可 |
| Message count = 0 (既存) | Fall back to overwrite | 境界検出不能 |
| new count < existing count | messagesAppended: 0 (no-op) | メッセージ削除は想定外、既存内容保護 |
| new count == existing count | messagesAppended: 0 (no-op) | 変更なし |
| listFiles() エラー | Fall back to overwrite | ディレクトリ未作成等 |
| ID scan で複数マッチ | 最初のマッチを使用 | 決定論的動作 |
| putFile() エラー | エラー伝播（現行と同じ） | API接続問題 |
| Deep Research type | 常に overwrite | 単一ドキュメントエクスポート |
| messageFormat 設定変更後の追記 | 新しいフォーマットで追記（混在許容） | 既存コンテンツの保護を優先。フォーマットの統一より安全性を重視 |

**フォーマット混在について**: ユーザーが `messageFormat` 設定を変更した後に追記する場合、既存メッセージは元のフォーマット（例: blockquote）を保持し、新規メッセージは現在の設定（例: callout）で追記される。これは既存コンテンツを一切変更しない Safety-first 原則の帰結であり、許容される動作とする。

**Logging**: `[G2O Background] Append mode:` プレフィックスで全操作をログ。

---

## 10. Performance

| Scenario | HTTP Requests | Typical Latency |
|----------|--------------|-----------------|
| Direct path match (most common) | 1 GET + 1 PUT | ~200ms |
| Title changed → ID scan | 1 GET (miss) + 1 GET (list) + 1 GET (match) + 1 PUT | ~500ms |
| File not found → new file | 1 GET (miss) + 1 GET (list, empty) + 1 PUT | ~400ms |
| Append OFF (overwrite) | 1 GET + 1 PUT | ~200ms (unchanged) |

---

## 11. Implementation Sequence

| # | Step | Dependencies | Parallelizable |
|---|------|-------------|---------------|
| 1 | Title extraction (3 extractors) | — | Yes |
| 2 | Types + Storage + UI | — | Yes |
| 3 | frontmatter-parser.ts + tests | — | Yes |
| 4 | message-counter.ts + tests | — | Yes |
| 5 | listFiles() API + tests | — | Yes |
| 6 | append-utils.ts + tests | 3, 4, 5 | — |
| 7 | handleSave() integration + tests | 2, 6 | — |
| 8 | Toast improvement | 7 | — |

Step 1〜5 は並行開発可能。

---

## 12. Test Strategy

### New Test Files (~50 tests)

- `test/lib/frontmatter-parser.test.ts` (~15): parse/update with various formats
- `test/lib/message-counter.test.ts` (~15): count/extract across all 3 message formats
- `test/lib/append-utils.test.ts` (~20): lookup, buildAppendContent, extractIdSuffix

### Modified Test Files (~18 tests)

- `test/lib/obsidian-api.test.ts` (+5): listFiles
- `test/background/index.test.ts` (+8): append mode branches
- `test/extractors/claude.test.ts` (+2): document.title priority
- `test/extractors/chatgpt.test.ts` (+2): document.title priority
- `test/extractors/perplexity.test.ts` (+1): document.title priority
