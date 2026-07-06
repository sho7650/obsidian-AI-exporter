/**
 * Shared TypeScript types for Gemini to Obsidian extension
 */

/**
 * Supported AI platform identifiers
 */
export type AIPlatform = 'gemini' | 'claude' | 'perplexity' | 'chatgpt' | 'notebooklm';

/**
 * An image captured from a conversation (e.g. a Gemini-generated image).
 *
 * Image bytes are captured in the content script (blob: URLs are origin- and
 * context-scoped and cannot be fetched from the background service worker), so
 * they travel to the background as base64 over structured-clone message passing.
 */
export interface ExtractedImage {
  /** Stable id, unique within the conversation (e.g. "img-1") */
  readonly id: string;
  /** MIME type, e.g. "image/png" */
  readonly mimeType: string;
  /** Base64-encoded image bytes (no `data:` prefix) */
  readonly data: string;
  /** Alt text from the DOM (e.g. "（AI 生成）") */
  readonly alt: string;
  /** Original blob/URL (diagnostic only; not resolvable outside the page) */
  readonly sourceUrl?: string;
}

/**
 * Represents a single message in a conversation
 */
export interface ConversationMessage {
  /** Unique message identifier */
  id: string;
  /** Message author role */
  role: 'user' | 'assistant';
  /** Message content (plain text for user, may contain HTML for assistant) */
  content: string;
  /** Original HTML content (for assistant messages, used in HTML→Markdown conversion) */
  htmlContent?: string;
  /** Tool-use content (web search, code interpreter) — rendered as separate callout */
  toolContent?: string;
  /** Zero-based message order in conversation */
  index: number;
}

/**
 * Extracted conversation data
 */
export interface ConversationData {
  id: string;
  title: string;
  url: string;
  source: AIPlatform;
  type?: 'conversation' | 'deep-research';
  /** Deep Research link information (optional) */
  links?: DeepResearchLinks;
  messages: ConversationMessage[];
  /** Images captured from the conversation (e.g. Gemini-generated images) */
  images?: ExtractedImage[];
  extractedAt: Date;
  metadata: ConversationMetadata;
}

/**
 * Deep Research source information
 *
 * Design: Sources are stored in DOM order (0-based array).
 * Mapping to data-turn-source-index (1-based):
 *   data-turn-source-index="N" → sources[N-1]
 */
export interface DeepResearchSource {
  /** 0-based array index (DOM order) */
  index: number;
  /** Source URL */
  url: string;
  /** Source title */
  title: string;
  /** Domain name */
  domain: string;
}

/**
 * Deep Research links extraction result
 *
 * Design: Only sources array is stored. Inline citations are processed
 * during HTML→Markdown conversion using data-turn-source-index attribute.
 */
export interface DeepResearchLinks {
  /** Source list (DOM order, 0-based index) */
  sources: DeepResearchSource[];
}

/**
 * Additional metadata about the conversation
 */
export interface ConversationMetadata {
  /** Total number of messages */
  messageCount: number;
  /** Number of user messages */
  userMessageCount: number;
  /** Number of assistant (AI) messages */
  assistantMessageCount: number;
  /** Whether conversation contains code blocks */
  hasCodeBlocks: boolean;
  /** Estimated token count (reserved for future use - not currently calculated) */
  estimatedTokens?: number;
}

/**
 * Obsidian note structure
 */
export interface ObsidianNote {
  fileName: string;
  frontmatter: NoteFrontmatter;
  body: string;
  contentHash: string;
  /**
   * Images referenced by `g2o-image://{id}` placeholders in {@link body}.
   * Resolved per output destination in the background (Obsidian embed,
   * downloaded file, or stripped for clipboard).
   */
  images?: ExtractedImage[];
}

/**
 * YAML frontmatter fields
 */
export interface NoteFrontmatter {
  id: string;
  title: string;
  source: string;
  type?: string;
  url: string;
  created: string;
  modified: string;
  tags: string[];
  message_count: number;
}

/**
 * Output destination identifier
 */
export type OutputDestination = 'obsidian' | 'file' | 'clipboard';

/**
 * Output option settings
 * Manages enabled/disabled state for each output destination
 */
export interface OutputOptions {
  /** Save via Obsidian REST API */
  obsidian: boolean;
  /** Save as file to downloads folder */
  file: boolean;
  /** Copy to system clipboard */
  clipboard: boolean;
}

/**
 * Result of a single output operation
 */
export interface OutputResult {
  destination: OutputDestination;
  success: boolean;
  error?: string;
  /** Number of messages appended (Obsidian append mode only) */
  messagesAppended?: number;
  /**
   * Actual file name used when the intended name was occupied by a
   * DIFFERENT conversation (filename collision safeguard, issue #327).
   */
  savedAs?: string;
}

/**
 * Response from offscreen clipboard write operation
 */
export interface ClipboardWriteResponse {
  success: boolean;
  error?: string;
}

/**
 * Aggregated result of multiple output operations
 */
export interface MultiOutputResponse {
  results: OutputResult[];
  /** Whether all outputs succeeded */
  allSuccessful: boolean;
  /** Whether at least one output succeeded */
  anySuccessful: boolean;
  /** Number of messages appended (append mode only) */
  messagesAppended?: number;
}

/**
 * Secure settings (stored in local storage)
 * Sensitive data like API keys are stored locally, not synced
 */
export interface SecureSettings {
  obsidianApiKey: string;
}

/**
 * Sync settings (stored in sync storage)
 * Non-sensitive data that can be synced across devices
 */
export interface SyncSettings {
  obsidianUrl: string;
  vaultPath: string;
  templateOptions: TemplateOptions;
  outputOptions: OutputOptions;
  /** Enable auto-scroll to load all messages in long conversations (e.g. Gemini) */
  enableAutoScroll: boolean;
  /** Enable append mode to only add new messages to existing notes */
  enableAppendMode: boolean;
  /** Include tool-use / intermediate content (e.g., web search results) */
  enableToolContent: boolean;
  /** Export conversation images (Obsidian vault + file download). */
  enableImageExport: boolean;
  /**
   * Vault-relative folder for exported images. Supports the same template
   * tokens as {@link vaultPath} (`{platform}`, `{YYYY}`, …). Default
   * `AI/{platform}/images`. Obsidian resolves attachments by filename, so the
   * note's wikilink embeds need only the filename regardless of this folder.
   */
  imageVaultPath: string;
  /**
   * Obsidian-only: flatten callouts longer than {@link maxCalloutLines} to
   * plain text when saving to the vault. A very long message rendered as one
   * giant callout can hang Obsidian's renderer; downloaded markdown is
   * unaffected. Default true.
   */
  flattenLargeCallouts: boolean;
  /** Line threshold for {@link flattenLargeCallouts}. Default 200. */
  maxCalloutLines: number;
}

/**
 * Extension settings stored in chrome.storage
 * Combined interface merging SecureSettings and SyncSettings
 */
export interface ExtensionSettings extends SecureSettings, SyncSettings {}

/**
 * Settings returned to content scripts (API key redacted)
 *
 * Security: Content scripts run inside third-party pages and should
 * never receive the actual API key. They only need to know whether
 * a key is configured (boolean flag).
 */
export interface ContentScriptSettings extends SyncSettings {
  isApiKeyConfigured: boolean;
}

/**
 * Template customization options
 */
export interface TemplateOptions {
  /** Include conversation ID in frontmatter */
  includeId: boolean;
  /** Include title in frontmatter */
  includeTitle: boolean;
  /** Include tags in frontmatter */
  includeTags: boolean;
  /** Include source platform in frontmatter */
  includeSource: boolean;
  /** Include created/modified dates in frontmatter */
  includeDates: boolean;
  /** Include message count in frontmatter */
  includeMessageCount: boolean;
  /** Message formatting style */
  messageFormat: 'callout' | 'plain' | 'blockquote';
  /** Callout type for user messages (e.g., 'QUESTION') */
  userCalloutType: string;
  /** Callout type for assistant messages (e.g., 'NOTE') */
  assistantCalloutType: string;
  /**
   * Prepend an `##` header derived from the user message before each user
   * callout/blockquote/plain block. Enables Obsidian TOC navigation in long
   * conversations. Defaults to false (issue #187).
   */
  includeQuestionHeaders?: boolean;
  /** IANA timezone for created/modified dates (e.g., 'Asia/Tokyo'). Defaults to 'UTC'. */
  timezone?: string;
}

/**
 * Message types for chrome.runtime communication
 */
export type ExtensionMessage =
  | { action: 'saveToOutputs'; data: ObsidianNote; outputs: OutputDestination[] }
  | { action: 'getSettings' }
  | { action: 'testConnection' };

/**
 * Message sent from the background worker to the offscreen document.
 * Kept separate from ExtensionMessage: the background listener routes
 * `target: 'offscreen'` messages away before validation.
 */
export interface OffscreenClipboardMessage {
  action: 'clipboardWrite';
  target: 'offscreen';
  content: string;
}

/**
 * Response from background service worker
 */
export interface SaveResponse {
  success: boolean;
  error?: string;
  isNewFile?: boolean;
  messagesAppended?: number;
  /** Actual file name when a collision forced an alternative (issue #327) */
  savedAs?: string;
}

/**
 * Extraction result from content script
 */
export interface ExtractionResult {
  success: boolean;
  data?: ConversationData;
  error?: string;
  warnings?: string[];
}

/**
 * Validation result for extraction quality
 */
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Interface for AI platform extractors
 */
export interface IConversationExtractor {
  readonly platform: AIPlatform;
  canExtract(): boolean;
  extract(): Promise<ExtractionResult>;
  getConversationId(): string | null;
  getTitle(): string;
  extractMessages(): ConversationMessage[];
  validate(result: ExtractionResult): ValidationResult;
  applySettings(settings: SyncSettings): void;
}
