import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ObsidianApiClient,
  ObsidianApiError,
  isObsidianApiError,
  classifyNetworkError,
} from '../../src/lib/obsidian-api';
import { getErrorMessage } from '../../src/lib/error-utils';

describe('ObsidianApiClient', () => {
  let client: ObsidianApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new ObsidianApiClient(27123, 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('constructs with port and API key', () => {
      const client = new ObsidianApiClient(28000, 'my-key');
      // Verify by making a request and checking the URL
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      void client.testConnection();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:28000/vault/',
        expect.any(Object)
      );
    });
  });

  describe('testConnection', () => {
    it('returns success when connection and authentication succeed', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await client.testConnection();

      expect(result).toEqual({
        reachable: true,
        authenticated: true,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/',
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer test-api-key' },
        })
      );
    });

    it('returns authenticated:false when API key is invalid (401)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const result = await client.testConnection();

      expect(result).toEqual({
        reachable: true,
        authenticated: false,
        error: 'Invalid API key',
      });
    });

    it('returns authenticated:false when API key is forbidden (403)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      const result = await client.testConnection();

      expect(result).toEqual({
        reachable: true,
        authenticated: false,
        error: 'Invalid API key',
      });
    });

    it('returns authenticated:false for other server errors', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await client.testConnection();

      expect(result).toEqual({
        reachable: true,
        authenticated: false,
        error: 'Server error: 500',
      });
    });

    it('returns reachable:false when network error occurs', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await client.testConnection();

      expect(result).toEqual({
        reachable: false,
        authenticated: false,
        error: 'Cannot reach Obsidian. Is it running?',
      });
    });

    it('returns timeout error when request times out', async () => {
      const timeoutError = new DOMException('The operation timed out', 'TimeoutError');
      mockFetch.mockRejectedValue(timeoutError);

      const result = await client.testConnection();

      expect(result).toEqual({
        reachable: false,
        authenticated: false,
        error: 'Connection timed out',
      });
    });
  });

  describe('getFile', () => {
    it('returns file content when file exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('# File Content'),
      });

      const content = await client.getFile('path/to/file.md');

      expect(content).toBe('# File Content');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/path%2Fto%2Ffile.md',
        expect.any(Object)
      );
    });

    it('returns null when file does not exist (404)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const content = await client.getFile('non-existent.md');

      expect(content).toBeNull();
    });

    it('throws error for other status codes', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.getFile('path/to/file.md')).rejects.toMatchObject({
        status: 500,
        message: 'Failed to get file: Internal Server Error',
      });
    });

    it('throws timeout error for network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.getFile('path/to/file.md')).rejects.toMatchObject({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });

    it('throws timeout error for AbortError', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      await expect(client.getFile('path/to/file.md')).rejects.toMatchObject({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });

    it('encodes path correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('content'),
      });

      await client.getFile('AI/Gemini/test file.md');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/AI%2FGemini%2Ftest%20file.md',
        expect.any(Object)
      );
    });
  });

  describe('putFile', () => {
    it('creates or updates file successfully', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await client.putFile('path/to/file.md', '# New Content');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/path%2Fto%2Ffile.md',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'text/markdown',
          },
          body: '# New Content',
        })
      );
    });

    it('throws error for failed response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(client.putFile('path/to/file.md', 'content')).rejects.toMatchObject({
        status: 403,
        message: 'Failed to save file: Forbidden',
      });
    });

    it('throws timeout error for network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.putFile('path/to/file.md', 'content')).rejects.toMatchObject({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });

    it('throws timeout error for TimeoutError', async () => {
      const timeoutError = new DOMException('The operation timed out', 'TimeoutError');
      mockFetch.mockRejectedValue(timeoutError);

      await expect(client.putFile('path/to/file.md', 'content')).rejects.toMatchObject({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });
  });


  describe('listFiles', () => {
    it('returns file list for existing directory', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ files: ['note1.md', 'note2.md', 'subdir/'] }),
      });

      const files = await client.listFiles('AI/claude');

      expect(files).toEqual(['note1.md', 'note2.md']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/AI%2Fclaude/',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        })
      );
    });

    it('returns empty array for non-existent directory (404)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const files = await client.listFiles('nonexistent');

      expect(files).toEqual([]);
    });

    it('filters out directories from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ files: ['note.md', 'images/', 'another.md', 'docs/'] }),
      });

      const files = await client.listFiles('AI');

      expect(files).toEqual(['note.md', 'another.md']);
    });

    it('throws error for server errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.listFiles('AI')).rejects.toMatchObject({
        status: 500,
        message: 'Failed to list files: Internal Server Error',
      });
    });

    it('throws timeout error for network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.listFiles('AI')).rejects.toMatchObject({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });
  });

  describe('AbortSignal.timeout fallback', () => {
    it('uses fallback when AbortSignal.timeout is not available', async () => {
      // Save original AbortSignal.timeout
      const originalTimeout = AbortSignal.timeout;

      // Remove AbortSignal.timeout to trigger fallback
      // @ts-expect-error - intentionally removing for test
      delete AbortSignal.timeout;

      // Re-import the module to use the fallback path
      vi.resetModules();
      const { ObsidianApiClient: FreshClient } = await import('../../src/lib/obsidian-api');

      const freshMockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', freshMockFetch);

      const freshClient = new FreshClient(27123, 'test-key');
      await freshClient.testConnection();

      // Verify fetch was called with an AbortSignal to /vault/ endpoint
      expect(freshMockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );

      // Restore AbortSignal.timeout
      AbortSignal.timeout = originalTimeout;
    });
  });
});

describe('ObsidianApiError', () => {
  it('extends Error with name and status', () => {
    const error = new ObsidianApiError(404, 'Not found');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ObsidianApiError);
    expect(error.name).toBe('ObsidianApiError');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.stack).toBeDefined();
  });
});

describe('isObsidianApiError', () => {
  it('returns true for ObsidianApiError instance', () => {
    expect(isObsidianApiError(new ObsidianApiError(404, 'Not found'))).toBe(true);
  });

  it('returns false for plain object with status and message', () => {
    expect(isObsidianApiError({ status: 404, message: 'Not found' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isObsidianApiError(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isObsidianApiError('error')).toBe(false);
    expect(isObsidianApiError(123)).toBe(false);
  });

  it('returns false for generic Error', () => {
    expect(isObsidianApiError(new Error('test'))).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('returns message for network error (status 0)', () => {
    const error = new ObsidianApiError(0, 'Timeout');
    expect(getErrorMessage(error)).toBe(
      'Obsidian REST API is not running. Please ensure Obsidian is open and the Local REST API plugin is enabled.'
    );
  });

  it('returns message for auth error (status 401)', () => {
    const error = new ObsidianApiError(401, 'Unauthorized');
    expect(getErrorMessage(error)).toBe(
      'Invalid API key. Please check your settings.'
    );
  });

  it('returns message for auth error (status 403)', () => {
    const error = new ObsidianApiError(403, 'Forbidden');
    expect(getErrorMessage(error)).toBe(
      'Invalid API key. Please check your settings.'
    );
  });

  it('returns message for not found error (status 404)', () => {
    const error = new ObsidianApiError(404, 'Not Found');
    expect(getErrorMessage(error)).toBe('File not found in vault.');
  });

  it('returns original message for other status codes', () => {
    const error = new ObsidianApiError(500, 'Internal Server Error');
    expect(getErrorMessage(error)).toBe('Internal Server Error');
  });

  it('returns Error.message for Error instances', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error)).toBe('Something went wrong');
  });

  it('returns stringified value for unknown error types', () => {
    // getErrorMessage now uses extractErrorMessage as fallback which stringifies the value
    expect(getErrorMessage('string error')).toBe('string error');
    expect(getErrorMessage(123)).toBe('123');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});

describe('classifyNetworkError', () => {
  it('returns "abort" for DOMException with name AbortError', () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const result = classifyNetworkError(abortError);
    expect(result).toBe('abort');
  });
});
