export type WranglerDeploymentKind = 'deploy' | 'pages-deploy';

export interface DeploymentIdentity {
  deploymentId: string;
  deploymentUrl: string;
  deployedAt: string;
  target: string;
}

export interface ReleaseEvidenceInput {
  environment: 'production';
  frontendWorkerCommit: string;
  workerDeploymentId: string;
  workerDeploymentUrl: string;
  pagesDeploymentId: string;
  pagesDeploymentUrl: string;
  backendGitCommit: string;
  backendDeploymentId: string;
  launchedAt: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const requireString = (record: Record<string, unknown>, field: string): string => {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
    throw new Error(`Wrangler output is missing a valid ${field}`);
  }
  return value.trim();
};

export const parseWranglerDeploymentOutput = (
  source: string,
  kind: WranglerDeploymentKind,
): DeploymentIdentity => {
  const records = source
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return asRecord(JSON.parse(line));
      } catch {
        throw new Error(`Wrangler output line ${index + 1} is not valid JSON`);
      }
    })
    .filter((record): record is Record<string, unknown> => record !== null);
  const failed = records.find((record) => record.type === 'command-failed');
  if (failed) throw new Error('Wrangler recorded a failed deployment command');
  const record = records.findLast((candidate) => candidate.type === kind);
  if (!record) throw new Error(`Wrangler output does not contain ${kind}`);

  if (kind === 'deploy') {
    const targets = record.targets;
    if (!Array.isArray(targets) || typeof targets[0] !== 'string') {
      throw new Error('Wrangler Worker output is missing a deployment target');
    }
    return {
      deploymentId: requireString(record, 'version_id'),
      deploymentUrl: targets[0],
      deployedAt: requireString(record, 'timestamp'),
      target: requireString(record, 'worker_name'),
    };
  }

  return {
    deploymentId: requireString(record, 'deployment_id'),
    deploymentUrl: requireString(record, 'url'),
    deployedAt: requireString(record, 'timestamp'),
    target: requireString(record, 'pages_project'),
  };
};

export const buildReleaseEvidence = (input: ReleaseEvidenceInput) => ({
  environment: input.environment,
  frontendWorkerCommit: input.frontendWorkerCommit,
  worker: {
    deploymentId: input.workerDeploymentId,
    deploymentUrl: input.workerDeploymentUrl,
  },
  pages: {
    deploymentId: input.pagesDeploymentId,
    deploymentUrl: input.pagesDeploymentUrl,
  },
  backend: {
    gitCommit: input.backendGitCommit,
    deploymentId: input.backendDeploymentId,
    migrationsReady: true,
  },
  launchedAt: input.launchedAt,
});
