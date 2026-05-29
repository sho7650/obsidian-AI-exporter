/**
 * Fitness function: platform Single Source of Truth (ADR-012).
 *
 * `src/manifest.json` content_scripts[0].matches is the SSOT for supported
 * platforms (per CLAUDE.md "Adding New Platforms"). This holistic check proves
 * the CODE side stays in sync with it — complementing scripts/lint-platforms.mjs,
 * which covers the DOCS side (README, privacy.html, locales).
 *
 * For every platform host in the manifest it asserts the host/id is present in:
 *   - manifest host_permissions
 *   - ALLOWED_ORIGINS         (src/lib/constants.ts)
 *   - getExtractor() routing  (src/content/index.ts)
 *   - the AIPlatform union     (src/lib/types.ts)
 *
 * The PLATFORM_IDS map below is the one place a human updates when adding a
 * platform; a manifest host with no mapping fails fast, mirroring the
 * HOST_DISPLAY_NAMES guard in lint-platforms.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf-8');

// hostname -> AIPlatform id. Brand ids are not derivable from hostnames.
const PLATFORM_IDS: Record<string, string> = {
  'gemini.google.com': 'gemini',
  'claude.ai': 'claude',
  'chatgpt.com': 'chatgpt',
  'www.perplexity.ai': 'perplexity',
  'notebooklm.google.com': 'notebooklm',
};

interface Manifest {
  content_scripts: { matches: string[] }[];
  host_permissions: string[];
}

const manifest = JSON.parse(read('src/manifest.json')) as Manifest;

// Derive platform hosts from the SSOT (skip infrastructure hosts like 127.0.0.1).
const platformHosts = manifest.content_scripts[0].matches
  .map((m) => m.replace('https://', '').replace('/*', ''))
  .filter((h) => !h.startsWith('127.'));

describe('architecture: platform SSOT (manifest <-> code)', () => {
  it('every manifest platform host has a known AIPlatform id', () => {
    for (const host of platformHosts) {
      expect(PLATFORM_IDS[host], `add "${host}" to PLATFORM_IDS`).toBeDefined();
    }
  });

  it.each(platformHosts)('host %s is consistent across manifest + code', (host) => {
    const id = PLATFORM_IDS[host];

    // manifest host_permissions
    expect(manifest.host_permissions).toContain(`https://${host}/*`);

    // ALLOWED_ORIGINS (constants.ts)
    expect(read('src/lib/constants.ts')).toContain(`'https://${host}'`);

    // getExtractor() routing (content/index.ts)
    expect(read('src/content/index.ts')).toContain(`hostname === '${host}'`);

    // AIPlatform union (types.ts)
    const types = read('src/lib/types.ts');
    const union = /export type AIPlatform\s*=\s*([^;]+);/.exec(types);
    expect(union, 'AIPlatform union not found in types.ts').not.toBeNull();
    expect(union?.[1]).toContain(`'${id}'`);
  });
});
