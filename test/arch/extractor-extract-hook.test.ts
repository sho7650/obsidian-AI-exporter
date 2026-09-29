/**
 * Fitness function: only BaseExtractor declares `extract()` (ADR-043).
 *
 * `BaseExtractor.extract()` is the template method every platform shares: the
 * Deep Research short-circuit, the scroll warning, and the structured
 * `truncated` / `messageWatermark` signals that the background acts on. A
 * platform customizes it through hooks — `onExtractStart`, `collectMessages`,
 * `finalizeExtraction` — never by re-implementing it.
 *
 * That is not hypothetical. Gemini overrode `extract()` and, when ADR-033 added
 * `truncated` to the shared flow, its copy never set it: a cut-short Gemini
 * capture could overwrite a complete note (DES-018 H-1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const BASE = 'src/content/extractors/base.ts';

const extractors = execFileSync('git', ['ls-files', '-z', 'src/content/extractors'], {
  cwd: root,
  encoding: 'utf-8',
})
  .split('\0')
  .filter(rel => rel.endsWith('.ts') && rel !== BASE);

/** Strip comments so prose about extract() stays allowed. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * A declaration — `extract(): T {`, `async extract() {`, or `extract = …` — but
 * not a member call such as `this.extract()`, which the `.` lookbehind rules out.
 */
const EXTRACT_DECLARATION = /(?<![.\w])extract\s*(?:\([^)]*\)\s*[:{]|=)/g;

describe('architecture: extraction goes through the template method', () => {
  it('finds extractor sources to check', () => {
    expect(extractors.length).toBeGreaterThan(0);
  });

  it.each(extractors)('%s does not override extract', rel => {
    const code = stripComments(fs.readFileSync(path.join(root, rel), 'utf-8'));
    const offenders = code.match(EXTRACT_DECLARATION) ?? [];
    expect(
      offenders,
      `${rel} overrides extract(), so fixes to BaseExtractor's shared flow — such as the ` +
        `truncated flag of ADR-033 — never reach this platform. Override onExtractStart(), ` +
        `collectMessages() or finalizeExtraction() instead`
    ).toEqual([]);
  });

  it('BaseExtractor still declares the template method', () => {
    const base = stripComments(fs.readFileSync(path.join(root, BASE), 'utf-8'));
    expect(base.match(EXTRACT_DECLARATION)).toHaveLength(1);
  });
});
