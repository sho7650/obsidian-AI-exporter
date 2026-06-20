/**
 * Build-comparison helpers.
 *
 * Pure / filesystem logic shared by `scripts/compare-build.mjs`. Compares the
 * *contents* of two built artifact trees (a local `dist/` and an extracted CI
 * ZIP) rather than the ZIP container bytes — because `zip -r` records
 * filesystem entry order, per-file timestamps, and mode/uid/gid, all of which
 * differ across machines (macOS vs Linux) even when the built files are
 * byte-identical. See docs/build-reproducibility.md.
 *
 * @typedef {Map<string, string>} Manifest  posix-relative-path -> sha256 hex
 * @typedef {Object} DiffResult
 * @property {boolean} identical  true when every file matches
 * @property {string[]} onlyLocal paths present only in the local tree
 * @property {string[]} onlyCi    paths present only in the CI tree
 * @property {string[]} mismatch  paths present in both with differing content
 */

import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

/** Suffix marking macOS Finder metadata files excluded by build:zip. */
const DS_STORE_SUFFIX = '.DS_Store';
/** Directory segment for Vite's internal manifest, excluded by build:zip. */
const VITE_DIR_SEGMENT = '.vite';

/**
 * Normalize a path to use forward slashes, so comparisons are OS-independent.
 *
 * @param {string} p
 * @returns {string}
 */
export function toPosix(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Decide whether a posix-relative path is excluded from the comparison,
 * mirroring `build:zip`'s `-x '*.DS_Store' -x '.vite/*'` exclusions so the
 * local tree and the extracted CI ZIP are compared on equal footing.
 *
 * Note: the bare directory name `.vite` is also matched (not just `.vite/*`).
 * This is intentional and slightly stricter than zip's glob: {@link buildManifest}
 * calls this on directories too, so matching `.vite` lets the walk prune that
 * subtree entirely instead of recursing into it.
 *
 * @param {string} posixPath
 * @returns {boolean}
 */
export function isExcluded(posixPath) {
  const segments = posixPath.split('/');
  if (segments.includes(VITE_DIR_SEGMENT)) return true;
  const base = segments[segments.length - 1];
  return base.endsWith(DS_STORE_SUFFIX);
}

/**
 * Walk a directory tree and build a manifest of `posixRelativePath -> sha256`.
 * Excluded paths (see {@link isExcluded}) are skipped, including not recursing
 * into excluded directories.
 *
 * @param {string} dir  root directory to scan
 * @returns {Manifest}
 */
export function buildManifest(dir) {
  /** @type {Manifest} */
  const manifest = new Map();
  walk(dir, dir, manifest);
  return manifest;
}

/**
 * @param {string} root
 * @param {string} current
 * @param {Manifest} manifest
 */
function walk(root, current, manifest) {
  const entries = readdirSync(current, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(current, entry.name);
    const relPosix = toPosix(relative(root, full));
    if (isExcluded(relPosix)) continue;
    // Only regular files and directories are walked. Symlinks (which a Chrome
    // extension dist/ does not contain) are intentionally skipped.
    if (entry.isDirectory()) {
      walk(root, full, manifest);
    } else if (entry.isFile()) {
      const hash = createHash('sha256').update(readFileSync(full)).digest('hex');
      manifest.set(relPosix, hash);
    }
  }
}

/**
 * Compare two manifests, classifying every difference.
 *
 * @param {Manifest} local
 * @param {Manifest} ci
 * @returns {DiffResult}
 */
export function diffManifests(local, ci) {
  /** @type {string[]} */
  const onlyLocal = [];
  /** @type {string[]} */
  const onlyCi = [];
  /** @type {string[]} */
  const mismatch = [];

  for (const [path, hash] of local) {
    if (!ci.has(path)) {
      onlyLocal.push(path);
    } else if (ci.get(path) !== hash) {
      mismatch.push(path);
    }
  }
  for (const path of ci.keys()) {
    if (!local.has(path)) onlyCi.push(path);
  }

  onlyLocal.sort();
  onlyCi.sort();
  mismatch.sort();

  const identical = onlyLocal.length === 0 && onlyCi.length === 0 && mismatch.length === 0;
  return { identical, onlyLocal, onlyCi, mismatch };
}

/**
 * Render a human-readable summary of a diff result.
 *
 * @param {DiffResult} diff
 * @param {{ localLabel?: string, ciLabel?: string }} [labels]
 * @returns {string}
 */
export function formatReport(diff, labels = {}) {
  const { localLabel = 'local', ciLabel = 'CI' } = labels;
  if (diff.identical) {
    return '✅ Builds are identical — every file content matches.';
  }

  const lines = ['❌ Builds differ:'];
  if (diff.mismatch.length > 0) {
    lines.push(`  content mismatch (${diff.mismatch.length}): ${diff.mismatch.join(', ')}`);
  }
  if (diff.onlyLocal.length > 0) {
    lines.push(`  only in ${localLabel} (${diff.onlyLocal.length}): ${diff.onlyLocal.join(', ')}`);
  }
  if (diff.onlyCi.length > 0) {
    lines.push(`  only in ${ciLabel} (${diff.onlyCi.length}): ${diff.onlyCi.join(', ')}`);
  }
  return lines.join('\n');
}
