/**
 * Obsidian-only body post-processing: flatten callouts/blockquotes longer than
 * a threshold to plain text.
 *
 * Obsidian decorates every blockquote line, so a very long message rendered as
 * one giant callout makes the note render pathologically slowly and can hang
 * the app. Converting such runs to plain text renders in linear time. This runs
 * only in the Obsidian save path — downloaded markdown keeps its callouts.
 */

/** `> [!TYPE] Label` callout header → captures the label. */
const CALLOUT_HEADER_PATTERN = /^> \[![^\]]+\][+-]? *(.*)$/;

/** Remove a single leading `> ` (or bare `>`) blockquote marker. */
function stripBlockquoteMarker(line: string): string {
  return line.replace(/^> ?/, '');
}

/**
 * Convert one blockquote run to plain text. A callout run (`> [!TYPE] Label`)
 * becomes a bold `**Label:**` heading followed by its de-quoted content; a plain
 * blockquote run just loses its `> ` markers (its label, if any, sits above it).
 */
function flattenRun(run: string[]): string[] {
  const headerMatch = run[0].match(CALLOUT_HEADER_PATTERN);
  if (headerMatch) {
    const label = headerMatch[1].trim();
    const content = run.slice(1).map(stripBlockquoteMarker);
    return label ? [`**${label}:**`, '', ...content] : content;
  }
  return run.map(stripBlockquoteMarker);
}

/**
 * Flatten every blockquote/callout run longer than `maxLines` (counting the
 * callout header line) to plain text. Shorter runs and non-blockquote content
 * are returned unchanged.
 */
export function flattenLargeCallouts(body: string, maxLines: number): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('>')) {
      let j = i;
      while (j < lines.length && lines[j].startsWith('>')) j++;
      const run = lines.slice(i, j);
      out.push(...(run.length > maxLines ? flattenRun(run) : run));
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }

  return out.join('\n');
}
