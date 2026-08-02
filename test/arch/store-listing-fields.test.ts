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
const FIELD_BLOCK =
  /<!--\s*field:\s*([\w.*-]+),\s*limit:\s*(\d+)\s*-->\s*```text\n([\s\S]*?)\n```/g;

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

/**
 * Radio buttons and checkboxes have no character limit, so they are recorded as
 *
 *   <!-- declaration: NAME, value: VALUE -->
 */
const DECLARATION = /<!--\s*declaration:\s*([\w.]+),\s*value:\s*(.+?)\s*-->/g;

function parseDeclarations(markdown: string): Map<string, string> {
  return new Map([...markdown.matchAll(DECLARATION)].map(m => [m[1], m[2]]));
}

/**
 * The nine data types the dashboard asks about, in the order it lists them.
 * Each must be answered explicitly: an omission here is indistinguishable from
 * an unticked box when read back, and "we collect nothing" is exactly the claim
 * that has to be deliberate.
 */
const DATA_CATEGORIES = [
  'personally_identifiable_information',
  'health_information',
  'financial_and_payment_information',
  'authentication_information',
  'personal_communications',
  'location',
  'web_history',
  'user_activity',
  'website_content',
] as const;

const manifest = JSON.parse(read('src/manifest.json')) as Manifest;
const listing = read('docs/store/listing.md');
const fields = parseFields(listing);
const byName = new Map(fields.map(f => [f.name, f]));
const declarations = parseDeclarations(listing);

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
    expect(field!.text.includes(host), `host permission justification never mentions ${host}`).toBe(
      true
    );
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

describe('architecture: privacy declarations are version-controlled', () => {
  it.each(DATA_CATEGORIES)('answers the %s data-usage question explicitly', category => {
    const value = declarations.get(`data.${category}`);
    expect(
      value,
      `add "data.${category}" to docs/store/listing.md; an unrecorded category reads the ` +
        `same as an unticked box, and "we collect nothing" has to be a deliberate claim`
    ).toBeDefined();
    expect(['yes', 'no'], `data.${category} must be yes or no`).toContain(value);
  });

  it('declares website content as collected, because conversation text is read from the page', () => {
    // The Chrome Web Store's definition of "handle" covers local-only work:
    // "Extensions are required to disclose how they handle user data, even when
    // data is processed or stored locally on a user's device and is not
    // transmitted to external servers or third parties."
    // Every extractor reads conversation text out of the DOM, so this is a yes.
    expect(declarations.get('data.website_content')).toBe('yes');
  });

  it('keeps the remote-code answer consistent with the manifest CSP', () => {
    const answer = declarations.get('remote_code');
    expect(['yes', 'no'], 'declare remote_code as yes or no').toContain(answer);

    const csp = manifest.content_security_policy.extension_pages;
    const scriptSrc = /script-src\s+([^;]+)/.exec(csp)?.[1].trim() ?? '';
    const allowsRemoteScripts = /https?:\/\//.test(scriptSrc);

    expect(
      answer === 'no',
      `remote_code is "${answer}" but script-src is "${scriptSrc}" — the declaration and the ` +
        `CSP disagree about whether remotely hosted code can run`
    ).toBe(!allowsRemoteScripts);
  });

  it('records the same privacy policy URL that README.md publishes', () => {
    const declared = declarations.get('privacy_policy_url');
    expect(declared, 'add "privacy_policy_url" to docs/store/listing.md').toBeDefined();
    expect(
      read('README.md').includes(declared!),
      `README.md does not link ${declared} — the dashboard and the docs point users at ` +
        `different privacy policies`
    ).toBe(true);
  });
});
