import { describe, it, expect } from 'vitest';
import type { PlatformReport } from '../notifier';
import {
  extractPlatform,
  parseAnnotationCounts,
  detectSkipReason,
  processTestResult,
  buildValidationReport,
  type TestEndInput,
} from '../report-builder';

// --- Factory helpers ---

function makeAnnotations(
  counts: { pass?: number; warn?: number; fail?: number; baseline_issues?: number } = {},
): Array<{ type: string; description: string }> {
  return [
    { type: 'pass', description: String(counts.pass ?? 0) },
    { type: 'warn', description: String(counts.warn ?? 0) },
    { type: 'fail', description: String(counts.fail ?? 0) },
    { type: 'baseline_issues', description: String(counts.baseline_issues ?? 0) },
  ];
}

function makeInput(overrides: Partial<TestEndInput> = {}): TestEndInput {
  return {
    platform: 'gemini',
    status: 'passed',
    annotations: makeAnnotations({ pass: 5 }),
    ...overrides,
  };
}

// --- Tests ---

describe('extractPlatform', () => {
  it('converts title to lowercase', () => {
    expect(extractPlatform('Gemini')).toBe('gemini');
  });

  it('passes through already-lowercase title', () => {
    expect(extractPlatform('claude')).toBe('claude');
  });

  it('returns "unknown" for empty string', () => {
    expect(extractPlatform('')).toBe('unknown');
  });
});

describe('parseAnnotationCounts', () => {
  it('extracts all four counts from annotations', () => {
    const annotations = makeAnnotations({ pass: 5, warn: 2, fail: 0, baseline_issues: 1 });
    expect(parseAnnotationCounts(annotations)).toEqual({
      pass: 5,
      warn: 2,
      fail: 0,
      baselineIssues: 1,
    });
  });

  it('returns zeros for empty annotations', () => {
    expect(parseAnnotationCounts([])).toEqual({
      pass: 0,
      warn: 0,
      fail: 0,
      baselineIssues: 0,
    });
  });

  it('returns zero when description is undefined', () => {
    const annotations = [{ type: 'pass' }]; // no description
    expect(parseAnnotationCounts(annotations)).toEqual({
      pass: 0,
      warn: 0,
      fail: 0,
      baselineIssues: 0,
    });
  });
});

describe('detectSkipReason', () => {
  it('detects AUTH_EXPIRED from skip annotation', () => {
    const annotations = [
      { type: 'skip', description: 'gemini: AUTH_EXPIRED — run \'npm run e2e:auth\' to re-login' },
    ];
    expect(detectSkipReason(annotations)).toBe('auth_expired');
  });

  it('detects unreachable from skip annotation', () => {
    const annotations = [{ type: 'skip', description: 'gemini: site unreachable' }];
    expect(detectSkipReason(annotations)).toBe('unreachable');
  });

  it('returns null when no skip annotation exists', () => {
    const annotations = makeAnnotations({ pass: 5 });
    expect(detectSkipReason(annotations)).toBeNull();
  });

  it('returns null for skip with unrecognized reason', () => {
    const annotations = [{ type: 'skip', description: 'some other reason' }];
    expect(detectSkipReason(annotations)).toBeNull();
  });
});

describe('processTestResult', () => {
  it('creates a new platform entry from empty map', () => {
    const input = makeInput({ platform: 'gemini', annotations: makeAnnotations({ pass: 5, warn: 1 }) });
    const result = processTestResult(new Map(), input);

    expect(result.has('gemini')).toBe(true);
    const report = result.get('gemini')!;
    expect(report.authStatus).toBe('authenticated');
    expect(report.classification?.pass).toHaveLength(5);
    expect(report.classification?.warn).toHaveLength(1);
  });

  it('merges counts for same platform across multiple tests', () => {
    const first = makeInput({ platform: 'gemini', annotations: makeAnnotations({ pass: 5, warn: 1 }) });
    const second = makeInput({ platform: 'gemini', annotations: makeAnnotations({ pass: 3, fail: 2 }) });

    let map = processTestResult(new Map(), first);
    map = processTestResult(map, second);

    const report = map.get('gemini')!;
    expect(report.classification?.pass).toHaveLength(8);
    expect(report.classification?.warn).toHaveLength(1);
    expect(report.classification?.fail).toHaveLength(2);
  });

  it('sets authStatus and clears classification on skipped test', () => {
    const input: TestEndInput = {
      platform: 'gemini',
      status: 'skipped',
      annotations: [{ type: 'skip', description: 'gemini: AUTH_EXPIRED — run \'npm run e2e:auth\' to re-login' }],
    };
    const result = processTestResult(new Map(), input);

    const report = result.get('gemini')!;
    expect(report.authStatus).toBe('auth_expired');
    expect(report.classification).toBeUndefined();
  });

  it('does not mutate the original map (immutability)', () => {
    const original: ReadonlyMap<string, PlatformReport> = new Map();
    const input = makeInput();
    const result = processTestResult(original, input);

    expect(original.size).toBe(0);
    expect(result.size).toBe(1);
    expect(result).not.toBe(original);
  });

  it('handles unreachable skip reason', () => {
    const input: TestEndInput = {
      platform: 'chatgpt',
      status: 'skipped',
      annotations: [{ type: 'skip', description: 'chatgpt: site unreachable' }],
    };
    const result = processTestResult(new Map(), input);

    expect(result.get('chatgpt')!.authStatus).toBe('unreachable');
    expect(result.get('chatgpt')!.classification).toBeUndefined();
  });
});

describe('buildValidationReport', () => {
  function makePlatformMap(
    entries: Array<{ platform: string; authStatus?: string; pass?: number; warn?: number; fail?: number }>,
  ): Map<string, PlatformReport> {
    const map = new Map<string, PlatformReport>();
    for (const e of entries) {
      if (e.authStatus === 'auth_expired' || e.authStatus === 'unreachable') {
        map.set(e.platform, {
          platform: e.platform,
          authStatus: e.authStatus,
          classification: undefined,
        });
      } else {
        map.set(e.platform, {
          platform: e.platform,
          authStatus: 'authenticated',
          classification: {
            pass: new Array(e.pass ?? 0).fill(null),
            warn: new Array(e.warn ?? 0).fill(null),
            fail: new Array(e.fail ?? 0).fill(null),
            baselineIssues: [],
          },
        });
      }
    }
    return map;
  }

  it('returns "pass" when all platforms pass', () => {
    const map = makePlatformMap([
      { platform: 'gemini', pass: 5 },
      { platform: 'claude', pass: 3 },
    ]);
    const report = buildValidationReport(map);
    expect(report.overallStatus).toBe('pass');
    expect(report.platforms).toHaveLength(2);
    expect(report.timestamp).toBeTruthy();
  });

  it('returns "fail" when any platform has failures', () => {
    const map = makePlatformMap([
      { platform: 'gemini', pass: 5, fail: 1 },
      { platform: 'claude', pass: 3 },
    ]);
    expect(buildValidationReport(map).overallStatus).toBe('fail');
  });

  it('returns "auth_expired" when no fail but auth expired', () => {
    const map = makePlatformMap([
      { platform: 'gemini', authStatus: 'auth_expired' },
      { platform: 'claude', pass: 3 },
    ]);
    expect(buildValidationReport(map).overallStatus).toBe('auth_expired');
  });

  it('returns "warn" when only warnings exist', () => {
    const map = makePlatformMap([
      { platform: 'gemini', pass: 5, warn: 1 },
      { platform: 'claude', pass: 3 },
    ]);
    expect(buildValidationReport(map).overallStatus).toBe('warn');
  });

  it('"fail" takes priority over "auth_expired"', () => {
    const map = makePlatformMap([
      { platform: 'gemini', pass: 3, fail: 1 },
      { platform: 'claude', authStatus: 'auth_expired' },
    ]);
    expect(buildValidationReport(map).overallStatus).toBe('fail');
  });

  it('returns "pass" for empty map', () => {
    expect(buildValidationReport(new Map()).overallStatus).toBe('pass');
  });
});
