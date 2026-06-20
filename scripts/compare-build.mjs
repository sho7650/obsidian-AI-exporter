#!/usr/bin/env node

/**
 * compare-build — verify a local build matches the GitHub Actions release ZIP.
 *
 * Compares *file contents* (sorted per-file SHA-256), NOT the ZIP container,
 * because `zip -r` records entry order / timestamps / perms that differ across
 * machines even when the built files are identical. See
 * docs/build-reproducibility.md.
 *
 * Usage:
 *   node scripts/compare-build.mjs                 # build locally, compare vs release v<pkg version>
 *   node scripts/compare-build.mjs --tag v1.2.16   # compare vs a specific release tag
 *   node scripts/compare-build.mjs --ci-zip a.zip  # compare vs an already-downloaded zip
 *   node scripts/compare-build.mjs --twice         # build twice locally, check determinism
 *   node scripts/compare-build.mjs --keep          # keep temp dirs for inspection
 *
 * Exit code: 0 when identical, 1 when builds differ, 2 on operational error.
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildManifest, diffManifests, formatReport } from './lib/build-compare.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');

/**
 * Parse argv into options.
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const opts = { twice: false, keep: false, tag: null, ciZip: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--twice') opts.twice = true;
    else if (arg === '--keep') opts.keep = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--tag') {
      opts.tag = argv[++i];
      if (!opts.tag) die('--tag requires a value');
    } else if (arg === '--ci-zip') {
      opts.ciZip = argv[++i];
      if (!opts.ciZip) die('--ci-zip requires a value');
    } else die(`Unknown argument: ${arg}`);
  }
  return opts;
}

/** @param {string} msg */
function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}

/** @param {string} cmd @param {string[]} args @param {string} cwd */
function run(cmd, args, cwd = ROOT) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

/** @returns {string} the version field from package.json */
function readVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

/** @returns {string} short HEAD sha, or 'unknown' */
function headSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/** Build the extension into dist/ exactly as the release pipeline does. */
function buildLocal() {
  console.log('▶ building locally (npm run build)…');
  run('npm', ['run', 'build']);
}

const tempDirs = [];
/** @param {string} prefix */
function makeTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/**
 * Remove all temp dirs created this run (best effort).
 * @param {boolean} keep when true, retain dirs and print their paths instead
 */
function cleanup(keep) {
  if (keep && tempDirs.length > 0) {
    console.log(`\nkept temp dirs:\n  ${tempDirs.join('\n  ')}`);
    return;
  }
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort — the OS reclaims /tmp eventually
    }
  }
}

/**
 * Download the release ZIP for a tag into a temp dir and return its path.
 * @param {string} tag
 * @returns {string} path to the downloaded .zip
 */
function downloadReleaseZip(tag) {
  const dir = makeTemp('g2o-ci-');
  console.log(`▶ downloading release ZIP for ${tag} via gh…`);
  try {
    run('gh', ['release', 'download', tag, '--pattern', 'gemini2obsidian-*.zip', '--dir', dir]);
  } catch {
    // Throw (not die) so main()'s catch cleans up temp dirs and exits 2.
    throw new Error(
      `gh release download failed for tag '${tag}'. Is the tag published and gh authenticated?`
    );
  }
  const zips = readdirSync(dir).filter(f => f.endsWith('.zip'));
  if (zips.length !== 1) {
    throw new Error(
      `expected exactly one zip for ${tag}, found ${zips.length}: ${zips.join(', ')}`
    );
  }
  return join(dir, zips[0]);
}

/**
 * Extract a zip into a fresh temp dir and return that dir.
 * @param {string} zipPath
 * @returns {string}
 */
function extractZip(zipPath) {
  const dir = makeTemp('g2o-extract-');
  run('unzip', ['-q', '-o', zipPath, '-d', dir]);
  return dir;
}

/** Local-vs-local determinism check. */
function runTwice() {
  buildLocal();
  const first = buildManifest(DIST);
  buildLocal();
  const second = buildManifest(DIST);
  const diff = diffManifests(first, second);
  console.log('\n' + formatReport(diff, { localLabel: 'build #1', ciLabel: 'build #2' }));
  if (!diff.identical) {
    console.log(
      '\nLocal build is NON-deterministic on this machine (see Vite issues #13071/#13672).'
    );
  }
  return diff;
}

/**
 * Local-vs-CI content comparison.
 * @param {{ tag: string | null, ciZip: string | null }} opts
 */
function runCompare(opts) {
  buildLocal();
  const localManifest = buildManifest(DIST);

  const zipPath = opts.ciZip
    ? resolve(opts.ciZip)
    : downloadReleaseZip(opts.tag ?? `v${readVersion()}`);
  const ciDir = extractZip(zipPath);
  const ciManifest = buildManifest(ciDir);

  const diff = diffManifests(localManifest, ciManifest);
  console.log(`\nlocal HEAD: ${headSha()}  (ensure it matches the release tag's commit)`);
  console.log(formatReport(diff));
  if (!diff.identical) {
    console.log(`\nInvestigate with:\n  diffoscope ${DIST} ${ciDir}`);
    console.log('(re-run with --keep to retain the extracted CI dir for diffoscope)');
  }
  return diff;
}

function printHelp() {
  console.log(
    [
      'compare-build — verify a local build matches the GitHub Actions release ZIP',
      '',
      'Usage:',
      '  compare-build                 compare local build vs release v<package.json version>',
      '  compare-build --tag <tag>     compare vs a specific release tag',
      '  compare-build --ci-zip <path> compare vs an already-downloaded zip',
      '  compare-build --twice         build twice locally, check determinism',
      '  compare-build --keep          keep temp dirs for diffoscope inspection',
    ].join('\n')
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  try {
    const diff = opts.twice ? runTwice() : runCompare(opts);
    cleanup(opts.keep);
    process.exit(diff.identical ? 0 : 1);
  } catch (err) {
    // Any operational failure (build, download, extract, FS) → exit 2,
    // distinct from "builds differ" (exit 1). Always discard temp dirs.
    cleanup(false);
    die(err instanceof Error ? err.message : String(err));
  }
}

main();
