/**
 * CDP daemon configuration.
 *
 * All values can be overridden via environment variables.
 */

import path from 'path';
import dotenv from 'dotenv';

export interface DaemonConfig {
  readonly cdpPort: number;
  readonly profileDir: string;
  readonly statePath: string;
  readonly pidFile: string;
  readonly keepAliveIntervalMs: number;
  readonly headless: boolean;
  readonly platformUrls: readonly string[];
  readonly chromeFlags: readonly string[];
}

const E2E_DIR = path.resolve(import.meta.dirname, '..');
const ENV_LOCAL_PATH = path.join(E2E_DIR, '.env.local');

function parsePort(raw: string | undefined, fallback: number): number {
  const port = parseInt(raw ?? String(fallback), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid CDP_PORT: "${raw}". Must be 1–65535.`);
  }
  return port;
}

export function loadConfig(): DaemonConfig {
  // Load .env.local so daemon picks up KEEP_ALIVE_INTERVAL_MIN etc.
  dotenv.config({ path: ENV_LOCAL_PATH });

  const cdpPort = parsePort(process.env.CDP_PORT, 9222);
  const keepAliveMin = parseInt(process.env.KEEP_ALIVE_INTERVAL_MIN ?? '15', 10);

  // DAEMON_HEADED=1 disables headless (useful for macOS firewall approval or debugging)
  const headless = process.env.DAEMON_HEADED !== '1';

  return {
    cdpPort,
    headless,
    profileDir: path.join(E2E_DIR, 'auth', 'profiles'),
    statePath: path.join(E2E_DIR, 'auth', 'state.json'),
    pidFile: path.join(E2E_DIR, 'daemon', 'chrome.pid'),
    keepAliveIntervalMs: keepAliveMin * 60 * 1000,
    platformUrls: [
      'https://gemini.google.com',
      'https://claude.ai',
      'https://chatgpt.com',
      'https://www.perplexity.ai',
    ],
    chromeFlags: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Override headless UA to avoid Cloudflare bot detection.
      // --headless=new still exposes "HeadlessChrome" in User-Agent.
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.81 Safari/537.36',
    ],
  };
}
