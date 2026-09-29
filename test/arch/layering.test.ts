/**
 * Fitness function: one-way layering (ADR-012).
 *
 * Enforces the dependency direction documented in CLAUDE.md:
 *
 *     Content Script -> Background -> Obsidian REST API
 *
 * `lib/` is the shared base layer; `popup/` and `offscreen/` are leaves. A few
 * lib modules touch the DOM, so the background (a service worker) may not
 * import them.
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

  it('offscreen must not import content / background / popup', () => {
    modules(p)
      .that()
      .resideInFolder('**/offscreen/**')
      .should()
      .notImportFrom('**/content/**', '**/background/**', '**/popup/**')
      .because('offscreen is a leaf document that depends only on lib')
      .check();
  });

  it('background must not import the DOM-dependent lib modules', () => {
    // Service workers have no DOM (developer.chrome.com, Offscreen API), and
    // DOMPurify needs one. These modules live in lib/ for the content scripts;
    // jsdom would let a background import pass every unit test and then fail
    // only in the real worker (DES-018 L-2). Direct imports only: a lib module
    // that starts importing one of these would need its own entry here.
    modules(p)
      .that()
      .resideInFolder('**/background/**')
      .should()
      .notImportFrom('**/lib/scroll-manager.ts', '**/lib/scroll-axis.ts', '**/lib/sanitize.ts')
      .because('the service worker has no DOM')
      .check();
  });

  it('extractors must not import background / popup / offscreen', () => {
    modules(p)
      .that()
      .resideInFolder('**/content/extractors/**')
      .should()
      .notImportFrom('**/background/**', '**/popup/**', '**/offscreen/**')
      .because(
        'extractors depend on base, selectors, lib, and content helpers ' +
          '(image-markers, markdown-rules) — never on another extension context'
      )
      .check();
  });
});
