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
        'src/popup/index.ts', // Has side effects on import, tested via patterns
        'src/content/index.ts', // Has side effects on import, tested via patterns
        'src/offscreen/offscreen.ts', // Chrome-specific runtime, cannot test in jsdom
        'test/**/*.ts', // Test infrastructure should not count toward coverage
      ],
      // Final thresholds - achieved 88.5% statements
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
    },
  },
});
