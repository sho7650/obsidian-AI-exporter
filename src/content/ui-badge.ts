/**
 * Persistent sync-status badge (issue #458, ADR-034).
 *
 * A toast that disappears after five seconds is invisible to anyone who
 * started a long sync and looked away — which is the whole complaint in #458.
 * The badge stays until the conversation changes or the user dismisses it.
 *
 * It reports the result of the LAST sync, not that the conversation is up to
 * date: adding messages afterwards does not clear it, so every rendering path
 * here states the age.
 */

import { getMessage } from '../lib/i18n';
import { describeAge, type SyncStatus, type SyncStatusKind } from './sync-status';
import { ensureSyncAnchor } from './ui';

const BADGE_ID = 'g2o-sync-badge';
const DETAIL_ID = 'g2o-sync-detail';

/** Plain glyphs, not emoji: emoji metrics vary per platform and a 20px disc has no room to spare. */
const BADGE_GLYPHS: Record<SyncStatusKind, string> = {
  success: '✓',
  partial: '!',
  error: '×',
};

const BADGE_LABEL_KEYS: Record<SyncStatusKind, string> = {
  success: 'badge_lastSyncSucceeded',
  partial: 'badge_lastSyncPartial',
  error: 'badge_lastSyncFailed',
};

/** Callbacks the caller supplies to keep its own state in step with the badge. */
export interface SyncBadgeHandlers {
  /** The user ticked the status off. Not called by {@link clearSyncBadge}. */
  onDismiss?: () => void;
}

interface BadgeState {
  status: SyncStatus;
  handlers: SyncBadgeHandlers;
  /** Removes the document-level listeners that close the panel. */
  detachPanelListeners: (() => void) | null;
}

let state: BadgeState | null = null;

/**
 * Show (or replace) the badge for a finished sync.
 */
export function showSyncBadge(status: SyncStatus, handlers: SyncBadgeHandlers = {}): void {
  closePanel();
  document.getElementById(BADGE_ID)?.remove();

  state = { status, handlers, detachPanelListeners: null };

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.dataset.kind = status.kind;
  badge.textContent = BADGE_GLYPHS[status.kind];
  badge.setAttribute('role', 'status');
  badge.setAttribute('tabindex', '0');
  badge.setAttribute('aria-label', badgeLabel(status));

  badge.addEventListener('click', event => {
    event.stopPropagation();
    togglePanel();
  });
  badge.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    togglePanel();
  });

  ensureSyncAnchor().appendChild(badge);
}

/**
 * Remove the badge because it no longer describes the page — a conversation
 * change, or a new sync taking over. Distinct from the user dismissing it, so
 * `onDismiss` does not fire.
 */
export function clearSyncBadge(): void {
  closePanel();
  document.getElementById(BADGE_ID)?.remove();
  state = null;
}

function badgeLabel(status: SyncStatus): string {
  return getMessage(BADGE_LABEL_KEYS[status.kind]);
}

function togglePanel(): void {
  if (document.getElementById(DETAIL_ID)) {
    closePanel();
    return;
  }
  openPanel();
}

function closePanel(): void {
  document.getElementById(DETAIL_ID)?.remove();
  if (state?.detachPanelListeners) {
    state.detachPanelListeners();
    state.detachPanelListeners = null;
  }
}

function openPanel(): void {
  if (!state) return;

  const panel = buildPanel(state.status);
  document.body.appendChild(panel);

  const onDocumentClick = (event: MouseEvent) => {
    // Clicks inside the panel (its dismiss button included) are handled there.
    if (event.target instanceof Node && panel.contains(event.target)) return;
    closePanel();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePanel();
  };

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
  state.detachPanelListeners = () => {
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onKeyDown);
  };
}

function buildPanel(status: SyncStatus): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = DETAIL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', badgeLabel(status));

  panel.appendChild(element('p', 'g2o-detail-title', badgeLabel(status)));
  panel.appendChild(timeLine(status));

  if (status.error) {
    panel.appendChild(element('p', 'g2o-detail-error', status.error));
  }

  if (status.fileName) {
    panel.appendChild(element('p', 'g2o-detail-file', status.fileName));
  }

  if (status.messagesAppended !== undefined) {
    panel.appendChild(
      element(
        'p',
        'g2o-detail-appended',
        getMessage('badge_detailAppended', String(status.messagesAppended))
      )
    );
  }

  if (status.results.length > 0) {
    const list = document.createElement('ul');
    status.results.forEach(result => {
      const item = element(
        'li',
        'g2o-detail-item',
        result.success ? result.destination : `${result.destination}: ${result.error ?? ''}`
      );
      item.setAttribute('data-destination', result.destination);
      item.setAttribute('data-success', String(result.success));
      list.appendChild(item);
    });
    panel.appendChild(list);
  }

  if (status.warnings.length > 0) {
    const list = document.createElement('ul');
    status.warnings.forEach(warning => {
      list.appendChild(element('li', 'g2o-detail-warning', warning));
    });
    panel.appendChild(list);
  }

  panel.appendChild(dismissButton());
  return panel;
}

/**
 * When the sync happened, in absolute *and* relative form.
 *
 * Both, deliberately: the absolute time is unambiguous, and the relative one
 * is what makes a stale badge legible at a glance.
 */
function timeLine(status: SyncStatus): HTMLElement {
  const age = describeAge(status.at, new Date());
  const relative =
    age.key === 'age_justNow'
      ? getMessage('badge_age_justNow')
      : getMessage(`badge_${age.key}`, String(age.value));

  const line = element(
    'p',
    'g2o-detail-time',
    getMessage('badge_detailLastSync', [status.at.toLocaleTimeString(), relative])
  );
  line.setAttribute('data-at', status.at.toISOString());
  return line;
}

function dismissButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'g2o-detail-dismiss';
  button.type = 'button';
  button.textContent = getMessage('badge_dismiss');
  button.addEventListener('click', event => {
    event.stopPropagation();
    const onDismiss = state?.handlers.onDismiss;
    clearSyncBadge();
    onDismiss?.();
  });
  return button;
}

function element(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
