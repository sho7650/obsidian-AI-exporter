/**
 * Offscreen document tests
 *
 * Tests sender validation and clipboard operations
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture the message listener
let capturedListener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean | undefined;

// Mock the textarea element for clipboard operations
const mockTextarea = {
  value: '',
  select: vi.fn(),
};

describe('offscreen/offscreen', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockTextarea.value = '';

    // Mock document.querySelector to return our mock textarea
    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      if (selector === '#clipboard-textarea') {
        return mockTextarea as unknown as HTMLTextAreaElement;
      }
      return null;
    });

    // Mock document.execCommand (deprecated but used in offscreen for clipboard)
    // jsdom does not define execCommand, so use Object.defineProperty
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });

    // Capture message listener
    vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation(listener => {
      capturedListener = listener;
    });

    // Import fresh
    vi.resetModules();
    await import('../../src/offscreen/offscreen');
  });

  it('registers message listener', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(capturedListener).toBeDefined();
  });

  it('rejects messages from different extension IDs', () => {
    const sendResponse = vi.fn();
    const result = capturedListener(
      { action: 'clipboardWrite', target: 'offscreen', content: 'test' },
      { id: 'different-extension-id' } as chrome.runtime.MessageSender,
      sendResponse
    );

    // Should return false (not handled) and not call sendResponse
    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('rejects messages when sender.id is undefined', () => {
    const sendResponse = vi.fn();
    const result = capturedListener(
      { action: 'clipboardWrite', target: 'offscreen', content: 'test' },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('rejects messages from content scripts (sender.tab defined) (SEC-03)', () => {
    const sendResponse = vi.fn();
    const result = capturedListener(
      { action: 'clipboardWrite', target: 'offscreen', content: 'test' },
      {
        id: chrome.runtime.id,
        tab: { id: 1, index: 0, highlighted: false, active: true, pinned: false } as chrome.tabs.Tab,
      } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('accepts messages from background service worker (no sender.tab) (SEC-03)', () => {
    const sendResponse = vi.fn();
    capturedListener(
      { action: 'clipboardWrite', target: 'offscreen', content: 'hello' },
      { id: chrome.runtime.id } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('handles clipboard write from valid sender', () => {
    const sendResponse = vi.fn();
    capturedListener(
      { action: 'clipboardWrite', target: 'offscreen', content: 'test content' },
      { id: chrome.runtime.id } as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(mockTextarea.value).toBe(''); // Cleared after copy
    expect(mockTextarea.select).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});
