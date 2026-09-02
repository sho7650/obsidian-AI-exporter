/**
 * UI components for content script
 * Floating button, toast notifications, loading states
 */

import {
  DEFAULT_TOAST_DURATION,
  SUCCESS_TOAST_DURATION,
  ERROR_TOAST_DURATION,
  WARNING_TOAST_DURATION,
} from '../lib/constants';
import { getMessage } from '../lib/i18n';

// CSS styles for UI components
const STYLES = `
  #g2o-sync-anchor {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
  }

  #g2o-sync-button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
    transition: all 0.2s ease;
  }

  #g2o-sync-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(124, 58, 237, 0.5);
  }

  #g2o-sync-button:active {
    transform: translateY(0);
  }

  #g2o-sync-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  #g2o-sync-button .icon {
    font-size: 16px;
  }

  #g2o-sync-button .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: g2o-spin 0.8s linear infinite;
  }

  @keyframes g2o-spin {
    to { transform: rotate(360deg); }
  }

  .g2o-toast {
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    animation: g2o-slideIn 0.3s ease;
    max-width: 400px;
  }

  @keyframes g2o-slideIn {
    from {
      opacity: 0;
      transform: translateX(100px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .g2o-toast.success {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .g2o-toast.error {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }

  .g2o-toast.warning {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  .g2o-toast.info {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
  }

  .g2o-toast .icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .g2o-toast .message {
    flex: 1;
    line-height: 1.4;
  }

  .g2o-toast .close {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    margin-left: 8px;
  }

  .g2o-toast .close:hover {
    opacity: 1;
  }

  /* ---- Sync status badge (issue #458, ADR-034) ----
     Anchored to the sync button's corner rather than a screen edge: the
     extension already owns this space, so the badge cannot collide with the
     platform's own controls (all five put account/share menus top-right). */
  #g2o-sync-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.9);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    user-select: none;
  }

  #g2o-sync-badge[data-kind="success"] { background: #10b981; }
  #g2o-sync-badge[data-kind="partial"] { background: #f59e0b; }
  #g2o-sync-badge[data-kind="error"]   { background: #ef4444; }

  #g2o-sync-badge:focus-visible {
    outline: 2px solid #7c3aed;
    outline-offset: 2px;
  }

  #g2o-sync-detail {
    position: fixed;
    bottom: 76px;
    right: 20px;
    z-index: 10002;
    max-width: 320px;
    max-height: 50vh;
    overflow-y: auto;
    padding: 14px 16px;
    background: white;
    color: #1f2937;
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }

  #g2o-sync-detail .g2o-detail-title {
    font-weight: 600;
    margin: 0 0 6px;
  }

  #g2o-sync-detail .g2o-detail-time,
  #g2o-sync-detail .g2o-detail-file,
  #g2o-sync-detail .g2o-detail-appended {
    margin: 0 0 6px;
    color: #4b5563;
    word-break: break-word;
  }

  #g2o-sync-detail ul {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
  }

  #g2o-sync-detail .g2o-detail-error {
    margin: 0 0 6px;
    color: #b91c1c;
    word-break: break-word;
  }

  #g2o-sync-detail .g2o-detail-item[data-success="false"] { color: #b91c1c; }
  #g2o-sync-detail .g2o-detail-warning { color: #b45309; }

  #g2o-sync-detail .g2o-detail-dismiss {
    width: 100%;
    padding: 8px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #f9fafb;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  #g2o-sync-detail .g2o-detail-dismiss:hover { background: #f3f4f6; }
`;

let styleInjected = false;
let currentToast: HTMLDivElement | null = null;

/**
 * Inject CSS styles into the page
 */
function injectStyles(): void {
  if (styleInjected) return;

  const style = document.createElement('style');
  style.id = 'g2o-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * The positioned container holding the sync button and its status badge.
 *
 * The badge is a sibling of the button rather than a child: a second click
 * target inside a `<button>` is invalid HTML and its clicks would trigger a
 * sync. Anchoring both to this wrapper keeps the badge glued to the button's
 * corner without measuring anything in JS.
 */
export function ensureSyncAnchor(): HTMLDivElement {
  injectStyles();

  const existing = document.getElementById('g2o-sync-anchor');
  if (existing) return existing as HTMLDivElement;

  const anchor = document.createElement('div');
  anchor.id = 'g2o-sync-anchor';
  document.body.appendChild(anchor);
  return anchor;
}

/**
 * Create and inject the sync button
 */
export function injectSyncButton(onClick: () => void): HTMLButtonElement {
  const anchor = ensureSyncAnchor();

  // Remove existing button if present
  const existing = document.getElementById('g2o-sync-button');
  if (existing) {
    existing.remove();
  }

  const button = document.createElement('button');
  button.id = 'g2o-sync-button';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = '📥';

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = getMessage('ui_syncButton');

  button.appendChild(icon);
  button.appendChild(text);

  button.addEventListener('click', onClick);
  // Prepend so the badge, appended later, paints above the button.
  anchor.prepend(button);

  return button;
}

/**
 * Set button loading state
 */
export function setButtonLoading(loading: boolean): void {
  const button = document.getElementById('g2o-sync-button') as HTMLButtonElement | null;
  if (!button) return;

  button.disabled = loading;

  const icon = button.querySelector('.icon');
  const text = button.querySelector('.text');

  if (loading) {
    if (icon) {
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      icon.replaceWith(spinner);
    }
    if (text) text.textContent = getMessage('ui_syncing');
  } else {
    const spinner = button.querySelector('.spinner');
    if (spinner) {
      const newIcon = document.createElement('span');
      newIcon.className = 'icon';
      newIcon.textContent = '📥';
      spinner.replaceWith(newIcon);
    }
    if (text) text.textContent = getMessage('ui_syncButton');
  }
}

type ToastType = 'success' | 'error' | 'warning' | 'info';

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

/**
 * Show a toast notification
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration: number = DEFAULT_TOAST_DURATION
): void {
  injectStyles();

  // Remove existing toast if present
  if (currentToast) {
    currentToast.remove();
    currentToast = null;
  }

  const toast = document.createElement('div');
  toast.className = `g2o-toast ${type}`;
  currentToast = toast;

  const toastIcon = document.createElement('span');
  toastIcon.className = 'icon';
  toastIcon.textContent = TOAST_ICONS[type];

  const toastMessage = document.createElement('span');
  toastMessage.className = 'message';
  toastMessage.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => {
    toast.remove();
    if (currentToast === toast) {
      currentToast = null;
    }
  });

  toast.appendChild(toastIcon);
  toast.appendChild(toastMessage);
  toast.appendChild(closeBtn);

  document.body.appendChild(toast);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => {
      if (currentToast !== toast) return;
      toast.style.animation = 'g2o-slideIn 0.3s ease reverse';
      setTimeout(() => {
        toast.remove();
        if (currentToast === toast) {
          currentToast = null;
        }
      }, 300);
    }, duration);
  }
}

/**
 * Show success toast with file info
 */
export function showSuccessToast(fileName: string, isNewFile: boolean): void {
  const messageKey = isNewFile ? 'toast_success_created' : 'toast_success_updated';
  showToast(getMessage(messageKey, fileName), 'success', SUCCESS_TOAST_DURATION);
}

/**
 * Show error toast with details
 */
export function showErrorToast(error: string): void {
  showToast(error, 'error', ERROR_TOAST_DURATION);
}

/**
 * Show warning toast
 */
export function showWarningToast(message: string): void {
  showToast(message, 'warning', WARNING_TOAST_DURATION);
}
