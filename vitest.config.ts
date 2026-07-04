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
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/lib/types.ts', // Type definitions only
        // Entry shims: import-time side effect only (a few lines each).
        // All logic lives in popup/app.ts and content/bootstrap.ts, which ARE covered.
        'src/popup/index.ts',
        'src/content/index.ts',
        'test/**/*.ts', // Test infrastructure should not count toward coverage
      ],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
    },
  },
});
