/**
 * Regex-based YAML frontmatter parser
 *
 * Parses and updates YAML frontmatter without external YAML libraries.
 * Handles key:value pairs, tag lists, and quoted values.
 */

import { escapeYamlValue } from './yaml-utils';

/**
 * Parsed frontmatter result
 */
export interface ParsedFrontmatter {
  /** Raw frontmatter string including --- delimiters */
  raw: string;
  /** Parsed key-value pairs (tags stored as string[]) */
  fields: Record<string, string | string[]>;
  /** Body content after frontmatter */
  body: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns null if no valid frontmatter found.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  // Must start with ---
  if (!content.startsWith('---')) return null;

  // Find closing --- (must be at line start)
  const closingIndex = content.indexOf('\n---', 3);
  if (closingIndex === -1) return null;

  // Raw frontmatter includes both --- delimiters
  const endOfClosing = closingIndex + 4; // length of '\n---'
  const raw = content.substring(0, endOfClosing);

  // Body is everything after closing --- (skip leading newline)
  let body = content.substring(endOfClosing);
  if (body.startsWith('\n')) {
    body = body.substring(1);
  }

  // Parse fields from the inner YAML block
  const yamlBlock = content.substring(4, closingIndex); // skip opening '---\n'
  const fields: Record<string, string | string[]> = {};
  let currentKey = '';

  for (const line of yamlBlock.split('\n')) {
    // List item: "  - value"
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      const existing = fields[currentKey];
      const value = stripQuotes(listMatch[1].trim());
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        fields[currentKey] = [value];
      }
      continue;
    }

    // Key-value pair: "key: value" or "key:"
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();
      if (rawValue === '') {
        // Could be a list header (e.g., "tags:")
        fields[currentKey] = [];
      } else {
        fields[currentKey] = stripQuotes(rawValue);
      }
    }
  }

  return { raw, fields, body };
}

/**
 * Strip surrounding quotes from a YAML value
 */
function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.substring(1, value.length - 1);
  }
  return value;
}

/**
 * Update specific fields in raw frontmatter string.
 * Preserves all other fields and formatting.
 * Only modifies lines matching the update keys; does NOT add missing keys.
 */
export function updateFrontmatter(
  rawFrontmatter: string,
  updates: Record<string, string | number>
): string {
  const lines = rawFrontmatter.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    let replaced = false;
    for (const [key, value] of Object.entries(updates)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${escapedKey}\\s*:`);
      if (pattern.test(line)) {
        // Use raw number for numeric values, escape strings
        const formattedValue =
          typeof value === 'number' ? String(value) : escapeYamlValue(String(value));
        result.push(`${key}: ${formattedValue}`);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      result.push(line);
    }
  }

  return result.join('\n');
}
