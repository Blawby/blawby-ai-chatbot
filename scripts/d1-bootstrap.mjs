#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith('-')) return fallback;
  return value;
};

const hasFlag = (name) => args.includes(name);

const db = getArg('--db', null);
const env = getArg('--env', null);
const remote = hasFlag('--remote');

if (!db || !env) {
  console.error('Usage: node scripts/d1-bootstrap.mjs --db <db-name> --env <env> [--remote]');
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'worker', 'schema.sql');
const migrationsDir = path.join(repoRoot, 'worker', 'migrations');

if (!fs.existsSync(schemaPath)) {
  console.error(`Missing schema.sql at ${schemaPath}`);
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  console.error(`Missing migrations directory at ${migrationsDir}`);
  process.exit(1);
}

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

let tempFile = null;
if (migrationFiles.length > 0) {
  const values = migrationFiles.map((file) => `('${file}')`).join(',\n');
  const markSql = `INSERT OR IGNORE INTO d1_migrations (name) VALUES\n${values};\n`;
  tempFile = path.join(os.tmpdir(), `mark_migrations_${Date.now()}.sql`);
  fs.writeFileSync(tempFile, markSql);
}

const baseArgs = ['d1', 'execute', db, '--env', env];
if (remote) {
  baseArgs.push('--remote');
}

const run = (commandArgs) => {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npxCommand, ['wrangler', ...commandArgs], { stdio: 'inherit', cwd: repoRoot });
};

console.log(`Bootstrapping D1 database '${db}' (env: ${env}, remote: ${remote})`);
run([...baseArgs, '--file', schemaPath]);
if (tempFile) {
  run([...baseArgs, '--file', tempFile]);
  fs.unlinkSync(tempFile);
} else {
  console.log('No migration files found; skipping migration markers.');
}
console.log('Bootstrap complete.');
