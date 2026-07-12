import { describe, expect, it } from 'vitest';
import { REQUIRED_WORKER_SECRETS, validateProductionConfig } from '../../../scripts/lib/productionConfig.js';

const validConfig = () => ({
  wrangler: {
    env: {
      production: {
        name: 'blawby-ai-chatbot',
        kv_namespaces: [{ binding: 'CHAT_SESSIONS' }],
        d1_databases: [{ binding: 'DB' }],
        r2_buckets: [{ binding: 'FILES_BUCKET' }],
        vectorize: [{ binding: 'SEARCH_VECTORS' }],
        queues: {
          producers: [
            { binding: 'NOTIFICATION_EVENTS' },
            { binding: 'SEARCH_INDEX_EVENTS' },
            { binding: 'INTAKE_CONVERSATION_EVENTS' },
          ],
          consumers: [
            { queue: 'notification-events' },
            { queue: 'search-index-events' },
            { queue: 'intake-conversation-events' },
          ],
        },
        durable_objects: {
          bindings: [
            { name: 'CHAT_ROOM' },
            { name: 'CHAT_COUNTER' },
            { name: 'MATTER_PROGRESS' },
            { name: 'PRESENCE_ROOM' },
          ],
        },
        ai: { binding: 'AI' },
        version_metadata: { binding: 'CF_VERSION_METADATA' },
        observability: {
          enabled: true,
          logs: { enabled: true, persist: true, invocation_logs: true },
        },
        vars: {
          NODE_ENV: 'production',
          CLOUDFLARE_PUBLIC_URL: 'https://ai.blawby.com',
          BACKEND_API_URL: 'https://api.blawby.com',
          ADOBE_IMS_BASE_URL: 'https://ims-na1.adobelogin.com',
          ADOBE_PDF_SERVICES_BASE_URL: 'https://pdf-services.adobe.io',
          ALLOWED_WS_ORIGINS: 'https://ai.blawby.com,https://blawby.com',
        },
        routes: [{ pattern: 'ai.blawby.com/api/*', zone_name: 'blawby.com' }],
      },
    },
  },
  pagesHeaders: "Content-Security-Policy: default-src 'self'; object-src 'none'; style-src https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src https://cdn.onesignal.com",
  pagesRedirects: '/api/* /api/:splat 200\n/* /index.html 200',
  buildEnv: {
    VITE_BACKEND_API_URL: 'https://api.blawby.com',
    VITE_APP_BASE_URL: 'https://ai.blawby.com',
    VITE_WORKER_API_URL: 'https://ai.blawby.com',
  },
  workerSecretNames: [...REQUIRED_WORKER_SECRETS],
});

describe('production configuration validation', () => {
  it('accepts the complete production topology', () => {
    expect(validateProductionConfig(validConfig())).toEqual([]);
  });

  it('fails closed when a required binding is absent', () => {
    const config = validConfig();
    config.wrangler.env.production.queues.producers = config.wrangler.env.production.queues.producers
      .filter(({ binding }) => binding !== 'INTAKE_CONVERSATION_EVENTS');

    expect(validateProductionConfig(config)).toContainEqual({
      field: 'worker.env.production.queues.producers.INTAKE_CONVERSATION_EVENTS',
      reason: 'required binding is missing',
    });
  });

  it('rejects staging and localhost URLs without echoing their values', () => {
    const config = validConfig();
    config.buildEnv.VITE_BACKEND_API_URL = 'https://staging-api.blawby.com/private-value';
    config.wrangler.env.production.vars.CLOUDFLARE_PUBLIC_URL = 'http://localhost:8787/secret-path';

    const failures = validateProductionConfig(config);
    expect(failures.map(({ field }) => field)).toEqual(expect.arrayContaining([
      'build.VITE_BACKEND_API_URL',
      'worker.env.production.vars.CLOUDFLARE_PUBLIC_URL',
    ]));
    expect(JSON.stringify(failures)).not.toContain('private-value');
    expect(JSON.stringify(failures)).not.toContain('secret-path');
  });

  it('rejects route drift and missing CSP targets', () => {
    const config = validConfig();
    config.wrangler.env.production.routes = [{ pattern: 'ai-staging.blawby.com/api/*', zone_name: 'blawby.com' }];
    config.pagesHeaders = "Content-Security-Policy: default-src 'self'";

    const fields = validateProductionConfig(config).map(({ field }) => field);
    expect(fields).toContain('worker.env.production.routes');
    expect(fields).toContain('pages.public/_headers.Content-Security-Policy');
  });

  it('checks production Worker secret names, not secret values', () => {
    const config = validConfig();
    config.workerSecretNames = config.workerSecretNames.filter((name) => name !== 'WORKER_EVENT_SECRET');

    expect(validateProductionConfig(config)).toContainEqual({
      field: 'worker.secret.WORKER_EVENT_SECRET',
      reason: 'required production secret name is missing',
    });
  });
});
