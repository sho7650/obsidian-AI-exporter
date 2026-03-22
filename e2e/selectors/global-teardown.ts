/**
 * Playwright globalTeardown: aggregate test results → Obsidian notification.
 *
 * Reads the JSON report produced by Playwright, constructs a ValidationReport,
 * saves a timestamped copy, and sends to Obsidian via notifier.ts.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { notifyObsidian, type ValidationReport, type PlatformReport } from './notifier';
import type { ClassificationResult } from './classifier';
import type { AuthStatus } from './auth-check';

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env.local') });

interface PlaywrightAnnotation {
  type: string;
  description: string;
}

interface PlaywrightTestResult {
  status: string;
  annotations: PlaywrightAnnotation[];
}

interface PlaywrightSpec {
  title: string;
  tests: PlaywrightTestResult[];
}

interface PlaywrightSuite {
  title: string;
  specs: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightReport {
  suites: PlaywrightSuite[];
}

/**
 * Extract platform results from the Playwright JSON report.
 */
function extractPlatformResults(report: PlaywrightReport): PlatformReport[] {
  const platformMap = new Map<string, PlatformReport>();

  function processSuite(suite: PlaywrightSuite): void {
    const platformName = suite.title.toLowerCase();

    for (const spec of suite.specs) {
      for (const testResult of spec.tests) {
        const platform = platformName || 'unknown';

        if (!platformMap.has(platform)) {
          platformMap.set(platform, {
            platform,
            authStatus: 'authenticated' as AuthStatus,
            classification: { pass: [], warn: [], fail: [], baselineIssues: [] },
          });
        }

        const report = platformMap.get(platform)!;

        // Check for skip (auth_expired or unreachable)
        if (testResult.status === 'skipped') {
          const skipAnnotation = testResult.annotations.find(
            (a) => a.type === 'skip' || a.description?.includes('AUTH_EXPIRED'),
          );
          if (skipAnnotation?.description?.includes('AUTH_EXPIRED')) {
            report.authStatus = 'auth_expired';
          } else if (skipAnnotation?.description?.includes('unreachable')) {
            report.authStatus = 'unreachable';
          }
          report.classification = undefined;
          continue;
        }

        // Extract counts from annotations
        const getCount = (type: string): number => {
          const ann = testResult.annotations.find((a) => a.type === type);
          return ann ? parseInt(ann.description, 10) : 0;
        };

        const passCount = getCount('pass');
        const warnCount = getCount('warn');
        const failCount = getCount('fail');
        const baselineCount = getCount('baseline_issues');

        // Merge counts into existing classification
        if (report.classification) {
          // Use placeholder arrays with correct lengths for the summary
          report.classification = {
            pass: [...report.classification.pass, ...new Array(passCount).fill(null)],
            warn: [...report.classification.warn, ...new Array(warnCount).fill(null)],
            fail: [...report.classification.fail, ...new Array(failCount).fill(null)],
            baselineIssues: [...report.classification.baselineIssues, ...new Array(baselineCount).fill(null)],
          } as ClassificationResult;
        }
      }
    }

    for (const child of suite.suites ?? []) {
      processSuite(child);
    }
  }

  for (const suite of report.suites) {
    processSuite(suite);
  }

  return [...platformMap.values()];
}

async function globalTeardown(): Promise<void> {
  const reportPath = path.join(import.meta.dirname, '..', 'results', 'report.json');

  if (!fs.existsSync(reportPath)) {
    console.error('[globalTeardown] No report.json found. Skipping notification.');
    return;
  }

  console.log('[globalTeardown] Building ValidationReport from report.json...');

  const rawReport: PlaywrightReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  const timestamp = new Date().toISOString();

  // Save timestamped copy
  const resultsDir = path.join(import.meta.dirname, '..', 'results');
  const dateStr = timestamp.slice(0, 10);
  const timestampedPath = path.join(resultsDir, `report-${dateStr}.json`);
  fs.copyFileSync(reportPath, timestampedPath);

  // Extract platform results
  const platforms = extractPlatformResults(rawReport);

  // Determine overall status
  const hasAuthExpired = platforms.some((p) => p.authStatus === 'auth_expired');
  const hasFail = platforms.some((p) =>
    p.classification && p.classification.fail.length > 0,
  );
  const hasWarn = platforms.some((p) =>
    p.classification && p.classification.warn.length > 0,
  );

  let overallStatus: ValidationReport['overallStatus'];
  if (hasFail) overallStatus = 'fail';
  else if (hasAuthExpired) overallStatus = 'auth_expired';
  else if (hasWarn) overallStatus = 'warn';
  else overallStatus = 'pass';

  const validationReport: ValidationReport = { timestamp, platforms, overallStatus };

  // Notify Obsidian
  const obsidianUrl = process.env.OBSIDIAN_URL ?? 'http://127.0.0.1:27123';
  const obsidianApiKey = process.env.OBSIDIAN_API_KEY;
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? 'AI/selector-health';

  if (!obsidianApiKey) {
    console.warn('[globalTeardown] OBSIDIAN_API_KEY not set in .env.local. Skipping Obsidian notification.');
    return;
  }

  await notifyObsidian(validationReport, { obsidianUrl, obsidianApiKey, vaultPath });
}

export default globalTeardown;
