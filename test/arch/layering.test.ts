/**
 * Fitness function: one-way layering (ADR-012).
 *
 * Enforces the dependency direction documented in CLAUDE.md:
 *
 *     Content Script -> Background -> Obsidian REST API
 *
 * `lib/` is the shared base layer; `popup/` and `offscreen/` are leaves.
 * Cross-layer talk between content and background happens via the Chrome
 * messaging API at runtime, NOT via static imports, so importing across
 * those folders is forbidden.
 *
 * Glob anchoring: ts-archunit matches resideInFolder()/notImportFrom() against
 * ABSOLUTE file paths, so folders are matched with globstar-prefixed globs
 * (a bare non-prefixed folder glob matches nothing — verified during ADR-012).
 * Planting a `src/lib -> src/content` import makes the first case fail.
 */
import path from 'node:path';
import { describe, it } from 'vitest';
import { project, modules } from '@nielspeter/ts-archunit';

const tsconfigPath = path.resolve(import.meta.dirname, '../../tsconfig.json');
const p = project(tsconfigPath);

describe('architecture: layering', () => {
  it('lib must not import content / background / popup / offscreen', () => {
    modules(p)
      .that()
      .resideInFolder('**/lib/**')
      .should()
      .notImportFrom('**/content/**', '**/background/**', '**/popup/**', '**/offscreen/**')
      .because('lib is the shared base layer and must not depend upward')
      .check();
  });

  it('content must not import background / popup / offscreen', () => {
    modules(p)
      .that()
      .resideInFolder('**/content/**')
      .should()
      .notImportFrom('**/background/**', '**/popup/**', '**/offscreen/**')
      .because('content talks to background via Chrome messaging, not imports')
      .check();
  });

  it('background must not import content / popup / offscreen', () => {
    modules(p)
      .that()
      .resideInFolder('**/background/**')
      .should()
      .notImportFrom('**/content/**', '**/popup/**', '**/offscreen/**')
      .because('background depends only on lib and its own modules')
      .check();
  });

  it('popup must not import content / background / offscreen', () => {
    modules(p)
      .that()
      .resideInFolder('**/popup/**')
      .should()
      .notImportFrom('**/content/**', '**/background/**', '**/offscreen/**')
      .because('popup is a leaf UI layer that depends only on lib')
      .check();
  });

  it('extractors must not import background / popup / offscreen', () => {
    modules(p)
      .that()
      .resideInFolder('**/content/extractors/**')
      .should()
      .notImportFrom('**/background/**', '**/popup/**', '**/offscreen/**')
      .because('extractors depend only on base, selectors, and lib')
      .check();
  });
});
