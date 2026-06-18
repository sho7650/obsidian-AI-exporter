/**
 * Fitness function: CRXJS entry basename uniqueness.
 *
 * CRXJS generates `service-worker-loader.js` by resolving the manifest's
 * `background.service_worker` entry to its emitted chunk. When the background
 * entry and a content-script entry share the same output basename (both
 * `index.ts` -> both emit `index.ts-<hash>.js`), CRXJS's chunk lookup becomes
 * ambiguous and resolves order-dependently. In some build environments the SW
 * loader then imports the CONTENT-SCRIPT chunk, which references `document`/
 * `window` and throws on service-worker registration (the SW silently dies).
 *
 * See: the 1.2.13 GitHub-packaged build, where service-worker-loader.js
 * imported the content-script chunk instead of the background chunk.
 *
 * This guard asserts the script entries declared in the manifest have pairwise
 * distinct basenames, so the loader resolution is structurally unambiguous on
 * every build host. It complements the rename of the background entry to a
 * unique filename (src/background/service-worker.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf-8');

interface Manifest {
  background?: { service_worker?: string };
  content_scripts?: { js?: string[] }[];
}

const manifest = JSON.parse(read('src/manifest.json')) as Manifest;

// Every JS/TS entry CRXJS turns into an emitted chunk: the background service
// worker plus each content-script file.
const scriptEntries: string[] = [
  ...(manifest.background?.service_worker ? [manifest.background.service_worker] : []),
  ...(manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? []),
].filter((p) => /\.(t|j)sx?$/.test(p));

describe('architecture: CRXJS entry basename uniqueness', () => {
  it('declares at least the background + content script entries', () => {
    // Sanity: the manifest must actually wire up the entries we are guarding.
    expect(scriptEntries.length).toBeGreaterThanOrEqual(2);
    expect(manifest.background?.service_worker).toBeDefined();
  });

  it('every manifest script entry file exists on disk', () => {
    for (const entry of scriptEntries) {
      expect(fs.existsSync(path.join(root, entry)), `missing entry: ${entry}`).toBe(true);
    }
  });

  it('script entries have pairwise-distinct output basenames', () => {
    const basenames = scriptEntries.map((p) => path.basename(p));
    const duplicates = basenames.filter((b, i) => basenames.indexOf(b) !== i);
    expect(
      duplicates,
      `colliding entry basenames ${JSON.stringify(duplicates)} cause CRXJS to ` +
        `resolve service-worker-loader.js to the wrong chunk; give each entry a unique filename`,
    ).toEqual([]);
  });
});
