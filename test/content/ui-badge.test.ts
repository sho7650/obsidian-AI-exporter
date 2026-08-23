/**
 * Sync-status badge tests (issue #458)
 *
 * The badge outlives the toast, so what it claims matters more: it reports the
 * result of the LAST sync, never that the conversation is up to date.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showSyncBadge, clearSyncBadge } from '../../src/content/ui-badge';
import { injectSyncButton } from '../../src/content/ui';
import type { SyncStatus } from '../../src/content/sync-status';
import type { OutputResult } from '../../src/lib/types';

const AT = new Date('2026-08-23T14:32:00Z');

function status(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    kind: 'success',
    at: AT,
    conversationKey: 'conv-1',
    fileName: 'my-note.md',
    results: [{ destination: 'obsidian', success: true }] as OutputResult[],
    warnings: [],
    ...overrides,
  };
}

const badge = () => document.getElementById('g2o-sync-badge');
const panel = () => document.getElementById('g2o-sync-detail');

describe('sync badge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearSyncBadge();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('showSyncBadge', () => {
    it('renders a success badge', () => {
      showSyncBadge(status());

      expect(badge()).not.toBeNull();
      expect(badge()?.dataset.kind).toBe('success');
      expect(badge()?.textContent).toBe('✓');
    });

    it('renders an error badge', () => {
      showSyncBadge(status({ kind: 'error' }));

      expect(badge()?.dataset.kind).toBe('error');
      expect(badge()?.textContent).toBe('×');
    });

    it('renders a partial badge', () => {
      showSyncBadge(status({ kind: 'partial' }));

      expect(badge()?.dataset.kind).toBe('partial');
      expect(badge()?.textContent).toBe('!');
    });

    it('anchors the badge alongside the sync button', () => {
      injectSyncButton(vi.fn());
      showSyncBadge(status());

      const anchor = document.getElementById('g2o-sync-anchor');
      expect(anchor).not.toBeNull();
      expect(badge()?.parentElement).toBe(anchor);
      expect(document.getElementById('g2o-sync-button')?.parentElement).toBe(anchor);
    });

    it('renders without a sync button present', () => {
      showSyncBadge(status());

      expect(badge()).not.toBeNull();
    });

    it('replaces a previous badge instead of stacking', () => {
      showSyncBadge(status());
      showSyncBadge(status({ kind: 'error' }));

      expect(document.querySelectorAll('#g2o-sync-badge')).toHaveLength(1);
      expect(badge()?.dataset.kind).toBe('error');
    });

    it('closes an open panel when a new sync replaces the badge', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(panel()).not.toBeNull();

      showSyncBadge(status({ kind: 'error' }));

      expect(panel()).toBeNull();
    });

    it('exposes the status to assistive technology', () => {
      showSyncBadge(status());

      expect(badge()?.getAttribute('role')).toBe('status');
      expect(badge()?.getAttribute('aria-label')).toBeTruthy();
      expect(badge()?.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('detail panel', () => {
    it('opens on click', () => {
      showSyncBadge(status());

      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()).not.toBeNull();
    });

    it('opens on Enter', () => {
      showSyncBadge(status());

      badge()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(panel()).not.toBeNull();
    });

    it('closes on a second click', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()).toBeNull();
      expect(badge()).not.toBeNull();
    });

    it('shows the file the note was saved as', () => {
      showSyncBadge(status({ fileName: 'saved-under-this.md' }));
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()?.textContent).toContain('saved-under-this.md');
    });

    it('lists each destination with its outcome', () => {
      showSyncBadge(
        status({
          kind: 'partial',
          results: [
            { destination: 'obsidian', success: true },
            { destination: 'file', success: false, error: 'disk full' },
          ],
        })
      );
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const items = panel()?.querySelectorAll('.g2o-detail-item');
      expect(items).toHaveLength(2);
      expect(items?.[0].getAttribute('data-destination')).toBe('obsidian');
      expect(items?.[0].getAttribute('data-success')).toBe('true');
      expect(items?.[1].getAttribute('data-success')).toBe('false');
      expect(items?.[1].textContent).toContain('disk full');
    });

    it('records when the sync happened', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()?.querySelector('.g2o-detail-time')?.getAttribute('data-at')).toBe(
        AT.toISOString()
      );
    });

    it('lists warnings', () => {
      showSyncBadge(status({ warnings: ['1 image could not be saved'] }));
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()?.querySelectorAll('.g2o-detail-warning')).toHaveLength(1);
      expect(panel()?.textContent).toContain('1 image could not be saved');
    });

    it('omits the warning list when there are none', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()?.querySelectorAll('.g2o-detail-warning')).toHaveLength(0);
    });

    it('reports the append count when append mode ran', () => {
      showSyncBadge(status({ messagesAppended: 3 }));
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()?.querySelector('.g2o-detail-appended')).not.toBeNull();
    });

    it('closes on Escape but keeps the badge', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(panel()).toBeNull();
      expect(badge()).not.toBeNull();
    });

    it('closes on an outside click but keeps the badge', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()).toBeNull();
      expect(badge()).not.toBeNull();
    });

    it('stays open when the panel itself is clicked', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      panel()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(panel()).not.toBeNull();
    });
  });

  describe('dismiss', () => {
    it('removes the badge and the panel', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      panel()
        ?.querySelector<HTMLButtonElement>('.g2o-detail-dismiss')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(badge()).toBeNull();
      expect(panel()).toBeNull();
    });

    it('notifies the caller so it can stop watching', () => {
      const onDismiss = vi.fn();
      showSyncBadge(status(), { onDismiss });
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      panel()
        ?.querySelector<HTMLButtonElement>('.g2o-detail-dismiss')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearSyncBadge', () => {
    it('removes the badge and the panel', () => {
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      clearSyncBadge();

      expect(badge()).toBeNull();
      expect(panel()).toBeNull();
    });

    it('does not call onDismiss — clearing is not the user ticking it off', () => {
      const onDismiss = vi.fn();
      showSyncBadge(status(), { onDismiss });

      clearSyncBadge();

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('is a no-op when no badge is shown', () => {
      expect(() => clearSyncBadge()).not.toThrow();
    });

    it('detaches its document listeners', () => {
      // A stale Escape handler would keep firing on every keypress for the
      // life of the tab.
      showSyncBadge(status());
      badge()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      clearSyncBadge();

      expect(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      ).not.toThrow();
      expect(panel()).toBeNull();
    });
  });
});

describe('pre-save failure', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => clearSyncBadge());

  it('shows the error text when no destination ever ran', () => {
    showSyncBadge(
      status({
        kind: 'error',
        results: [],
        fileName: undefined,
        error: 'Cannot connect to Obsidian',
      })
    );
    document
      .getElementById('g2o-sync-badge')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const errorLine = document
      .getElementById('g2o-sync-detail')
      ?.querySelector('.g2o-detail-error');
    expect(errorLine?.textContent).toContain('Cannot connect to Obsidian');
  });
});
