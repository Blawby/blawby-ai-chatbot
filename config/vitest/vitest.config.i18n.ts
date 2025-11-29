import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// i18n test configuration - no real API setup
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    testTimeout: 10000, // 10 seconds for i18n tests
    hookTimeout: 10000, // 10 seconds for hooks
    fileParallelism: false,
    include: [
      'src/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/**'
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
  },
  esbuild: {
    target: 'es2020',
    loader: 'tsx',
    jsxImportSource: 'preact'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../src'),
      '~': resolve(__dirname, '../../'),
      '@tests': resolve(__dirname, '../../tests'),
      '@fixtures': resolve(__dirname, '../../tests/fixtures'),
      '@i18n': resolve(__dirname, '../../src/i18n/index.ts'),
      '@locales': resolve(__dirname, '../../src/locales')
    }
  }
});
