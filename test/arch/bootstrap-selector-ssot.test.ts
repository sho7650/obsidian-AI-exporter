/**
 * Fitness function: the content script's readiness selector is derived from
 * the extractors' selector modules, never written down again in bootstrap.ts.
 *
 * bootstrap.ts used to hold its own comma-joined list of "a conversation has
 * rendered" selectors. Nothing tied it to src/content/extractors/selectors/,
 * so when a platform variant died and was removed from the extractor's group
 * (`article[data-turn-id]`, 2026-07) the copy in bootstrap kept it, and no
 * test or live check could see the drift (docs/investigation/
 * e2e-coverage-gaps-2026-09.md §A). The single source is now
 * selectors/ready.ts, which bootstrap must import.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const bootstrapPath = path.join(root, 'src/content/bootstrap.ts');

/** Only executable code is inspected; prose may still name a selector. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('architecture: bootstrap readiness selector is derived, not duplicated', () => {
  const code = stripComments(fs.readFileSync(bootstrapPath, 'utf-8'));

  it('imports CONVERSATION_CONTAINER_SELECTOR from selectors/ready', () => {
    expect(code).toMatch(
      /import\s*\{[^}]*\bCONVERSATION_CONTAINER_SELECTOR\b[^}]*\}\s*from\s*'\.\/extractors\/selectors\/ready'/
    );
  });

  it('does not assign CONVERSATION_CONTAINER_SELECTOR a string literal of its own', () => {
    expect(code).not.toMatch(/CONVERSATION_CONTAINER_SELECTOR\s*=\s*['"`]/);
  });

  it('passes no selector string literal to querySelector for readiness', () => {
    // Every querySelector call in bootstrap must take an identifier, so the
    // selector can only come from an imported single source.
    const literalCalls = code.match(/querySelector(?:All)?\(\s*['"`]/g) ?? [];
    expect(
      literalCalls,
      'bootstrap.ts calls querySelector with an inline string — route it through selectors/ready.ts'
    ).toEqual([]);
  });
});
