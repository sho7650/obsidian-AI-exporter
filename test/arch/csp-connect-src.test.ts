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
 *
 * The second lesson is #433-adjacent but its own bug (ADR-030): **both lists
 * apply to every hop of a redirect**. ADR-021 assumed the CDN redirected within
 * the wildcarded domain; when Google moved the target to `lh3.google.com`, a
 * request the extension was allowed to make died on a hop it never named, and
 * the console blamed a host that appears nowhere in our code. So the assertions
 * below are driven by `IMAGE_CONNECT_HOSTS` — every host the fetch chain has to
 * reach, sources and redirect targets alike — and a redirect target is checked
 * to be reachable WITHOUT becoming an accepted image source.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  IMAGE_CDN_DOMAIN,
  IMAGE_CDN_REDIRECT_HOSTS,
  IMAGE_CONNECT_HOSTS,
  isAllowedImageSourceUrl,
} from '../../src/lib/image-utils';

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
    const bare = source
      .replace(/^https?:\/\//, '')
      .replace(/:\*$/, '')
      .replace(/\/\*$/, '');
    if (bare === host) return true;
    return bare.startsWith('*.') && (host === bare.slice(2) || host.endsWith(bare.slice(1)));
  });
}

/** Host permissions as bare hosts, normalised the way `covers()` expects. */
const hostPermissions = manifest.host_permissions;

describe('manifest CSP connect-src', () => {
  it('declares a connect-src at all', () => {
    expect(
      directive('connect-src'),
      'connect-src is absent, so every host is allowed'
    ).not.toBeNull();
  });

  it.each(IMAGE_CONNECT_HOSTS)('connect-src permits %s', host => {
    const sources = directive('connect-src') as string[];
    expect(
      covers(sources, host),
      `connect-src does not cover ${host}; the service worker's fetch dies on ` +
        `that hop. Current: ${sources.join(' ')}`
    ).toBe(true);
  });

  it.each(IMAGE_CONNECT_HOSTS)('host_permissions permits %s', host => {
    // Both lists or neither: a host in CSP but not in host_permissions loses
    // the CORS exemption the credentialed fetch depends on, and the failure
    // reads as a completely different error (ADR-021, ADR-030).
    expect(
      covers(hostPermissions, host),
      `host_permissions does not cover ${host}. Current: ${hostPermissions.join(' ')}`
    ).toBe(true);
  });

  it('permits the local Obsidian API', () => {
    const sources = directive('connect-src') as string[];
    expect(covers(sources, '127.0.0.1')).toBe(true);
  });

  // Reachable is not the same as nameable. A redirect target is somewhere the
  // browser takes us; it must never be somewhere a message can send us, or the
  // worker — which can also reach 127.0.0.1, where the vault and API key live —
  // becomes an SSRF proxy for one more host for free (ADR-021, ADR-030).
  it.each(IMAGE_CDN_REDIRECT_HOSTS)('%s is reachable but is not an accepted image source', host => {
    expect(covers(directive('connect-src') as string[], host)).toBe(true);
    expect(
      isAllowedImageSourceUrl(`https://${host}/rd-gg/ACRwjas`),
      `${host} became an accepted image source; it is a redirect target, and ` +
        `nothing in the extension ever chooses such a URL`
    ).toBe(false);
  });

  it('keeps the image source allow-list to the CDN domain', () => {
    expect(isAllowedImageSourceUrl(`https://lh3.${IMAGE_CDN_DOMAIN}/gg/ACRwjau`)).toBe(true);
  });
});
