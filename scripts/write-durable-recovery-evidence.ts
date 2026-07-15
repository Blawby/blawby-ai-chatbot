import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDurableRecoveryEvidence } from './lib/durableRecoveryEvidence.js';

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Usage: write-durable-recovery-evidence.ts <output.json>');

const source = process.env.RECOVERY_EVIDENCE_JSON;
if (!source) throw new Error('RECOVERY_EVIDENCE_JSON is required');

let parsed: unknown;
try {
  parsed = JSON.parse(source);
} catch {
  throw new Error('RECOVERY_EVIDENCE_JSON must be valid JSON');
}

const evidence = buildDurableRecoveryEvidence(parsed);
writeFileSync(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
