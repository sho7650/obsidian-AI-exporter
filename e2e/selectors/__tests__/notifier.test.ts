import { describe, it, expect } from 'vitest';
import { generateMarkdown, type PlatformReport, type ValidationReport } from '../notifier';

function makePlatform(overrides: Partial<PlatformReport> = {}): PlatformReport {
  return {
    platform: 'gemini',
    authStatus: 'authenticated',
    classification: {
      pass: [],
      warn: [],
      fail: [],
      baselineBlocking: [],
      baselineAdvisory: [],
    },
    failedTargets: [],
    stallSkips: [],
    unsettledTargets: [],
    ...overrides,
  };
}

function makeReport(platforms: PlatformReport[]): ValidationReport {
  return { timestamp: '2026-09-22T10:00:00+09:00', platforms, overallStatus: 'pass' };
}

describe('generateMarkdown — unsettled targets', () => {
  // Counts sampled from a page that never settled are not evidence of DOM
  // drift (ADR-016 §1a). report-builder records such targets, but the note
  // used to omit them, so a reader could not tell a real diff from a
  // mid-render sample (e2e-coverage-gaps-2026-09.md §C.8).
  it('shows an Unsettled column in the summary table', () => {
    const md = generateMarkdown(makeReport([makePlatform({ unsettledTargets: ['gemini_conv'] })]));

    const header = md.split('\n').find(l => l.startsWith('| Platform |'));
    expect(header).toContain('Unsettled');
    const row = md.split('\n').find(l => l.startsWith('| gemini |'));
    expect(row).toMatch(/\| 1 \|$/);
  });

  it('lists the unsettled targets in a platform section', () => {
    const md = generateMarkdown(makeReport([makePlatform({ unsettledTargets: ['gemini_conv'] })]));

    expect(md).toContain('## gemini');
    expect(md).toContain('Unsettled');
    expect(md).toContain('gemini_conv');
  });

  it('renders "-" and no section when every target settled', () => {
    const md = generateMarkdown(makeReport([makePlatform()]));

    const row = md.split('\n').find(l => l.startsWith('| gemini |'));
    expect(row).toMatch(/\| - \|$/);
    expect(md).not.toContain('## gemini');
  });
});
