import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildReleaseEvidence,
  parsePagesCanonicalDeployment,
  parseWorkerHealthRelease,
  parseWranglerDeploymentOutput
} from '../../../scripts/lib/deploymentEvidence.js';

describe('deployment evidence', () => {
  it('reads native Worker and Pages deployment identifiers', () => {
    const session = JSON.stringify({
      type: 'wrangler-session',
      timestamp: '2026-07-12T00:00:00Z'
    });
    const worker = JSON.stringify({
      type: 'deploy',
      worker_name: 'blawby-ai-chatbot',
      version_id: 'worker-version-720',
      targets: ['https://ai.blawby.com/api/*'],
      timestamp: '2026-07-12T00:00:01Z'
    });
    const pages = JSON.stringify({
      type: 'pages-deploy',
      pages_project: 'blawby-ai-chatbot-frontend',
      deployment_id: 'pages-deployment-720',
      url: 'https://720.blawby-ai-chatbot-frontend.pages.dev',
      timestamp: '2026-07-12T00:00:02Z'
    });

    expect(parseWranglerDeploymentOutput(`${session}\n${worker}\n`, 'deploy')).toEqual({
      deploymentId: 'worker-version-720',
      deploymentUrl: 'https://ai.blawby.com/api/*',
      deployedAt: '2026-07-12T00:00:01Z',
      target: 'blawby-ai-chatbot'
    });
    expect(parseWranglerDeploymentOutput(`${session}\n${pages}\n`, 'pages-deploy')).toEqual({
      deploymentId: 'pages-deployment-720',
      deploymentUrl: 'https://720.blawby-ai-chatbot-frontend.pages.dev',
      deployedAt: '2026-07-12T00:00:02Z',
      target: 'blawby-ai-chatbot-frontend'
    });
  });

  it('fails closed on a failed or incomplete Wrangler command', () => {
    expect(() =>
      parseWranglerDeploymentOutput(JSON.stringify({ type: 'command-failed', message: 'token detail' }), 'deploy')
    ).toThrow('failed deployment command');
    expect(() =>
      parseWranglerDeploymentOutput(
        JSON.stringify({
          type: 'deploy',
          worker_name: 'worker',
          timestamp: 'now'
        }),
        'deploy'
      )
    ).toThrow('deployment target');
  });

  it('records only release identity and readiness evidence', () => {
    const evidence = buildReleaseEvidence({
      environment: 'production',
      frontendWorkerCommit: 'frontend-commit',
      workerDeploymentId: 'worker-id',
      workerDeploymentUrl: 'https://ai.blawby.com/api/*',
      pagesDeploymentId: 'pages-id',
      pagesDeploymentUrl: 'https://pages-id.pages.dev',
      backendGitCommit: 'backend-commit',
      backendDeploymentId: 'railway-id',
      launchedAt: '2026-07-12T00:00:00Z'
    });

    expect(evidence).toMatchObject({
      environment: 'production',
      frontendWorkerCommit: 'frontend-commit',
      worker: { deploymentId: 'worker-id' },
      pages: { deploymentId: 'pages-id' },
      backend: {
        gitCommit: 'backend-commit',
        deploymentId: 'railway-id',
        migrationsReady: true
      }
    });
    expect(JSON.stringify(evidence)).not.toMatch(/token|secret|runtimeConfig/i);
  });

  it('reads the current Worker and canonical Pages release identities', () => {
    expect(
      parseWorkerHealthRelease(
        {
          success: true,
          data: {
            environment: 'production',
            release: {
              commit: 'abcdef0123456789',
              workerVersionId: 'worker-version-721'
            }
          }
        },
        'production'
      )
    ).toEqual({
      commit: 'abcdef0123456789',
      deploymentId: 'worker-version-721'
    });
    expect(
      parsePagesCanonicalDeployment({
        success: true,
        result: {
          canonical_deployment: {
            id: 'pages-deployment-721',
            url: 'https://721.blawby-ai-chatbot-frontend.pages.dev/'
          }
        }
      })
    ).toEqual({
      deploymentId: 'pages-deployment-721',
      deploymentUrl: 'https://721.blawby-ai-chatbot-frontend.pages.dev'
    });
  });

  it('fails closed when the current Cloudflare identity is unsafe to restore', () => {
    expect(() =>
      parseWorkerHealthRelease(
        {
          data: {
            environment: 'staging',
            release: { commit: 'unknown', workerVersionId: 'worker-version' }
          }
        },
        'staging'
      )
    ).toThrow('unknown');
    expect(() =>
      parsePagesCanonicalDeployment({
        success: true,
        result: { canonical_deployment: null }
      })
    ).toThrow('canonical deployment');
  });

  it('keeps staging automatic and production manual, serialized, and ordered', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const staging = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8');
    const production = readFileSync(resolve(root, '.github/workflows/launch-production.yml'), 'utf8');

    expect(staging).toMatch(/push:\s*\n\s*branches:\s*\n\s*- staging/);
    expect(staging).not.toMatch(/- main/);
    expect(production).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(production).not.toMatch(/\n\s*push:/);
    expect(production).toContain('group: launch-production');
    expect(production).toContain('cancel-in-progress: false');
    expect(production).toMatch(/capture-current:[\s\S]*needs: preflight/);
    expect(production).toMatch(/deploy-worker:[\s\S]*needs: capture-current/);
    expect(production).toMatch(/deploy-pages:[\s\S]*needs: deploy-worker/);
    expect(production).toContain('environment: production');
    expect(production).toContain('WRANGLER_OUTPUT_FILE_PATH');
    expect(production).toContain('verify-deployment-propagation.ts');
  });

  it('smokes production with dedicated secrets and restores both Cloudflare surfaces on failure', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const production = readFileSync(resolve(root, '.github/workflows/launch-production.yml'), 'utf8');
    const staging = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8');
    const smoke = readFileSync(resolve(root, 'tests/e2e/production-smoke.spec.ts'), 'utf8');
    const smokeConfig = readFileSync(resolve(root, 'playwright.production-smoke.config.ts'), 'utf8');
    const e2eConfig = readFileSync(resolve(root, 'tests/e2e/helpers/e2eConfig.ts'), 'utf8');

    expect(production).toContain('capture-cloudflare-release.ts');
    expect(production).toContain('E2E_REQUIRE_ENV_ONLY');
    expect(production).toContain('E2E_REQUIRE_EXISTING_USERS');
    expect(production).toContain('E2E_SKIP_ANONYMOUS_AUTH');
    expect(production).toContain('PRODUCTION_SMOKE_OWNER_EMAIL');
    expect(production).toContain('PRODUCTION_SMOKE_CLIENT_EMAIL');
    expect(production).toContain('playwright.production-smoke.config.ts');
    expect(production).toContain('wrangler rollback');
    expect(production).toContain('rollback-pages-deployment.ts');
    expect(production).toContain('verify-pages-canonical.ts');
    expect(production).toMatch(/rollback-production:[\s\S]*if:[\s\S]*production-smoke\.result == 'failure'/);
    expect(production).toMatch(/record-release:[\s\S]*- production-smoke/);

    expect(staging).toContain('rehearse_rollback');
    expect(staging).toContain('rollback-rehearsal:');
    expect(staging).toContain('rollbackDurationSeconds');
    expect(staging).toContain('Redeploy current staging Worker');
    expect(staging).toContain('Redeploy current staging Pages');
    expect(staging).toContain('page https://ai-staging.blawby.com');
    expect(staging).not.toContain('https://staging.blawby.com');

    expect(smoke).toContain('production-launch-test');
    expect(smoke).toContain('production_launch_smoke');
    expect(smoke).toContain('/api/ai/chat');
    expect(smoke).toMatch(/data:\s*\{\s*status:\s*["']archived["']\s*\}/);
    expect(smoke).not.toMatch(/request\.(?:post|patch|put|delete)\(`?\/api\/(?:invoices|matters)/);
    expect(smoke).not.toMatch(/webhook|charge|send-email|send-sms/i);
    expect(smokeConfig).toMatch(/trace:\s*["']off["']/);
    expect(e2eConfig).toContain("if (process.env.E2E_REQUIRE_ENV_ONLY === 'true') return;");
  });
});
