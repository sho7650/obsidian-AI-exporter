/**
 * Frontmatter tag templates (issue #493).
 *
 * Users keep their own tag schemes, so the tags a note carries are a setting:
 * one list for conversations, one for Deep Research reports. Each entry is a
 * literal tag or the `{platform}` token, which expands to the source id at
 * save time, the same token users already know from the vault path template.
 *
 * Obsidian tag rules (https://obsidian.md/help/tags): letters, numbers, `_`,
 * `-`, `/` and Unicode letters; at least one non-numeric character; no
 * spaces; case-insensitive. `parseTagList()` enforces them at the popup and at
 * the storage boundary so a note can never carry a tag Obsidian would refuse.
 */

/** Token that expands to the source platform id (`gemini`, `claude`, ...). */
export const PLATFORM_TOKEN = '{platform}';

/** Tags written to a conversation note when the setting is untouched. */
export const DEFAULT_CONVERSATION_TAGS: readonly string[] = ['ai-conversation', PLATFORM_TOKEN];

/** Tags written to a Deep Research note when the setting is untouched. */
export const DEFAULT_DEEP_RESEARCH_TAGS: readonly string[] = [
  'ai-research',
  'deep-research',
  PLATFORM_TOKEN,
];

/** Separator used when the list is shown in the popup. */
const DISPLAY_SEPARATOR = ', ';

/** Characters Obsidian accepts inside a tag. */
const TAG_PATTERN = /^[\p{L}\p{N}_\-/]+$/u;

/** A tag made only of digits is not a tag in Obsidian. */
const DIGITS_ONLY = /^\p{N}+$/u;

/**
 * Normalise one raw entry: trim, drop a leading `#`, and join words with `-`
 * so that "Foo Bar" becomes the tag the user evidently meant.
 */
function normalizeEntry(entry: string): string {
  return entry.trim().replace(/^#/, '').trim().replace(/\s+/g, '-');
}

function isValidEntry(entry: string): boolean {
  if (entry === PLATFORM_TOKEN) return true;
  return TAG_PATTERN.test(entry) && !DIGITS_ONLY.test(entry);
}

/**
 * Parse a comma-separated tag list typed by the user.
 *
 * An empty field means "use the defaults" (users who want no tags at all use
 * the existing Tags checkbox). Any invalid entry makes the WHOLE field fall
 * back, with a warning, mirroring `validateCalloutType()`: a partially applied
 * list would silently drop tags the user believes are being written.
 */
export function parseTagList(raw: string, fallback: readonly string[]): string[] {
  const entries = raw
    .split(',')
    .map(normalizeEntry)
    .filter(entry => entry.length > 0);

  if (entries.length === 0) {
    return [...fallback];
  }

  const invalid = entries.filter(entry => !isValidEntry(entry));
  if (invalid.length > 0) {
    const quoted = invalid.map(tag => `"${tag}"`).join(', ');
    console.warn(`[G2O] Invalid tag list entry ${quoted}, using default tags`);
    return [...fallback];
  }

  return entries;
}

/** Format a stored list for display in the popup text field. */
export function formatTagList(tags: readonly string[]): string {
  return tags.join(DISPLAY_SEPARATOR);
}

/**
 * Expand `{platform}` and drop duplicates. Obsidian treats tags
 * case-insensitively, so `Claude` after `claude` is the same tag and is
 * removed; the first spelling wins.
 */
export function resolveTags(template: readonly string[], platform: string): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const entry of template) {
    const tag = entry === PLATFORM_TOKEN ? platform : entry;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(tag);
  }
  return resolved;
}
