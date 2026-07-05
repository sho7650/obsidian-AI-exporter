/**
 * Filename collision helpers (issue #327).
 *
 * Conversations with identical titles can produce identical file names —
 * notably Perplexity repeating tasks, whose conversation ids start with the
 * title slug, so the id-prefix suffix in generateFileName() repeats too.
 * When a save would land on a file holding a DIFFERENT conversation
 * (frontmatter id mismatch), the handler probes deterministic alternatives
 * instead of overwriting.
 */

import { generateHash } from './hash';

/**
 * Deterministic per-conversation suffix (8-hex hash of the frontmatter id).
 * The same conversation always maps to the same alternative name, so
 * re-saves land on their own file regardless of probe order or date.
 */
export function collisionSuffix(conversationId: string): string {
  return generateHash(conversationId);
}

/**
 * Candidate file name for a probe attempt.
 * attempt 0 = the original name; 1 = base-suffix.md; n>=2 = base-suffix-n.md
 * (the counter exists only for the astronomically unlikely hash collision).
 */
export function candidateFileName(
  originalFileName: string,
  suffix: string,
  attempt: number
): string {
  if (attempt === 0) return originalFileName;
  const base = originalFileName.replace(/\.md$/, '');
  return attempt === 1 ? `${base}-${suffix}.md` : `${base}-${suffix}-${attempt}.md`;
}
