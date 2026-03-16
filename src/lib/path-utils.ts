/**
 * Path security utilities
 * Prevents path traversal attacks
 */

/**
 * Detect path traversal attacks
 *
 * Note: A naive path.includes('..') would produce false positives for
 * legitimate filenames like foo..bar, so a more precise regex is used.
 */
export function containsPathTraversal(path: string): boolean {
  // Detect null bytes (filesystem string terminator attack)
  if (path.includes('\0')) return true;
  // Detect ../ or ..\ only when combined with path separators:
  // ^..   : leading ..
  // /.. or \.. : .. after path separator
  // ../ or ..\ : .. before path separator
  // ..$   : trailing ..
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)) return true;
  // Detect absolute paths
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return true;
  // Detect URL-encoded .. combined with path separators
  if (/(?:^|%2f|%5c)%2e%2e(?:%2f|%5c|$)/i.test(path)) return true;
  return false;
}

/**
 * Resolve template variables in a vault path
 * Supported variables: {platform}
 * Unknown variables are preserved as-is (safe fallback)
 *
 * @example
 * resolvePathTemplate('AI/{platform}', { platform: 'gemini' })
 * // → 'AI/gemini'
 */
export function resolvePathTemplate(path: string, variables: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in variables ? variables[key] : match;
  });
}
