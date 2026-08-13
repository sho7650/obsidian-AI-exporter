/**
 * Fitness function: code fences are written and parsed in exactly one place
 * (ADR-029).
 *
 * Issue #433 was one defect written down three times: `markdown-rules.ts` had
 * a hardcoded three-backtick fence in two rules, and two separate readers
 * (`escapeByLine()`, `scanMessageStarts()`) each carried their own length-blind
 * `` ``` `` toggle. Each copy was individually plausible and collectively wrong,
 * and nothing in the suite objected to a fourth copy being added.
 *
 * So the rule is structural: `src/lib/code-fence.ts` emits fences via
 * `fenceCodeBlock()` and tracks them via `nextFenceState()`, and no other
 * module under src/ may spell a fence out for itself.
 *
 * Comments are stripped first, so documenting a fence in prose stays allowed —
 * only executable code is inspected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const srcDir = path.join(root, 'src');

/** The one module allowed to spell fences out. */
const FENCE_SSOT = 'src/lib/code-fence.ts';

/**
 * A documented, deliberately narrow exemption: `BaseExtractor.buildMetadata()`
 * probes raw HTML for a fence substring to set the `hasCodeBlocks` metadata
 * flag. That is a heuristic over page HTML, not fence emission or fence
 * parsing, so it is exempt — but only this exact expression is. Any other
 * fence literal in that file still fails the check below.
 */
const EXEMPT_EXPRESSIONS = ["m.content.includes('```')"];

function collectSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Strip comments so prose about fences stays allowed. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function executableCode(rel: string): string {
  const raw = stripComments(fs.readFileSync(path.join(root, rel), 'utf-8'));
  return EXEMPT_EXPRESSIONS.reduce((code, expr) => code.split(expr).join(''), raw);
}

const sources = collectSources(srcDir)
  .map(f => path.relative(root, f))
  .filter(rel => rel !== FENCE_SSOT);

describe('architecture: code fences have a single source of truth', () => {
  it('finds sources to check, and the SSOT module itself', () => {
    expect(sources.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, FENCE_SSOT))).toBe(true);
  });

  it.each(sources)('%s does not spell out a fence literal', rel => {
    const code = executableCode(rel);
    // A run of three or more backticks in a string, or the escaped form a
    // template literal uses.
    const offenders = [...(code.match(/`{3,}/g) ?? []), ...(code.match(/\\`\\`\\`/g) ?? [])];
    expect(
      offenders,
      `${rel} writes a fence itself — emit fenced code via fenceCodeBlock() from ${FENCE_SSOT}`
    ).toEqual([]);
  });

  it.each(sources)('%s does not detect fences itself', rel => {
    const code = executableCode(rel);
    // `` `{3,} `` quantifiers and `startsWith('```')`-style probes: both are
    // length-blind fence detection, which is what desynced the readers in #433.
    const offenders = [
      ...(code.match(/`\{\d+,?\d*\}/g) ?? []),
      ...(code.match(/startsWith\(\s*['"`]`/g) ?? []),
    ];
    expect(
      offenders,
      `${rel} parses fences itself — track fence state via nextFenceState() from ${FENCE_SSOT}`
    ).toEqual([]);
  });
});
