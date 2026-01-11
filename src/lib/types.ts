/**
 * Shared TypeScript types for Gemini to Obsidian extension
 */

/**
 * Represents a single message in a conversation
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  htmlContent?: string;
  timestamp?: Date;
  index: number;
}

/**
 * Extracted conversation data
 */
export interface ConversationData {
  id: string;
  title: string;
  url: string;
  source: 'gemini' | 'claude' | 'perplexity';
  type?: 'conversation' | 'deep-research';
  messages: ConversationMessage[];
  extractedAt: Date;
  metadata: ConversationMetadata;
}

/**
 * Additional metadata about the conversation
 */
export interface ConversationMetadata {
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  hasCodeBlocks: boolean;
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
 * セキュア設定（local storage用）
 * API Keyなどの機密データはsyncではなくlocalに保存
 */
export interface SecureSettings {
  obsidianApiKey: string;
}

/**
 * 同期設定（sync storage用）
 * 非機密データはデバイス間同期可能
 */
export interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
}

/**
 * Extension settings stored in chrome.storage
 * SecureSettingsとSyncSettingsの統合インターフェース
 */
export interface ExtensionSettings extends SecureSettings, SyncSettings {
  openaiApiKey?: string;
  enableAutoTags?: boolean;
}

/**
 * Template customization options
 */
export interface TemplateOptions {
  includeId: boolean;
  includeTitle: boolean;
  includeTags: boolean;
  includeSource: boolean;
  includeDates: boolean;
  includeMessageCount: boolean;
  messageFormat: 'callout' | 'plain' | 'blockquote';
  userCalloutType: string;
  assistantCalloutType: string;
  customFrontmatter?: Record<string, string>;
}

/**
 * Message types for chrome.runtime communication
 */
export type ExtensionMessage =
  | { action: 'saveToObsidian'; data: ObsidianNote }
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
  readonly platform: 'gemini' | 'claude' | 'perplexity';
  canExtract(): boolean;
  extract(): Promise<ExtractionResult>;
  getConversationId(): string | null;
  getTitle(): string;
  extractMessages(): ConversationMessage[];
  validate(result: ExtractionResult): ValidationResult;
}
