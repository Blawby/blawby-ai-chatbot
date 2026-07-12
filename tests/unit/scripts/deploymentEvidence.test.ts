import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReleaseEvidence, parseWranglerDeploymentOutput } from '../../../scripts/lib/deploymentEvidence.js';

describe('deployment evidence', () => {
  it('reads native Worker and Pages deployment identifiers', () => {
    const session = JSON.stringify({ type: 'wrangler-session', timestamp: '2026-07-12T00:00:00Z' });
    const worker = JSON.stringify({
      type: 'deploy',
      worker_name: 'blawby-ai-chatbot',
      version_id: 'worker-version-720',
      targets: ['https://ai.blawby.com/api/*'],
      timestamp: '2026-07-12T00:00:01Z',
    });
    const pages = JSON.stringify({
      type: 'pages-deploy',
      pages_project: 'blawby-ai-chatbot-frontend',
      deployment_id: 'pages-deployment-720',
      url: 'https://720.blawby-ai-chatbot-frontend.pages.dev',
      timestamp: '2026-07-12T00:00:02Z',
    });

    expect(parseWranglerDeploymentOutput(`${session}\n${worker}\n`, 'deploy')).toEqual({
      deploymentId: 'worker-version-720',
      deploymentUrl: 'https://ai.blawby.com/api/*',
      deployedAt: '2026-07-12T00:00:01Z',
      target: 'blawby-ai-chatbot',
    });
    expect(parseWranglerDeploymentOutput(`${session}\n${pages}\n`, 'pages-deploy')).toEqual({
      deploymentId: 'pages-deployment-720',
      deploymentUrl: 'https://720.blawby-ai-chatbot-frontend.pages.dev',
      deployedAt: '2026-07-12T00:00:02Z',
      target: 'blawby-ai-chatbot-frontend',
    });
  });

  it('fails closed on a failed or incomplete Wrangler command', () => {
    expect(() => parseWranglerDeploymentOutput(
      JSON.stringify({ type: 'command-failed', message: 'token detail' }),
      'deploy',
    )).toThrow('failed deployment command');
    expect(() => parseWranglerDeploymentOutput(
      JSON.stringify({ type: 'deploy', worker_name: 'worker', timestamp: 'now' }),
      'deploy',
    )).toThrow('deployment target');
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
      launchedAt: '2026-07-12T00:00:00Z',
    });

    expect(evidence).toMatchObject({
      environment: 'production',
      frontendWorkerCommit: 'frontend-commit',
      worker: { deploymentId: 'worker-id' },
      pages: { deploymentId: 'pages-id' },
      backend: { gitCommit: 'backend-commit', deploymentId: 'railway-id', migrationsReady: true },
    });
    expect(JSON.stringify(evidence)).not.toMatch(/token|secret|runtimeConfig/i);
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
    expect(production).toMatch(/deploy-worker:[\s\S]*needs: preflight/);
    expect(production).toMatch(/deploy-pages:[\s\S]*needs: deploy-worker/);
    expect(production).toContain('environment: production');
    expect(production).toContain('WRANGLER_OUTPUT_FILE_PATH');
    expect(production).toContain('verify-deployment-propagation.ts');
  });
});
