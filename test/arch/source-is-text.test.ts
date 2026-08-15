/**
 * Fitness function: source files stay text.
 *
 * `compareWithBaseline`'s key separator was a raw NUL byte embedded directly in
 * `e2e/selectors/baseline.ts`. Git classifies such a file as binary, so its
 * diff renders as `Bin 7129 -> 11141 bytes` — the change is invisible in review
 * on GitHub, and stays invisible for as long as either side of the comparison
 * carries the byte. It cost a PR its most important diff before anyone noticed.
 *
 * The character itself was fine; writing it raw instead of as `\u0000` was not.
 * This check keeps that distinction: any control character a source file needs
 * must be written as an escape.
 *
 * Allowed: tab, newline, carriage return — the ones a text file legitimately
 * contains.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const SCANNED_DIRS = ['src', 'e2e', 'test', 'scripts'] as const;
const TEXT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json', '.css', '.html', '.md'];

/** Control characters a text file may legitimately hold. */
const ALLOWED_CONTROL_CODES = new Set([0x09, 0x0a, 0x0d]);

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // results/ holds generated run reports; node_modules is not ours.
      if (entry.name === 'node_modules' || entry.name === 'results') return [];
      return collectFiles(full);
    }
    return entry.isFile() && TEXT_EXTENSIONS.includes(path.extname(entry.name)) ? [full] : [];
  });
}

const sources = SCANNED_DIRS.flatMap(dir => collectFiles(path.join(root, dir))).map(f =>
  path.relative(root, f)
);

/** Offsets of every disallowed control byte, with a little context. */
function findControlBytes(rel: string): string[] {
  const bytes = fs.readFileSync(path.join(root, rel));
  const hits: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    if (code < 0x20 && !ALLOWED_CONTROL_CODES.has(code)) {
      const hex = `0x${code.toString(16).padStart(2, '0')}`;
      hits.push(`byte ${i} (${hex})`);
    }
  }
  return hits;
}

describe('architecture: source files are text, not binary', () => {
  it('finds sources to scan', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('%s contains no raw control characters', rel => {
    expect(
      findControlBytes(rel),
      `${rel} embeds a raw control character. Git then treats the file as binary and its diff ` +
        `stops being reviewable — write the character as an escape (\\u0000, \\x1b, …) instead`
    ).toEqual([]);
  });
});
