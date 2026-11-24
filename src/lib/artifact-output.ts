/**
 * Resolve `g2o-craft://{id}` body placeholders per output destination
 * (ADR-046), the counterpart of image-output.ts for generated text files.
 *
 * The content script emits destination-agnostic placeholders
 * (`[name](g2o-craft://id)`); each output handler resolves them here:
 * - Obsidian:  wikilink `[[filename]]` + text files to write to the vault
 * - File:      the same wikilink + files to download
 * - Clipboard / append mode: placeholders stripped entirely
 *
 * The extension never embeds a craft (`![[…]]`): it is a document to open,
 * not a picture to render inline.
 */

import type { ExtractedArtifact } from './types';

/** A resolved artifact ready to be written (vault) or downloaded (file). */
interface ResolvedArtifactFile {
  readonly fileName: string;
  readonly content: string;
}

/** Result of resolving artifact placeholders for a destination. */
export interface ArtifactResolution {
  readonly body: string;
  readonly files: ResolvedArtifactFile[];
}

/**
 * Artifact ids the content script writes and the Turndown rule accepts. The
 * page can forge a marker, so the rule checks this.
 */
export const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Matches `[label](g2o-craft://ID)`, capturing the label (1) and id (2). The
 * writer escapes the label, so a backslash pair such as `\]` belongs to it.
 */
const PLACEHOLDER_PATTERN = /\[((?:\\.|[^\]\\])*)\]\(g2o-craft:\/\/([^)]+)\)/g;

/** Longest original file name kept, extension included. */
const MAX_ORIGINAL_NAME_LENGTH = 100;

/** Characters a file system or an Obsidian wikilink cannot carry in a name. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const UNSAFE_NAME_CHARS = /[<>:"/\\|?*[\]#^\u0000-\u001f]/g;

/** Collapse 3+ consecutive newlines left behind by removed placeholders. */
function collapseBlankLines(body: string): string {
  return body.replace(/\n{3,}/g, '\n\n');
}

/**
 * A file name the platform showed, made safe to write: any directory part is
 * dropped, unsafe characters become `_`, leading dots go (no hidden or `..`
 * names) and the length is capped with the extension kept. Never empty.
 */
export function sanitizeArtifactName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .replace(UNSAFE_NAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (!cleaned) return 'craft';
  if (cleaned.length <= MAX_ORIGINAL_NAME_LENGTH) return cleaned;

  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, MAX_ORIGINAL_NAME_LENGTH - ext.length) + ext;
}

/**
 * Deterministic file name per artifact: `{noteBaseName}-{originalName}`.
 * Two artifacts that would share a name (compared case-insensitively, as
 * Windows and macOS vaults do) keep every file by adding `-2`, `-3`, … before
 * the extension of the later ones. Stable across re-saves, so overwrites are
 * idempotent.
 */
export function artifactFileNames(
  noteBaseName: string,
  artifacts: readonly ExtractedArtifact[]
): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();

  for (const artifact of artifacts) {
    const original = sanitizeArtifactName(artifact.name);
    const dot = original.lastIndexOf('.');
    const stem = dot > 0 ? original.slice(0, dot) : original;
    const ext = dot > 0 ? original.slice(dot) : '';

    let fileName = `${noteBaseName}-${original}`;
    for (let n = 2; taken.has(fileName.toLowerCase()); n++) {
      fileName = `${noteBaseName}-${stem}-${n}${ext}`;
    }
    taken.add(fileName.toLowerCase());
    names.set(artifact.id, fileName);
  }
  return names;
}

/** Remove all artifact placeholders (clipboard, append mode, export disabled). */
export function stripArtifactPlaceholders(body: string): string {
  return collapseBlankLines(body.replace(PLACEHOLDER_PATTERN, ''));
}

/**
 * Replace each placeholder with a wikilink, collecting the file for every
 * matched artifact. Placeholders with no matching artifact (a craft that could
 * not be read) are stripped.
 */
export function resolveArtifacts(
  body: string,
  artifacts: readonly ExtractedArtifact[],
  noteBaseName: string
): ArtifactResolution {
  const byId = new Map(artifacts.map(artifact => [artifact.id, artifact]));
  const fileNames = artifactFileNames(noteBaseName, artifacts);
  const files: ResolvedArtifactFile[] = [];
  const emitted = new Set<string>();

  const resolvedBody = body.replace(PLACEHOLDER_PATTERN, (_match, _label: string, id: string) => {
    const artifact = byId.get(id);
    const fileName = fileNames.get(id);
    if (!artifact || !fileName) return '';

    if (!emitted.has(id)) {
      emitted.add(id);
      files.push({ fileName, content: artifact.content });
    }
    return `[[${fileName}]]`;
  });

  return { body: collapseBlankLines(resolvedBody), files };
}
