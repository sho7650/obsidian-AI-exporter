/**
 * Merlin craft reader (ADR-046): opens each craft card in Merlin's side panel,
 * selects the "Code" tab and reads the source out of it.
 *
 * A craft's content is not in the message DOM — the chat shows only a card
 * (docs/requirements/REQ-merlin-extractor.md §3.5). The only reachable copy of
 * the source is the main-document code block of the "Code" tab, which exists
 * only after the card is opened and that tab selected. The "Preview" tab is a
 * cross-origin iframe (`crafts.getmerlin.in`) and is never used.
 *
 * Rules the automation keeps:
 * - it never touches the "Edit" tab nor anything that regenerates;
 * - it leaves the panel as it found it (closed, or open on the same craft and
 *   tab);
 * - one unreadable craft is an outcome with a reason, never an exception, so
 *   the note is still saved.
 */

import type { ArtifactReadOutcome, PendingArtifact } from '../artifact-markers';
import { SELECTORS } from './selectors/merlin';

/** One craft card of a message: a `button.not-prose` showing a file name. */
const CRAFT_CARD_SELECTOR = 'button.not-prose';
/** The file name inside a card. */
const CRAFT_NAME_SELECTOR = '.line-clamp-2';
/** Where a card must not be looked for: the response body holds images, not cards. */
const RESPONSE_BODY_SELECTOR = SELECTORS.markdownContent.join(', ');
/** A message article, as `Element.closest` target. */
const ARTICLE_SELECTOR = 'article';

const TABLIST_SELECTOR = '[role="tablist"]';
const TAB_SELECTOR = '[role="tab"]';
const TABPANEL_SELECTOR = '[role="tabpanel"]';
/** Radix ids the tabs carry: `radix-<n>-trigger-<value>`. */
const TAB_ID_INFIX = '-trigger-';
/** The panel header's file name. */
const PANEL_TITLE_SELECTOR = 'span.text-base.font-semibold';
/** The header's close button holds the lucide `x` icon. */
const CLOSE_ICON_SELECTOR = 'svg.lucide-x';

const CODE_BLOCK_SELECTOR = '[data-streamdown="code-block"]';
const CODE_LINE_SELECTOR = 'code > span.block';
const CODE_SELECTOR = 'code';

/** The tab holding the source. */
const CODE_TAB = 'code';
/** The tab a user edits in; the automation never selects it. */
const EDIT_TAB = 'edit';

export interface CraftReaderTiming {
  /** How long to wait for the panel, a tab or the code to appear. */
  timeoutMs: number;
  /** Interval between checks while waiting. */
  pollMs: number;
  /** How long the reopened panel must stand still before it counts as restored. */
  settleMs: number;
}

const DEFAULT_TIMING: CraftReaderTiming = { timeoutMs: 8000, pollMs: 50, settleMs: 800 };

/** The craft cards inside one message, in document order. */
export function findCraftCards(article: ParentNode): HTMLElement[] {
  return Array.from(article.querySelectorAll<HTMLElement>(CRAFT_CARD_SELECTOR)).filter(
    card => !card.closest(RESPONSE_BODY_SELECTOR) && craftCardName(card) !== ''
  );
}

/** The file name a card shows, or '' when the element is not a craft card. */
export function craftCardName(card: Element): string {
  return card.querySelector(CRAFT_NAME_SELECTOR)?.textContent?.trim() ?? '';
}

/** The open side panel: the tablist outside any message, and what holds the tab panels. */
interface Panel {
  tablist: HTMLElement;
  root: HTMLElement;
  title: string;
}

function findPanel(doc: Document): Panel | null {
  for (const tablist of doc.querySelectorAll<HTMLElement>(TABLIST_SELECTOR)) {
    if (tablist.closest(ARTICLE_SELECTOR)) continue;
    for (let node = tablist.parentElement; node; node = node.parentElement) {
      if (!node.querySelector(TABPANEL_SELECTOR)) continue;
      const title = node.querySelector(PANEL_TITLE_SELECTOR)?.textContent?.trim() ?? '';
      return { tablist, root: node, title };
    }
  }
  return null;
}

function tabValue(tab: Element): string {
  const id = tab.getAttribute('id') ?? '';
  const at = id.lastIndexOf(TAB_ID_INFIX);
  return at === -1 ? '' : id.slice(at + TAB_ID_INFIX.length);
}

function findTab(panel: Panel, value: string): HTMLElement | null {
  const tabs = Array.from(panel.tablist.querySelectorAll<HTMLElement>(TAB_SELECTOR));
  return (
    tabs.find(tab => tabValue(tab) === value) ??
    tabs.find(tab => (tab.textContent ?? '').trim().toLowerCase() === value) ??
    null
  );
}

function selectedTabValue(panel: Panel): string | null {
  const selected = panel.tablist.querySelector(`${TAB_SELECTOR}[aria-selected="true"]`);
  return selected ? tabValue(selected) || (selected.textContent ?? '').trim().toLowerCase() : null;
}

/**
 * Select a tab the way Radix does: its trigger activates on `mousedown`
 * (primary button, no ctrl), not on `click`, so a bare `.click()` would leave
 * the tab as it was.
 */
function selectTab(tab: HTMLElement): void {
  tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
}

/** How many times a card is pressed before the panel is declared not to open. */
const OPEN_ATTEMPTS = 2;

/**
 * Press a card the way a pointer does: pointer and mouse down/up, then click.
 * A bare `.click()` from the content script's isolated world was not enough to
 * open the panel for some users, while the full sequence is what the page sees
 * from a real press.
 */
function pressCard(card: HTMLElement): void {
  const init = { bubbles: true, cancelable: true, button: 0 };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    const EventType =
      type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    card.dispatchEvent(new EventType(type, init as MouseEventInit));
  }
  card.click();
}

function closeButton(panel: Panel): HTMLElement | null {
  const bar = panel.tablist.parentElement;
  const buttons = Array.from(bar?.children ?? []).filter(
    (child): child is HTMLElement => child.tagName === 'BUTTON'
  );
  return (
    buttons.find(button => button.querySelector(CLOSE_ICON_SELECTOR)) ??
    buttons[buttons.length - 1] ??
    null
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Poll until `probe` returns something, or give up after the timeout. */
async function waitFor<T>(probe: () => T | null, timing: CraftReaderTiming): Promise<T | null> {
  const deadline = Date.now() + timing.timeoutMs;
  for (;;) {
    const found = probe();
    if (found) return found;
    if (Date.now() >= deadline) return null;
    await sleep(timing.pollMs);
  }
}

async function closePanel(doc: Document, timing: CraftReaderTiming): Promise<void> {
  const panel = findPanel(doc);
  if (!panel) return;
  const button = closeButton(panel);
  if (!button) return;
  pressCard(button);
  await waitFor(() => (findPanel(doc) ? null : true), timing);
}

/** The source in the code block of the active tab panel, or null while it is not there. */
function readSource(panel: Panel): { language: string; content: string } | null {
  const block = panel.root.querySelector<HTMLElement>(
    `${TABPANEL_SELECTOR}[data-state="active"] ${CODE_BLOCK_SELECTOR}, ${TABPANEL_SELECTOR}:not([hidden]) ${CODE_BLOCK_SELECTOR}`
  );
  const code = block?.querySelector(CODE_SELECTOR);
  if (!block || !code) return null;

  // textContent loses the line breaks (each line is a block-level span), so
  // the source is rebuilt line by line; innerText would be empty off-screen.
  const lines = Array.from(code.querySelectorAll(CODE_LINE_SELECTOR));
  const content =
    lines.length > 0
      ? lines.map(line => line.textContent ?? '').join('\n')
      : (code.textContent ?? '');
  const language = block.getAttribute('data-language') ?? '';
  return { language, content };
}

async function readOne(
  doc: Document,
  item: PendingArtifact,
  timing: CraftReaderTiming
): Promise<ArtifactReadOutcome> {
  const fail = (reason: string): ArtifactReadOutcome => ({ id: item.id, reason });

  // A craft opened over another keeps the old tab and, for equal names, an
  // identical header — so start every read from a closed panel.
  await closePanel(doc, timing);

  // A click that Merlin ignores is retried once with a fresh look at the card;
  // each try gets a share of the time, so a stuck card costs seconds, not minutes.
  const attemptTiming = { ...timing, timeoutMs: Math.max(timing.timeoutMs / OPEN_ATTEMPTS, 1) };
  let opened: Panel | null = null;
  for (let attempt = 0; attempt < OPEN_ATTEMPTS && !opened; attempt++) {
    const card = item.locate();
    if (!card) return fail('craft card is no longer on the page');
    pressCard(card);
    opened = await waitFor(() => {
      const panel = findPanel(doc);
      return panel && panel.title === item.name ? panel : null;
    }, attemptTiming);
  }
  if (!opened) {
    const shown = findPanel(doc);
    return fail(
      shown
        ? `the craft panel did not open (it shows "${shown.title}")`
        : 'the craft panel did not open (no panel appeared)'
    );
  }

  const codeTab = await waitFor(() => {
    const panel = findPanel(doc);
    return panel ? findTab(panel, CODE_TAB) : null;
  }, timing);
  if (!codeTab) return fail('the Code tab was not found');
  if (codeTab.getAttribute('aria-selected') !== 'true') selectTab(codeTab);

  // Merlin opens a craft on the Code tab for a moment and then re-renders on
  // Preview (measured 2026-11-24: ~400ms), so the tab is re-selected whenever
  // the panel is found on another one while the source has not been read yet.
  const source = await waitFor(() => {
    const panel = findPanel(doc);
    if (!panel || panel.title !== item.name) return null;
    const tab = findTab(panel, CODE_TAB);
    if (tab && tab.getAttribute('aria-selected') !== 'true') selectTab(tab);
    return readSource(panel);
  }, timing);
  if (!source) return fail('the source did not appear in the Code tab');

  return { id: item.id, language: source.language, content: source.content };
}

/** What the panel looked like before the automation touched it. */
interface PanelSnapshot {
  title: string;
  tab: string | null;
}

/** The open panel's state, or null when there is none (or it cannot be read). */
function snapshotPanel(doc: Document): PanelSnapshot | null {
  try {
    const panel = findPanel(doc);
    return panel ? { title: panel.title, tab: selectedTabValue(panel) } : null;
  } catch {
    return null;
  }
}

/**
 * Put the panel back: closed if it was closed; otherwise reopened on the craft
 * it showed, on the tab it showed (never the Edit tab).
 */
async function restorePanel(
  doc: Document,
  original: PanelSnapshot | null,
  timing: CraftReaderTiming
): Promise<void> {
  await closePanel(doc, timing);
  if (!original) return;

  const card = Array.from(doc.querySelectorAll<HTMLElement>('article'))
    .flatMap(article => findCraftCards(article))
    .find(candidate => craftCardName(candidate) === original.title);
  if (!card) return;
  pressCard(card);

  const panel = await waitFor(() => {
    const found = findPanel(doc);
    return found && found.title === original.title ? found : null;
  }, timing);
  if (!panel || !original.tab || original.tab === EDIT_TAB) return;

  // The reopened panel re-renders on its default tab after a moment (see
  // readOne), which would undo the tab restored here. Keep re-asserting the
  // wanted tab until the panel has stood still for `settleMs`.
  let stableSince = Date.now();
  let lastLayout = '';
  await waitFor(() => {
    const current = findPanel(doc);
    if (!current) return null;
    const tab = findTab(current, original.tab as string);
    if (tab && tab.getAttribute('aria-selected') !== 'true') selectTab(tab);
    const layout = Array.from(current.tablist.querySelectorAll(TAB_SELECTOR))
      .map(each => `${tabValue(each)}:${each.getAttribute('aria-selected')}`)
      .join(',');
    if (layout !== lastLayout) {
      lastLayout = layout;
      stableSince = Date.now();
    }
    return Date.now() - stableSince >= timing.settleMs ? true : null;
  }, timing);
}

/**
 * Read the source of every pending craft, one at a time, and leave the panel
 * as it was found. Never rejects: each card yields its own outcome.
 */
export async function readMerlinCrafts(
  pending: readonly PendingArtifact[],
  doc: Document = document,
  timing: CraftReaderTiming = DEFAULT_TIMING
): Promise<ArtifactReadOutcome[]> {
  const original = snapshotPanel(doc);
  const outcomes: ArtifactReadOutcome[] = [];
  try {
    for (const item of pending) {
      try {
        outcomes.push(await readOne(doc, item, timing));
      } catch (error) {
        outcomes.push({
          id: item.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    try {
      await restorePanel(doc, original, timing);
    } catch (error) {
      console.warn('[G2O] Could not restore the Merlin craft panel:', error);
    }
  }
  return outcomes;
}
