/**
 * Input validation utilities
 * Validates and sanitizes user input
 */

import { containsPathTraversal } from './path-utils';
import { MIN_PORT, MAX_PORT, MAX_VAULT_PATH_LENGTH, MIN_API_KEY_LENGTH } from './constants';

/**
 * Allowed callout types
 */
export const ALLOWED_CALLOUT_TYPES = [
  'NOTE',
  'TIP',
  'IMPORTANT',
  'WARNING',
  'CAUTION',
  'ABSTRACT',
  'SUMMARY',
  'TLDR',
  'INFO',
  'TODO',
  'SUCCESS',
  'CHECK',
  'DONE',
  'QUESTION',
  'HELP',
  'FAQ',
  'FAILURE',
  'FAIL',
  'MISSING',
  'DANGER',
  'ERROR',
  'BUG',
  'EXAMPLE',
  'QUOTE',
  'CITE',
] as const;

type CalloutType = (typeof ALLOWED_CALLOUT_TYPES)[number];

/**
 * Validate callout type
 */
export function validateCalloutType(type: string, defaultType: CalloutType): CalloutType {
  const normalized = type.toUpperCase().trim();
  if (ALLOWED_CALLOUT_TYPES.includes(normalized as CalloutType)) {
    return normalized as CalloutType;
  }
  console.warn(`[G2O] Invalid callout type "${type}", using default "${defaultType}"`);
  return defaultType;
}

/**
 * Validate vault path
 */
export function validateVaultPath(path: string): string {
  // Empty path is allowed (saves to vault root)
  if (!path.trim()) return '';

  // Path traversal check
  if (containsPathTraversal(path)) {
    throw new Error('Vault path contains invalid characters');
  }

  // Length limit (filesystem constraint)
  if (path.length > MAX_VAULT_PATH_LENGTH) {
    throw new Error(`Vault path is too long (max ${MAX_VAULT_PATH_LENGTH} characters)`);
  }

  return path.trim();
}

/**
 * Validate Obsidian API URL
 * Accepts http/https URLs with optional port (1024-65535).
 * Returns normalized URL (origin only, no path or trailing slash).
 */
export function validateObsidianUrl(url: string): string {
  const trimmed = url.trim();

  if (!trimmed) {
    throw new Error('API URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use http or https scheme');
  }

  // Validate port range if explicitly specified
  if (parsed.port) {
    const port = parseInt(parsed.port, 10);
    if (port < MIN_PORT || port > MAX_PORT) {
      throw new Error(`Port must be between ${MIN_PORT} and ${MAX_PORT}`);
    }
  }

  // Return origin only (scheme + host + port), no path
  return parsed.origin;
}

/**
 * Validate API key
 * Conforms to Obsidian REST API implementation:
 * - SHA-256 hash hex string (64 characters)
 * - Format: [0-9a-fA-F]{64}
 */
export function validateApiKey(key: string): string {
  const trimmed = key.trim();

  // Empty check
  if (!trimmed) {
    throw new Error('API key is required');
  }

  // Obsidian REST API generates SHA-256 hashes (64 hex chars),
  // but we allow flexibility for manually configured keys
  if (trimmed.length !== 64) {
    console.warn(`[G2O] API key length is ${trimmed.length}, expected 64 (SHA-256 hex)`);
  }

  // Hex format validation (warning only, non-blocking)
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    console.warn('[G2O] API key contains non-hexadecimal characters');
  }

  // Minimum length check (for security)
  if (trimmed.length < MIN_API_KEY_LENGTH) {
    throw new Error(`API key is too short (minimum ${MIN_API_KEY_LENGTH} characters for security)`);
  }

  return trimmed;
}
