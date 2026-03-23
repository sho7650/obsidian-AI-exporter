/**
 * Chrome executable discovery.
 *
 * Shared between e2e/auth/setup-profile.ts and e2e/daemon/.
 */

import fs from 'fs';
import { execSync } from 'child_process';

const MAC_CANDIDATES: readonly string[] = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
];

export interface ChromeFinderDeps {
  readonly existsSync: (path: fs.PathLike) => boolean;
  readonly execWhich: () => string;
}

const defaultDeps: ChromeFinderDeps = {
  existsSync: fs.existsSync,
  execWhich: () => execSync('which google-chrome', { encoding: 'utf-8' }).trim(),
};

/**
 * Find the Chrome executable path.
 *
 * Priority:
 * 1. CHROME_PATH environment variable
 * 2. macOS application paths
 * 3. `which google-chrome` (Linux / custom installs)
 */
export function findChromeExecutable(deps: ChromeFinderDeps = defaultDeps): string {
  const chromePath = process.env.CHROME_PATH;
  if (chromePath) return chromePath;

  for (const candidate of MAC_CANDIDATES) {
    if (deps.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    return deps.execWhich();
  } catch {
    throw new Error(
      'Google Chrome not found. Install Chrome or set CHROME_PATH environment variable.',
    );
  }
}
