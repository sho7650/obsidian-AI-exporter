/**
 * Fitness function: an extractor never re-types a selector that its selector
 * module already defines.
 *
 * The selector modules under src/content/extractors/selectors/ are the
 * contract the live E2E validation enforces (ADR-005, ADR-016). A literal copy
 * inside the extractor — `turn.querySelector('user-query')` next to
 * `SELECTORS.userQuery: ['user-query', …]` — is invisible to that contract:
 * when the group is repaired, the copy keeps the old string and the extractor
 * silently stops matching while the E2E run stays green. The 2026-09 audit
 * found five such copies (docs/investigation/e2e-coverage-gaps-2026-09.md §A).
 *
 * Rule: a string literal passed to querySelector / querySelectorAll / closest /
 * matches inside an extractor must not equal (per comma-separated part) any
 * selector of that platform's module, nor equal one with its trailing
 * pseudo-class narrowing removed (`button.citation-marker` vs
 * `button.citation-marker:not(:has(mat-icon))`). Detection-only selectors the
 * contract deliberately excludes (kept as private consts, see #402) are
 * untouched: they are not string literals at the call site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const extractorsDir = path.join(root, 'src/content/extractors');
const selectorsDir = path.join(extractorsDir, 'selectors');

const PLATFORMS = ['gemini', 'claude', 'chatgpt', 'perplexity', 'notebooklm'] as const;

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every selector string of every exported group in the platform's module. */
async function contractSelectors(platform: string): Promise<Set<string>> {
  const mod = (await import(path.join(selectorsDir, `${platform}.ts`))) as Record<string, unknown>;
  const out = new Set<string>();
  for (const value of Object.values(mod)) {
    if (typeof value !== 'object' || value === null) continue;
    for (const list of Object.values(value as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        if (typeof s === 'string') {
          for (const part of s.split(',')) out.add(part.trim());
        }
      }
    }
  }
  return out;
}

/** String literals handed straight to a DOM query call. */
function inlineQueryLiterals(code: string): string[] {
  const re =
    /\b(?:querySelector|querySelectorAll|closest|matches)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  const found: string[] = [];
  for (const m of code.matchAll(re)) found.push(m[2]);
  return found;
}

function withoutPseudo(selector: string): string {
  return selector.replace(/:(?:not|has|is|where)\(.*\)$/, '').trim();
}

describe('architecture: extractors do not duplicate their contract selectors', () => {
  it.each(PLATFORMS)('%s.ts has no inline copy of a contract selector', async platform => {
    const contract = await contractSelectors(platform);
    expect(contract.size).toBeGreaterThan(0);
    const code = stripComments(
      fs.readFileSync(path.join(extractorsDir, `${platform}.ts`), 'utf-8')
    );

    const offenders = inlineQueryLiterals(code).filter(literal =>
      literal
        .split(',')
        .map(p => p.trim())
        .some(
          part =>
            contract.has(part) || [...contract].some(c => withoutPseudo(c) === part && c !== part)
        )
    );

    expect(
      offenders,
      `${platform}.ts re-types a selector that selectors/${platform}.ts already defines — ` +
        `use SELECTORS / COMPUTED_SELECTORS / JOINED_SELECTORS instead`
    ).toEqual([]);
  });
});
