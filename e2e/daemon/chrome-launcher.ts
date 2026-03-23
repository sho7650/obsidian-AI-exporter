/**
 * Chrome process launcher for the CDP daemon.
 *
 * Spawns Chrome as a regular process (not via Playwright) to avoid
 * automation flags that trigger bot detection.
 *
 * IMPORTANT: All pre-flight checks (port, SingletonLock) MUST pass
 * before Chrome is spawned. If any check fails, the function throws
 * instead of proceeding — no warnings, no partial state.
 */

import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { chromium, type Cookie } from 'playwright';
import { findChromeExecutable } from '../shared/chrome-finder';
import { waitForCDP } from '../shared/cdp-utils';
import type { DaemonConfig } from './config';

interface StorageState {
  readonly cookies: Cookie[];
  readonly origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

// ─── Pre-flight checks ────────────────────────────────────────────

/**
 * Read the PID from a SingletonLock symlink.
 * Returns null if the lock doesn't exist or is unreadable.
 */
export function readSingletonLockPid(profileDir: string): number | null {
  const lockPath = path.join(profileDir, 'SingletonLock');
  try {
    const target = fs.readlinkSync(lockPath);
    const pidStr = target.split('-').pop();
    const pid = pidStr ? parseInt(pidStr, 10) : NaN;
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Ensure no other Chrome is using the profile directory.
 *
 * - If SingletonLock exists and the owning process is alive → throw (hard stop)
 * - If SingletonLock exists but the owning process is dead → remove the stale lock
 * - If SingletonLock doesn't exist → pass
 */
export function ensureProfileAvailable(profileDir: string): void {
  const lockPath = path.join(profileDir, 'SingletonLock');

  let lockExists: boolean;
  try {
    fs.lstatSync(lockPath);
    lockExists = true;
  } catch {
    lockExists = false;
  }

  if (!lockExists) return;

  const pid = readSingletonLockPid(profileDir);

  if (pid === null) {
    // Unreadable lock — remove it
    fs.unlinkSync(lockPath);
    console.log('[G2O Daemon] Removed unreadable SingletonLock.');
    return;
  }

  let processAlive: boolean;
  try {
    process.kill(pid, 0);
    processAlive = true;
  } catch {
    processAlive = false;
  }

  if (processAlive) {
    throw new Error(
      `Profile is locked by a running Chrome (PID ${pid}).\n` +
        `Kill it first:  kill ${pid}\n` +
        `Then retry:     npm run e2e:daemon start`
    );
  }

  // Stale lock — safe to remove
  fs.unlinkSync(lockPath);
  console.log(`[G2O Daemon] Removed stale SingletonLock (PID ${pid} not running).`);
}

/**
 * Ensure the CDP port is not already occupied.
 * If it is, someone else is listening — we must NOT proceed.
 */
export async function ensurePortAvailable(cdpPort: number): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (res.ok) {
      throw new Error(
        `CDP port ${cdpPort} is already in use (another Chrome or process is listening).\n` +
          `Find and kill it:  lsof -i :${cdpPort}\n` +
          `Then retry:        npm run e2e:daemon start`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already in use')) {
      throw err; // Re-throw our own error
    }
    // fetch failed (connection refused) → port is free, good
  }
}

// ─── Launch ────────────────────────────────────────────────────────

/**
 * Launch Chrome with CDP enabled.
 *
 * Pre-flight checks (port, SingletonLock) are enforced before spawn.
 * Chrome starts with about:blank; platform tabs are opened separately
 * via {@link openPlatformTabs}.
 *
 * @returns The Chrome child process after CDP is confirmed ready.
 */
export async function launchChrome(config: DaemonConfig): Promise<ChildProcess> {
  const chromePath = findChromeExecutable();

  // --- Pre-flight: abort if resources are occupied ---
  await ensurePortAvailable(config.cdpPort);
  ensureProfileAvailable(config.profileDir);

  const args = [
    `--user-data-dir=${config.profileDir}`,
    `--remote-debugging-port=${config.cdpPort}`,
    ...(config.headless ? ['--headless=new'] : []),
    ...config.chromeFlags,
    'about:blank',
  ];

  console.log(`[G2O Daemon] Launching Chrome: ${chromePath}`);
  console.log(`[G2O Daemon] Profile: ${config.profileDir}`);
  console.log(`[G2O Daemon] CDP port: ${config.cdpPort}`);
  console.log(`[G2O Daemon] Headless: ${config.headless}`);

  const chromeProcess = spawn(chromePath, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false,
  });

  // Surface Chrome stderr for diagnostics
  chromeProcess.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.error(`[Chrome] ${line}`);
  });

  // Track spawn errors (emitted asynchronously, e.g. ENOENT).
  const spawnState = { error: null as Error | null };
  chromeProcess.on('error', err => {
    spawnState.error = err;
    console.error(`[G2O Daemon] Chrome process error: ${err.message}`);
  });

  // Wait for CDP endpoint to be ready
  try {
    await waitForCDP(config.cdpPort);
    console.log('[G2O Daemon] Chrome CDP ready.');
  } catch {
    chromeProcess.kill();
    throw spawnState.error
      ? new Error(`Chrome failed to start: ${spawnState.error.message}`)
      : new Error(
          `Chrome started but CDP not available on port ${config.cdpPort}. ` +
            `Is the port already in use?`
        );
  }

  return chromeProcess;
}

// ─── Cookie injection ──────────────────────────────────────────────

/**
 * Inject session cookies from state.json into the browser context.
 *
 * Chrome's profile directory only persists cookies with an explicit
 * `expires` attribute. Session cookies (no expiry) live in memory only
 * and are lost when Chrome closes. Since `e2e:auth` captures ALL
 * cookies (including session cookies) to state.json, we re-inject
 * them so the daemon has a complete cookie jar.
 */
async function injectStorageState(
  statePath: string,
  context: import('playwright').BrowserContext
): Promise<void> {
  if (!fs.existsSync(statePath)) {
    console.warn(
      `[G2O Daemon] state.json not found at ${statePath}. ` +
        `Session cookies will be missing. Run: npm run e2e:auth`
    );
    return;
  }

  const raw = fs.readFileSync(statePath, 'utf-8');
  const state: StorageState = JSON.parse(raw);

  if (state.cookies?.length) {
    await context.addCookies(state.cookies);
    console.log(`[G2O Daemon] Injected ${state.cookies.length} cookies from state.json.`);
  }
}

// ─── Tab management ────────────────────────────────────────────────

/**
 * Open platform tabs via Playwright CDP connection.
 *
 * 1. Injects cookies from state.json (session cookies lost on Chrome restart)
 * 2. Opens a new page for each platform URL
 * 3. Disconnects (Chrome and tabs keep running)
 */
export async function openPlatformTabs(config: DaemonConfig): Promise<void> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);
  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('No browser context found. Chrome may not have fully started.');
    }

    await injectStorageState(config.statePath, context);

    for (const url of config.platformUrls) {
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        console.log(`[G2O Daemon] Opened: ${url}`);
      } catch (err) {
        console.warn(
          `[G2O Daemon] Failed to open ${url}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[G2O Daemon] ${config.platformUrls.length} platform tabs ready.`);
}

// ─── Shutdown ──────────────────────────────────────────────────────

/**
 * Gracefully stop Chrome. Sends SIGTERM, then SIGKILL after timeout.
 */
export async function stopChrome(pid: number, timeoutMs = 5000): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // Process already gone
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      return; // Process exited
    }
    await new Promise(r => setTimeout(r, 200));
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone
  }
}

/**
 * Kill whatever is using the CDP port and profile, regardless of
 * whether it was started by the daemon or not.
 *
 * Used by `stop` to clean up orphaned Chrome processes.
 */
export function killOrphanChrome(config: DaemonConfig): boolean {
  const lockPid = readSingletonLockPid(config.profileDir);
  if (lockPid === null) return false;

  let alive: boolean;
  try {
    process.kill(lockPid, 0);
    alive = true;
  } catch {
    alive = false;
  }

  if (!alive) {
    // Just clean up the stale lock
    ensureProfileAvailable(config.profileDir);
    return false;
  }

  console.log(`[G2O Daemon] Killing orphan Chrome (PID ${lockPid})...`);
  try {
    process.kill(lockPid, 'SIGTERM');
  } catch {
    // already gone
  }
  return true;
}
