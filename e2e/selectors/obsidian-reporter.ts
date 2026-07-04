/**
 * Custom Playwright Reporter: sends Obsidian notifications after test completion.
 *
 * Collects per-target detail from the JSON attachment each test emits
 * (test.info().attach — the official structured-data channel) and builds a
 * full-fidelity report: real classification objects, per-target failures,
 * stall skips, and auth/test-data states. Replaces the v1 annotation-count
 * transport that reduced everything to four integers.
 *
 * @see docs/adr/006-custom-reporter-for-obsidian-notification.md
 * @see docs/design/DES-015-live-selector-validation.md
 */

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { notifyObsidian, type PlatformReport } from './notifier';
import { extractPlatform, processTestResult, buildValidationReport } from './report-builder';

class ObsidianReporter implements Reporter {
  private platformMap: Map<string, PlatformReport> = new Map();

  constructor() {
    dotenv.config({ path: path.join(import.meta.dirname, '..', '.env.local') });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const platform = extractPlatform(test.parent.title);
    this.platformMap = processTestResult(this.platformMap, {
      platform,
      status: result.status,
      attachments: result.attachments,
    });
  }

  async onEnd(): Promise<void> {
    const report = buildValidationReport(this.platformMap, process.env.TIMEZONE);

    // Save timestamped JSON report (full detail — real objects, no placeholders)
    const resultsDir = path.join(import.meta.dirname, '..', 'results');
    try {
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      const dateStr = report.timestamp.slice(0, 10);
      const jsonPath = path.join(resultsDir, `report-${dateStr}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    } catch (error) {
      console.error(
        `[ObsidianReporter] Failed to save JSON report: ${error instanceof Error ? error.message : error}`
      );
    }

    const obsidianUrl = process.env.OBSIDIAN_URL ?? 'http://127.0.0.1:27123';
    const obsidianApiKey = process.env.OBSIDIAN_API_KEY;
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? 'AI/selector-health';

    if (!obsidianApiKey) {
      console.warn(
        '[ObsidianReporter] OBSIDIAN_API_KEY not set in .env.local. Skipping Obsidian notification.'
      );
      return;
    }

    await notifyObsidian(report, { obsidianUrl, obsidianApiKey, vaultPath });
  }

  printsToStdio(): boolean {
    return false;
  }
}

export default ObsidianReporter;
