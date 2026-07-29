/**
 * Fitness function: the Chrome Web Store dashboard text is version-controlled
 * and consistent with the manifest.
 *
 * The dashboard's Privacy tab holds free text that no build step ever reads, so
 * it rots silently and the damage only appears at review time. Two instances in
 * a single day (2026-07-29):
 *
 *   - the host permission justification still said "Seven host permissions" and
 *     named only notebooklm.google.com, one release after the rebrand;
 *   - the single purpose description had listed four platforms since NotebookLM
 *     shipped in #206 (2026-04-09), while the manifest requested host
 *     permissions for five.
 *
 * The dashboard itself warns: "Remove any permissions that are not necessary
 * for your extension's single purpose. If you request unnecessary permissions,
 * this version will be rejected." Whether a permission is *necessary* is judged
 * against the single purpose, so the two texts have to agree with the manifest
 * and with each other.
 *
 * docs/store/listing.md is the source of truth; this proves it stays true.
 *
 * @see https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { PLATFORM_REGISTRY, ALL_PLATFORMS } from '../../src/lib/platform-registry';

const root = path.resolve(import.meta.dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf-8');

/**
 * Every dashboard field is written as:
 *
 *   <!-- field: NAME, limit: N -->
 *   ```text
 *   ...the exact text pasted into the dashboard...
 *   ```
 */
const FIELD_BLOCK = /<!--\s*field:\s*([\w.*-]+),\s*limit:\s*(\d+)\s*-->\s*```text\n([\s\S]*?)\n```/g;

interface Field {
  name: string;
  limit: number;
  text: string;
}

function parseFields(markdown: string): Field[] {
  return [...markdown.matchAll(FIELD_BLOCK)].map(m => ({
    name: m[1],
    limit: Number(m[2]),
    text: m[3],
  }));
}

interface Manifest {
  permissions: string[];
  host_permissions: string[];
}

const manifest = JSON.parse(read('src/manifest.json')) as Manifest;
const fields = parseFields(read('docs/store/listing.md'));
const byName = new Map(fields.map(f => [f.name, f]));

/** Hosts as a reviewer sees them, with the manifest's scheme/glob stripped. */
const manifestHosts = manifest.host_permissions.map(p =>
  p.replace(/^https?:\/\//, '').replace(/\/\*$/, '')
);

describe('architecture: store listing fields are version-controlled', () => {
  it('parses every field block in docs/store/listing.md', () => {
    expect(fields.length).toBeGreaterThan(0);
  });

  it.each(fields.map(f => [f.name, f] as const))('%s stays within its limit', (_name, field) => {
    expect(
      field.text.length,
      `${field.name} is ${field.text.length} chars; the dashboard caps it at ${field.limit}`
    ).toBeLessThanOrEqual(field.limit);
  });

  it.each(manifest.permissions)('declares a justification for the %s permission', permission => {
    expect(
      byName.get(`permission.${permission}`),
      `add a "permission.${permission}" field to docs/store/listing.md`
    ).toBeDefined();
  });

  it('justifies no permission the manifest does not request', () => {
    const justified = fields
      .map(f => f.name)
      .filter(n => n.startsWith('permission.'))
      .map(n => n.slice('permission.'.length));
    expect(justified.sort()).toEqual([...manifest.permissions].sort());
  });

  it.each(manifestHosts)('the host permission justification mentions %s', host => {
    const field = byName.get('host_permissions');
    expect(field, 'add a "host_permissions" field to docs/store/listing.md').toBeDefined();
    expect(
      field!.text.includes(host),
      `host permission justification never mentions ${host}`
    ).toBe(true);
  });

  it.each(ALL_PLATFORMS)('the single purpose description covers %s', platform => {
    const field = byName.get('single_purpose');
    expect(field, 'add a "single_purpose" field to docs/store/listing.md').toBeDefined();
    const { label, labelAliases = [] } = PLATFORM_REGISTRY[platform];
    const names = [label, ...labelAliases];
    expect(
      names.some(name => field!.text.toLowerCase().includes(name.toLowerCase())),
      `single purpose names none of ${names.join(' / ')} — a reviewer judges whether a ` +
        `host permission is necessary against this text, and an unjustified permission is rejected`
    ).toBe(true);
  });
});
