import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReleaseEvidence, type ReleaseEvidenceInput } from './lib/deploymentEvidence.js';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value || /[\r\n]/.test(value)) throw new Error(`${name} is required`);
  return value;
};

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Usage: write-release-evidence.ts <output.json>');
const environment = required('RELEASE_ENVIRONMENT');
if (environment !== 'production') throw new Error('Release evidence environment must be production');

const input: ReleaseEvidenceInput = {
  environment,
  frontendWorkerCommit: required('FRONTEND_WORKER_COMMIT'),
  workerDeploymentId: required('WORKER_DEPLOYMENT_ID'),
  workerDeploymentUrl: required('WORKER_DEPLOYMENT_URL'),
  pagesDeploymentId: required('PAGES_DEPLOYMENT_ID'),
  pagesDeploymentUrl: required('PAGES_DEPLOYMENT_URL'),
  backendGitCommit: required('BACKEND_GIT_COMMIT'),
  backendDeploymentId: required('BACKEND_DEPLOYMENT_ID'),
  launchedAt: required('LAUNCHED_AT'),
};
writeFileSync(resolve(outputPath), `${JSON.stringify(buildReleaseEvidence(input), null, 2)}\n`, 'utf8');
