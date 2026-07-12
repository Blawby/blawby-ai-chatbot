import { writeFileSync } from 'node:fs';
import { runProductionHealthChecks } from './lib/productionHealth.js';

const results = await runProductionHealthChecks();
const evidence = {
  checkedAt: new Date().toISOString(),
  environment: 'production',
  outcome: results.every((result) => result.outcome === 'healthy') ? 'healthy' : 'failed',
  checks: results,
};

writeFileSync('production-health.json', `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(evidence)}\n`);
if (evidence.outcome === 'failed') process.exitCode = 1;
