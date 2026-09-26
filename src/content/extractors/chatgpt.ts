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
import { ImageMarkerCollector } from '../image-markers';
import type {
  AIPlatform,
  ConversationMessage,
  ExtractionResult,
  SyncSettings,
} from '../../lib/types';

import { SELECTORS } from './selectors/chatgpt';

/**
 * The `<img>` of a generated image, current layout first (ADR-041, issue #515).
 *
 * - 2026-09: `[data-testid="generated-image-preview"] img` with a `blob:` src
 *   (docs/investigation/chatgpt-dom-2026-09.md). The widget carries no id.
 * - Legacy (measured 2026-09-22, docs/investigation/chatgpt-image-dom-structure.md):
 *   `div.group/imagegen-image#image-<uuid>` holding three `<img>` with one src —
 *   the visible one plus two `aria-hidden` duplicates for the crossfade and
 *   blurred backdrop — so only the visible one is captured.
 *
 * Deliberately NOT part of `SELECTORS`, for the same #402 reason as
 * {@link DEEP_RESEARCH_FRAME_SELECTORS}: the E2E baseline could then only be
 * written from a test conversation that contains a generated image.
 */
const GENERATED_IMAGE_SELECTOR = [
  '[data-testid="generated-image-preview"] img',
  '[class*="imagegen-image"] img:not([aria-hidden="true"])',
].join(', ');

/** Prefix of the legacy widget container's id; the remainder is the image's uuid. */
const IMAGE_WIDGET_ID_PREFIX = 'image-';

/**
 * How long the thread must rest at the top before auto-scroll may finish
 * (ADR-042). Since 2026-09 ChatGPT loads older turns only once the view reaches
 * the top: 69-138ms with the tab visible (measured live 2026-09-26), so 2s is a
 * ~15x margin that still costs a single pause per sync.
 */
const TOP_SETTLE_MS = 2000;

/** Carrier of the message ids an answer unit renders (2026-09 layout). */
const MESSAGE_IDS_ATTRIBUTE = 'data-chatgpt-search-message-ids';

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
 * The pre-2026-09 layout (issue #515): one `section[data-turn-id]` per message,
 * role on `data-turn` / `data-message-author-role`, body in `.markdown.prose`,
 * and a `conversation-turn-N` ordinal. Kept for users still on the old rollout.
 *
 * Deliberately NOT part of `SELECTORS`: the E2E baseline rejects zero-match
 * entries, and the live page no longer renders any of these (#402, the
 * Perplexity #464 precedent).
 */
const LEGACY_SELECTORS = {
  conversationTurn: ['section[data-turn-id]', 'section[data-testid^="conversation-turn"]'],
  userMessage: [
    '[data-message-author-role="user"] .whitespace-pre-wrap',
    'section[data-turn="user"] .whitespace-pre-wrap',
    '.user-message-bubble-color .whitespace-pre-wrap',
  ],
  assistantResponse: [
    '[data-message-author-role="assistant"] .markdown.prose',
    'section[data-turn="assistant"] .markdown.prose',
    '.markdown.prose.dark\\:prose-invert',
  ],
  markdownContent: ['.markdown.prose', '.markdown-new-styling'],
  scrollContainer: ['[data-scroll-root]', '[class*="not-print:overflow-y-auto"]'],
} as const;

/**
 * Lookups that run outside a single turn, so they cannot know the layout in
 * advance: try the current layout first, then the legacy one. Inside a turn the
 * layouts never mix, so content lookups use these lists too.
 */
const USER_MESSAGE_ANY_LAYOUT = [...SELECTORS.userMessage, ...LEGACY_SELECTORS.userMessage];
const MARKDOWN_ANY_LAYOUT = [...SELECTORS.markdownContent, ...LEGACY_SELECTORS.markdownContent];
const SCROLL_CONTAINER_ANY_LAYOUT = [
  ...SELECTORS.scrollContainer,
  ...LEGACY_SELECTORS.scrollContainer,
];

/** The mounted turns and which layout they use. */
interface MountedTurns {
  /** `pair`: one turn = prompt + answer (2026-09). `legacy`: one turn = one message. */
  layout: 'pair' | 'legacy';
  turns: HTMLElement[];
}

/**
 * ChatGPT conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt';

  /** Whether generated images are captured (set from settings before extract()) */
  enableImageExport = true;

  /**
   * Generated-image markers registered while turns are read, drained once the
   * messages are assembled. Ids come from the widget uuid, so the harvest that
   * revisits a turn per scroll window registers the same image, not a new one.
   */
  private readonly images = new ImageMarkerCollector();

  /** Apply the settings only this platform has; the shared ones live in BaseExtractor. */
  protected applyPlatformSettings(settings: SyncSettings): void {
    this.enableImageExport = settings.enableImageExport ?? true;
  }

  protected onExtractStart(): void {
    this.images.reset();
  }

  protected finalizeExtraction(result: ExtractionResult): Promise<ExtractionResult> {
    return this.images.attach(result);
  }

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
      this.getFirstMessageTitle(USER_MESSAGE_ANY_LAYOUT, 'Untitled ChatGPT Conversation')
    );
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation, in DOM order.
   *
   * The same turn → message reading as the auto-scroll harvest, applied once to
   * whatever is mounted.
   */
  extractMessages(): ConversationMessage[] {
    const entries = this.harvestWindow();
    if (entries.length === 0) {
      console.warn('[G2O] No conversation turns found with primary selectors');
    }
    return entries.map((entry, index) => ({ ...entry.value, index }));
  }

  /**
   * The mounted turns, in the current layout if any are present, otherwise in
   * the legacy one. A page renders one layout, never both.
   */
  private findTurns(root: Element | Document = document): MountedTurns {
    const pairs = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn, root);
    if (pairs.length > 0) return { layout: 'pair', turns: pairs };
    return {
      layout: 'legacy',
      turns: this.queryAllWithFallback<HTMLElement>(LEGACY_SELECTORS.conversationTurn, root),
    };
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
      container: SCROLL_CONTAINER_ANY_LAYOUT,
      topSettleMs: TOP_SETTLE_MS,
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
   * Highest `conversation-turn-N` ordinal currently mounted (issue #465).
   *
   * N is numbered across the whole conversation and never renumbered per window
   * (see {@link turnOrdinal}), so a value above the one a sync covered can only
   * mean a turn was added — scrolling up mounts *smaller* ordinals.
   */
  getMessageWatermark(): number | null {
    // Scoped to the thread scroller, for the same reason accumulation is: the
    // sidebar <nav> matches loose selectors and carries its own list.
    const root = this.queryWithFallback<HTMLElement>(SCROLL_CONTAINER_ANY_LAYOUT) ?? document;
    let highest: number | null = null;
    this.findTurns(root).turns.forEach(turn => {
      const ordinal = this.turnOrdinal(turn);
      if (ordinal === undefined || !Number.isFinite(ordinal)) return;
      if (highest === null || ordinal > highest) highest = ordinal;
    });
    return highest;
  }

  /**
   * Harvest the currently-mounted window as keyed messages, in DOM order.
   *
   * Keys are stable across virtualized remounts, so turns de-duplicate as
   * scroll windows overlap.
   */
  private harvestWindow(): HarvestEntry<ConversationMessage>[] {
    const { layout, turns } = this.findTurns();
    return turns.flatMap(turn =>
      layout === 'pair' ? this.pairTurnEntries(turn) : this.legacyTurnEntries(turn)
    );
  }

  /**
   * A 2026-09 turn: the user prompt, then its answer when one has rendered.
   * Keyed by the turn's `data-turn-key` plus the role. No `order`: the only
   * index on the page, `fallback-turn-N`, is renumbered per mounted window, so
   * ordering comes from the window merge alone (issue #515).
   */
  private pairTurnEntries(turn: HTMLElement): HarvestEntry<ConversationMessage>[] {
    const turnKey = turn.getAttribute('data-turn-key') ?? '';
    const entries: HarvestEntry<ConversationMessage>[] = [];

    const user = this.extractUserContent(turn);
    if (user) {
      const key = `${turnKey}:user`;
      entries.push({ key, value: { id: key, role: 'user', content: user, index: 0 } });
    }

    const answer = this.extractAssistantContent(turn);
    if (answer) {
      const key = `${turnKey}:assistant`;
      entries.push({
        key,
        value: { id: key, role: 'assistant', content: answer, htmlContent: answer, index: 0 },
      });
    }
    return entries;
  }

  /**
   * A pre-2026-09 turn holding one message. Keyed by its uuid (data-turn-id,
   * then data-message-id), hashing content only as a last resort, and ordered
   * by its `conversation-turn-N` ordinal.
   */
  private legacyTurnEntries(turn: HTMLElement): HarvestEntry<ConversationMessage>[] {
    const role = this.turnRole(turn);
    if (role !== 'user' && role !== 'assistant') return [];

    const content =
      role === 'user' ? this.extractUserContent(turn) : this.extractAssistantContent(turn);
    if (!content) return [];

    const key =
      turn.getAttribute('data-turn-id') ??
      turn.querySelector('[data-message-id]')?.getAttribute('data-message-id') ??
      `${role}-${generateHash(content)}`;

    return [
      {
        key,
        value: {
          id: key,
          role,
          content,
          htmlContent: role === 'assistant' ? content : undefined,
          index: 0, // re-indexed after accumulation
        },
        order: this.turnOrdinal(turn),
      },
    ];
  }

  /**
   * Extract user message content (plain text)
   */
  private extractUserContent(turnElement: Element): string {
    // Find user message content within the turn
    const contentEl = this.queryWithFallback<HTMLElement>(USER_MESSAGE_ANY_LAYOUT, turnElement);
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
    const markdownEls = this.queryAllWithFallback<HTMLElement>(MARKDOWN_ANY_LAYOUT, turnElement);
    // The image widget sits beside the prose, not inside it, and an
    // image-only turn has no prose at all — so the markers are appended to
    // whatever text the turn has, and on their own they keep the turn alive.
    const imageMarkers = this.generatedImageMarkers(turnElement);

    if (markdownEls.length > 0) {
      const answerEls = this.selectAnswerBlocks(turnElement, markdownEls);
      const blocks = answerEls.map(el => this.sanitizeBlockHtml(el.innerHTML));
      return [...blocks, imageMarkers].filter(Boolean).join('\n\n');
    }

    // Fallback (legacy layout only): the old assistantResponse selectors.
    const assistantEl = this.queryWithFallback<HTMLElement>(
      LEGACY_SELECTORS.assistantResponse,
      turnElement
    );
    if (assistantEl) {
      return [this.sanitizeBlockHtml(assistantEl.innerHTML), imageMarkers]
        .filter(Boolean)
        .join('\n\n');
    }

    return imageMarkers;
  }

  /**
   * `<img data-g2o-image>` markers for the turn's generated images, sanitized
   * like any other block; empty when the turn has none or export is off.
   *
   * Ids must be stable across the per-window harvests of a virtualized scroll
   * (ADR-041), so they come from the page, never a counter, in this order:
   * the answer's message id plus the image's index (2026-09 layout), the legacy
   * widget uuid, then the turn key plus the index.
   */
  private generatedImageMarkers(turnElement: Element): string {
    const turnKey =
      turnElement.getAttribute('data-turn-key') ??
      turnElement.getAttribute('data-turn-id') ??
      String(this.turnOrdinal(turnElement) ?? 'turn');
    const markers = this.images.markersFor(turnElement as HTMLElement, {
      selector: GENERATED_IMAGE_SELECTOR,
      enabled: this.enableImageExport,
      idFor: (img, index) => {
        const messageId = img
          .closest(`[${MESSAGE_IDS_ATTRIBUTE}]`)
          ?.getAttribute(MESSAGE_IDS_ATTRIBUTE)
          ?.trim()
          .split(/\s+/)[0];
        if (messageId) return `img-${messageId}-${index}`;
        const widgetId = img.closest(`[id^="${IMAGE_WIDGET_ID_PREFIX}"]`)?.id;
        return widgetId
          ? `img-${widgetId.slice(IMAGE_WIDGET_ID_PREFIX.length)}`
          : `img-${turnKey}-${index}`;
      },
    });
    return markers ? this.sanitizeBlockHtml(markers) : '';
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
