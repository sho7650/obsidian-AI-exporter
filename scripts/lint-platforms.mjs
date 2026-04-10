#!/usr/bin/env node

/**
 * Platform lint script — validates that all platforms in manifest.json
 * content_scripts[0].matches are referenced in documentation and config files.
 *
 * SSOT: src/manifest.json → content_scripts[0].matches
 *
 * Usage: node scripts/lint-platforms.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Hardcoded hostname → display name map.
// Brand capitalization is not derivable from hostnames (e.g., ChatGPT, not Chatgpt).
// When a new platform is added to manifest.json, add it here — the script will
// fail with "Unknown platform hostname" if a match entry has no mapping.
const HOST_DISPLAY_NAMES = {
  'gemini.google.com': 'Gemini',
  'claude.ai': 'Claude',
  'chatgpt.com': 'ChatGPT',
  'www.perplexity.ai': 'Perplexity',
  'notebooklm.google.com': 'NotebookLM',
};

// Check targets: each entry defines a file and what to look for.
// "hostname" checks look for the raw hostname string in the file body.
// "displayName" checks parse a specific JSON field and look for the display name (case-insensitive).
const CHECK_TARGETS = [
  { file: 'docs/privacy.html', type: 'hostname' },
  { file: 'README.md', type: 'hostname' },
  { file: 'README.ja.md', type: 'hostname' },
  { file: 'CLAUDE.md', type: 'hostname' },
  { file: 'package.json', type: 'displayName', jsonField: 'description' },
  {
    file: 'src/_locales/en/messages.json',
    type: 'displayName',
    jsonField: 'extDescription.message',
  },
  {
    file: 'src/_locales/ja/messages.json',
    type: 'displayName',
    jsonField: 'extDescription.message',
  },
];

// --- Main ---

const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'src/manifest.json'), 'utf-8'),
);
const matches = manifest.content_scripts[0].matches;

// Extract platforms (skip infrastructure hosts like 127.0.0.1)
const platforms = [];
for (const pattern of matches) {
  const hostname = pattern.replace('https://', '').replace('/*', '');
  if (hostname.startsWith('127.')) continue;

  const displayName = HOST_DISPLAY_NAMES[hostname];
  if (!displayName) {
    console.error(
      `ERROR: Unknown platform hostname: ${hostname}. Add it to HOST_DISPLAY_NAMES in scripts/lint-platforms.mjs`,
    );
    process.exit(1);
  }
  platforms.push({ hostname, displayName });
}

// Header
console.log('Platform lint check');
console.log('===================');
console.log(
  `Source: src/manifest.json content_scripts[0].matches`,
);
console.log(
  `Platforms: ${platforms.map((p) => `${p.displayName} (${p.hostname})`).join(', ')}`,
);
console.log();

// Run checks
const errors = [];

for (const target of CHECK_TARGETS) {
  const filePath = resolve(ROOT, target.file);
  const raw = readFileSync(filePath, 'utf-8');

  for (const platform of platforms) {
    if (target.type === 'hostname') {
      if (!raw.includes(platform.hostname)) {
        errors.push(
          `ERROR: ${target.file} is missing platform hostname: ${platform.hostname}`,
        );
      }
    } else if (target.type === 'displayName') {
      let searchText = raw;
      if (target.jsonField) {
        const json = JSON.parse(raw);
        // Support dotted paths like "extDescription.message"
        const parts = target.jsonField.split('.');
        let value = json;
        for (const part of parts) {
          value = value?.[part];
        }
        searchText = typeof value === 'string' ? value : '';
      }
      if (!searchText.toLowerCase().includes(platform.displayName.toLowerCase())) {
        errors.push(
          `ERROR: ${target.file} is missing platform display name: ${platform.displayName}`,
        );
      }
    }
  }
}

// Report
if (errors.length > 0) {
  for (const err of errors) {
    console.log(err);
  }
  console.log();
  console.log(
    `${errors.length} error(s) found. Update the files above to include all platforms.`,
  );
  process.exit(1);
} else {
  console.log(
    `All ${CHECK_TARGETS.length} files are consistent with manifest.json. \u2713`,
  );
  process.exit(0);
}
