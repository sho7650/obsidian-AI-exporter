/**
 * Fitness function: only BaseExtractor declares `applySettings` (ADR-032).
 *
 * Settings shared by every platform — `enableAutoScroll`, and now the two
 * auto-scroll deadlines of issue #449 — are assigned in
 * `BaseExtractor.applySettings`, which then calls the `applyPlatformSettings`
 * hook. An extractor that overrides `applySettings` instead silently drops
 * whatever the base class assigned, and the loss is invisible: extraction still
 * works, it just quietly ignores the user's configuration.
 *
 * That is not hypothetical. Before ADR-032 all three virtualized extractors
 * overrode it and each repeated `this.enableAutoScroll = …`; adding the
 * deadlines to the base class alone would have had no effect on any of them.
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

/** Strip comments so prose about applySettings stays allowed. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('architecture: platform settings go through the hook', () => {
  it('finds extractor sources to check', () => {
    expect(extractors.length).toBeGreaterThan(0);
  });

  it.each(extractors)('%s does not override applySettings', rel => {
    const code = stripComments(fs.readFileSync(path.join(root, rel), 'utf-8'));
    const offenders = code.match(/\bapplySettings\s*\(/g) ?? [];
    expect(
      offenders,
      `${rel} overrides applySettings, so everything BaseExtractor assigns — auto-scroll and ` +
        `its deadlines — is dropped for this platform. Override applyPlatformSettings() instead`
    ).toEqual([]);
  });

  it('BaseExtractor still declares both halves', () => {
    const base = fs.readFileSync(path.join(root, BASE), 'utf-8');
    expect(base).toContain('applySettings(settings: SyncSettings)');
    expect(base).toContain('applyPlatformSettings');
  });
});
