/**
 * Fitness function: hostnames live only in the platform registry (ADR-014, ADR-023).
 *
 * The NotebookLM rebrand broke extraction because a hostname was written down
 * twice — once in src/manifest.json and again in the extractor's canExtract().
 * Updating the manifest alone left the extractor rejecting the very page it had
 * just been granted access to.
 *
 * PLATFORM_REGISTRY is the single source of truth, and content/bootstrap.ts and
 * BaseExtractor.canExtract() both resolve hosts through platformForHost(). This
 * check proves no extractor has quietly reintroduced its own copy.
 *
 * The manifest is the one legitimate duplicate — it cannot import TypeScript —
 * and test/arch/platform-ssot.test.ts guards that seam separately.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const extractorsDir = path.join(root, 'src/content/extractors');

/** Every .ts file under src/content/extractors, including selectors/. */
function collectSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

const sources = collectSources(extractorsDir);

/**
 * Strip comments so documenting a host in prose ("formerly notebooklm.google.com")
 * stays allowed — only executable code is inspected.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('architecture: hostnames are not duplicated into extractors', () => {
  it('finds extractor sources to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources.map(f => path.relative(root, f)))(
    '%s does not compare window.location.hostname directly',
    rel => {
      const code = stripComments(fs.readFileSync(path.join(root, rel), 'utf-8'));
      const offenders = code.match(/location\.hostname\s*[=!]==/g) ?? [];
      expect(
        offenders,
        `${rel} compares location.hostname itself — resolve the platform via platformForHost() instead`
      ).toEqual([]);
    }
  );
});
