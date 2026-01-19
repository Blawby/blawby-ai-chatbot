import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        main: './worker/index.ts',
        isolatedStorage: true,
        miniflare: {
          envPath: 'worker/.dev.vars',
          d1Databases: ['DB'],
          kvNamespaces: {
            CHAT_SESSIONS: 'kv-chat-sessions'
          },
          compatibilityDate: '2024-12-01'
        }
      },
    },
    setupFiles: ['./tests/setup-worker.ts'],
    include: [
      'tests/integration/**/*.test.{ts,tsx,js,jsx}',
      'tests/integration/**/*.spec.{ts,tsx,js,jsx}'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**'
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
});
