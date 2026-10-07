/**
 * Claude Extractor
 *
 * Extracts conversations from Claude AI (claude.ai)
 * Supports both normal chat and Deep Research (Extended Thinking) modes
 *
 * @see docs/design/DES-002-claude-extractor.md
 */

import { BaseExtractor, type ScrollConfig } from './base';
import { hostnameOf } from './deep-research-result';
import { sanitizeHtml } from '../../lib/sanitize';
import { htmlToMarkdownRaw } from '../markdown-rules';
import { generateHash } from '../../lib/hash';
import type { HarvestEntry } from '../../lib/scroll-accumulate';
import type { ConversationMessage, DeepResearchSource, SyncSettings } from '../../lib/types';
import { SELECTORS, DEEP_RESEARCH_SELECTORS, JOINED_SELECTORS } from './selectors/claude';

/**
 * Page chrome that sits inside the 2026-10 answer element: the screen-reader
 * heading ("Claude responded: …", a copy of the answer's opening) and the
 * message actions bar (Copy / Retry / the date). Not answer content.
 *
 * Kept out of SELECTORS: they are only stripped, never extracted, so a live
 * zero-match would cost nothing — while a baseline entry would block the
 * platform when they go (#402).
 */
const ANSWER_CHROME_SELECTOR = 'h2.sr-only, [data-testid="message-actions"]';

/**
 * Any step row of an answer — Thinking summary or Tool activity. An expanded
 * row renders its detail (the full reasoning, for a Thinking row) as
 * `.standard-markdown` inside the row, so the answer body must skip it.
 * Private for the same reason as ANSWER_CHROME_SELECTOR: it is only excluded.
 */
const STEP_ROW_SELECTOR = '[data-cds="TurnStatus"]';

/**
 * Claude conversation and Deep Research extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude';
  /** Include tool-use / intermediate content (web search, code interpreter, etc.) */
  enableToolContent = false;

  /**
   * Apply user settings: enable/disable tool content extraction and auto-scroll
   */
  protected applyPlatformSettings(settings: SyncSettings): void {
    this.enableToolContent = settings.enableToolContent ?? false;
  }

  // ========== Platform Detection ==========

  /**
   * Check if a Deep Research / Artifact report is the actively-viewed panel.
   *
   * Detects the #markdown-artifact element, but presence alone is not enough:
   * Claude keeps the artifact mounted after the panel is closed, moving the
   * off-screen panel into an `inert` + `aria-hidden="true"` subtree (verified
   * live 2026-07-16, w/h collapse to 0 and x is pushed past the viewport). A
   * presence-only check therefore hijacked every save after the user had ever
   * opened a report — returning the stale report and dropping the conversation
   * (issue #352 follow-up). Treat an inert / aria-hidden subtree as "closed".
   *
   * @see FR-003-3 in design document
   */
  isDeepResearchVisible(): boolean {
    const artifact = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.artifact);
    if (!artifact) return false;
    return !this.isInDismissedPanel(artifact);
  }

  /**
   * Whether an element sits inside a dismissed (closed) panel subtree.
   *
   * Claude does not unmount a closed Deep Research / Artifact panel — it moves
   * the off-screen subtree into `inert` + `aria-hidden="true"` (verified live
   * 2026-07-16). Such content is neither the active view nor a real conversation
   * turn, so both DR detection and message collection ignore it — otherwise the
   * lingering report (which carried `.font-claude-response` in that DOM) would leak into
   * the conversation as a stale extra assistant turn.
   */
  private isInDismissedPanel(element: Element): boolean {
    if (element.closest('[inert], [aria-hidden="true"]') === null) return false;

    // `inert` alone is not enough to call something dismissed: Claude also uses
    // it for the collapsed overflow of a LONG message, so treating every inert
    // ancestor as a closed panel silently dropped the user's own prompt from
    // the export while the reply survived.
    //
    // Measured live via CDP on one account, same day: user turns of 16 / 54 /
    // 182 characters sit outside `[inert]`, a 597-character one sits inside it,
    // and `#markdown-artifact` sits outside any `[data-index]` row. So position
    // — not the attribute — is what separates a conversation turn from a
    // dismissed panel.
    return element.closest(SELECTORS.conversationRow[0]) === null;
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL format: https://claude.ai/chat/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/chat\/([a-f0-9-]{36})/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. Deep Research h1 title (if Deep Research visible)
   * 2. document.title (via getPageTitle())
   * 3. First user message content (truncated)
   * 4. Default title
   */
  getTitle(): string {
    if (this.isDeepResearchVisible()) {
      return this.getDeepResearchTitle();
    }

    return (
      this.getPageTitle() ??
      this.getFirstMessageTitle(SELECTORS.userMessage, 'Untitled Claude Conversation')
    );
  }

  /** Expose platform selectors to BaseExtractor's DR title/content helpers. */
  protected getDeepResearchSelectors() {
    return DEEP_RESEARCH_SELECTORS;
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Extracts User/Assistant messages in DOM order
   * @see FR-002 in design document
   */
  extractMessages(): ConversationMessage[] {
    const sortedElements = this.collectSortedElements();

    // Pre-extract tool content keyed by message ID (matches buildMessagesFromElements format)
    const toolContentById = new Map<string, string>();
    if (this.enableToolContent) {
      sortedElements.forEach((item, index) => {
        if (item.type === 'assistant') {
          const tc = this.extractToolContentFromElement(item.element);
          if (tc) toolContentById.set(`assistant-${index}`, tc);
        }
      });
    }

    const messages = this.buildMessagesFromElements(
      sortedElements,
      el => this.extractUserContent(el),
      el => this.extractAssistantContent(el)
    );

    // Attach tool content to corresponding assistant messages (DES-014 H-5: immutable)
    if (toolContentById.size === 0) return messages;

    return messages.map(msg => {
      const tc = toolContentById.get(msg.id);
      return tc ? { ...msg, toolContent: tc } : msg;
    });
  }

  /**
   * Collect user/assistant message elements in DOM order.
   *
   * User messages nested inside an assistant response (e.g. quoted content) are
   * skipped, as is anything inside a dismissed artifact panel (a closed report
   * lingers mounted; see {@link isInDismissedPanel}).
   * Shared by extractMessages() (single pass) and harvestWindow() (per-scroll-
   * window pass for virtualized conversations).
   */
  private collectSortedElements(): Array<{ element: Element; type: 'user' | 'assistant' }> {
    const allElements: Array<{ element: Element; type: 'user' | 'assistant' }> = [];

    const userMessages = this.queryAllWithFallback<HTMLElement>(SELECTORS.userMessage);
    userMessages.forEach(el => {
      if (this.isInDismissedPanel(el)) return;
      const assistantParent = el.closest(JOINED_SELECTORS.assistantResponse);
      if (!assistantParent) {
        allElements.push({ element: el, type: 'user' });
      }
    });

    const assistantResponses = this.queryAllWithFallback<HTMLElement>(SELECTORS.assistantResponse);
    assistantResponses.forEach(el => {
      if (this.isInDismissedPanel(el)) return;
      allElements.push({ element: el, type: 'assistant' });
    });

    return this.sortByDomPosition(allElements);
  }

  /**
   * Auto-scroll config: Claude virtualizes the conversation (ADR-017).
   */
  protected getScrollConfig(): ScrollConfig {
    return {
      container: SELECTORS.scrollContainer,
      harvest: () => this.harvestWindow(),
    };
  }

  /**
   * Highest `data-index` currently mounted (issue #465).
   *
   * `data-index` is the virtual-row ordinal Claude assigns in conversation
   * order and never renumbers, so a value above the one a sync covered can only
   * mean a turn was added — scrolling up mounts *smaller* indices, never larger.
   */
  getMessageWatermark(): number | null {
    // Scoped to the thread scroller: `[data-index]` is a bare attribute
    // selector and Claude's own chrome virtualizes lists too, so a sidebar row
    // would otherwise raise the watermark and clear the badge for a scroll.
    const root = this.queryWithFallback<HTMLElement>(SELECTORS.scrollContainer) ?? document;
    let highest: number | null = null;
    this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationRow, root).forEach(row => {
      const index = Number(row.getAttribute('data-index'));
      if (!Number.isFinite(index)) return;
      if (highest === null || index > highest) highest = index;
    });
    return highest;
  }

  /**
   * Harvest the currently-mounted window as keyed messages.
   *
   * The key is the virtual-row `data-index` (stable per turn across windows),
   * falling back to a content hash when the wrapper is absent, so turns are
   * de-duplicated correctly as windows overlap during scrolling.
   */
  private harvestWindow(): HarvestEntry<ConversationMessage>[] {
    const entries: HarvestEntry<ConversationMessage>[] = [];
    this.collectSortedElements().forEach(item => {
      const content =
        item.type === 'user'
          ? this.extractUserContent(item.element)
          : this.extractAssistantContent(item.element);
      if (!content) return;

      // `data-index` is monotonic in conversation order; use it both as the
      // stable de-dup key and as the ordering signal so accumulation can sort by
      // it (robust against mergeWindow scramble — issue #352).
      const row = item.element.closest(SELECTORS.conversationRow[0]);
      const dataIndex = row?.getAttribute('data-index');
      const parsed = dataIndex !== undefined && dataIndex !== null ? Number(dataIndex) : NaN;
      const key = dataIndex ? `idx-${dataIndex}` : `${item.type}-${generateHash(content)}`;
      const order = Number.isFinite(parsed) ? parsed : undefined;
      const message: ConversationMessage = {
        id: key,
        role: item.type,
        content,
        htmlContent: item.type === 'assistant' ? content : undefined,
        index: 0, // re-indexed after accumulation
      };

      if (this.enableToolContent && item.type === 'assistant') {
        const tc = this.extractToolContentFromElement(item.element);
        if (tc) {
          entries.push({ key, value: { ...message, toolContent: tc }, order });
          return;
        }
      }
      entries.push({ key, value: message, order });
    });
    return entries;
  }

  /**
   * Extract user message content as markdown.
   *
   * Sanitizes the grid container's innerHTML via DOMPurify and converts it
   * to markdown (without angle-bracket escaping — {@link formatMessage}
   * applies that step later). This preserves paragraph breaks and
   * `<pre>`/`<code>` blocks that a plain `textContent` extraction would
   * flatten or drop entirely (see issue #200).
   *
   * Falls back to sanitized plain text for elements that produce no
   * markdown output (e.g. bare text nodes without block structure).
   */
  private extractUserContent(element: Element): string {
    const rawHtml = element.innerHTML;
    if (rawHtml) {
      const markdown = htmlToMarkdownRaw(sanitizeHtml(rawHtml)).trim();
      if (markdown) return markdown;
    }

    // Defensive fallback: preserve prior behavior for elements that have
    // only a text node and no convertible HTML structure.
    const textContent = element.textContent?.trim();
    if (textContent) {
      return this.sanitizeText(textContent);
    }
    return '';
  }

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * All HTML is sanitized via DOMPurify to prevent XSS
   * @see NFR-001-2 in design document
   */
  private extractAssistantContent(element: Element): string {
    const parts = this.collectResponseMarkdown(element);
    if (parts.length > 0) {
      return parts.join('\n');
    }

    // No markdown section anywhere: fall back to the whole response element,
    // minus the page chrome that the 2026-10 answer element also wraps.
    const answer = element.cloneNode(true) as Element;
    answer.querySelectorAll(ANSWER_CHROME_SELECTOR).forEach(chrome => chrome.remove());
    return sanitizeHtml(answer.innerHTML);
  }

  /**
   * Collect the response body's markdown sections, in DOM order.
   *
   * An answer interleaves its text blocks with step rows (Thinking summary,
   * Tool activity), and an expanded step row renders its own `.standard-markdown`
   * — for a Thinking row, the full reasoning. Those sections are skipped so only
   * the answer's text reaches the note (issue #48 on the 2026-10 DOM).
   *
   * `querySelectorAll` walks in document order, so one sweep yields the text
   * blocks already in conversation order.
   */
  private collectResponseMarkdown(element: Element): string[] {
    const sections = this.queryAllWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
    const parts: string[] = [];

    for (const section of sections) {
      if (section.closest(STEP_ROW_SELECTOR)) continue;
      // A lower-priority selector such as [class*="markdown"] can match both a
      // wrapper and the node inside it; emitting both would repeat the shared
      // text, so keep only the outermost match.
      if (sections.some(other => other !== section && other.contains(section))) continue;
      const html = sanitizeHtml(section.innerHTML);
      if (html.trim()) parts.push(html);
    }

    return parts;
  }

  /**
   * Tool activity of one answer, as bold labels in render order.
   *
   * Only the row's own label is read: a row the user has expanded also holds
   * the step's queries and interim notes in `[data-cds-row-panel]`, which we
   * leave out rather than export them for expanded rows alone.
   */
  private extractToolContentFromElement(element: Element): string | null {
    const labels = this.queryAllWithFallback<HTMLElement>(SELECTORS.toolStatus, element)
      .map(status =>
        this.sanitizeText(status.querySelector(':scope > [data-cds-row] bdi')?.textContent ?? '')
      )
      .filter(label => label !== '')
      .map(label => `**${label}**`);
    return labels.length > 0 ? labels.join('\n\n') : null;
  }

  // ========== Deep Research Extraction ==========

  /**
   * Extract source list from Deep Research inline citations
   *
   * Deduplicates by URL and maintains DOM order
   * @see FR-003-4 in design document
   */
  extractSourceList(): DeepResearchSource[] {
    const sources: DeepResearchSource[] = [];
    const seenUrls = new Map<string, number>(); // URL -> index mapping for deduplication

    // Find all inline citation links
    const citationLinks = document.querySelectorAll<HTMLAnchorElement>(
      JOINED_SELECTORS.inlineCitation
    );

    citationLinks.forEach(link => {
      const url = link.href;
      if (!url || !url.startsWith('http')) return;

      // Skip duplicates
      if (seenUrls.has(url)) return;

      // Extract title from link text or parent
      let title = link.textContent?.trim() || '';
      if (!title || title.includes('+')) {
        // Try to get a better title from aria-label or title attribute
        title = link.getAttribute('aria-label') || link.getAttribute('title') || '';
      }
      if (!title) {
        title = 'Unknown Title';
      }

      const domain = hostnameOf(url);

      const index = sources.length;
      seenUrls.set(url, index);

      sources.push({
        index,
        url,
        title: this.sanitizeText(title),
        domain,
      });
    });

    return sources;
  }
}
