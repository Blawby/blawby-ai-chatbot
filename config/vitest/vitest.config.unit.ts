import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [resolve(__dirname, '../../tests/setup-unit.ts')],
    include: [
      'tests/unit/**/*.test.{ts,tsx,js,jsx}',
      'tests/unit/**/*.spec.{ts,tsx,js,jsx}',
      'src/hooks/__tests__/useMattersSidebar.test.ts',
      'src/hooks/__tests__/useOrganizationManagement.test.ts',
      'src/utils/__tests__/deepEqual.test.ts',
      'src/utils/__tests__/errorHandler.test.ts',
      'src/__tests__/i18n.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
      'tests/integration/**',
      'src/components/**/__tests__/**',
      'src/__tests__/components/**',
      'src/__tests__/RTLSupport.test.tsx',
      'src/components/settings/**/__tests__/**'
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
