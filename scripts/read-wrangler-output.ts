import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseWranglerDeploymentOutput, type WranglerDeploymentKind } from './lib/deploymentEvidence.js';

const [sourcePath, rawKind] = process.argv.slice(2);
if (!sourcePath || (rawKind !== 'deploy' && rawKind !== 'pages-deploy')) {
  throw new Error('Usage: read-wrangler-output.ts <output.ndjson> <deploy|pages-deploy>');
}

const identity = parseWranglerDeploymentOutput(
  readFileSync(resolve(sourcePath), 'utf8'),
  rawKind as WranglerDeploymentKind,
);
const lines = [
  `deployment_id=${identity.deploymentId}`,
  `deployment_url=${identity.deploymentUrl}`,
  `deployed_at=${identity.deployedAt}`,
  `target=${identity.target}`,
].join('\n') + '\n';

const githubOutput = process.env.GITHUB_OUTPUT?.trim();
if (githubOutput) appendFileSync(githubOutput, lines, 'utf8');
else process.stdout.write(lines);
