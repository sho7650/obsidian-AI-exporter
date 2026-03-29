/**
 * Obsidian Local REST API client
 * API docs: https://github.com/coddingtonbear/obsidian-local-rest-api
 */

import { DEFAULT_API_TIMEOUT } from './constants';

/**
 * Network error type classification
 */
type NetworkErrorType = 'connection' | 'timeout' | 'abort' | 'unknown';

/**
 * Classify the type of network error
 *
 * @param error - The caught error
 * @returns The classified error type
 */
export function classifyNetworkError(error: unknown): NetworkErrorType {
  // TypeError: Failed to fetch (Chrome)
  // TypeError: NetworkError when attempting to fetch resource (Firefox)
  if (error instanceof TypeError) {
    return 'connection';
  }

  // DOMException handling
  if (error instanceof DOMException) {
    // TimeoutError: AbortSignal.timeout() triggered
    if (error.name === 'TimeoutError') {
      return 'timeout';
    }
    // AbortError: User-initiated abort or AbortController.abort()
    if (error.name === 'AbortError') {
      return 'abort';
    }
  }

  return 'unknown';
}

/**
 * Check if an error is a network-related error
 *
 * @param error - The caught error
 * @returns True if the error is network-related
 */
function isNetworkError(error: unknown): boolean {
  return classifyNetworkError(error) !== 'unknown';
}

/**
 * Create an AbortSignal with timeout
 * Polyfill for AbortSignal.timeout() (Chrome < 103 support)
 *
 * Memory safety: If fetch completes before the timer, the setTimeout
 * callback may remain pending, but the controller will be GC'd,
 * so no memory leak occurs.
 */
function createTimeoutSignal(ms: number): AbortSignal {
  // Use native API on Chrome 103+
  if ('timeout' in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  // Fallback for Chrome < 103
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Connection test result with detailed status
 */
interface ConnectionTestResult {
  /** Server is reachable */
  reachable: boolean;
  /** API Key is valid (authentication succeeded) */
  authenticated: boolean;
  /** Error message (when failed) */
  error?: string;
}

export class ObsidianApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ObsidianApiError';
    this.status = status;
  }
}

export class ObsidianApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Fetch with timeout and unified network error handling.
   * Wraps fetch() with AbortSignal.timeout and converts network errors
   * to ObsidianApiError. Used by getFile, putFile, listFiles.
   *
   * Not used by testConnection (which returns a result object instead of throwing).
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...options,
        signal: createTimeoutSignal(DEFAULT_API_TIMEOUT),
      });
    } catch (error) {
      if (isNetworkError(error)) {
        throw this.createError(0, 'Request timed out. Please check your connection.');
      }
      throw error;
    }
  }

  /**
   * Test API connection with authentication verification
   *
   * Uses /vault/ endpoint which requires authentication.
   * This ensures the API key is validated, not just server reachability.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await fetch(`${this.baseUrl}/vault/`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: createTimeoutSignal(DEFAULT_API_TIMEOUT),
      });

      // Authentication error
      if (response.status === 401 || response.status === 403) {
        return {
          reachable: true,
          authenticated: false,
          error: 'Invalid API key',
        };
      }

      // Other server errors
      if (!response.ok) {
        return {
          reachable: true,
          authenticated: false,
          error: `Server error: ${response.status}`,
        };
      }

      // Success
      return {
        reachable: true,
        authenticated: true,
      };
    } catch (error) {
      // Network error
      const errorType = classifyNetworkError(error);
      return {
        reachable: false,
        authenticated: false,
        error:
          errorType === 'timeout'
            ? 'Connection timed out'
            : 'Cannot reach Obsidian. Is it running?',
      };
    }
  }

  /**
   * Get file content from vault
   * @param path - Path relative to vault root (e.g., "AI/Gemini/conversation.md")
   * @returns File content as string, or null if file doesn't exist
   */
  async getFile(path: string): Promise<string | null> {
    const encodedPath = encodeURIComponent(path);
    const response = await this.fetchWithTimeout(`${this.baseUrl}/vault/${encodedPath}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw this.createError(response.status, `Failed to get file: ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * Create or update file in vault
   * @param path - Path relative to vault root
   * @param content - File content (markdown)
   */
  async putFile(path: string, content: string): Promise<void> {
    const encodedPath = encodeURIComponent(path);
    const response = await this.fetchWithTimeout(`${this.baseUrl}/vault/${encodedPath}`, {
      method: 'PUT',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'text/markdown',
      },
      body: content,
    });

    if (!response.ok) {
      throw this.createError(response.status, `Failed to save file: ${response.statusText}`);
    }
  }

  /**
   * List files in a vault directory.
   * Uses GET /vault/{directory}/ endpoint.
   * Returns empty array if directory doesn't exist (404).
   *
   * @param directory - Directory path relative to vault root
   * @returns Array of filenames (directories filtered out)
   */
  async listFiles(directory: string): Promise<string[]> {
    const encodedDir = encodeURIComponent(directory);
    const response = await this.fetchWithTimeout(`${this.baseUrl}/vault/${encodedDir}/`, {
      method: 'GET',
      headers: {
        ...this.getHeaders(),
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw this.createError(response.status, `Failed to list files: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const rawFiles = Array.isArray(data?.files) ? data.files : [];
    const files = rawFiles.filter((f): f is string => typeof f === 'string');
    // Filter out directories (entries ending with '/')
    return files.filter(f => !f.endsWith('/'));
  }

  /**
   * Create an API error
   */
  private createError(status: number, message: string): ObsidianApiError {
    return new ObsidianApiError(status, message);
  }
}

/**
 * Type guard for ObsidianApiError
 */
export function isObsidianApiError(error: unknown): error is ObsidianApiError {
  return error instanceof ObsidianApiError;
}

// getErrorMessage moved to src/lib/error-utils.ts for centralization
