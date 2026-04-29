import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

const sharedAlias = {
  '@': resolve(root, 'src'),
  '~': root,
  '@tests': resolve(root, 'tests'),
  '@fixtures': resolve(root, 'tests/fixtures'),
  '@i18n': resolve(root, 'src/i18n/index.ts'),
  '@locales': resolve(root, 'src/locales'),
};

const sharedCoverage = {
  provider: 'v8' as const,
  reporter: ['text', 'json', 'html'] as const,
  exclude: [
    'node_modules/',
    'dist/',
    'tests/fixtures/',
    '**/*.d.ts',
    '**/*.config.*',
  ],
};

// Single root vitest config with two projects:
//   - unit:       Node env, runs tests/unit + selected src files
//   - component:  jsdom env, runs src/components/__tests__ + tests/component
// Worker integration tests stay in vitest.config.worker.ts because the
// Cloudflare pool needs a different runner (defineWorkersConfig).
// Filter from CLI: `vitest --project unit` / `--project component`.
export default defineConfig({
  test: {
    coverage: sharedCoverage,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          setupFiles: [resolve(root, 'tests/setup-unit.ts')],
          include: [
            'tests/unit/**/*.test.{ts,tsx,js,jsx}',
            'tests/unit/**/*.spec.{ts,tsx,js,jsx}',
            'tests/unit/**/*.test-d.ts',
            'src/hooks/__tests__/useMattersSidebar.test.ts',
            'src/hooks/__tests__/useOrganizationManagement.test.ts',
            'src/utils/__tests__/deepEqual.test.ts',
            'src/utils/__tests__/errorHandler.test.ts',
            'src/__tests__/i18n.test.ts',
          ],
          exclude: [
            'node_modules/**',
            'dist/**',
            'tests/e2e/**',
            'tests/integration/**',
            'src/components/**/__tests__/**',
            'src/__tests__/components/**',
            'src/__tests__/RTLSupport.test.tsx',
            'src/components/settings/**/__tests__/**',
          ],
        },
        resolve: { alias: sharedAlias },
      },
      {
        test: {
          name: 'component',
          environment: 'jsdom',
          globals: true,
          setupFiles: [resolve(root, 'tests/setup.ts')],
          testTimeout: 10_000,
          hookTimeout: 10_000,
          include: [
            'src/components/**/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}',
            'src/__tests__/components/**/*.{test,spec}.{js,ts,jsx,tsx}',
            'src/__tests__/RTLSupport.test.tsx',
            'src/components/settings/**/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}',
            'tests/component/**/*.{test,spec}.{js,ts,jsx,tsx}',
          ],
          exclude: [
            'node_modules/**',
            'dist/**',
            'tests/e2e/**',
          ],
        },
        esbuild: {
          target: 'es2020',
          jsxImportSource: 'preact',
        },
        resolve: {
          alias: {
            react: 'preact/compat',
            'react-dom': 'preact/compat',
            'react/jsx-runtime': 'preact/jsx-runtime',
            'react-dom/client': 'preact/compat',
            ...sharedAlias,
          },
        },
      },
    ],
  },
});
