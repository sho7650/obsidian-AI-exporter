/**
 * Centralized error handling utilities
 *
 * Provides consistent error message extraction across the codebase.
 * Previously split between extractors/base.ts and obsidian-api.ts.
 */

import { isObsidianApiError } from './obsidian-api';

/**
 * Extract a human-readable error message from an unknown error value
 *
 * Generic error message extraction for any error type.
 * Use this as the primary error handler throughout the codebase.
 *
 * @param error - Unknown error value to extract message from
 * @returns Human-readable error message string
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Get user-friendly error message with Obsidian API-specific handling
 *
 * Provides more specific messages for Obsidian API errors, with
 * fallback to generic error extraction for other error types.
 *
 * @param error - Unknown error value
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isObsidianApiError(error)) {
    switch (error.status) {
      case 0:
        return 'Obsidian REST API is not running. Please ensure Obsidian is open and the Local REST API plugin is enabled.';
      case 401:
      case 403:
        return 'Invalid API key. Please check your settings.';
      case 404:
        return 'File not found in vault.';
      default:
        return error.message;
    }
  }
  return extractErrorMessage(error);
}
