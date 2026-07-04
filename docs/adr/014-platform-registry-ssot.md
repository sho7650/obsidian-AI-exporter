# ADR-014: Platform registry as single source of truth for platform metadata

## Status

Accepted (2026-07-04)

## Context

Supporting a platform requires consistent metadata in several places. Before
this ADR, each was hand-maintained independently:

- `AIPlatform` union (`src/lib/types.ts`)
- `VALID_SOURCES` (`src/lib/constants.ts`) — duplicate of the union with **no
  type relationship**
- `ALLOWED_ORIGINS` (`src/lib/constants.ts`) — free-standing origin literals
- `PLATFORM_LABELS` (`src/lib/constants.ts`) — the only one type-linked
  (`Record<AIPlatform, string>`)
- `getExtractor()` hostname if-chain (`src/content/index.ts`)
- `PLATFORM_ROOT_SELECTORS` hostname-keyed map (`src/content/index.ts`)

The `platform-ssot` fitness function (ADR-012) catches divergence at test
time, but the 2026-07-04 architecture analysis rated this a bandaid: the
duplication itself makes adding platform #6 an 8-step manual checklist where
half the steps are re-stating the same three facts (id, hostname, label).

## Decision

Introduce `src/lib/platform-registry.ts` as the single source of truth for
per-platform metadata:

```ts
export const PLATFORM_REGISTRY: Record<AIPlatform, PlatformInfo> = {
  gemini: { host: 'gemini.google.com', label: 'Gemini' },
  // ...
};
```

Key properties:

1. **Compile-time exhaustiveness.** `Record<AIPlatform, PlatformInfo>` means
   extending the `AIPlatform` union fails to compile until a registry entry
   exists, and vice versa for consumers keyed by the union
   (`PLATFORM_ROOT_SELECTORS`, extractor constructor map).
2. **Derived, not duplicated.** `VALID_SOURCES`, `ALLOWED_ORIGINS`, and
   `PLATFORM_LABELS` in `constants.ts` are derived from the registry. Origins
   are derived from hosts (`https://${host}`) — one fact, one place.
3. **Layering preserved.** The registry is pure data and lives in `lib/`.
   Extractor **constructors stay in `src/content/index.ts`** in a
   `Record<AIPlatform, ...>` map: putting classes in a lib registry would
   create a lib→content dependency and violate the one-way layering enforced
   by `test/arch/layering.test.ts`.
4. **Fitness function narrows.** `platform-ssot.test.ts` now guards the
   manifest ⇄ registry seam (the only edge TypeScript cannot see) plus the
   derivation structure, instead of pairwise-checking six hand-written lists.

## Consequences

- Adding a platform: extend the `AIPlatform` union, add one registry entry,
  add the extractor + its constructor/selector map entries (compile-enforced),
  update the manifest. `CLAUDE.md` "Adding New Platforms" is updated
  accordingly.
- `VALID_SOURCES` changes type from a literal tuple to `readonly AIPlatform[]`;
  `(typeof VALID_SOURCES)[number]` now resolves to `AIPlatform` (semantically
  identical for existing call sites).
- The manifest remains hand-maintained (JSON cannot import TypeScript); the
  fitness function remains the guard for that seam.
