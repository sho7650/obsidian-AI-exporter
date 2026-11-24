import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  craftCardName,
  findCraftCards,
  readMerlinCrafts,
} from '../../src/content/extractors/merlin-crafts';
import type { PendingArtifact } from '../../src/content/artifact-markers';
import { clearFixture } from '../fixtures/dom-helpers';
import {
  createMerlinPage,
  installCraftPanel,
  merlinAssistantArticle,
  merlinImageWidget,
  merlinUserArticle,
} from '../fixtures/merlin-dom';

const SOURCES = {
  'a.html': { language: 'html', lines: ['<p>a</p>', '<p>second</p>'] },
  'b.md': { language: 'markdown', lines: ['# b', '', 'text'] },
};

/** Fast timing so a card that never opens fails quickly. */
const FAST = { timeoutMs: 60, pollMs: 5, settleMs: 10 };
/** Real waits for the panel, but a short settle, for tests that restore an open panel. */
const QUICK = { timeoutMs: 2000, pollMs: 5, settleMs: 100 };

function pendingFor(...names: string[]): PendingArtifact[] {
  return names.map((name, index) => ({
    id: `craft-${index + 1}`,
    name,
    locate: () => findCraftCards(document).find(card => craftCardName(card) === name) ?? null,
  }));
}

function page(crafts: string[]): void {
  createMerlinPage([
    merlinUserArticle('u1', 'q'),
    merlinAssistantArticle('a1', { bodies: ['<p>x</p>'], crafts }),
  ]);
}

describe('findCraftCards / craftCardName', () => {
  beforeEach(clearFixture);

  it('finds the cards of a message and reads their file names', () => {
    page(['a.html', 'b.md']);

    const cards = findCraftCards(document);

    expect(cards.map(craftCardName)).toEqual(['a.html', 'b.md']);
  });

  it('does not take the image widget buttons for cards', () => {
    createMerlinPage([
      merlinUserArticle('u1', 'q'),
      merlinAssistantArticle('a1', { bodies: [merlinImageWidget('https://x.test/i.png', 'alt')] }),
    ]);

    expect(findCraftCards(document)).toEqual([]);
  });

  it('ignores a button.not-prose without a file name', () => {
    document.body.innerHTML = '<article><button class="not-prose"><svg></svg></button></article>';
    expect(findCraftCards(document)).toEqual([]);
  });

  it('does not look inside the response body', () => {
    createMerlinPage([
      merlinUserArticle('u1', 'q'),
      merlinAssistantArticle('a1', {
        bodies: ['<button class="not-prose"><div class="line-clamp-2">inside.md</div></button>'],
      }),
    ]);
    expect(findCraftCards(document)).toEqual([]);
  });
});

describe('readMerlinCrafts', () => {
  let uninstall: () => void = () => {};

  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    uninstall();
    uninstall = () => {};
    clearFixture();
  });

  it('reads the source line by line from the Code tab', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html', 'b.md']);

    const outcomes = await readMerlinCrafts(pendingFor('a.html', 'b.md'));

    expect(outcomes).toEqual([
      { id: 'craft-1', language: 'html', content: '<p>a</p>\n<p>second</p>' },
      { id: 'craft-2', language: 'markdown', content: '# b\n\ntext' },
    ]);
    expect(panel.log.openedTitles).toEqual(['a.html', 'b.md']);
  });

  it('selects the tab with mousedown, never the Edit tab', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html']);

    await readMerlinCrafts(pendingFor('a.html'));

    expect(panel.log.clickedTabs).toEqual(['code']);
  });

  it('closes the panel when it was closed before', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html']);

    await readMerlinCrafts(pendingFor('a.html'));

    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.querySelector('button.not-prose p')?.textContent).toBe('Click to open craft');
  });

  it('reopens the craft that was open, on the tab it was on', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html', 'b.md']);
    findCraftCards(document)[1].click(); // the user had b.md open, on Preview
    panel.log.openedTitles.length = 0;
    panel.log.clickedTabs.length = 0;

    await readMerlinCrafts(pendingFor('a.html'), document, QUICK);

    expect(panel.log.openedTitles).toEqual(['a.html', 'b.md']);
    const title = document
      .querySelector('[role="tablist"]')
      ?.closest('div[dir]')
      ?.querySelector('span.text-base');
    expect(title?.textContent).toBe('b.md');
    expect(
      document.querySelector('[role="tab"][aria-selected="true"]')?.id.endsWith('-trigger-preview')
    ).toBe(true);
  });

  it('restores a Code tab that was selected, and leaves an Edit tab alone', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html', 'b.md']);
    findCraftCards(document)[1].click();
    const tab = (value: string): HTMLElement =>
      document.querySelector<HTMLElement>(`[role="tab"][id$="-trigger-${value}"]`)!;
    tab('code').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    panel.log.clickedTabs.length = 0;

    await readMerlinCrafts(pendingFor('a.html'), document, QUICK);

    expect(panel.log.clickedTabs).toEqual(['code', 'code']); // read of a.html, then the restore
    expect(
      document.querySelector('[role="tab"][aria-selected="true"]')?.id.endsWith('-trigger-code')
    ).toBe(true);

    // Now the user is on the Edit tab: reading must not re-select it.
    tab('edit').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    panel.log.clickedTabs.length = 0;

    await readMerlinCrafts(pendingFor('a.html'), document, QUICK);

    expect(panel.log.clickedTabs).toEqual(['code']);
    expect(panel.log.clickedTabs).not.toContain('edit');
  });

  it('keeps the restored tab when the reopened panel falls back to Preview', async () => {
    const panel = installCraftPanel(SOURCES, { fallsBackToPreview: ['b.md'] });
    uninstall = panel.uninstall;
    page(['a.html', 'b.md']);
    findCraftCards(document)[1].click();
    const codeTab = document.querySelector<HTMLElement>('[role="tab"][id$="-trigger-code"]')!;
    codeTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));

    await readMerlinCrafts(pendingFor('a.html'), document, QUICK);
    await new Promise(resolve => setTimeout(resolve, 80)); // past the fallback

    expect(
      document.querySelector('[role="tab"][aria-selected="true"]')?.id.endsWith('-trigger-code')
    ).toBe(true);
  });

  it('keeps every craft when two share a name', async () => {
    const panel = installCraftPanel({ 'd.mmd': { language: 'mermaid', lines: ['graph TD'] } });
    uninstall = panel.uninstall;
    page(['d.mmd', 'd.mmd']);
    const pending: PendingArtifact[] = [0, 1].map(index => ({
      id: `craft-${index + 1}`,
      name: 'd.mmd',
      locate: () => findCraftCards(document)[index] ?? null,
    }));

    const outcomes = await readMerlinCrafts(pending);

    expect(outcomes.map(o => 'content' in o && o.content)).toEqual(['graph TD', 'graph TD']);
    expect(panel.log.openedTitles).toHaveLength(2);
  });

  it('reports a card that is gone, and goes on', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['b.md']);
    const pending: PendingArtifact[] = [
      { id: 'craft-1', name: 'a.html', locate: () => null },
      ...pendingFor('b.md').map(item => ({ ...item, id: 'craft-2' })),
    ];

    const outcomes = await readMerlinCrafts(pending, document, FAST);

    expect(outcomes[0]).toEqual({ id: 'craft-1', reason: 'craft card is no longer on the page' });
    expect(outcomes[1]).toMatchObject({ id: 'craft-2', content: '# b\n\ntext' });
  });

  it('reports a panel that never opens, and goes on', async () => {
    const panel = installCraftPanel(SOURCES, { neverOpens: ['a.html'] });
    uninstall = panel.uninstall;
    page(['a.html', 'b.md']);

    const outcomes = await readMerlinCrafts(pendingFor('a.html', 'b.md'), document, FAST);

    expect(outcomes[0]).toEqual({
      id: 'craft-1',
      reason: 'the craft panel did not open (no panel appeared)',
    });
    expect(outcomes[1]).toMatchObject({ id: 'craft-2', language: 'markdown' });
  });

  it('selects the Code tab again when the panel falls back to another one', async () => {
    const panel = installCraftPanel(SOURCES, { ignoresFirstTabSelection: ['a.html'] });
    uninstall = panel.uninstall;
    page(['a.html']);

    const outcomes = await readMerlinCrafts(pendingFor('a.html'));

    expect(outcomes[0]).toMatchObject({ id: 'craft-1', language: 'html' });
    expect(panel.log.clickedTabs).toEqual(['code', 'code']);
  });

  it('reports a panel without a Code tab', async () => {
    const panel = installCraftPanel(SOURCES, { noCodeTab: ['a.html'] });
    uninstall = panel.uninstall;
    page(['a.html']);

    const outcomes = await readMerlinCrafts(pendingFor('a.html'), document, FAST);

    expect(outcomes[0]).toEqual({ id: 'craft-1', reason: 'the Code tab was not found' });
    expect(panel.log.clickedTabs).toEqual([]);
  });

  it('reports a Code tab whose source never shows up', async () => {
    const panel = installCraftPanel({}); // no source registered: the Code panel stays empty
    uninstall = panel.uninstall;
    page(['a.html']);

    const outcomes = await readMerlinCrafts(pendingFor('a.html'), document, FAST);

    expect(outcomes[0]).toEqual({
      id: 'craft-1',
      reason: 'the source did not appear in the Code tab',
    });
  });

  it('turns an exception into an outcome instead of rejecting', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html']);
    const throwing: PendingArtifact = {
      id: 'craft-1',
      name: 'a.html',
      locate: () => {
        throw new Error('page exploded');
      },
    };

    const outcomes = await readMerlinCrafts([throwing], document, FAST);

    expect(outcomes).toEqual([{ id: 'craft-1', reason: 'page exploded' }]);
  });

  it('survives a failure while restoring the panel', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html', 'b.md']);
    findCraftCards(document)[1].click();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw new Error('dom gone');
    });

    try {
      const outcomes = await readMerlinCrafts([], document, FAST);

      expect(outcomes).toEqual([]);
      expect(warn).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('does nothing and returns nothing for no cards', async () => {
    const panel = installCraftPanel(SOURCES);
    uninstall = panel.uninstall;
    page(['a.html']);

    expect(await readMerlinCrafts([])).toEqual([]);
    expect(panel.log.openedTitles).toEqual([]);
  });
});
