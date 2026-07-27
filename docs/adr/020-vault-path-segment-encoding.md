# ADR-020: Vault paths are percent-encoded per segment, not whole

## Status

Accepted (2026-07-27)

## Context

`ObsidianApiClient` built every `/vault/{path}` URL with
`encodeURIComponent(path)`. That encodes the whole string as one URI component,
so directory separators became `%2F`:

```
AI/gemini/note.md  →  /vault/AI%2Fgemini%2Fnote.md
```

This worked until Local REST API **4.1.3**, which fixed an authenticated path
traversal vulnerability ([GHSA-62gx-5q78-wrvx](https://github.com/advisories/GHSA-62gx-5q78-wrvx)).
Before the fix, the handler decoded the entire remainder of the path in one go:

```ts
// 4.1.2 — src/requestHandler.ts
const path = decodeURIComponent(req.path.slice(req.path.indexOf("/", 1) + 1));
```

Express normalises `../` at the routing layer but does not treat `%2F` as a
separator, so `..%2F..%2F` reached the handler intact and this single decode
reconstituted it into `../../` — escaping the vault root. As the advisory puts
it: "the string routing saw is not the string the handler uses".

4.1.3 splits on literal `/` **first** and decodes each segment individually,
then confines the result:

```ts
// 4.1.3+ — src/requestHandler.ts, extractVaultPath()
segments = rawRemainder.split("/").map((s) => decodeURIComponent(s));
const syntheticRoot = "/vault";
const resolved = posix.resolve(syntheticRoot, segments.join("/"));
if (resolved !== syntheticRoot && !resolved.startsWith(syntheticRoot + "/")) {
  this.returnCannedResponse(res, { errorCode: ErrorCode.PathTraversalNotAllowed });
  return null;
}
```

A `%2F` therefore no longer separates directories. `AI%2Fgemini%2Fnote.md` is
one segment that decodes to a single file *named* `AI/gemini/note.md`, which
cannot exist — every request 404s. The behaviour is unchanged through 5.0.2.

Observed impact (issues #377, #376):

| Operation | Result before this change |
| --- | --- |
| Save with any sub-folder vault path (default `AI/{platform}`) | 404, surfaced as "File not found in vault." |
| Save with an empty vault path | worked — no `/` in the path, so nothing to mis-encode |
| Image export (`AI/{platform}/images`) | always failed, and silently |
| Append-mode ID scan (`listFiles` / `listEntries`) | 404 → treated as "no such directory" → duplicate notes |

The OpenAPI specification is unambiguous that this is our bug, not upstream's:
`filename` is documented as "Path to the relevant file (relative to your vault
root)" — a path, whose separators belong in the URL as separators.

## Decision

Encode vault paths **per segment**, in one exported helper in
`src/lib/obsidian-api.ts` used by all four call sites (`getFile`, `putFile`,
`putBinaryFile`, `listEntries`):

```ts
export function encodeVaultPath(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}
```

**`encodeURIComponent` per segment, not `encodeURI` over the whole path.**
`encodeURI` is the tempting one-liner and is wrong here. Per MDN it does not
escape the reserved set `; / ? : @ & = + $ , #`, and `vaultPath` /
`imageVaultPath` are free-form user input with no character validation
(`settings-schema.ts`). A vault path of `AI/Q&A` or `AI/notes#draft` would
produce a corrupted or truncated request URL. MDN's guidance is explicit: "If
you want to dynamically assemble string values into a URL, you probably want to
use `encodeURIComponent()` on each dynamic segment instead."

The helper lives in `obsidian-api.ts` rather than `path-utils.ts` because it is
a REST-transport concern, not a vault-path semantics concern. `path-utils.ts`
keeps template resolution and traversal detection, which run before any URL
exists.

Path-traversal defence is unchanged and unaffected: `containsPathTraversal()`
still runs on the decoded path in `obsidian-handlers.ts` before any request is
built, and the server applies its own confinement check independently.

## Consequences

- Sub-folder vault paths, image export, and append-mode directory scans work
  again on Local REST API 4.1.3 through 5.0.2.
- **Backward compatible with 4.1.2 and earlier.** The old handler decodes the
  whole path once; `AI/my%20notes/foo.md` decodes to `AI/my notes/foo.md`, and a
  literal `%` survives because it is encoded to `%25`. No version detection or
  branching is required, and none was added.
- Six existing assertions in `test/lib/obsidian-api.test.ts` had pinned the
  `%2F` form. They encoded the defect as the contract, so the suite stayed green
  while every real save failed — the tests were updated to the corrected URLs
  and seven `encodeVaultPath` unit tests added, including the `#`/`?`/`&` case
  that distinguishes this from `encodeURI`.
- Related, shipped in the same change: image-write failures were logged with
  `console.warn` and dropped, which is why #376 reported image export as simply
  "does not work" with no error. `SaveResponse` and `OutputResult` gained an
  optional `warning` field, so a note that saves while an image fails now raises
  a follow-up warning toast instead of appearing fully successful. Image
  failures remain non-blocking for the note itself.
