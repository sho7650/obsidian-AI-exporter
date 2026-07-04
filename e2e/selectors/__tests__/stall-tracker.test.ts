import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConsecutiveStalls, recordStall, resetStalls } from '../stall-tracker';

let statePath: string;

beforeEach(() => {
  statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stall-')), 'stall-state.json');
});

afterEach(() => {
  fs.rmSync(path.dirname(statePath), { recursive: true, force: true });
});

describe('stall-tracker', () => {
  it('returns 0 for an unknown key (no state file)', () => {
    expect(getConsecutiveStalls('gemini_conv', statePath)).toBe(0);
  });

  it('increments per recordStall and persists across reads', () => {
    expect(recordStall('gemini_conv', statePath)).toBe(1);
    expect(recordStall('gemini_conv', statePath)).toBe(2);
    expect(getConsecutiveStalls('gemini_conv', statePath)).toBe(2);
  });

  it('tracks keys independently', () => {
    recordStall('gemini_conv', statePath);
    recordStall('gemini_conv', statePath);
    recordStall('gemini_dr', statePath);

    expect(getConsecutiveStalls('gemini_conv', statePath)).toBe(2);
    expect(getConsecutiveStalls('gemini_dr', statePath)).toBe(1);
  });

  it('resetStalls clears only the given key', () => {
    recordStall('gemini_conv', statePath);
    recordStall('gemini_dr', statePath);

    resetStalls('gemini_conv', statePath);

    expect(getConsecutiveStalls('gemini_conv', statePath)).toBe(0);
    expect(getConsecutiveStalls('gemini_dr', statePath)).toBe(1);
  });

  it('survives a corrupt state file by starting fresh', () => {
    fs.writeFileSync(statePath, 'not json');
    expect(getConsecutiveStalls('gemini_conv', statePath)).toBe(0);
    expect(recordStall('gemini_conv', statePath)).toBe(1);
  });
});
