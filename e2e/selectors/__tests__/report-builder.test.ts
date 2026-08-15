import { describe, it, expect } from 'vitest';
import {
  parseDetailAttachment,
  processTestResult,
  buildValidationReport,
  ATTACHMENT_NAME,
  type TargetDetail,
  type TestEndInput,
} from '../report-builder';
import type { PlatformReport } from '../notifier';
import type { SelectorResult, WarnDetail } from '../classifier';
import type { BaselineComparison } from '../baseline';

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

function makeComparison(overrides: Partial<BaselineComparison> = {}): BaselineComparison {
  return {
    group: 'SELECTORS',
    name: 'turn',
    selector: '.turn',
    baselineCount: 3,
    currentCount: 3,
    status: 'match',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<TargetDetail> = {}): TargetDetail {
  return {
    platform: 'gemini',
    target: 'gemini_conv',
    mode: 'validate',
    authStatus: 'authenticated',
    classification: {
      pass: [makeSelectorResult()],
      warn: [],
      fail: [],
      baselineBlocking: [],
      baselineAdvisory: [],
    },
    ...overrides,
  };
}

function inputFor(
  detail: TargetDetail | undefined,
  status: TestEndInput['status'] = 'passed'
): TestEndInput {
  return {
    platform: detail?.platform ?? 'gemini',
    status,
    attachments: detail
      ? [
          {
            name: ATTACHMENT_NAME,
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify(detail)),
          },
        ]
      : [],
  };
}

describe('parseDetailAttachment', () => {
  it('parses the g2o detail attachment body', () => {
    const detail = makeDetail();
    const parsed = parseDetailAttachment(inputFor(detail).attachments);
    expect(parsed?.target).toBe('gemini_conv');
    expect(parsed?.classification?.pass).toHaveLength(1);
  });

  it('returns undefined when the attachment is absent', () => {
    expect(parseDetailAttachment([])).toBeUndefined();
  });

  it('returns undefined for a malformed body instead of throwing', () => {
    const parsed = parseDetailAttachment([
      { name: ATTACHMENT_NAME, contentType: 'application/json', body: Buffer.from('not json') },
    ]);
    expect(parsed).toBeUndefined();
  });
});

describe('processTestResult', () => {
  it('merges classifications from both targets of a platform with REAL objects', () => {
    const conv = makeDetail({
      target: 'gemini_conv',
      classification: {
        pass: [makeSelectorResult({ name: 'a' })],
        warn: [],
        fail: [],
        baselineBlocking: [],
        baselineAdvisory: [makeComparison({ status: 'degraded' })],
      },
    });
    const dr = makeDetail({
      target: 'gemini_dr',
      classification: {
        pass: [makeSelectorResult({ name: 'b' }), makeSelectorResult({ name: 'c' })],
        warn: [],
        fail: [],
        baselineBlocking: [makeComparison({ status: 'lost', currentCount: 0 })],
        baselineAdvisory: [],
      },
    });

    let map: ReadonlyMap<string, PlatformReport> = new Map();
    map = processTestResult(map, inputFor(conv));
    map = processTestResult(map, inputFor(dr, 'failed'));

    const gemini = map.get('gemini')!;
    const c = gemini.classification!;
    expect(c.pass).toHaveLength(3);
    expect(c.pass.map(p => p.name).sort()).toEqual(['a', 'b', 'c']);
    expect(c.baselineBlocking).toHaveLength(1);
    expect(c.baselineBlocking[0].status).toBe('lost');
    expect(c.baselineAdvisory).toHaveLength(1);
    expect(gemini.failedTargets).toEqual(['gemini_dr']);
  });

  it('records auth_expired from the detail of a skipped target', () => {
    const detail = makeDetail({
      authStatus: 'auth_expired',
      skipReason: 'gemini: AUTH_EXPIRED — run e2e:auth',
      classification: undefined,
    });

    const map = processTestResult(new Map(), inputFor(detail, 'skipped'));

    expect(map.get('gemini')!.authStatus).toBe('auth_expired');
  });

  it('records test_data_missing from a failed target', () => {
    const detail = makeDetail({
      authStatus: 'test_data_missing',
      classification: undefined,
    });

    const map = processTestResult(new Map(), inputFor(detail, 'failed'));

    expect(map.get('gemini')!.authStatus).toBe('test_data_missing');
  });

  it('records a target whose selector counts never settled', () => {
    // Counts read off a page that was still rendering are not evidence of DOM
    // drift, so the report has to say which targets were sampled mid-render
    // rather than leaving the numbers looking authoritative.
    const detail = makeDetail({
      settle: { settled: false, elapsedMs: 15_000, observations: 50 },
    });

    const map = processTestResult(new Map(), inputFor(detail, 'passed'));

    expect(map.get('gemini')!.unsettledTargets).toEqual(['gemini_conv']);
  });

  it('leaves unsettledTargets empty when the page settled', () => {
    const detail = makeDetail({
      settle: { settled: true, elapsedMs: 2_800, observations: 6 },
    });

    const map = processTestResult(new Map(), inputFor(detail, 'passed'));

    expect(map.get('gemini')!.unsettledTargets).toEqual([]);
  });

  it('records stall skips with their target', () => {
    const detail = makeDetail({
      skipReason: 'gemini: content did not load (transient — loading indicator present, stall 2/3)',
      classification: undefined,
    });

    const map = processTestResult(new Map(), inputFor(detail, 'skipped'));

    const gemini = map.get('gemini')!;
    expect(gemini.stallSkips).toEqual(['gemini_conv']);
    expect(gemini.authStatus).toBe('authenticated');
  });

  it('marks a failed target even when the detail attachment is missing (crash before attach)', () => {
    const map = processTestResult(new Map(), {
      platform: 'chatgpt',
      status: 'failed',
      attachments: [],
    });

    expect(map.get('chatgpt')!.failedTargets).toEqual(['chatgpt']);
  });
});

describe('buildValidationReport overallStatus', () => {
  function reportFor(inputs: TestEndInput[]): ReturnType<typeof buildValidationReport> {
    let map: ReadonlyMap<string, PlatformReport> = new Map();
    for (const input of inputs) map = processTestResult(map, input);
    return buildValidationReport(map, 'UTC');
  }

  it('is pass when everything is clean', () => {
    const report = reportFor([inputFor(makeDetail())]);
    expect(report.overallStatus).toBe('pass');
  });

  it('is fail when any Playwright test failed (even without detail)', () => {
    const report = reportFor([
      { platform: 'chatgpt', status: 'failed', attachments: [] },
      inputFor(makeDetail()),
    ]);
    expect(report.overallStatus).toBe('fail');
  });

  it('is fail on baseline blocking violations', () => {
    const detail = makeDetail({
      classification: {
        pass: [],
        warn: [],
        fail: [],
        baselineBlocking: [makeComparison({ status: 'new_selector', baselineCount: -1 })],
        baselineAdvisory: [],
      },
    });
    expect(reportFor([inputFor(detail, 'failed')]).overallStatus).toBe('fail');
  });

  it('is fail on dead primaries (warn entries)', () => {
    const warnDetail: WarnDetail = {
      failedPrimary: makeSelectorResult({ matchCount: 0 }),
      workingFallback: makeSelectorResult({ index: 1 }),
    };
    const detail = makeDetail({
      classification: {
        pass: [],
        warn: [warnDetail],
        fail: [],
        baselineBlocking: [],
        baselineAdvisory: [],
      },
    });
    expect(reportFor([inputFor(detail, 'failed')]).overallStatus).toBe('fail');
  });

  it('is fail on test_data_missing', () => {
    const detail = makeDetail({ authStatus: 'test_data_missing', classification: undefined });
    expect(reportFor([inputFor(detail, 'failed')]).overallStatus).toBe('fail');
  });

  it('is auth_expired when a session died and nothing failed harder', () => {
    const detail = makeDetail({
      authStatus: 'auth_expired',
      skipReason: 'AUTH_EXPIRED',
      classification: undefined,
    });
    expect(reportFor([inputFor(detail, 'skipped')]).overallStatus).toBe('auth_expired');
  });

  it('is warn on advisory-only degradation', () => {
    const detail = makeDetail({
      classification: {
        pass: [makeSelectorResult()],
        warn: [],
        fail: [],
        baselineBlocking: [],
        baselineAdvisory: [makeComparison({ status: 'degraded', currentCount: 1 })],
      },
    });
    expect(reportFor([inputFor(detail)]).overallStatus).toBe('warn');
  });

  it('is warn on a stall skip (transient, but visible)', () => {
    const detail = makeDetail({
      skipReason: 'stall 1/3 — transient',
      classification: undefined,
    });
    expect(reportFor([inputFor(detail, 'skipped')]).overallStatus).toBe('warn');
  });
});
