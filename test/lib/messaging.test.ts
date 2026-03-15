import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendMessage } from '../../src/lib/messaging';

describe('sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset lastError
    (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError = null;
  });

  it('sends message and resolves with response', async () => {
    const mockResponse = { setting: 'value' };
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback(mockResponse);
      }
    );

    const result = await sendMessage({ action: 'getSettings' });
    expect(result).toEqual(mockResponse);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'getSettings' },
      expect.any(Function)
    );
  });

  it('replaces Chrome context invalidation lastError with user-friendly message', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError = {
          message: 'Extension context invalidated.',
        };
        if (callback) callback(undefined);
      }
    );

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Extension context invalidated. Please reload the page.'
    );
  });

  it('passes through non-context-invalidation lastError messages', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError = {
          message: 'Could not establish connection. Receiving end does not exist.',
        };
        if (callback) callback(undefined);
      }
    );

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Could not establish connection. Receiving end does not exist.'
    );
  });

  it('rejects with "Unknown error" when lastError has no message', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError =
          {} as chrome.runtime.LastError;
        if (callback) callback(undefined);
      }
    );

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow('Unknown error');
  });

  it('handles testConnection action', async () => {
    const mockResponse = { success: true };
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback(mockResponse);
      }
    );

    const result = await sendMessage({ action: 'testConnection' });
    expect(result).toEqual({ success: true });
  });

  it('handles saveToObsidian action', async () => {
    const mockResponse = { success: true, filePath: '/path/to/file.md' };
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback(mockResponse);
      }
    );

    const result = await sendMessage({
      action: 'saveToObsidian',
      data: {} as Parameters<typeof sendMessage>[0] extends { data?: infer D } ? D : never,
    } as Parameters<typeof sendMessage>[0]);
    expect(result).toEqual({ success: true, filePath: '/path/to/file.md' });
  });
});

describe('sendMessage - extension context invalidation', () => {
  let originalRuntime: typeof chrome.runtime;

  beforeEach(() => {
    originalRuntime = chrome.runtime;
  });

  afterEach(() => {
    // Always restore chrome.runtime to prevent test pollution
    Object.defineProperty(chrome, 'runtime', {
      value: originalRuntime,
      writable: true,
      configurable: true,
    });
  });

  it('rejects when chrome.runtime is undefined', async () => {
    Object.defineProperty(chrome, 'runtime', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Extension context invalidated. Please reload the page.'
    );
  });

  it('rejects when chrome.runtime.id is undefined (context invalidated but runtime object exists)', async () => {
    // This is the real-world scenario: chrome.runtime still exists as an object,
    // chrome.runtime.sendMessage still exists as a function, but chrome.runtime.id
    // becomes undefined when the extension context is invalidated.
    Object.defineProperty(chrome, 'runtime', {
      value: { ...originalRuntime, id: undefined },
      writable: true,
      configurable: true,
    });

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Extension context invalidated. Please reload the page.'
    );
  });

  it('rejects when chrome.runtime.sendMessage throws synchronously', async () => {
    // When context is invalidated, sendMessage() can throw synchronously
    // even though the function reference still exists
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Extension context invalidated. Please reload the page.'
    );
  });

  it('rejects cleanly when chrome.runtime becomes undefined during in-flight message', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        // Simulate context invalidation mid-flight
        Object.defineProperty(chrome, 'runtime', {
          value: { id: undefined },
          writable: true,
          configurable: true,
        });
        if (callback) callback(undefined);
      }
    );

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Extension context invalidated. Please reload the page.'
    );
  });
});
