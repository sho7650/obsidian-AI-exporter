/**
 * Obsidian notification for selector health reports.
 *
 * Creates a Markdown note in Obsidian via the Local REST API
 * when WARN, FAIL, or AUTH_EXPIRED conditions are detected.
 */

import type { ClassificationResult } from './classifier';
import type { AuthStatus } from './auth-check';

export interface NotificationConfig {
  obsidianUrl: string;
  obsidianApiKey: string;
  vaultPath: string;
}

export interface PlatformReport {
  platform: string;
  authStatus: AuthStatus;
  classification?: ClassificationResult;
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
  config: NotificationConfig,
): Promise<void> {
  if (report.overallStatus === 'pass') {
    console.log('[globalTeardown] All selectors passed. No notification needed.');
    return;
  }

  const markdown = generateMarkdown(report);
  const dateStr = report.timestamp.slice(0, 10);
  const fileName = `selector-health-${dateStr}.md`;
  const notePath = `${config.vaultPath}/${fileName}`;

  try {
    const response = await fetch(
      `${config.obsidianUrl}/vault/${encodeURIComponent(notePath)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/markdown',
          Authorization: `Bearer ${config.obsidianApiKey}`,
        },
        body: markdown,
      },
    );

    if (!response.ok) {
      console.error(`[globalTeardown] Obsidian notification failed: ${response.status} ${response.statusText}`);
    } else {
      console.log(`[globalTeardown] Obsidian notification sent: ${notePath}`);
    }
  } catch (error) {
    console.error(`[globalTeardown] Obsidian notification error: ${error instanceof Error ? error.message : error}`);
  }
}

function generateMarkdown(report: ValidationReport): string {
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
    '| Platform | Auth | Pass | Warn | Fail | Baseline |',
    '|----------|------|------|------|------|----------|',
  ];

  for (const p of report.platforms) {
    if (p.authStatus !== 'authenticated' || !p.classification) {
      const authIcon = p.authStatus === 'auth_expired' ? '🔑 EXPIRED' : '🔌 DOWN';
      lines.push(`| ${p.platform} | ${authIcon} | - | - | - | - |`);
    } else {
      const c = p.classification;
      lines.push(
        `| ${p.platform} | ✅ | ${c.pass.length} | ${c.warn.length} | ${c.fail.length} | ${c.baselineIssues.length} |`,
      );
    }
  }

  lines.push('');

  for (const p of report.platforms) {
    if (p.authStatus !== 'authenticated') {
      lines.push(`## ${p.platform} — ${p.authStatus === 'auth_expired' ? '🔑 Authentication Expired' : '🔌 Unreachable'}`);
      lines.push('');
      lines.push('Run `npm run e2e:auth` to re-authenticate.');
      lines.push('');
      continue;
    }

    if (!p.classification) continue;
    const c = p.classification;

    if (c.warn.length === 0 && c.fail.length === 0 && c.baselineIssues.length === 0) continue;

    lines.push(`## ${p.platform}`);
    lines.push('');

    if (c.warn.length > 0) {
      lines.push('### ⚠️ Warnings (primary failed, fallback OK)');
      lines.push('');
      lines.push('| Name | Failed Primary | Working Fallback | Fallback Matches |');
      lines.push('|------|----------------|------------------|------------------|');
      for (const w of c.warn) {
        lines.push(
          `| ${w.failedPrimary.group}:${w.failedPrimary.name} | \`${w.failedPrimary.selector}\` | \`${w.workingFallback.selector}\` | ${w.workingFallback.matchCount} |`,
        );
      }
      lines.push('');
    }

    if (c.fail.length > 0) {
      lines.push('### ❌ Failures (all selectors broken)');
      lines.push('');
      lines.push('| Name | Primary Selector |');
      lines.push('|------|------------------|');
      for (const f of c.fail) {
        lines.push(`| ${f.group}:${f.name} | \`${f.selector}\` |`);
      }
      lines.push('');
    }

    if (c.baselineIssues.length > 0) {
      lines.push('### 📉 Baseline Degradation');
      lines.push('');
      lines.push('| Selector | Baseline | Current | Status |');
      lines.push('|----------|----------|---------|--------|');
      for (const b of c.baselineIssues) {
        lines.push(`| ${b.name} | ${b.baselineCount} | ${b.currentCount} | ${b.status} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
