import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'e2e/**/*.test.ts'],
    // E2E test timeout extension
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // NOTE: `include` does not narrow the measured set on its own. With the
      // v8 provider the report still covers every file loaded during the run,
      // so anything outside src/ must be excluded explicitly below (ADR-019).
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/lib/types.ts', // Type definitions only
        // Entry shims: import-time side effect only (a few lines each).
        // All logic lives in popup/app.ts and content/bootstrap.ts, which ARE covered.
        'src/popup/index.ts',
        'src/content/index.ts',
        'test/**/*.ts', // Test infrastructure should not count toward coverage
        // E2E selector-validation tooling. It has its own unit tests, but it is
        // developer tooling rather than shipped extension code; leaving it in
        // diluted the thresholds below (ADR-019).
        'e2e/**',
      ],
      // Calibrated against the measured src-only figures (96.13 / 87.17 /
      // 98.67 / 97.43 at the time of ADR-019), leaving a small margin.
      thresholds: {
        statements: 95,
        branches: 85,
        functions: 95,
        lines: 95,
      },
    },
  },
});
