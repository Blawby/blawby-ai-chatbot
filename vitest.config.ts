import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Unified test configuration - all tests use real API calls
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ["./tests/setup-node.ts"],
    testTimeout: 60000, // 60 seconds for real API tests
    hookTimeout: 60000, // 60 seconds for hooks (beforeAll/afterAll)
    fileParallelism: false, // Force single-file execution to prevent file-level parallelism
    include: [
      'tests/unit/**/*.{test,spec}.{js,ts,jsx,tsx}'
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
  },
  esbuild: {
    target: 'es2020',
    loader: 'tsx',
    jsxImportSource: 'preact'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '~': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
      '@fixtures': resolve(__dirname, './tests/fixtures'),
      '@i18n': resolve(__dirname, './src/i18n/index.ts'),
      '@locales': resolve(__dirname, './src/locales')
    }
  }
}); 
