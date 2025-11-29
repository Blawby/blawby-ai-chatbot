import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Frontend component test configuration - uses DOM environment
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    include: [
      'src/**/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}'
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
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      'react-dom/client': 'preact/compat',
      '@': resolve(__dirname, './src'),
      '~': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
      '@fixtures': resolve(__dirname, './tests/fixtures'),
      '@i18n': resolve(__dirname, './src/i18n/index.ts'),
      '@locales': resolve(__dirname, './src/locales')
    }
  }
});
