import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildStateFingerprint,
  shouldNotify,
  loadNotifyState,
  saveNotifyState,
} from '../notify-policy';
import type { ValidationReport, PlatformReport } from '../notifier';
import type { SelectorResult } from '../classifier';

function makeSelectorResult(overrides: Partial<SelectorResult> = {}): SelectorResult {
  return {
    platform: 'gemini',
    group: 'SELECTORS',
    name: 'turn',
    selector: '.turn',
    index: 0,
    matchCount: 3,
    nonEmptyCount: 1,
    ...overrides,
  };
}

function makePlatform(overrides: Partial<PlatformReport> = {}): PlatformReport {
  return {
    platform: 'gemini',
    authStatus: 'authenticated',
    classification: {
      pass: [makeSelectorResult()],
      warn: [],
      fail: [],
      baselineBlocking: [],
      baselineAdvisory: [],
    },
    failedTargets: [],
    stallSkips: [],
    ...overrides,
  };
}

function makeReport(
  overallStatus: ValidationReport['overallStatus'],
  platforms: PlatformReport[]
): ValidationReport {
  return { timestamp: '2026-07-04T10:00:00+09:00', platforms, overallStatus };
}

describe('buildStateFingerprint', () => {
  it('captures issue identities, not counts', () => {
    const report = makeReport('fail', [
      makePlatform({
        failedTargets: ['gemini_dr'],
        classification: {
          pass: [makeSelectorResult()],
          warn: [],
          fail: [makeSelectorResult({ name: 'turn', selector: '.gone' })],
          baselineBlocking: [],
          baselineAdvisory: [],
        },
      }),
    ]);

    const fp = buildStateFingerprint(report);

    expect(fp.overallStatus).toBe('fail');
    expect(JSON.stringify(fp)).toContain('.gone');
    expect(JSON.stringify(fp)).toContain('gemini_dr');
    // The pass list must NOT affect the fingerprint (pass-count churn is noise)
    expect(JSON.stringify(fp)).not.toContain('"pass"');
  });

  it('is order-insensitive for issue lists', () => {
    const a = makeReport('fail', [
      makePlatform({ failedTargets: ['gemini_conv', 'gemini_dr'] }),
    ]);
    const b = makeReport('fail', [
      makePlatform({ failedTargets: ['gemini_dr', 'gemini_conv'] }),
    ]);

    expect(buildStateFingerprint(a)).toEqual(buildStateFingerprint(b));
  });

  it('ignores the timestamp', () => {
    const a = buildStateFingerprint(makeReport('pass', [makePlatform()]));
    const b = buildStateFingerprint({
      ...makeReport('pass', [makePlatform()]),
      timestamp: '2027-01-01T00:00:00Z',
    });
    expect(a).toEqual(b);
  });
});

describe('shouldNotify', () => {
  const passFp = buildStateFingerprint(makeReport('pass', [makePlatform()]));
  const failFp = buildStateFingerprint(
    makeReport('fail', [makePlatform({ failedTargets: ['gemini_conv'] })])
  );
  const otherFailFp = buildStateFingerprint(
    makeReport('fail', [makePlatform({ failedTargets: ['gemini_dr'] })])
  );

  it('does not notify when the state is unchanged (standing failure)', () => {
    expect(shouldNotify(failFp, failFp).notify).toBe(false);
  });

  it('notifies when the failing set changes, even at the same overallStatus', () => {
    const decision = shouldNotify(otherFailFp, failFp);
    expect(decision.notify).toBe(true);
  });

  it('notifies on recovery (fail -> pass)', () => {
    const decision = shouldNotify(passFp, failFp);
    expect(decision.notify).toBe(true);
    expect(decision.recovered).toBe(true);
  });

  it('stays silent on pass -> pass', () => {
    expect(shouldNotify(passFp, passFp).notify).toBe(false);
  });

  it('first run: notifies when not pass', () => {
    expect(shouldNotify(failFp, undefined).notify).toBe(true);
  });

  it('first run: silent when pass', () => {
    expect(shouldNotify(passFp, undefined).notify).toBe(false);
  });
});

describe('notify state persistence', () => {
  let statePath: string;

  beforeEach(() => {
    statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notify-')), 'state.json');
  });

  afterEach(() => {
    fs.rmSync(path.dirname(statePath), { recursive: true, force: true });
  });

  it('round-trips a fingerprint', () => {
    const fp = buildStateFingerprint(
      makeReport('fail', [makePlatform({ failedTargets: ['gemini_conv'] })])
    );
    saveNotifyState(fp, statePath);
    expect(loadNotifyState(statePath)).toEqual(fp);
  });

  it('returns undefined when no state exists', () => {
    expect(loadNotifyState(statePath)).toBeUndefined();
  });

  it('returns undefined for a corrupt state file', () => {
    fs.writeFileSync(statePath, '{broken');
    expect(loadNotifyState(statePath)).toBeUndefined();
  });
});
