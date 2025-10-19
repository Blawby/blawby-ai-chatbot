import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup-unit.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx,js,jsx}',
      'tests/unit/**/*.spec.{ts,tsx,js,jsx}',
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx,js,jsx}'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
      'tests/integration/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/fixtures/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  }
});
