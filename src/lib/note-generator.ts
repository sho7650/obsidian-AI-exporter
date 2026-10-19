/**
 * Note Content Generator
 *
 * Generates final markdown content with frontmatter from ObsidianNote.
 * Separated from background/service-worker.ts to avoid Chrome API dependency in tests.
 */

import { escapeYamlValue } from './yaml-utils';
import { neutralizeLiveHtml } from './html-gate';
import type { ObsidianNote, ExtensionSettings } from './types';

export interface RenderedNote {
  content: string;
  /** Length of the body as sent, after the HTML gate; what `maxNoteSizeMiB` caps. */
  gatedBodyLength: number;
}

/**
 * Generate full note content with frontmatter and body
 * Uses YAML escaping to prevent injection attacks (NEW-04)
 *
 * The body passes the HTML gate as its last transform (DES-019 §4.0). The
 * frontmatter does not: its values are YAML-escaped and render as text.
 */
export function renderNote(note: ObsidianNote, settings: ExtensionSettings): RenderedNote {
  const { templateOptions } = settings;
  const lines: string[] = [];

  // Generate YAML frontmatter
  lines.push('---');

  if (templateOptions.includeId) {
    lines.push(`id: ${escapeYamlValue(note.frontmatter.id)}`);
  }

  if (templateOptions.includeTitle) {
    lines.push(`title: ${escapeYamlValue(note.frontmatter.title)}`);
  }

  if (templateOptions.includeSource) {
    lines.push(`source: ${escapeYamlValue(note.frontmatter.source)}`);
    lines.push(`url: ${escapeYamlValue(note.frontmatter.url)}`);
  }

  if (templateOptions.includeDates) {
    lines.push(`created: ${escapeYamlValue(note.frontmatter.created)}`);
    lines.push(`modified: ${escapeYamlValue(note.frontmatter.modified)}`);
  }

  if (templateOptions.includeTags && note.frontmatter.tags.length > 0) {
    lines.push('tags:');
    for (const tag of note.frontmatter.tags) {
      lines.push(`  - ${escapeYamlValue(tag)}`);
    }
  }

  if (templateOptions.includeMessageCount) {
    lines.push(`message_count: ${note.frontmatter.message_count}`);
  }

  lines.push('---');
  lines.push('');

  const body = neutralizeLiveHtml(note.body);
  lines.push(body);

  return { content: lines.join('\n'), gatedBodyLength: body.length };
}

export function generateNoteContent(note: ObsidianNote, settings: ExtensionSettings): string {
  return renderNote(note, settings).content;
}
