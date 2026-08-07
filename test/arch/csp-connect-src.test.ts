/**
 * Fitness function: the manifest's CSP must permit every host the extension
 * actually connects to.
 *
 * `connect-src` was introduced purely to allow the local Obsidian API
 * (`fix(csp): add connect-src directive for localhost API access`). Naming any
 * source at all closes every other one, and the generated-image fetch added
 * later (#376) went out against a policy that silently blocked it: Chrome's
 * manifest reference states the extension-pages policy "applies to page and
 * worker contexts in the extension, including popups, background workers", so
 * the service worker's fetch of the image CDN failed with a bare
 * `TypeError: Failed to fetch` — reported by users as "images are not saved".
 *
 * Host permissions grant permission; CSP still governs the connection. Both
 * have to list a host, and this test keeps them from drifting apart again.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { IMAGE_CDN_DOMAIN } from '../../src/lib/image-utils';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../src/manifest.json'), 'utf-8')
) as {
  host_permissions: string[];
  content_security_policy: { extension_pages: string };
};

/** Sources listed for one CSP directive, or null when the directive is absent. */
function directive(name: string): string[] | null {
  const policy = manifest.content_security_policy.extension_pages;
  const found = policy
    .split(';')
    .map(part => part.trim())
    .find(part => part === name || part.startsWith(`${name} `));
  if (!found) return null;
  return found.split(/\s+/).slice(1);
}

/** True when `sources` covers `host` (exact, or a `*.` wildcard parent). */
function covers(sources: string[], host: string): boolean {
  return sources.some(source => {
    const bare = source.replace(/^https?:\/\//, '').replace(/:\*$/, '').replace(/\/\*$/, '');
    if (bare === host) return true;
    return bare.startsWith('*.') && (host === bare.slice(2) || host.endsWith(bare.slice(1)));
  });
}

describe('manifest CSP connect-src', () => {
  it('permits the image CDN the service worker fetches from', () => {
    const sources = directive('connect-src');
    expect(sources, 'connect-src is absent, so every host is allowed').not.toBeNull();
    expect(
      covers(sources as string[], `lh3.${IMAGE_CDN_DOMAIN}`),
      `connect-src does not cover the image CDN (${IMAGE_CDN_DOMAIN}); the ` +
        `service worker's fetch will fail with "Failed to fetch". Current: ${sources?.join(' ')}`
    ).toBe(true);
  });

  it('permits the local Obsidian API', () => {
    const sources = directive('connect-src') as string[];
    expect(covers(sources, '127.0.0.1')).toBe(true);
  });

  it('lists every remote host_permission it needs to connect to', () => {
    // Content scripts are not bound by the extension CSP, so page hosts are
    // exempt; only hosts the extension itself connects to must appear. The
    // image CDN is the one such host today.
    const sources = directive('connect-src') as string[];
    const cdnPermission = manifest.host_permissions.find(p => p.includes(IMAGE_CDN_DOMAIN));

    expect(cdnPermission, 'the image CDN must stay in host_permissions').toBeDefined();
    expect(covers(sources, `lh3.${IMAGE_CDN_DOMAIN}`)).toBe(true);
  });
});
