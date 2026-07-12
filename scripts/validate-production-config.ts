import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'smol-toml';
import { validateProductionConfig } from './lib/productionConfig.js';

const args = process.argv.slice(2);
const hasFlag = (flag: string): boolean => args.includes(flag);
const flagValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const root = resolve(import.meta.dirname, '..');
const wrangler = parse(readFileSync(resolve(root, 'worker/wrangler.toml'), 'utf8')) as Record<string, unknown>;
const pagesHeaders = readFileSync(resolve(root, 'public/_headers'), 'utf8');
const pagesRedirects = readFileSync(resolve(root, 'public/_redirects'), 'utf8');

const secretsPath = flagValue('--worker-secrets');
let workerSecretNames: string[] | undefined;
if (secretsPath) {
  const raw = JSON.parse(readFileSync(resolve(secretsPath), 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error('Worker secret inventory must be a JSON array');
  workerSecretNames = raw
    .map((entry) => typeof entry === 'string' ? entry : (entry && typeof entry === 'object' ? (entry as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string');
}

const failures = validateProductionConfig({
  wrangler,
  pagesHeaders,
  pagesRedirects,
  buildEnv: hasFlag('--build-env') ? process.env : undefined,
  workerSecretNames,
});

if (failures.length > 0) {
  console.error(`Production configuration validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure.field}: ${failure.reason}`);
  process.exitCode = 1;
} else {
  console.log('Production configuration validation passed.');
}
