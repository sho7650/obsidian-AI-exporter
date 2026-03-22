import { defineConfig } from '@playwright/test';
import path from 'path';

const RESULTS_DIR = path.join(import.meta.dirname, 'results');

export default defineConfig({
  testDir: './selectors',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(RESULTS_DIR, 'report.json') }],
    ['./selectors/obsidian-reporter.ts'],
  ],
});
