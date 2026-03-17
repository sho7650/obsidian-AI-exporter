/**
 * E2E Test Helpers
 *
 * Provides utilities for running full extraction pipeline tests with real HTML fixtures.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import type {
  ConversationData,
  ObsidianNote,
  ExtensionSettings,
  NoteFrontmatter,
} from '../../../src/lib/types';

import {
  loadFixture,
  setGeminiLocation,
  setClaudeLocation,
  setChatGPTLocation,
  setPerplexityLocation,
} from '../../fixtures/dom-helpers';
import { GeminiExtractor } from '../../../src/content/extractors/gemini';
import { ClaudeExtractor } from '../../../src/content/extractors/claude';
import { ChatGPTExtractor } from '../../../src/content/extractors/chatgpt';
import { PerplexityExtractor } from '../../../src/content/extractors/perplexity';
import { conversationToNote } from '../../../src/content/markdown';
import { generateNoteContent } from '../../../src/lib/note-generator';

// ESM environment __dirname resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fixture base directory
 */
const FIXTURE_BASE_PATH = resolve(__dirname, '../../fixtures/html');

/**
 * Fixed date for snapshot stabilization
 */
const FIXED_DATE = '2025-01-01T00:00:00.000Z';

/**
 * E2E pipeline execution result
 */
interface E2EPipelineResult {
  /** Extraction success flag */
  success: boolean;
  /** Extracted data (only on success) */
  conversationData: ConversationData | null;
  /** Converted note (only on success) */
  obsidianNote: ObsidianNote | null;
  /** Final Markdown output (only on success) */
  finalMarkdown: string | null;
  /** Error message (only on failure) */
  error?: string;
}

/**
 * Successful E2EPipelineResult (for Type Guard)
 */
interface E2EPipelineSuccessResult extends E2EPipelineResult {
  success: true;
  conversationData: ConversationData;
  obsidianNote: ObsidianNote;
  finalMarkdown: string;
}

/**
 * Message structure validation options
 */
interface MessageStructureOptions {
  /** Minimum message count */
  minCount: number;
  /** Require user message (default: true) */
  requireUser?: boolean;
  /** Require assistant message (default: true) */
  requireAssistant?: boolean;
}

/**
 * Frontmatter validation options
 */
interface FrontmatterValidationOptions {
  /** Whether this is Deep Research format */
  isDeepResearch?: boolean;
}

/**
 * Default E2E test settings
 */
const DEFAULT_E2E_SETTINGS: ExtensionSettings = {
  obsidianApiKey: 'test-api-key',
  obsidianUrl: 'http://127.0.0.1:27123',
  vaultPath: 'AI Conversations',
  templateOptions: {
    includeId: true,
    includeTitle: true,
    includeSource: true,
    includeDates: true,
    includeTags: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
  },
  outputOptions: {
    obsidian: true,
    file: false,
    clipboard: false,
  },
};

/**
 * Load HTML fixture file and load into DOM
 *
 * @param platform - 'gemini' | 'claude' | 'chatgpt'
 * @param fixtureName - File name (without extension)
 * @returns Loaded HTML string
 * @throws Error if fixture file does not exist
 */
function loadFixtureFile(
  platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity',
  fixtureName: string
): string {
  const fixturePath = resolve(FIXTURE_BASE_PATH, platform, `${fixtureName}.html`);

  let html: string;
  try {
    html = readFileSync(fixturePath, 'utf-8');
  } catch {
    throw new Error(
      `Fixture not found: ${fixturePath}\n` +
        `Please capture HTML from ${platform} and save to this path.\n` +
        `See test/fixtures/html/README.md for instructions.`
    );
  }

  loadFixture(html);
  return html;
}

/**
 * Set window.location for platform
 */
function setLocationForPlatform(
  platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity',
  conversationId: string
): void {
  switch (platform) {
    case 'gemini':
      setGeminiLocation(conversationId);
      break;
    case 'claude':
      setClaudeLocation(conversationId);
      break;
    case 'chatgpt':
      setChatGPTLocation(conversationId);
      break;
    case 'perplexity':
      setPerplexityLocation(conversationId);
      break;
  }
}

/**
 * Create extractor for platform
 */
function createExtractor(platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity') {
  switch (platform) {
    case 'gemini':
      return new GeminiExtractor();
    case 'claude':
      return new ClaudeExtractor();
    case 'chatgpt':
      return new ChatGPTExtractor();
    case 'perplexity':
      return new PerplexityExtractor();
  }
}

/**
 * Run full E2E pipeline
 *
 * Processing flow:
 * 1. Load HTML fixture → jsdom
 * 2. Set window.location
 * 3. Run Extractor
 * 4. Normalize dates (snapshot stabilization)
 * 5. conversationToNote conversion
 * 6. generateNoteContent final output
 */
export async function runE2EPipeline(
  platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity',
  fixtureName: string,
  conversationId: string,
  settings: ExtensionSettings = DEFAULT_E2E_SETTINGS
): Promise<E2EPipelineResult> {
  // Step 1-2: Load fixture and set location
  loadFixtureFile(platform, fixtureName);
  setLocationForPlatform(platform, conversationId);

  // Step 3: Create and run extractor
  const extractor = createExtractor(platform);
  const extractionResult = await extractor.extract();

  if (!extractionResult.success || !extractionResult.data) {
    return {
      success: false,
      conversationData: null,
      obsidianNote: null,
      finalMarkdown: null,
      error: extractionResult.error ?? 'Extraction failed',
    };
  }

  // Step 4: Normalize dates and ID (snapshot stabilization)
  extractionResult.data.extractedAt = new Date(FIXED_DATE);

  // Normalize ID for snapshot stability
  // Some extractors generate timestamp-based fallback IDs - replace with fixed ID
  extractionResult.data.id = conversationId;

  // Step 5: Convert to ObsidianNote
  const obsidianNote = conversationToNote(extractionResult.data, settings.templateOptions);

  // Step 5.5: Normalize frontmatter dates
  obsidianNote.frontmatter.created = FIXED_DATE;
  obsidianNote.frontmatter.modified = FIXED_DATE;

  // Step 6: Generate final Markdown
  const finalMarkdown = generateNoteContent(obsidianNote, settings);

  return {
    success: true,
    conversationData: extractionResult.data,
    obsidianNote,
    finalMarkdown,
  };
}

/**
 * Assert extraction success (Type Guard)
 *
 * On success, result type narrows to E2EPipelineSuccessResult
 */
export function assertExtractionSuccess(
  result: E2EPipelineResult
): asserts result is E2EPipelineSuccessResult {
  if (!result.success) {
    throw new Error(`Extraction failed: ${result.error}`);
  }
  if (!result.conversationData) {
    throw new Error('ConversationData is null despite success=true');
  }
  if (!result.obsidianNote) {
    throw new Error('ObsidianNote is null despite success=true');
  }
  if (!result.finalMarkdown) {
    throw new Error('Final markdown is null despite success=true');
  }
}

/**
 * Assert source platform
 */
export function assertSourcePlatform(
  data: ConversationData,
  expected: 'gemini' | 'claude' | 'chatgpt' | 'perplexity'
): void {
  if (data.source !== expected) {
    throw new Error(`Source mismatch: expected '${expected}', got '${data.source}'`);
  }
}

/**
 * Assert message structure
 */
export function assertMessageStructure(
  data: ConversationData,
  options: MessageStructureOptions
): void {
  const { minCount, requireUser = true, requireAssistant = true } = options;

  if (data.messages.length < minCount) {
    throw new Error(`Insufficient messages: expected >= ${minCount}, got ${data.messages.length}`);
  }

  if (requireUser) {
    const hasUser = data.messages.some(m => m.role === 'user');
    if (!hasUser) {
      throw new Error('No user messages found in conversation');
    }
  }

  if (requireAssistant) {
    const hasAssistant = data.messages.some(m => m.role === 'assistant');
    if (!hasAssistant) {
      throw new Error('No assistant messages found in conversation');
    }
  }
}

/**
 * Assert required frontmatter fields
 */
export function assertFrontmatterFields(
  note: ObsidianNote,
  options: FrontmatterValidationOptions = {}
): void {
  const { isDeepResearch = false } = options;

  const required: (keyof NoteFrontmatter)[] = [
    'id',
    'title',
    'source',
    'url',
    'created',
    'modified',
  ];

  for (const field of required) {
    if (!note.frontmatter[field]) {
      throw new Error(`Missing required frontmatter field: ${field}`);
    }
  }

  // Deep Research requires type field
  if (isDeepResearch && !note.frontmatter.type) {
    throw new Error('Missing required frontmatter field for deep-research: type');
  }

  if (!note.frontmatter.tags || note.frontmatter.tags.length === 0) {
    throw new Error('Frontmatter tags array is empty');
  }
}

/**
 * Assert callout format
 */
export function assertCalloutFormat(
  markdown: string,
  _platform: 'gemini' | 'claude' | 'chatgpt' | 'perplexity'
): void {
  if (!markdown.includes('> [!QUESTION]')) {
    throw new Error('User callout (> [!QUESTION]) not found in output');
  }

  if (!markdown.includes('> [!NOTE]')) {
    throw new Error('Assistant callout (> [!NOTE]) not found in output');
  }
}

/**
 * Assert Deep Research format
 */
export function assertDeepResearchFormat(data: ConversationData, markdown: string): void {
  if (data.type !== 'deep-research') {
    throw new Error(`Expected type 'deep-research', got '${data.type ?? 'undefined'}'`);
  }

  // If sources exist, References section is required
  if (data.links?.sources && data.links.sources.length > 0) {
    if (!markdown.includes('# References')) {
      throw new Error('Deep Research with sources missing "# References" section');
    }

    if (!markdown.match(/\[\^1\]:/)) {
      throw new Error('Footnote definition format [^1]: not found');
    }
  }
}
