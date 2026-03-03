/**
 * Shared TypeScript types for Gemini to Obsidian extension
 */

/**
 * Supported AI platform identifiers
 */
export type AIPlatform = 'gemini' | 'claude' | 'perplexity' | 'chatgpt';

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
  /** Message timestamp (reserved for future use - not currently extracted) */
  timestamp?: Date;
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
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
  outputOptions: OutputOptions;
  /** Enable auto-scroll to load all messages in long conversations (e.g. Gemini) */
  enableAutoScroll: boolean;
  /** Enable append mode to only add new messages to existing notes */
  enableAppendMode: boolean;
  /** Include tool-use / intermediate content (e.g., web search results) */
  enableToolContent: boolean;
}

/**
 * Extension settings stored in chrome.storage
 * Combined interface merging SecureSettings and SyncSettings
 */
export interface ExtensionSettings extends SecureSettings, SyncSettings {
  /** OpenAI API key for AI-powered features (reserved for future use) */
  openaiApiKey?: string;
  /** Enable automatic tag generation (reserved for future use) */
  enableAutoTags?: boolean;
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
  /** Custom frontmatter fields (reserved for future use) */
  customFrontmatter?: Record<string, string>;
}

/**
 * Message types for chrome.runtime communication
 */
export type ExtensionMessage =
  | { action: 'saveToObsidian'; data: ObsidianNote }
  | { action: 'saveToOutputs'; data: ObsidianNote; outputs: OutputDestination[] }
  | { action: 'getExistingFile'; fileName: string; vaultPath: string }
  | { action: 'getSettings' }
  | { action: 'testConnection' };

/**
 * Response from background service worker
 */
export interface SaveResponse {
  success: boolean;
  error?: string;
  isNewFile?: boolean;
  messagesAppended?: number;
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
  applySettings(settings: ExtensionSettings): void;
}
