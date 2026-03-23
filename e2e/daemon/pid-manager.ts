/**
 * PID file management for the Chrome daemon process.
 */

import fs from 'fs';

/** Write a PID to the specified file. */
export function writePid(pidFile: string, pid: number): void {
  fs.writeFileSync(pidFile, String(pid));
}

/** Read PID from file. Returns null if file doesn't exist or content is invalid. */
export function readPid(pidFile: string): number | null {
  try {
    const content = fs.readFileSync(pidFile, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return Number.isNaN(pid) || content === '' ? null : pid;
  } catch {
    return null;
  }
}

/** Remove PID file. No-op if file doesn't exist. */
export function removePid(pidFile: string): void {
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // file doesn't exist, that's fine
  }
}

/** Check if a process with the given PID is running. */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
