/**
 * CDP Daemon CLI entry point.
 *
 * Usage:
 *   npx tsx e2e/daemon/daemon.ts start   — Launch Chrome + keep-alive
 *   npx tsx e2e/daemon/daemon.ts stop    — Stop Chrome daemon
 *   npx tsx e2e/daemon/daemon.ts status  — Check daemon health
 */

import { loadConfig } from './config';
import { writePid, readPid, isProcessRunning, removePid } from './pid-manager';
import { launchChrome, openPlatformTabs, stopChrome, killOrphanChrome } from './chrome-launcher';
import { runKeepAlive } from './keep-alive';
import type { DaemonCommand } from './types';

async function start(): Promise<void> {
  const config = loadConfig();

  // 1. Check PID file — is the daemon already running?
  const existingPid = readPid(config.pidFile);
  if (existingPid !== null && isProcessRunning(existingPid)) {
    console.error(
      `[G2O Daemon] Already running (PID ${existingPid}). ` + `Use 'npm run e2e:daemon stop' first.`
    );
    process.exit(1);
  }
  if (existingPid !== null) {
    console.log(`[G2O Daemon] Removing stale PID file (PID ${existingPid} not running).`);
    removePid(config.pidFile);
  }

  // 2. launchChrome runs pre-flight checks (port + SingletonLock) and
  //    throws if resources are occupied. No Chrome is spawned until
  //    all checks pass.
  const chromeProcess = await launchChrome(config);
  const pid = chromeProcess.pid;

  if (pid === undefined) {
    console.error('[G2O Daemon] Chrome started but PID is undefined.');
    process.exit(1);
  }

  if (chromeProcess.exitCode !== null) {
    console.error(`[G2O Daemon] Chrome exited immediately (code ${chromeProcess.exitCode}).`);
    process.exit(1);
  }

  writePid(config.pidFile, pid);
  console.log(`[G2O Daemon] Started (PID ${pid}).`);

  // 3. Inject session cookies from state.json + open platform tabs
  await openPlatformTabs(config);

  // 4. Start keep-alive loop
  const keepAliveInterval = setInterval(async () => {
    try {
      await runKeepAlive(config);
    } catch (err) {
      console.error(`[G2O Keep-Alive] Error: ${err instanceof Error ? err.message : err}`);
    }
  }, config.keepAliveIntervalMs);

  console.log(`[G2O Daemon] Keep-alive every ${config.keepAliveIntervalMs / 60_000} minutes.`);

  // 5. Handle Chrome exit
  chromeProcess.on('exit', code => {
    console.log(`[G2O Daemon] Chrome exited with code ${code}.`);
    clearInterval(keepAliveInterval);
    removePid(config.pidFile);
    process.exit(code ?? 1);
  });

  // 6. Graceful shutdown on signals
  const shutdown = () => {
    console.log('\n[G2O Daemon] Shutting down...');
    clearInterval(keepAliveInterval);
    chromeProcess.kill('SIGTERM');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function stop(): Promise<void> {
  const config = loadConfig();
  const pid = readPid(config.pidFile);

  if (pid !== null && isProcessRunning(pid)) {
    // Normal case: daemon PID file points to a live process
    console.log(`[G2O Daemon] Stopping Chrome (PID ${pid})...`);
    await stopChrome(pid);
    removePid(config.pidFile);
    console.log('[G2O Daemon] Stopped.');
    return;
  }

  // PID file is stale or missing — check for orphan Chrome
  if (pid !== null) {
    removePid(config.pidFile);
  }

  const killed = killOrphanChrome(config);
  if (killed) {
    // Give it a moment to exit and release SingletonLock
    await new Promise(r => setTimeout(r, 2000));
    console.log('[G2O Daemon] Orphan Chrome killed.');
  } else {
    console.log('[G2O Daemon] Not running.');
  }
}

async function status(): Promise<void> {
  const config = loadConfig();
  const pid = readPid(config.pidFile);

  if (pid === null) {
    console.log('[G2O Daemon] Not running (no PID file).');
  } else if (!isProcessRunning(pid)) {
    console.log(`[G2O Daemon] PID ${pid} found but process not running (stale PID file).`);
  } else {
    console.log(`[G2O Daemon] Running (PID ${pid}).`);
  }

  // Check CDP health regardless of PID (another Chrome might be listening)
  try {
    const versionRes = await fetch(`http://127.0.0.1:${config.cdpPort}/json/version`);
    if (versionRes.ok) {
      const version = (await versionRes.json()) as Record<string, string>;
      console.log(`[G2O Daemon] Chrome on port ${config.cdpPort}: ${version.Browser ?? 'unknown'}`);
    }

    const listRes = await fetch(`http://127.0.0.1:${config.cdpPort}/json/list`);
    if (listRes.ok) {
      const tabs = (await listRes.json()) as Array<{ url: string; title: string }>;
      console.log(`[G2O Daemon] Open tabs: ${tabs.length}`);
      for (const tab of tabs) {
        console.log(`  - ${tab.url} (${tab.title})`);
      }
    }
  } catch {
    console.log(`[G2O Daemon] No CDP endpoint on port ${config.cdpPort}.`);
  }
}

// --- CLI ---

const command = process.argv[2] as DaemonCommand | undefined;

const commands: Record<DaemonCommand, () => Promise<void>> = {
  start,
  stop,
  status,
};

if (!command || !(command in commands)) {
  console.error('Usage: npx tsx e2e/daemon/daemon.ts <start|stop|status>');
  process.exit(1);
}

commands[command]().catch(err => {
  console.error(`[G2O Daemon] Fatal: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
