/**
 * Authentication setup for live selector validation.
 *
 * Architecture:
 * 1. Launch Chrome DIRECTLY (no Playwright flags) → Google login works
 * 2. User logs in to all 4 platforms manually
 * 3. Connect via CDP to extract storageState (cookies + localStorage)
 * 4. Save as e2e/auth/state.json for smoke tests
 *
 * The smoke test uses Playwright's bundled Chromium with the saved
 * storageState — no profile directory sharing, no SingletonLock,
 * no keychain encryption mismatch.
 *
 * Usage: npm run e2e:auth
 */

import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { findChromeExecutable } from '../shared/chrome-finder';
import { waitForCDP } from '../shared/cdp-utils';
import { ensurePortAvailable, ensureProfileAvailable } from '../daemon/chrome-launcher';

const AUTH_DIR = import.meta.dirname;
const PROFILE_DIR = path.join(AUTH_DIR, 'profiles');
const STATE_PATH = path.join(AUTH_DIR, 'state.json');
const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222', 10);

const TARGET_URLS = [
  'https://gemini.google.com',
  'https://claude.ai',
  'https://chatgpt.com',
  'https://www.perplexity.ai',
];

function waitForLine(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function setupProfile(): Promise<void> {
  // Pre-flight: abort if port or profile is already in use.
  // This catches both daemon Chrome and orphan Chrome processes.
  try {
    await ensurePortAvailable(CDP_PORT);
    ensureProfileAvailable(PROFILE_DIR);
  } catch (err) {
    console.error(`[G2O Auth] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const chromePath = findChromeExecutable();

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  console.log('=== G2O Selector Validation: Auth Setup ===\n');
  console.log(`Chrome:  ${chromePath}`);
  console.log(`Profile: ${PROFILE_DIR}`);
  console.log(`State:   ${STATE_PATH}\n`);
  console.log('Steps:');
  console.log('  1. Chrome will open with 4 tabs');
  console.log('  2. Log in to ALL platforms');
  console.log('  3. Come back here and press Enter');
  console.log('  4. storageState will be extracted automatically');
  console.log('  5. Chrome will close\n');

  // Launch Chrome with CDP port for later connection
  const chromeProcess: ChildProcess = spawn(
    chromePath,
    [
      `--user-data-dir=${PROFILE_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...TARGET_URLS,
    ],
    {
      stdio: 'ignore',
    }
  );

  // Wait for CDP to be ready
  console.log('Waiting for Chrome to start...');
  try {
    await waitForCDP(CDP_PORT);
  } catch (e) {
    console.error('Failed to connect to Chrome CDP. Is port 9222 already in use?');
    chromeProcess.kill();
    process.exit(1);
  }
  console.log('Chrome is ready. Log in to all platforms.\n');

  // Wait for user to finish logging in
  await waitForLine('Press Enter after logging in to all platforms...');

  // Connect via CDP and extract storageState
  console.log('\nExtracting storageState...');
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const contexts = browser.contexts();

    if (contexts.length === 0) {
      throw new Error('No browser contexts found. Did you close all Chrome windows?');
    }

    // Export storageState from the default context
    await contexts[0].storageState({ path: STATE_PATH });
    console.log(`storageState saved to: ${STATE_PATH}`);

    await browser.close();
  } catch (e) {
    console.error('Failed to extract storageState:', e instanceof Error ? e.message : e);
    console.error('Make sure Chrome windows are still open when pressing Enter.');
    chromeProcess.kill();
    process.exit(1);
  }

  // Wait for Chrome to exit
  await new Promise<void>(resolve => {
    chromeProcess.on('exit', () => resolve());
    // Give Chrome a moment, then force kill if needed
    setTimeout(() => {
      if (!chromeProcess.killed) {
        chromeProcess.kill();
      }
    }, 3000);
  });

  console.log('\nSetup complete. Run `npm run e2e:selectors` to validate selectors.');
  console.log('Re-run this script when sessions expire (typically every 1-2 weeks).');
}

setupProfile();
