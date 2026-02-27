/**
 * YAML safety utilities
 * Prevents YAML injection attacks
 */

/**
 * Escape a YAML string value
 * Compliant with YAML 1.2 spec; wraps in double quotes if special characters are present
 *
 * Handled special characters:
 * - YAML syntax characters: : [ ] { } # & * ! | > ' " % @ `
 * - Control characters: \n \r \t
 * - Unicode line terminators: U+0085 (NEL), U+2028 (LS), U+2029 (PS)
 * - Reserved words: null, true, false, ~
 */
export function escapeYamlValue(value: string): string {
  // Check if quoting is needed
  const needsQuotes =
    /[:[\]{}#&*!|>'"%@`\n\r\t\u0085\u2028\u2029]/.test(value) ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value === '' ||
    /^(null|true|false|~|yes|no|on|off)$/i.test(value) ||
    /^[0-9.+-]/.test(value); // Could be interpreted as a number

  if (!needsQuotes) {
    return value;
  }

  // Escape with double quotes
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u0085/g, '\\N') // NEL (Next Line)
    .replace(/\u2028/g, '\\L') // LS (Line Separator)
    .replace(/\u2029/g, '\\P'); // PS (Paragraph Separator)

  return `"${escaped}"`;
}
