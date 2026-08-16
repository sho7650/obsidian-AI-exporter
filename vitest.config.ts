import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // Keep the console output of PASSING tests out of the run.
    //
    // The scroll engines log one line per iteration by design - that debug
    // trail is the instrument ADR-032 added for field reports - and the tests
    // simulate hundreds of iterations, so a CI run printed 10,400 lines of
    // which 2,600 were scroll iterations. Real failures drown in that.
    //
    // Only the DEFAULT reporter was affected: the minimal reporter vitest picks
    // locally already sets 'passed-only', so the noise was invisible on a
    // developer machine and only ever appeared in CI. Setting it here makes the
    // two agree. Logs from FAILING tests are still printed in full.
    silent: 'passed-only',
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
