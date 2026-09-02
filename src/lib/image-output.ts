/**
 * Resolve `g2o-image://{id}` body placeholders per output destination.
 *
 * The content script emits destination-agnostic placeholders (`![alt](g2o-image://id)`);
 * each output handler resolves them here:
 * - Obsidian:  wikilink embed `![[filename]]` + binary files to write to the vault
 * - File:      filename-only markdown `![alt](filename)` + files to download
 * - Clipboard: placeholders stripped entirely
 */

import { mimeToExtension } from './image-utils';
import type { ExtractedImage } from './types';

/** A resolved image ready to be written (vault) or downloaded (file). */
interface ResolvedImageFile {
  readonly fileName: string;
  readonly mimeType: string;
  /** Base64-encoded image bytes (no `data:` prefix). */
  readonly data: string;
}

/** Result of resolving image placeholders for a destination. */
export interface ImageResolution {
  readonly body: string;
  readonly files: ResolvedImageFile[];
}

/** Matches `![alt](g2o-image://ID)`, capturing alt (1) and id (2). */
const PLACEHOLDER_PATTERN = /!\[([^\]]*)\]\(g2o-image:\/\/([^)]+)\)/g;

/** Collapse 3+ consecutive newlines left behind by removed placeholders. */
function collapseBlankLines(body: string): string {
  return body.replace(/\n{3,}/g, '\n\n');
}

/**
 * Deterministic image filename: `{noteBaseName}-img-{n}.{ext}` (n is 1-based).
 * Stable across re-saves so overwrites are idempotent.
 */
export function imageFileName(noteBaseName: string, image: ExtractedImage, index: number): string {
  const ext = mimeToExtension(image.mimeType);
  return `${noteBaseName}-img-${index + 1}.${ext}`;
}

/** Remove all image placeholders (used for clipboard and unsupported paths). */
export function stripImagePlaceholders(body: string): string {
  return collapseBlankLines(body.replace(PLACEHOLDER_PATTERN, ''));
}

/**
 * Shared resolver: replace each placeholder using `render`, collecting the
 * file for every matched image. Placeholders with no matching image (failed
 * capture) are stripped.
 */
function resolve(
  body: string,
  images: readonly ExtractedImage[],
  noteBaseName: string,
  render: (fileName: string, alt: string) => string
): ImageResolution {
  const byId = new Map(images.map((image, index) => [image.id, { image, index }]));
  const files: ResolvedImageFile[] = [];
  const emitted = new Set<string>();

  const resolvedBody = body.replace(PLACEHOLDER_PATTERN, (_match, alt: string, id: string) => {
    const entry = byId.get(id);
    if (!entry) return '';

    const fileName = imageFileName(noteBaseName, entry.image, entry.index);
    if (!emitted.has(id)) {
      emitted.add(id);
      files.push({ fileName, mimeType: entry.image.mimeType, data: entry.image.data });
    }
    return render(fileName, alt);
  });

  return { body: collapseBlankLines(resolvedBody), files };
}

/**
 * Obsidian: replace placeholders with wikilink embeds `![[filename]]`.
 * Obsidian resolves attachments by name, so the link needs no folder path.
 */
export function resolveImagesForObsidian(
  body: string,
  images: readonly ExtractedImage[],
  noteBaseName: string
): ImageResolution {
  return resolve(body, images, noteBaseName, fileName => `![[${fileName}]]`);
}

/**
 * File download: replace placeholders with filename-only markdown links.
 */
export function resolveImagesForFile(
  body: string,
  images: readonly ExtractedImage[],
  noteBaseName: string
): ImageResolution {
  return resolve(body, images, noteBaseName, (fileName, alt) => `![${alt}](${fileName})`);
}
