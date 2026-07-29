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
  // One platform, two hosts: Google's rebrand moved NotebookLM to
  // notebook.google.com; the legacy host is kept during rollout (ADR-023).
  'notebook.google.com': 'notebooklm',
  'notebooklm.google.com': 'notebooklm',
};

interface Manifest {
  content_scripts: { matches: string[] }[];
  host_permissions: string[];
}

const manifest = JSON.parse(read('src/manifest.json')) as Manifest;

// Derive platform hosts from the SSOT (skip infrastructure hosts like 127.0.0.1).
const platformHosts = manifest.content_scripts[0].matches
  .map(m => m.replace('https://', '').replace('/*', ''))
  .filter(h => !h.startsWith('127.'));

describe('architecture: platform SSOT (manifest <-> code)', () => {
  it('every manifest platform host has a known AIPlatform id', () => {
    for (const host of platformHosts) {
      expect(PLATFORM_IDS[host], `add "${host}" to PLATFORM_IDS`).toBeDefined();
    }
  });

  it.each(platformHosts)('host %s is consistent across manifest + code', host => {
    const id = PLATFORM_IDS[host];

    // manifest host_permissions
    expect(manifest.host_permissions).toContain(`https://${host}/*`);

    // PLATFORM_REGISTRY (platform-registry.ts) — the one code-side SSOT (ADR-014)
    const registry = read('src/lib/platform-registry.ts');
    expect(registry, `registry must map ${id} to its host`).toContain(`'${host}'`);
    expect(new RegExp(`\\b${id}:`).test(registry), `registry must have a ${id} entry`).toBe(true);

    // Extractor routing (content/bootstrap.ts): constructor map keyed by platform id
    expect(
      new RegExp(`\\b${id}: \\w+Extractor\\b`).test(read('src/content/bootstrap.ts')),
      `content/bootstrap.ts must map ${id} to its extractor constructor`
    ).toBe(true);

    // AIPlatform union (types.ts)
    const types = read('src/lib/types.ts');
    const union = /export type AIPlatform\s*=\s*([^;]+);/.exec(types);
    expect(union, 'AIPlatform union not found in types.ts').not.toBeNull();
    expect(union?.[1]).toContain(`'${id}'`);
  });

  it('constants.ts derives platform lists from the registry instead of hand-writing them', () => {
    const constants = read('src/lib/constants.ts');
    expect(constants).toContain(`from './platform-registry'`);
    // No hand-maintained origin literals: origins must come from the registry
    for (const host of platformHosts) {
      expect(
        constants.includes(`'https://${host}'`),
        `constants.ts hand-writes origin for ${host} — derive it from PLATFORM_REGISTRY`
      ).toBe(false);
    }
  });
});
