/**
 * Merlin Extractor
 *
 * Extracts conversations from Merlin (www.getmerlin.in): messages, generated
 * images and — when "Include tool/search results" is on — the files ("crafts")
 * Merlin generates (REQ-merlin-extractor, ADR-046).
 *
 * Merlin is a React/Next.js app rendering markdown with Streamdown. Every
 * message is an `article[data-message-id]`, nothing is virtualized, and the
 * last turn sits in a wrapper, so messages are queried as descendants.
 *
 * @see docs/requirements/REQ-merlin-extractor.md
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import { MAX_CONVERSATION_TITLE_LENGTH } from '../../lib/constants';
import { fenceCodeBlock } from '../../lib/code-fence';
import { ImageMarkerCollector } from '../image-markers';
import { ArtifactMarkerCollector } from '../artifact-markers';
import { craftCardName, findCraftCards, readMerlinCrafts } from './merlin-crafts';
import type {
  ConversationMessage,
  ExtractedArtifact,
  ExtractionResult,
  SyncSettings,
} from '../../lib/types';

import { SELECTORS } from './selectors/merlin';

/**
 * The `<img>` of a generated image: inside the response body's `div.not-prose`,
 * wrapped in a `button` that opens the lightbox. The model icon in the header
 * and the sponsored box's logo are not inside such a button, so neither matches.
 *
 * Deliberately NOT part of `SELECTORS`: the E2E baseline would then be
 * writable only from a test conversation containing a generated image (#402).
 */
const GENERATED_IMAGE_SELECTOR =
  '.not-prose button img[src]:not(a[rel~="sponsored"] img, a[href*="trygravity.ai"] img)';

/** The model's icon in a message header; never exported. */
const MODEL_ICON_SELECTOR = 'img[alt$=" ai model\'s icon"]';

/** Container of a generated image, with its copy/download/bookmark buttons. */
const IMAGE_WIDGET_SELECTOR = 'div.not-prose';

/**
 * The sponsored box (§3.8): marked `rel="sponsored"` and routed through a
 * click-tracking host. Both signals are excluded explicitly so the box can
 * never leak into a note, wherever Merlin renders it.
 */
const SPONSORED_SELECTOR = 'a[rel~="sponsored"], a[href*="trygravity.ai"]';

/** The empty `<sup>` placeholders web-search citations leave behind (§3.11). */
const CITATION_MARKER_SELECTOR = 'sup.citation-shimmer';

const CODE_BLOCK_SELECTOR = '[data-streamdown="code-block"]';
const BOLD_SPAN_SELECTOR = 'span[data-streamdown="strong"]';
const CODE_BLOCK_CHROME_SELECTOR =
  '[data-streamdown="code-block-header"], [data-streamdown="code-block-actions"]';
const CODE_LINE_SELECTOR = 'code > span.block';
const TABLE_WRAPPER_SELECTOR = '[data-streamdown="table-wrapper"]';

/** Language names that survive as a fence info string. */
const SAFE_LANGUAGE = /^[A-Za-z0-9_+#.-]{1,30}$/;

/**
 * The credit line after a generated image, "Generato con GPT Image 2.5 Medium"
 * (Q6). Matched together with its position, so no other bold paragraph goes.
 */
const IMAGE_CREDIT = /^(?:generato (?:con|da)|generated (?:with|by|using))\s/i;

/** `$$…$$` written as plain text inside a paragraph (§3.9, form 1). */
const RAW_MATH = /\$\$([\s\S]+?)\$\$/g;
const MATH_SKIPPED_ANCESTORS = 'pre, code, [data-math], .katex, annotation, script, style';

const MESSAGE_ID_ATTRIBUTE = 'data-message-id';

/**
 * A Mermaid craft is saved as a Markdown file holding the diagram in a
 * ```mermaid fence, so Obsidian renders it: `flow.mmd` becomes `flow.md`.
 * Mermaid inside a message needs nothing here — it is a code block and stays
 * inline as the same fence.
 */
function mermaidCraftsToMarkdown(result: ExtractionResult): ExtractionResult {
  const artifacts = result.data?.artifacts;
  if (!result.data || !artifacts?.some(isMermaidCraft)) return result;
  return {
    ...result,
    data: {
      ...result.data,
      artifacts: artifacts.map(artifact =>
        isMermaidCraft(artifact)
          ? {
              ...artifact,
              name: `${artifact.name.replace(/\.[^./\\]*$/, '')}.md`,
              language: 'markdown',
              content: `\n${fenceCodeBlock(artifact.content, 'mermaid').trim()}\n`,
            }
          : artifact
      ),
    },
  };
}

function isMermaidCraft(artifact: ExtractedArtifact): boolean {
  return artifact.language === 'mermaid' || /\.(mmd|mermaid)$/i.test(artifact.name);
}

/**
 * Merlin conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class MerlinExtractor extends BaseExtractor {
  readonly platform = 'merlin';

  /** Whether generated images are captured (set from settings before extract()) */
  enableImageExport = true;

  /** Whether crafts are read — Merlin's share of "Include tool/search results". */
  enableToolContent = false;

  /**
   * Generated images are served from `storage.googleapis.com`, which answers the
   * page's origin with CORS headers, so the page reads them itself (§3.4).
   */
  private readonly images = new ImageMarkerCollector({ fetchCrossOriginFromPage: true });

  /** Craft cards registered while messages are read, opened once they are assembled. */
  private readonly crafts = new ArtifactMarkerCollector();

  protected applyPlatformSettings(settings: SyncSettings): void {
    this.enableImageExport = settings.enableImageExport ?? true;
    this.enableToolContent = settings.enableToolContent ?? false;
  }

  protected onExtractStart(): void {
    this.images.reset();
    this.crafts.reset();
  }

  protected async finalizeExtraction(result: ExtractionResult): Promise<ExtractionResult> {
    const withImages = await this.images.attach(result);
    const withCrafts = await this.crafts.attach(withImages, pending => readMerlinCrafts(pending));
    return mermaidCraftsToMarkdown(withCrafts);
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL format: https://www.getmerlin.in/chat/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * `document.title` is a generic "Chat - Merlin AI", so the title is the last
   * item of the top-bar breadcrumb (the project name of a project chat is not
   * exported). Falls back to the first user message.
   */
  getTitle(): string {
    const crumb = this.queryWithFallback<HTMLElement>(SELECTORS.conversationTitle);
    const title = this.sanitizeText(crumb?.textContent ?? '').substring(
      0,
      MAX_CONVERSATION_TITLE_LENGTH
    );
    return (
      title || this.getFirstMessageTitle(SELECTORS.userMessage, 'Untitled Merlin Conversation')
    );
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages, in DOM order.
   *
   * Only the branch Merlin currently displays is in the DOM, so a response with
   * several versions exports the shown one (Q22). Empty responses are skipped.
   */
  extractMessages(): ConversationMessage[] {
    const articles = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);
    if (articles.length === 0) {
      console.warn('[G2O] No Merlin messages found with primary selectors');
      return [];
    }

    const messages: ConversationMessage[] = [];
    articles.forEach((article, position) => {
      const role = this.roleOf(article);
      if (!role) return;

      const content =
        role === 'user' ? this.userText(article) : this.assistantHtml(article, position);
      if (!content) return;

      messages.push({
        id: `${role}-${position}`,
        role,
        content,
        htmlContent: role === 'assistant' ? content : undefined,
        index: messages.length,
      });
    });
    return messages;
  }

  /**
   * A message's role. The header's label is "Merlin" or the chosen model's
   * name, so it is not used; the response body and the model icon identify an
   * assistant, and the `ml-auto` alignment (or its plain-text paragraph) a user.
   */
  private roleOf(article: Element): 'user' | 'assistant' | null {
    if (
      this.queryWithFallback(SELECTORS.markdownContent, article) ||
      article.querySelector(MODEL_ICON_SELECTOR)
    ) {
      return 'assistant';
    }
    if (
      article.classList.contains('ml-auto') ||
      this.queryWithFallback(SELECTORS.userMessage, article)
    ) {
      return 'user';
    }
    return null;
  }

  /**
   * A user message's text, line breaks kept. Attachments are not in these
   * paragraphs, so they are never exported (Q17).
   */
  private userText(article: Element): string {
    return Array.from(article.querySelectorAll(SELECTORS.userMessage.join(', ')))
      .map(paragraph => {
        const clone = paragraph.cloneNode(true) as Element;
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        return (clone.textContent ?? '').trim();
      })
      .filter(Boolean)
      .join('\n');
  }

  /**
   * An assistant message's HTML, sanitized: the non-empty response bodies, then
   * a marker per craft card when crafts are exported. Header, toolbar, credits,
   * agent steps, craft cards and the sponsored box never reach it.
   */
  private assistantHtml(article: HTMLElement, position: number): string {
    const messageId = article.getAttribute(MESSAGE_ID_ATTRIBUTE) ?? `message-${position}`;
    const parts: string[] = [];

    this.queryAllWithFallback<HTMLElement>(SELECTORS.markdownContent, article).forEach(
      (body, bodyIndex) => {
        if (!body.textContent?.trim() && !body.querySelector('img')) return;
        const html = this.images.rewrite(body, {
          selector: GENERATED_IMAGE_SELECTOR,
          enabled: this.enableImageExport,
          idFor: (_img, index) => `${messageId}-${bodyIndex}-${index}`,
        });
        parts.push(this.cleanBody(html));
      }
    );

    if (this.enableToolContent) parts.push(...this.craftMarkers(article, messageId));

    const html = parts.join('\n');
    return html.trim() ? sanitizeHtml(html) : '';
  }

  /** One marker per craft card of the message, in card order. */
  private craftMarkers(article: HTMLElement, messageId: string): string[] {
    return findCraftCards(article).map((card, index) =>
      this.crafts.markerFor(document, `${messageId}#${index}`, craftCardName(card), () =>
        this.locateCraftCard(messageId, index)
      )
    );
  }

  /** The card's element now: Merlin replaces a card's node when its state changes. */
  private locateCraftCard(messageId: string, index: number): HTMLElement | null {
    const article = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn).find(
      candidate => candidate.getAttribute(MESSAGE_ID_ATTRIBUTE) === messageId
    );
    return (article && findCraftCards(article)[index]) ?? null;
  }

  // ========== Response body clean-up ==========

  /**
   * Turn one response body's HTML into what Turndown can convert faithfully.
   * Works on an inert document, so nothing is fetched and the page is untouched.
   */
  private cleanBody(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.body;

    root.querySelectorAll(SPONSORED_SELECTOR).forEach(el => el.remove());
    root.querySelectorAll(CITATION_MARKER_SELECTOR).forEach(el => el.remove());
    this.removeImageCredits(root);
    this.unwrapImageWidgets(root);
    this.convertBoldSpans(root, doc);
    this.rebuildCodeBlocks(root, doc);
    this.removeTableToolbars(root);
    this.convertRawMath(root, doc);
    return root.innerHTML;
  }

  /**
   * Drop the "Generato con <model>" line that follows an image widget (Q6). The
   * candidates are collected before any is removed, so deleting one credit
   * cannot make the next paragraph look like it follows a widget.
   */
  private removeImageCredits(root: HTMLElement): void {
    const credits = Array.from(root.querySelectorAll('p')).filter(paragraph => {
      const text = (paragraph.textContent ?? '').trim();
      return (
        IMAGE_CREDIT.test(`${text} `) &&
        paragraph.children.length === 1 &&
        (paragraph.firstElementChild?.textContent ?? '').trim() === text &&
        paragraph.previousElementSibling?.matches(IMAGE_WIDGET_SELECTOR)
      );
    });
    credits.forEach(paragraph => paragraph.remove());
  }

  /**
   * Replace each image widget by its image markers only, so the widget's
   * buttons cannot add text; a widget left with nothing but buttons (image
   * export off) is dropped.
   */
  private unwrapImageWidgets(root: HTMLElement): void {
    root.querySelectorAll(IMAGE_WIDGET_SELECTOR).forEach(widget => {
      const markers = Array.from(widget.querySelectorAll('img[data-g2o-image]'));
      if (markers.length > 0) {
        widget.replaceWith(...markers);
      } else if (widget.querySelector('button') && !this.hasNonButtonText(widget)) {
        widget.remove();
      }
    });
  }

  /**
   * Streamdown renders bold as `<span class="font-semibold" data-streamdown="strong">`,
   * which Turndown would flatten to plain text; give it a real `<strong>`.
   */
  private convertBoldSpans(root: HTMLElement, doc: Document): void {
    root.querySelectorAll(BOLD_SPAN_SELECTOR).forEach(span => {
      const strong = doc.createElement('strong');
      strong.append(...Array.from(span.childNodes));
      span.replaceWith(strong);
    });
  }

  private hasNonButtonText(element: Element): boolean {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('button').forEach(button => button.remove());
    return (clone.textContent ?? '').trim() !== '';
  }

  /**
   * Rebuild each Streamdown code block as `<pre><code class="language-x">`.
   *
   * The lines are read per `code > span.block` and joined with `\n`: the
   * blocks carry `content-visibility: auto`, so `innerText` is empty off-screen,
   * and `textContent` of the whole `<code>` loses the line breaks (§3.7).
   */
  private rebuildCodeBlocks(root: HTMLElement, doc: Document): void {
    root.querySelectorAll(CODE_BLOCK_SELECTOR).forEach(block => {
      const code = block.querySelector('code');
      if (!code) return;

      block.querySelectorAll(CODE_BLOCK_CHROME_SELECTOR).forEach(el => el.remove());
      const lines = Array.from(code.querySelectorAll(CODE_LINE_SELECTOR));
      const text =
        lines.length > 0
          ? lines.map(line => line.textContent ?? '').join('\n')
          : (code.textContent ?? '');
      const language = block.getAttribute('data-language') ?? '';

      const rebuilt = doc.createElement('code');
      if (SAFE_LANGUAGE.test(language)) rebuilt.className = `language-${language}`;
      rebuilt.textContent = text;
      const pre = doc.createElement('pre');
      pre.append(rebuilt);
      block.replaceWith(pre);
    });
  }

  /** Remove the Copy / Download / Fullscreen buttons around a table. */
  private removeTableToolbars(root: HTMLElement): void {
    root.querySelectorAll(TABLE_WRAPPER_SELECTOR).forEach(wrapper => {
      wrapper.querySelectorAll('button').forEach(button => button.remove());
    });
  }

  /**
   * Turn `$$…$$` written as plain text into the markup a rendered inline KaTeX
   * formula has, so the shared KaTeX handling gives both forms the same output
   * (Q19). The TeX source is kept verbatim, as the annotation's text.
   */
  private convertRawMath(root: HTMLElement, doc: Document): void {
    if (!(root.textContent ?? '').includes('$$')) return;

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      if (text.data.includes('$$') && !text.parentElement?.closest(MATH_SKIPPED_ANCESTORS)) {
        targets.push(text);
      }
    }

    for (const text of targets) {
      const fragment = doc.createDocumentFragment();
      let last = 0;
      for (const match of text.data.matchAll(RAW_MATH)) {
        const tex = match[1].trim();
        if (!tex) continue;
        fragment.append(text.data.slice(last, match.index), this.inlineMath(doc, tex));
        last = match.index + match[0].length;
      }
      if (last === 0) continue;
      fragment.append(text.data.slice(last));
      text.replaceWith(fragment);
    }
  }

  private inlineMath(doc: Document, tex: string): HTMLElement {
    const annotation = doc.createElement('annotation');
    annotation.setAttribute('encoding', 'application/x-tex');
    annotation.textContent = tex;
    const semantics = doc.createElement('semantics');
    semantics.append(annotation);
    const math = doc.createElement('math');
    math.append(semantics);
    const mathml = doc.createElement('span');
    mathml.className = 'katex-mathml';
    mathml.append(math);
    const katex = doc.createElement('span');
    katex.className = 'katex';
    katex.append(mathml);
    return katex;
  }
}
