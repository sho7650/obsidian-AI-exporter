import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureProfileAvailable, readSingletonLockPid } from '../chrome-launcher';

/** Check if a symlink itself exists (does NOT follow the target). */
function symlinkExists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

describe('readSingletonLockPid', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no lock exists', () => {
    expect(readSingletonLockPid(tmpDir)).toBeNull();
  });

  it('reads PID from a valid lock symlink', () => {
    fs.symlinkSync(`${os.hostname()}-42`, path.join(tmpDir, 'SingletonLock'));
    expect(readSingletonLockPid(tmpDir)).toBe(42);
  });

  it('returns null for unreadable format', () => {
    fs.symlinkSync('garbled', path.join(tmpDir, 'SingletonLock'));
    expect(readSingletonLockPid(tmpDir)).toBeNull();
  });
});

describe('ensureProfileAvailable', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes when no SingletonLock exists', () => {
    expect(() => ensureProfileAvailable(tmpDir)).not.toThrow();
  });

  it('removes stale lock when PID is not running', () => {
    const lockPath = path.join(tmpDir, 'SingletonLock');
    fs.symlinkSync(`${os.hostname()}-99999999`, lockPath);
    expect(symlinkExists(lockPath)).toBe(true);

    ensureProfileAvailable(tmpDir);
    expect(symlinkExists(lockPath)).toBe(false);
  });

  it('throws when lock is held by a running process', () => {
    const lockPath = path.join(tmpDir, 'SingletonLock');
    fs.symlinkSync(`${os.hostname()}-${process.pid}`, lockPath);

    expect(() => ensureProfileAvailable(tmpDir)).toThrow(
      `Profile is locked by a running Chrome (PID ${process.pid})`,
    );
    // Lock must NOT be removed
    expect(symlinkExists(lockPath)).toBe(true);
  });

  it('removes lock with unreadable PID format', () => {
    const lockPath = path.join(tmpDir, 'SingletonLock');
    fs.symlinkSync('garbled-data', lockPath);

    ensureProfileAvailable(tmpDir);
    expect(symlinkExists(lockPath)).toBe(false);
  });
});
