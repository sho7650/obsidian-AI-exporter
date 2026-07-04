/**
 * Obsidian notification for selector health reports.
 *
 * Creates a Markdown note in Obsidian via the Local REST API
 * when WARN, FAIL, or AUTH_EXPIRED conditions are detected.
 */

import type { ClassificationResult } from './classifier';
import type { AuthStatus } from './auth-check';

interface NotificationConfig {
  obsidianUrl: string;
  obsidianApiKey: string;
  vaultPath: string;
}

export interface PlatformReport {
  platform: string;
  authStatus: AuthStatus;
  /** Merged across the platform's targets; real objects, never placeholders. */
  classification?: ClassificationResult;
  /** Targets whose Playwright test failed/timed out/interrupted. */
  failedTargets: string[];
  /** Targets skipped on a transient content stall. */
  stallSkips: string[];
}

export interface ValidationReport {
  timestamp: string;
  platforms: PlatformReport[];
  overallStatus: 'pass' | 'warn' | 'fail' | 'auth_expired';
}

/**
 * Send a health report to Obsidian.
 * Skips notification when overallStatus is 'pass'.
 */
export async function notifyObsidian(
  report: ValidationReport,
  config: NotificationConfig
): Promise<void> {
  if (report.overallStatus === 'pass') {
    console.log('[ObsidianReporter] All selectors passed. No notification needed.');
    return;
  }

  const markdown = generateMarkdown(report);
  const dateStr = report.timestamp.slice(0, 10);
  const fileName = `selector-health-${dateStr}.md`;
  const notePath = `${config.vaultPath}/${fileName}`;

  try {
    const response = await fetch(`${config.obsidianUrl}/vault/${encodeURIComponent(notePath)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/markdown',
        Authorization: `Bearer ${config.obsidianApiKey}`,
      },
      body: markdown,
    });

    if (!response.ok) {
      console.error(
        `[ObsidianReporter] Obsidian notification failed: ${response.status} ${response.statusText}`
      );
    } else {
      console.log(`[ObsidianReporter] Obsidian notification sent: ${notePath}`);
    }
  } catch (error) {
    console.error(
      `[ObsidianReporter] Obsidian notification error: ${error instanceof Error ? error.message : error}`
    );
  }
}

const AUTH_LABELS: Readonly<Record<Exclude<AuthStatus, 'authenticated'>, string>> = {
  auth_expired: '🔑 Authentication Expired',
  unreachable: '🔌 Unreachable',
  test_data_missing: '🗑️ Test Data Missing',
};

const AUTH_GUIDANCE: Readonly<Record<Exclude<AuthStatus, 'authenticated'>, string>> = {
  auth_expired: "Run `npm run e2e:auth` to re-authenticate.",
  unreachable: 'The site could not be reached; check network / service status.',
  test_data_missing:
    'The pinned test conversation no longer opens — refresh the `*_CONV_URL` value in `e2e/.env.local`.',
};

export function generateMarkdown(report: ValidationReport): string {
  const dateStr = report.timestamp.slice(0, 10);
  const lines: string[] = [
    '---',
    `date: "${report.timestamp}"`,
    `status: ${report.overallStatus}`,
    'tags: [selector-health, automated]',
    '---',
    '',
    `# Selector Health Report - ${dateStr}`,
    '',
    `**Overall: ${report.overallStatus.toUpperCase()}**`,
    '',
    '## Summary',
    '',
    '| Platform | Auth | Pass | Dead Primary | Fail | BL Blocking | BL Advisory | Stall Skips |',
    '|----------|------|------|--------------|------|-------------|-------------|-------------|',
  ];

  for (const p of report.platforms) {
    const auth = p.authStatus === 'authenticated' ? '✅' : AUTH_LABELS[p.authStatus];
    const c = p.classification;
    lines.push(
      `| ${p.platform} | ${auth} | ${c?.pass.length ?? '-'} | ${c?.warn.length ?? '-'} | ` +
        `${c?.fail.length ?? '-'} | ${c?.baselineBlocking.length ?? '-'} | ` +
        `${c?.baselineAdvisory.length ?? '-'} | ${p.stallSkips.length || '-'} |`
    );
  }

  lines.push('');

  for (const p of report.platforms) {
    const sections: string[] = [];

    if (p.authStatus !== 'authenticated') {
      sections.push(`### ${AUTH_LABELS[p.authStatus]}`, '', AUTH_GUIDANCE[p.authStatus], '');
    }

    if (p.stallSkips.length > 0) {
      sections.push(
        '### ⏳ Content Stall (skipped)',
        '',
        `Targets: ${p.stallSkips.join(', ')} — escalates to FAIL after 3 consecutive stalls.`,
        ''
      );
    }

    if (p.failedTargets.length > 0 && !p.classification) {
      sections.push(
        '### ❌ Test Failed Before Validation',
        '',
        `Targets: ${p.failedTargets.join(', ')} — see the Playwright output for the failure message.`,
        ''
      );
    }

    const c = p.classification;
    if (c) {
      if (c.warn.length > 0) {
        sections.push(
          '### 💀 Dead Primary Selectors (FAIL — fallback carrying)',
          '',
          '| Name | Failed Primary | Working Fallback | Fallback Matches |',
          '|------|----------------|------------------|------------------|'
        );
        for (const w of c.warn) {
          sections.push(
            `| ${w.failedPrimary.group}:${w.failedPrimary.name} | \`${w.failedPrimary.selector}\` | \`${w.workingFallback.selector}\` | ${w.workingFallback.matchCount} |`
          );
        }
        sections.push('');
      }

      if (c.fail.length > 0) {
        sections.push(
          '### ❌ Failures (all selector variants broken)',
          '',
          '| Name | Primary Selector |',
          '|------|------------------|'
        );
        for (const f of c.fail) {
          sections.push(`| ${f.group}:${f.name} | \`${f.selector}\` |`);
        }
        sections.push('');
      }

      if (c.baselineBlocking.length > 0) {
        sections.push(
          '### 🚫 Baseline Contract Violations (FAIL)',
          '',
          "Intentional selector changes must be recorded via `npm run e2e:baseline:update`.",
          '',
          '| Selector | Status | Baseline | Current |',
          '|----------|--------|----------|---------|'
        );
        for (const b of c.baselineBlocking) {
          sections.push(
            `| ${b.group}:${b.name} \`${b.selector}\` | ${b.status} | ${b.baselineCount} | ${b.currentCount} |`
          );
        }
        sections.push('');
      }

      if (c.baselineAdvisory.length > 0) {
        sections.push(
          '### 📉 Baseline Degradation (advisory)',
          '',
          '| Selector | Baseline | Current |',
          '|----------|----------|---------|'
        );
        for (const b of c.baselineAdvisory) {
          sections.push(
            `| ${b.group}:${b.name} \`${b.selector}\` | ${b.baselineCount} | ${b.currentCount} |`
          );
        }
        sections.push('');
      }
    }

    if (sections.length > 0) {
      lines.push(`## ${p.platform}`, '', ...sections);
    }
  }

  return lines.join('\n');
}
