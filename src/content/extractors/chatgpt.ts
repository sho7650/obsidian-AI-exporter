/**
 * ChatGPT Extractor
 *
 * Extracts conversations from ChatGPT (chatgpt.com).
 *
 * Deep Research reports are NOT extractable: ChatGPT renders them inside a
 * cross-origin sandboxed iframe, which a content script on chatgpt.com cannot
 * read (issue #283). They are detected and reported rather than silently
 * dropped — see {@link ChatGPTExtractor.buildConversationResult}.
 *
 * @see docs/design/DES-003-chatgpt-extractor.md
 */

import { BaseExtractor, type ScrollConfig } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import { generateHash } from '../../lib/hash';
import type { HarvestEntry } from '../../lib/scroll-manager';
import type { AIPlatform, ConversationMessage, ExtractionResult } from '../../lib/types';

import { SELECTORS } from './selectors/chatgpt';

/**
 * Selectors identifying a Deep Research report frame (issue #283).
 *
 * Deliberately NOT part of `SELECTORS` in `selectors/chatgpt.ts`: every entry
 * of a platform's shared selector group must match at least once for the live
 * E2E baseline to be writable, and requiring the ChatGPT test conversation to
 * contain a Deep Research report would block every baseline update (the #402
 * trap). These are detection-only and match nothing in an ordinary thread.
 *
 * The `title` is an internal string OpenAI can rename at any time, so the
 * sandbox host is tried as well.
 *
 * BOTH host spellings are listed, and that is not redundancy. Issue #283
 * recorded `connector_openai_deep_research…` with UNDERSCORES in 2026-07; a
 * live conversation on 2026-08-09 served `connector-openai-deep-research…`
 * with HYPHENS. The separator is evidently not stable, and an `*=` attribute
 * match is a plain substring test, so one spelling does not cover the other.
 */
const DEEP_RESEARCH_FRAME_SELECTORS = [
  'iframe[title="internal://deep-research"]',
  'iframe[src*="deep-research"][src*="oaiusercontent.com"]',
  'iframe[src*="deep_research"][src*="oaiusercontent.com"]',
] as const;

/**
 * ChatGPT conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt';

  /**
   * Apply user settings: enable/disable auto-scroll for virtualized history.
   */

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL formats:
   *   https://chatgpt.com/c/{uuid}
   *   https://chatgpt.com/g/{gpt-slug}/c/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    // Match /c/{uuid} pattern (works for both regular and custom GPT URLs)
    const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. document.title (via getPageTitle())
   * 2. First user message content (truncated to MAX_CONVERSATION_TITLE_LENGTH)
   * 3. Default title
   */
  getTitle(): string {
    return (
      this.getPageTitle() ??
      this.getFirstMessageTitle(SELECTORS.userMessage, 'Untitled ChatGPT Conversation')
    );
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Uses section[data-turn-id] to find conversation turns (with article fallback),
   * then extracts User/Assistant messages in DOM order
   * @see FR-002 in design document
   */
  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Find all conversation turns
    const turns = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);

    if (turns.length === 0) {
      console.warn('[G2O] No conversation turns found with primary selectors');
      return messages;
    }

    // Process each turn
    turns.forEach((turn, index) => {
      const role = this.turnRole(turn);

      if (role === 'user') {
        const content = this.extractUserContent(turn);
        if (content) {
          messages.push({
            id: `user-${index}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
      } else if (role === 'assistant') {
        const content = this.extractAssistantContent(turn);
        if (content) {
          messages.push({
            id: `assistant-${index}`,
            role: 'assistant',
            content,
            htmlContent: content,
            index: messages.length,
          });
        }
      }
    });

    return messages;
  }

  // ========== Deep Research (issue #283) ==========

  /**
   * How many Deep Research report frames are on the page.
   *
   * A frame is counted once even when it matches both selectors.
   */
  private countDeepResearchFrames(): number {
    const frames = new Set<Element>();
    for (const selector of DEEP_RESEARCH_FRAME_SELECTORS) {
      document.querySelectorAll(selector).forEach(frame => frames.add(frame));
    }
    return frames.size;
  }

  /**
   * Report unreadable Deep Research content instead of letting it vanish.
   *
   * The report body lives in a sandboxed iframe on another origin, so the turn
   * wrapping it extracts as empty and is dropped. Left alone that produces a
   * note holding the user's prompt and no answer — a note that looks complete
   * and is not. Two cases:
   *
   * - **Nothing but the report.** Refuse the save with an explanation; a note
   *   containing only the question is worse than no note.
   * - **A report among ordinary turns.** Save the rest and warn, so the parts
   *   that CAN be captured are not lost to an all-or-nothing failure.
   *
   * Inert when no report frame is present.
   */
  protected buildConversationResult(
    messages: ConversationMessage[],
    conversationId: string,
    title: string,
    source: AIPlatform
  ): ExtractionResult {
    const frames = this.countDeepResearchFrames();
    if (frames === 0) {
      return super.buildConversationResult(messages, conversationId, title, source);
    }

    console.info(`[G2O] ${frames} ChatGPT Deep Research frame(s) detected — content is unreadable`);
    const reports = frames === 1 ? 'report' : 'reports';

    if (!messages.some(message => message.role === 'assistant')) {
      return {
        success: false,
        error:
          `This ChatGPT Deep Research ${reports} cannot be exported: ChatGPT renders ` +
          `${frames === 1 ? 'it' : 'them'} inside a sandboxed iframe on another origin, ` +
          `which a browser extension is not allowed to read (issue #283). ` +
          `Nothing was saved, because the only remaining content was your own prompt.`,
      };
    }

    const result = super.buildConversationResult(messages, conversationId, title, source);
    if (!result.success) return result;
    return {
      ...result,
      warnings: [
        ...(result.warnings ?? []),
        `${frames} Deep Research ${reports} in this conversation ${
          frames === 1 ? 'was' : 'were'
        } not exported — ChatGPT renders ${frames === 1 ? 'it' : 'them'} in a sandboxed ` +
          `cross-origin iframe that cannot be read (issue #283). The rest of the ` +
          `conversation was saved.`,
      ],
    };
  }

  /**
   * Determine a turn's role from data-turn or a nested data-message-author-role.
   */
  private turnRole(turn: Element): string | null {
    const turnRole = turn.getAttribute('data-turn');
    const authorRole = turn
      .querySelector('[data-message-author-role]')
      ?.getAttribute('data-message-author-role');
    return turnRole || authorRole || null;
  }

  /**
   * Auto-scroll config: ChatGPT virtualizes the conversation (ADR-017).
   */
  protected getScrollConfig(): ScrollConfig {
    return {
      container: SELECTORS.scrollContainer,
      harvest: () => this.harvestWindow(),
    };
  }

  /**
   * Conversation-wide ordinal of a turn, from `data-testid="conversation-turn-N"`.
   *
   * N is numbered across the whole conversation and is not renumbered per
   * mounted window: measured on a live desktop session (2026-07-29, issue #353),
   * a mid-scroll window reported turns 17-21 while the top window reported 1-21.
   * That makes it a monotonic order index — the role Claude's `data-index` plays
   * — so accumulation can sort by it instead of relying on window stitching.
   *
   * Returns undefined when the attribute is absent or unparsable, in which case
   * ordering falls back to the merge itself (see `mergeWindow`).
   */
  private turnOrdinal(turn: Element): number | undefined {
    const match = turn.getAttribute('data-testid')?.match(/^conversation-turn-(\d+)$/);
    return match ? Number(match[1]) : undefined;
  }

  /**
   * Harvest the currently-mounted window as keyed messages.
   *
   * Keyed by the turn's stable uuid (data-turn-id, then data-message-id),
   * hashing content only as a last resort, so turns de-duplicate correctly as
   * scroll windows overlap.
   */
  private harvestWindow(): HarvestEntry<ConversationMessage>[] {
    const entries: HarvestEntry<ConversationMessage>[] = [];
    const turns = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);

    turns.forEach(turn => {
      const role = this.turnRole(turn);
      if (role !== 'user' && role !== 'assistant') return;

      const content =
        role === 'user' ? this.extractUserContent(turn) : this.extractAssistantContent(turn);
      if (!content) return;

      const key =
        turn.getAttribute('data-turn-id') ??
        turn.querySelector('[data-message-id]')?.getAttribute('data-message-id') ??
        `${role}-${generateHash(content)}`;

      entries.push({
        key,
        value: {
          id: key,
          role,
          content,
          htmlContent: role === 'assistant' ? content : undefined,
          index: 0, // re-indexed after accumulation
        },
        order: this.turnOrdinal(turn),
      });
    });

    return entries;
  }

  /**
   * Extract user message content (plain text)
   */
  private extractUserContent(turnElement: Element): string {
    // Find user message content within the turn
    const contentEl = this.queryWithFallback<HTMLElement>(SELECTORS.userMessage, turnElement);
    if (contentEl?.textContent) {
      return this.sanitizeText(contentEl.textContent);
    }

    // Fallback: try to get any .whitespace-pre-wrap content
    const fallbackEl = turnElement.querySelector('.whitespace-pre-wrap');
    if (fallbackEl?.textContent) {
      return this.sanitizeText(fallbackEl.textContent);
    }

    return '';
  }

  /**
   * Reasoning-summary label inside a thinking turn (e.g. "Thought for 47s",
   * "Thought for a few seconds").
   *
   * A gpt-*-thinking assistant turn renders short reasoning-summary
   * `.markdown.prose` blocks BEFORE this label and the real answer AFTER it.
   * The summaries and the answer share an identical wrapper structure, so this
   * localized button text is the only available boundary marker (see #281).
   *
   * The English branch requires the trailing "for" keyword so transient
   * control buttons like "Thinking…" / "Continue reasoning" are not matched,
   * while still accepting natural-language durations. Matching is best-effort:
   * unrecognized locales fall back to keeping every block, so the answer is
   * never dropped.
   */
  private static readonly REASONING_LABEL_PATTERN =
    /^(?:thought|thinking|reasoned|worked)\s+for\b|^(?:思考|考え)/i;

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * A single assistant turn can contain MULTIPLE `.markdown.prose` blocks
   * across separate `[data-message-id]` wrappers (issue #281). All answer
   * blocks are collected and joined in DOM order so later parts of the
   * response are not dropped. Reasoning-summary blocks preceding a
   * "Thought for Ns" label are excluded best-effort (Claude-consistent).
   *
   * All HTML is sanitized via DOMPurify to prevent XSS, and utm_source
   * parameters are stripped from citation URLs.
   * @see NFR-001-2 in design document
   */
  private extractAssistantContent(turnElement: Element): string {
    const markdownEls = this.queryAllWithFallback<HTMLElement>(
      SELECTORS.markdownContent,
      turnElement
    );

    if (markdownEls.length > 0) {
      const answerEls = this.selectAnswerBlocks(turnElement, markdownEls);
      return answerEls.map(el => this.sanitizeBlockHtml(el.innerHTML)).join('\n\n');
    }

    // Fallback: try assistantResponse selectors
    const assistantEl = this.queryWithFallback<HTMLElement>(
      SELECTORS.assistantResponse,
      turnElement
    );
    if (assistantEl) {
      return this.sanitizeBlockHtml(assistantEl.innerHTML);
    }

    return '';
  }

  /**
   * Clean citation URLs and sanitize a single content block's HTML.
   */
  private sanitizeBlockHtml(html: string): string {
    return sanitizeHtml(this.cleanCitationUrls(html));
  }

  /**
   * Choose which markdown blocks belong to the answer.
   *
   * With a single block, behavior is unchanged. With multiple blocks, a
   * "Thought for Ns" reasoning label (if detected) marks the boundary: only
   * blocks positioned after it are kept. If no label is found, or excluding
   * reasoning would leave nothing, all blocks are kept so the answer is never
   * lost (safety floor — degrades to "join everything").
   */
  private selectAnswerBlocks(turnElement: Element, blocks: HTMLElement[]): HTMLElement[] {
    if (blocks.length <= 1) {
      return blocks;
    }

    const reasoningLabel = this.findReasoningLabel(turnElement);
    if (!reasoningLabel) {
      return blocks;
    }

    const afterLabel = blocks.filter(
      block =>
        (reasoningLabel.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    );
    return afterLabel.length > 0 ? afterLabel : blocks;
  }

  /**
   * Find the reasoning-summary label button within an assistant turn.
   * Returns the first button whose text matches REASONING_LABEL_PATTERN,
   * or null when none is present (non-thinking response).
   */
  private findReasoningLabel(turnElement: Element): HTMLElement | null {
    const buttons = turnElement.querySelectorAll<HTMLElement>('button');
    for (const button of buttons) {
      const text = button.textContent?.trim() ?? '';
      if (ChatGPTExtractor.REASONING_LABEL_PATTERN.test(text)) {
        return button;
      }
    }
    return null;
  }

  /**
   * Clean utm_source parameter from citation URLs
   *
   * ChatGPT adds ?utm_source=chatgpt.com to citation URLs.
   * Uses DOM-level manipulation instead of regex for safety.
   * @see DES-003-chatgpt-extractor.md Section 8.2
   */
  private cleanCitationUrls(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('a[href]').forEach(el => {
      const anchor = el as HTMLAnchorElement;
      try {
        const url = new URL(anchor.href);
        if (url.searchParams.get('utm_source') === 'chatgpt.com') {
          url.searchParams.delete('utm_source');
          anchor.href = url.toString();
        }
      } catch {
        // malformed href — leave for DOMPurify to handle
      }
    });
    return doc.body.innerHTML;
  }
}
