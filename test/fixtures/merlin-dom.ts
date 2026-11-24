/**
 * Merlin (www.getmerlin.in) DOM fixtures, shaped after the live pages inspected
 * on 2026-11-24 (docs/requirements/REQ-merlin-extractor.md §3).
 *
 * `installCraftPanel()` stands in for Merlin's craft side panel: clicking a card
 * opens a panel whose "Code" tab activates on `mousedown` (Radix), the card is
 * re-rendered (a new node) whenever it opens or closes, and the close button is
 * the `lucide-x` button after the tablist.
 */

import { defineLocation } from './dom-helpers';

export const MERLIN_CONVERSATION_ID = 'ed96096b-c79b-46ee-bf25-83df2cad6093';

/** Source lines are text in Merlin's DOM, so markup in a craft must not be parsed. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setMerlinLocation(conversationId = MERLIN_CONVERSATION_ID): void {
  defineLocation('www.getmerlin.in', `/chat/${conversationId}`);
}

export function merlinUserArticle(id: string, text: string, extra = ''): string {
  return `
    <article data-message-id="${id}" class="group/message ml-auto grid max-w-[80%]">
      <div class="grid gap-1.5">
        <div class="ml-auto grid w-fit gap-1.5 rounded-3xl bg-secondary">
          ${extra}
          <div class="max-w-full"><p class="whitespace-pre-wrap my-0.5"><span>${text}</span></p></div>
        </div>
        <div class="z-10 flex"><button title="Copy"><svg></svg></button></div>
      </div>
    </article>`;
}

export interface MerlinAssistantOptions {
  /** Inner HTML of each `.chat-reply-markdown` (empty strings give the empty ones). */
  bodies?: string[];
  /** Header label: "Merlin" or the chosen model's name. */
  label?: string;
  /** File names of craft cards shown under the body. */
  crafts?: string[];
  /** Raw HTML placed after the toolbar (e.g. the sponsored box). */
  after?: string;
  /** Raw HTML placed in the response area outside the markdown bodies. */
  beside?: string;
}

function merlinCraftCard(name: string): string {
  return `
    <button class="rounded-md not-prose group mb-2 block"><div class="flex rounded-2xl border">
      <div class="flex w-16"><svg class="lucide lucide-code"></svg></div>
      <div class="flex flex-1"><div class="flex-1 truncate px-4 py-3 text-left text-sm">
        <div class="line-clamp-2 text-left font-medium">${name}</div>
        <p class="text-left text-muted-foreground">Click to open craft</p>
      </div></div></div></button>`;
}

export function merlinAssistantArticle(id: string, options: MerlinAssistantOptions = {}): string {
  const { bodies = [], label = 'Merlin', crafts = [], after = '', beside = '' } = options;
  const iconId = label === 'Merlin' ? 'merlin' : label.toLowerCase().replace(/\s+/g, '-');
  const markdown = bodies
    .map(
      body => `<div class="chat-reply-markdown prose"><div class="space-y-4">${body}</div></div>`
    )
    .join('');
  const cards = crafts.length
    ? `<div class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">${crafts.map(merlinCraftCard).join('')}</div>`
    : '';
  return `
    <article data-message-id="${id}" class="group/message grid transform-none gap-3">
      <div class="flex items-center justify-between gap-2">
        <span><img alt="${iconId} ai model's icon" src="https://cdn.jsdelivr.net/gh/foyer-work/cdn-files@latest/${iconId}.webp"><button aria-expanded="false"><span>${label}</span></button></span>
      </div>
      <div class="grid gap-1.5">
        <div><div>${markdown}${beside}</div>${cards}</div>
        <div class="z-10 flex"><button title="Copy"><svg></svg></button><button>71</button></div>
        ${after}
      </div>
    </article>`;
}

export function merlinImageWidget(
  src: string,
  alt: string,
  model = 'GPT Image 2.5 Medium'
): string {
  return `
    <div class="not-prose flex gap-2"><div class="group relative">
      <button type="button" aria-haspopup="dialog"><img alt="${alt}" loading="lazy" src="${src}"></button>
      <div><button><svg></svg></button><button><svg></svg></button><button><svg></svg></button></div>
    </div></div>
    <p><span class="font-semibold" data-streamdown="strong">Generato con ${model}</span></p>`;
}

export function merlinCodeBlock(language: string, lines: string[]): string {
  const spans = lines
    .map(line => `<span class="block before:content-[counter(line)]">${escapeHtml(line)}</span>`)
    .join('');
  return `
    <div data-streamdown="code-block" data-language="${language}" style="content-visibility: auto;">
      <div data-streamdown="code-block-header"><span>${language}</span></div>
      <div><div data-streamdown="code-block-actions"><button title="Download file"></button><button title="Copy Code"></button></div></div>
      <div data-streamdown="code-block-body" data-language="${language}"><pre class="language-${language}"><code>${spans}</code></pre></div>
    </div>`;
}

export function merlinTable(headers: string[], rows: string[][]): string {
  const head = headers
    .map(h => `<th data-streamdown="table-header-cell" style="text-align: right;">${h}</th>`)
    .join('');
  const body = rows
    .map(
      row =>
        `<tr data-streamdown="table-row">${row.map(c => `<td data-streamdown="table-cell">${c}</td>`).join('')}</tr>`
    )
    .join('');
  return `
    <div class="my-4 flex flex-col gap-2" data-streamdown="table-wrapper">
      <div class="flex items-center justify-end gap-1">
        <button title="Copy table"></button><button title="Download table"></button><button title="View fullscreen"></button>
      </div>
      <div class="border-collapse overflow-x-auto"><table data-streamdown="table">
        <thead data-streamdown="table-header"><tr data-streamdown="table-row">${head}</tr></thead>
        <tbody data-streamdown="table-body">${body}</tbody>
      </table></div>
    </div>`;
}

export function merlinKatex(tex: string, display: boolean): string {
  const math = `<span class="katex"><span class="katex-mathml"><math${display ? ' display="block"' : ''}><semantics><mrow></mrow><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x</span></span>`;
  return display ? `<span class="katex-display">${math}</span>` : math;
}

export const SPONSORED_BOX = `
  <div><div class="mt-3">
    <a class="block w-full rounded-2xl border" target="_blank" rel="noopener noreferrer sponsored" href="https://api.trygravity.ai/track/click?p=abc">
      <div><img alt="" src="https://cdn.example.test/advertiser-logo.png"><span><span>Webz.io</span><span> · Sponsored</span></span></div>
      <p class="mt-3 line-clamp-2">Build powerful visualizations with Webz</p>
    </a>
  </div></div>`;

export interface MerlinPageOptions {
  /** Breadcrumb items; the last one is the chat title. */
  breadcrumb?: string[];
  /** Nest the last user/assistant pair in a wrapper, as the live page does (§3.1). */
  nestLastTurn?: boolean;
}

export function createMerlinPage(articles: string[], options: MerlinPageOptions = {}): void {
  const { breadcrumb = ['Test chat'], nestLastTurn = true } = options;
  const crumbs = breadcrumb
    .map((item, i) =>
      i === breadcrumb.length - 1
        ? `<li data-slot="breadcrumb-item"><span data-slot="breadcrumb-page" role="link" aria-disabled="true" aria-current="page">${item}</span></li>`
        : `<li data-slot="breadcrumb-item"><a href="/chat/projects">${item}</a></li><li data-slot="breadcrumb-separator"></li>`
    )
    .join('');
  const split = nestLastTurn && articles.length >= 2 ? articles.length - 2 : articles.length;
  const head = articles.slice(0, split).join('');
  const tail = articles.slice(split).join('');
  document.body.innerHTML = `
    <nav aria-label="breadcrumb" data-slot="breadcrumb"><ol data-slot="breadcrumb-list">${crumbs}</ol></nav>
    <main><div class="chat-messages-area">${head}${
      tail ? `<div class="mb-[calc(var(--promptarea-height))]"><div>${tail}</div></div>` : ''
    }</div></main>`;
}

export interface CraftSource {
  language: string;
  lines: string[];
}

export interface CraftPanelOptions {
  /** Craft file names whose card opens no panel at all. */
  neverOpens?: string[];
  /** Craft file names whose panel has no "Code" tab. */
  noCodeTab?: string[];
  /** Craft file names whose panel swallows the first tab selection (a late re-render). */
  ignoresFirstTabSelection?: string[];
  /** Craft file names whose panel falls back to Preview a moment after it opens. */
  fallsBackToPreview?: string[];
}

export interface CraftPanelLog {
  clickedTabs: string[];
  openedTitles: string[];
}

/**
 * Behave like Merlin's craft panel for every `button.not-prose` card in the page.
 * Returns the event log and a function to remove the listeners.
 */
export function installCraftPanel(
  sources: Record<string, CraftSource>,
  options: CraftPanelOptions = {}
): { log: CraftPanelLog; uninstall: () => void } {
  const log: CraftPanelLog = { clickedTabs: [], openedTitles: [] };
  let panelSerial = 0;

  const nameOf = (card: Element): string =>
    card.querySelector('.line-clamp-2')?.textContent?.trim() ?? '';

  const rerenderCard = (card: HTMLElement, open: boolean): void => {
    const copy = card.cloneNode(true) as HTMLElement;
    const status = copy.querySelector('p');
    if (status) status.textContent = open ? 'Showing craft' : 'Click to open craft';
    card.replaceWith(copy);
  };

  const closePanel = (): void => {
    document.querySelector('[data-test-craft-panel]')?.remove();
    document.querySelectorAll<HTMLElement>('button.not-prose').forEach(card => {
      if (card.querySelector('p')?.textContent === 'Showing craft') rerenderCard(card, false);
    });
  };

  const openPanel = (name: string): void => {
    const source = sources[name];
    const serial = ++panelSerial;
    const prefix = `radix-_r_${serial}_`;
    const panel = document.createElement('div');
    panel.setAttribute('data-test-craft-panel', '');
    const tabs = options.noCodeTab?.includes(name)
      ? ['preview', 'edit']
      : ['code', 'preview', 'edit'];
    panel.innerHTML = `
      <div dir="ltr" class="flex h-full min-h-0 flex-col">
        <div class="flex h-[54px] items-center px-4"><div class="flex w-full items-center justify-between">
          <div class="flex items-center gap-2"><span class="text-base font-semibold">${name}</span></div>
          <div class="flex items-center gap-4">
            <button><svg class="lucide lucide-maximize2"></svg></button>
            <div role="tablist">${tabs
              .map(
                t =>
                  `<button type="button" role="tab" id="${prefix}-trigger-${t}" aria-selected="${t === 'preview'}" data-state="${t === 'preview' ? 'active' : 'inactive'}">${t[0].toUpperCase()}${t.slice(1)}</button>`
              )
              .join('')}</div>
            <button><svg class="lucide lucide-x"></svg></button>
          </div>
        </div></div>
        <div role="tabpanel" data-state="active" id="${prefix}-content-preview"><iframe src="https://crafts.getmerlin.in/render"></iframe></div>
      </div>`;

    const activate = (value: string): void => {
      panel.querySelectorAll<HTMLElement>('[role=tab]').forEach(tab => {
        const on = tab.id.endsWith(`-trigger-${value}`);
        tab.setAttribute('aria-selected', String(on));
        tab.setAttribute('data-state', on ? 'active' : 'inactive');
      });
      panel.querySelector('[role=tabpanel]')?.remove();
      const content = document.createElement('div');
      content.setAttribute('role', 'tabpanel');
      content.setAttribute('data-state', 'active');
      content.id = `${prefix}-content-${value}`;
      if (value === 'code' && source) {
        const spans = source.lines.map(l => `<span class="block">${escapeHtml(l)}</span>`).join('');
        content.innerHTML = `<div data-streamdown="code-block" data-language="${source.language}" style="content-visibility: auto;"><div data-streamdown="code-block-header"><span>${source.language}</span></div><pre><code>${spans}</code></pre></div>`;
      } else if (value === 'preview') {
        content.innerHTML = '<iframe src="https://crafts.getmerlin.in/render"></iframe>';
      }
      panel.firstElementChild?.append(content);
    };

    let swallow = options.ignoresFirstTabSelection?.includes(name) ?? false;
    panel.querySelectorAll<HTMLElement>('[role=tab]').forEach(tab => {
      // Radix activates a trigger on mousedown, not on click.
      tab.addEventListener('mousedown', event => {
        if ((event as MouseEvent).button !== 0) return;
        const value = tab.id.split('-trigger-')[1];
        log.clickedTabs.push(value);
        if (swallow) {
          swallow = false;
          return;
        }
        activate(value);
      });
    });
    panel.querySelector('.lucide-x')?.parentElement?.addEventListener('click', closePanel);
    document.body.append(panel);
    log.openedTitles.push(name);
    if (options.fallsBackToPreview?.includes(name)) setTimeout(() => activate('preview'), 30);
  };

  const onClick = (event: Event): void => {
    const card = (event.target as Element).closest<HTMLElement>('button.not-prose');
    if (!card) return;
    const name = nameOf(card);
    if (options.neverOpens?.includes(name)) return;
    closePanel();
    const fresh = card.isConnected ? card : null;
    openPanel(name);
    if (fresh) rerenderCard(fresh, true);
  };

  document.addEventListener('click', onClick);
  return { log, uninstall: () => document.removeEventListener('click', onClick) };
}
