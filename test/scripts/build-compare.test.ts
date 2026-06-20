/**
 * Unit tests for the build-comparison helpers.
 *
 * These cover the pure / filesystem logic that powers `scripts/compare-build.mjs`:
 * path normalization, build:zip exclusion parity, per-file SHA-256 manifests,
 * and the manifest diff + report formatting.
 *
 * User journey: "As a maintainer, I want to know whether the artifact I built
 * locally has the same file contents as the artifact GitHub Actions built and
 * zipped, ignoring ZIP-container nondeterminism (entry order, timestamps, perms)."
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
// @ts-expect-error -- plain .mjs build tooling, no type declarations
import {
  toPosix,
  isExcluded,
  buildManifest,
  diffManifests,
  formatReport,
} from '../../scripts/lib/build-compare.mjs';

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'g2o-cmp-'));
  tmpDirs.push(dir);
  return dir;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('toPosix', () => {
  it('converts Windows backslashes to forward slashes', () => {
    expect(toPosix('assets\\index.js')).toBe('assets/index.js');
    expect(toPosix('a\\b\\c.txt')).toBe('a/b/c.txt');
  });

  it('leaves POSIX paths unchanged', () => {
    expect(toPosix('assets/index.js')).toBe('assets/index.js');
    expect(toPosix('manifest.json')).toBe('manifest.json');
  });
});

describe('isExcluded (build:zip parity: -x "*.DS_Store" -x ".vite/*")', () => {
  it('excludes anything inside a .vite directory', () => {
    expect(isExcluded('.vite')).toBe(true);
    expect(isExcluded('.vite/manifest.json')).toBe(true);
    expect(isExcluded('nested/.vite/chunk.js')).toBe(true);
  });

  it('excludes .DS_Store files anywhere', () => {
    expect(isExcluded('.DS_Store')).toBe(true);
    expect(isExcluded('assets/.DS_Store')).toBe(true);
  });

  it('keeps regular build output files', () => {
    expect(isExcluded('manifest.json')).toBe(false);
    expect(isExcluded('assets/index-abc123.js')).toBe(false);
    expect(isExcluded('_locales/en/messages.json')).toBe(false);
  });
});

describe('buildManifest', () => {
  it('produces a posix-keyed sha256 map of all files, recursively', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'manifest.json'), '{"a":1}');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'index.js'), 'console.log(1)');

    const manifest = buildManifest(dir);

    expect(manifest.get('manifest.json')).toBe(sha256('{"a":1}'));
    expect(manifest.get('assets/index.js')).toBe(sha256('console.log(1)'));
    expect(manifest.size).toBe(2);
  });

  it('excludes .vite/ and .DS_Store to mirror build:zip', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'manifest.json'), '{}');
    writeFileSync(join(dir, '.DS_Store'), 'junk');
    mkdirSync(join(dir, '.vite'));
    writeFileSync(join(dir, '.vite', 'manifest.json'), 'internal');

    const manifest = buildManifest(dir);

    expect(manifest.has('manifest.json')).toBe(true);
    expect(manifest.has('.DS_Store')).toBe(false);
    expect(manifest.has('.vite/manifest.json')).toBe(false);
    expect(manifest.size).toBe(1);
  });

  it('detects content differences via differing hashes', () => {
    const a = makeTempDir();
    const b = makeTempDir();
    writeFileSync(join(a, 'f.txt'), 'hello');
    writeFileSync(join(b, 'f.txt'), 'world');

    expect(buildManifest(a).get('f.txt')).not.toBe(buildManifest(b).get('f.txt'));
  });
});

describe('diffManifests', () => {
  it('reports identical when both manifests match', () => {
    const local = new Map([
      ['a.js', 'h1'],
      ['b.js', 'h2'],
    ]);
    const ci = new Map([
      ['a.js', 'h1'],
      ['b.js', 'h2'],
    ]);

    const diff = diffManifests(local, ci);

    expect(diff.identical).toBe(true);
    expect(diff.onlyLocal).toEqual([]);
    expect(diff.onlyCi).toEqual([]);
    expect(diff.mismatch).toEqual([]);
  });

  it('reports files only present locally', () => {
    const local = new Map([
      ['a.js', 'h1'],
      ['extra.js', 'h9'],
    ]);
    const ci = new Map([['a.js', 'h1']]);

    const diff = diffManifests(local, ci);

    expect(diff.identical).toBe(false);
    expect(diff.onlyLocal).toEqual(['extra.js']);
    expect(diff.onlyCi).toEqual([]);
    expect(diff.mismatch).toEqual([]);
  });

  it('reports files only present in CI', () => {
    const local = new Map([['a.js', 'h1']]);
    const ci = new Map([
      ['a.js', 'h1'],
      ['only-ci.js', 'h8'],
    ]);

    const diff = diffManifests(local, ci);

    expect(diff.identical).toBe(false);
    expect(diff.onlyCi).toEqual(['only-ci.js']);
    expect(diff.onlyLocal).toEqual([]);
  });

  it('reports content mismatches (same path, different hash)', () => {
    const local = new Map([['a.js', 'h1']]);
    const ci = new Map([['a.js', 'DIFFERENT']]);

    const diff = diffManifests(local, ci);

    expect(diff.identical).toBe(false);
    expect(diff.mismatch).toEqual(['a.js']);
  });

  it('sorts each difference list for stable output', () => {
    const local = new Map([
      ['z.js', 'h'],
      ['a.js', 'h'],
    ]);
    const ci = new Map<string, string>();

    const diff = diffManifests(local, ci);

    expect(diff.onlyLocal).toEqual(['a.js', 'z.js']);
  });
});

describe('formatReport', () => {
  it('reports success when identical', () => {
    const report = formatReport({ identical: true, onlyLocal: [], onlyCi: [], mismatch: [] });
    expect(report).toMatch(/identical/i);
  });

  it('lists each difference category when builds differ', () => {
    const report = formatReport({
      identical: false,
      onlyLocal: ['extra.js'],
      onlyCi: ['only-ci.js'],
      mismatch: ['a.js'],
    });
    expect(report).toMatch(/differ/i);
    expect(report).toContain('a.js');
    expect(report).toContain('extra.js');
    expect(report).toContain('only-ci.js');
  });
});
