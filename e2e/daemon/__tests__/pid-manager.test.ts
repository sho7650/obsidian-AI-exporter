import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writePid, readPid, isProcessRunning, removePid } from '../pid-manager';

describe('pid-manager', () => {
  let tmpDir: string;
  let pidFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-test-'));
    pidFile = path.join(tmpDir, 'test.pid');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writePid', () => {
    it('writes PID to file', () => {
      writePid(pidFile, 12345);
      expect(fs.readFileSync(pidFile, 'utf-8')).toBe('12345');
    });

    it('overwrites existing PID file', () => {
      writePid(pidFile, 11111);
      writePid(pidFile, 22222);
      expect(fs.readFileSync(pidFile, 'utf-8')).toBe('22222');
    });
  });

  describe('readPid', () => {
    it('returns PID from existing file', () => {
      fs.writeFileSync(pidFile, '12345');
      expect(readPid(pidFile)).toBe(12345);
    });

    it('returns null when file does not exist', () => {
      expect(readPid(pidFile)).toBeNull();
    });

    it('returns null for non-numeric content', () => {
      fs.writeFileSync(pidFile, 'not-a-number');
      expect(readPid(pidFile)).toBeNull();
    });

    it('returns null for empty file', () => {
      fs.writeFileSync(pidFile, '');
      expect(readPid(pidFile)).toBeNull();
    });
  });

  describe('removePid', () => {
    it('removes existing PID file', () => {
      fs.writeFileSync(pidFile, '12345');
      removePid(pidFile);
      expect(fs.existsSync(pidFile)).toBe(false);
    });

    it('does nothing when file does not exist', () => {
      expect(() => removePid(pidFile)).not.toThrow();
    });
  });

  describe('isProcessRunning', () => {
    it('returns true for current process', () => {
      expect(isProcessRunning(process.pid)).toBe(true);
    });

    it('returns false for non-existent PID', () => {
      // PID 99999999 is extremely unlikely to exist
      expect(isProcessRunning(99999999)).toBe(false);
    });
  });
});
