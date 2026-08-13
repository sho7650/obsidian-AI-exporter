# ADR-030: The image CDN's redirect target is a host of its own

- Status: Accepted
- Date: 2026-08-13
- Amends: [ADR-021](021-remote-image-fetch-in-service-worker.md)
- Related: [ADR-008](008-image-sync-strategy.md), [ADR-027](027-generated-image-capture-from-rendered-element.md), issue #376

## Context

Gemini image export stopped working. The extension's error console repeated, once per image:

```
Connecting to 'https://lh3.google.com/rd-gg/ACRwjas…=s1024-rj' violates the following
Content Security Policy directive: "connect-src 'self' http://127.0.0.1:*
https://127.0.0.1:* https://*.googleusercontent.com". The action has been blocked.
```

`lh3.google.com` appears nowhere in this repository. It is in neither
`host_permissions`, nor the manifest CSP, nor `isAllowedImageSourceUrl()`.

### Why the blocked URL cannot be a URL the extension chose

`src/` has exactly three `fetch()` call sites:

| Site | Guard |
| ---- | ----- |
| `background/image-fetch.ts:45` | `isAllowedImageSourceUrl()` at `:38`, and again at the message boundary in `background/validation.ts:87` |
| `content/image-capture.ts:108` | `blob:` URLs only |
| `lib/obsidian-api.ts` | the configured Obsidian base URL (127.0.0.1) |

A URL outside the allow-list is rejected **before** any fetch and surfaces as
`Image URL is not allowed`. A CSP violation is therefore positive evidence that a request *was*
issued — so the URL the extension named passed the guard, so it was on `*.googleusercontent.com`,
so the blocked URL is a **hop**, not the request. CSP is enforced against every URL in a redirect
chain, and the violation names the hop.

The build that produced the report was confirmed to be this repo's `dist/`: the console named
`service-worker.ts-Cy1DuXx-.js`, present in `dist/assets/`, and the minified guard
(`n===\`googleusercontent.com\`||n.endsWith(\`.googleusercontent.com\`)`) was read out of
`dist/assets/hash-Dl3GFoNt.js`. So this was not an old build lacking the guard.

### The assumption that expired

ADR-021 recorded the same redirect and drew a conclusion from it that has now stopped holding:

> `https://*.googleusercontent.com/*` is added to `host_permissions`. The subdomain is wildcarded
> because the CDN rotates across `lh3`/`lh4`/`lh5`/…, **and the observed request redirects from
> `/gg/` to `/rd-gg/` on the same host.**

The `/gg/` → `/rd-gg/` shape survives; "on the same host" does not. Google moved the redirect
target off `googleusercontent.com`. A wildcard over the source domain cannot cover it, because the
target is a different domain, and Chrome match patterns and CSP host-sources both refuse a
partial-label wildcard — `lh*.google.com` is not expressible in either grammar. The only forms
available are an exact host or a whole-label wildcard (`*.google.com`).

## Decision

**1. The redirect target is added to both manifest lists, and to neither guard.**
`https://lh3.google.com/*` joins `host_permissions`, and `https://lh3.google.com` joins CSP
`connect-src`. Host permissions grant permission; CSP still governs the connection; a host missing
from either one fails, which is the rule ADR-021 established and `test/arch/csp-connect-src.test.ts`
exists to keep.

**2. `isAllowedImageSourceUrl()` does not change — not one character.** The guard bounds *URLs a
caller can name*. A caller names only the initial URL; the redirect target is chosen by a server we
have already decided to fetch from. Adding the target to the guard would let a hostile message aim
the worker at that host **directly**, which is strictly more surface than the redirect achieves, for
no functional gain: nothing in the codebase ever passes such a URL (`content/image-capture.ts:103`
forwards the page's `<img>` src, and the page is served `*.googleusercontent.com`). The worker can
also reach `127.0.0.1`, where the vault and API key live — ADR-021's reason for the allow-list is
unchanged by this ADR.

This distinction is now written into the constants rather than left to a comment:

| Constant | Meaning |
| -------- | ------- |
| `IMAGE_CDN_DOMAIN` | host suffix accepted as an image **source** (the SSRF allow-list) — unchanged |
| `IMAGE_CDN_REDIRECT_HOSTS` | exact hosts the CDN redirects **into**: connectable, never a source |
| `IMAGE_CONNECT_HOSTS` | everything the fetch chain must reach; the arch test's single source of truth |

**3. Exactly the observed host, not a guessed family.** `lh3.google.com` is what all three reported
URLs used. `lh4`–`lh6` were considered and rejected: the store's own necessity rule
(quoted in `docs/store/listing.md`) targets permissions with nothing behind them, and a recurrence
is cheap to fix precisely because the violation message names the host — the runbook is below.
`*.google.com` was rejected as a broad host permission that buys nothing in return: `platform-ssot`
requires the per-platform Google hosts to stay as exact entries, so a wildcard would be purely
additive, and it would be a far worse mistake if anyone ever mirrored it into the source guard.

**4. Reachable is asserted together with not-nameable.** `test/arch/csp-connect-src.test.ts` checks,
for each redirect host, that CSP covers it *and* that `isAllowedImageSourceUrl()` still rejects it;
`test/lib/image-utils.test.ts` mirrors the negative. Both were verified non-vacuous by temporarily
widening the guard and observing them fail.

## Runbook, if Google moves the host again

The symptom is self-naming, which is why option 3 above is affordable:

1. Read the blocked host out of the CSP violation in the extension's error console.
2. Add it to `IMAGE_CDN_REDIRECT_HOSTS` in `src/lib/image-utils.ts`.
3. Add `https://<host>/*` to `host_permissions` and `https://<host>` to `connect-src`.
4. Recompress the host justification in `docs/store/listing.md` (3 characters of headroom remain)
   and update its `N characters` note.

`test/arch/csp-connect-src.test.ts` and `test/arch/store-listing-fields.test.ts` fail until steps
3 and 4 are done, so the sequence cannot be half-finished.

## Consequences

- **Users are prompted again.** A new `host_permissions` entry can leave the extension disabled
  until the user accepts the added permission — the same consequence ADR-021 recorded. The release
  notes must say so.
- **The store justification is at 997/1000 characters.** The ninth host was absorbed by merging the
  two CDN hosts into one `7-8.` entry and trimming prose. A tenth host means compressing again.
- **CSP cannot be tested here.** The suite proves the manifest strings agree with
  `IMAGE_CONNECT_HOSTS`; only loading the built extension in Chrome proves the fetch survives the
  redirect. That verification is a release step, not a CI step.
- **The failure mode if this recurs is unchanged and visible**: the worker's error reaches the
  export warning (ADR-027), and the console names the host.

## Alternatives considered

- **Follow redirects manually** (`redirect: 'manual'`, validate `Location`, re-fetch). Declined: it
  re-implements redirect following, needs an allow-list of its own for the target anyway, and the
  re-issued credentialed cross-origin request still requires the same host permission — so it adds
  a moving part without removing the manifest change.
- **`https://*.google.com/*`** — see Decision 3.
- **Enumerate `lh3`–`lh6.google.com`** — see Decision 3. Measured cost: 56 characters of host names
  into a field with 5 characters of headroom, i.e. ~55 characters of prose to cut, which is
  achievable; the reason for rejecting it is the unobserved permissions, not the budget.
