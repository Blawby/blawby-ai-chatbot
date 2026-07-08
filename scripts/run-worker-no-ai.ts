import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const sourceConfigPath = resolve(repoRoot, 'worker', 'wrangler.toml');
const generatedConfigPath = resolve(repoRoot, 'worker', 'wrangler.no-ai.tmp.toml');
const wranglerBinPath = resolve(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const removeTomlSection = (source: string, sectionName: string): string => {
  const lines = source.split(/\r?\n/);
  const output: string[] = [];
  let skipping = false;
  const sectionHeader = `[${sectionName}]`;

  for (const line of lines) {
    const trimmed = line.trim();
    const isSection = /^\[[^\]]+\]$/.test(trimmed);
    if (trimmed === sectionHeader) {
      skipping = true;
      continue;
    }
    if (skipping && isSection) {
      skipping = false;
    }
    if (!skipping) {
      output.push(line);
    }
  }

  return output.join('\n');
};

if (!existsSync(sourceConfigPath)) {
  throw new Error(`Missing Worker config: ${sourceConfigPath}`);
}

let generatedConfig = readFileSync(sourceConfigPath, 'utf-8');
generatedConfig = removeTomlSection(generatedConfig, 'ai');
generatedConfig = removeTomlSection(generatedConfig, 'env.dev.ai');
writeFileSync(generatedConfigPath, generatedConfig);

console.log(
  'Starting Wrangler with a generated no-AI config for deterministic non-AI e2e flows. ' +
  'This is not a replacement for npm run dev:worker when testing AI routes.'
);

const wranglerArgs = ['dev', '--port', '8787', '--config', generatedConfigPath, '--env', 'dev'];
const child = spawn(process.execPath, [wranglerBinPath, ...wranglerArgs], { stdio: 'inherit', cwd: repoRoot });

const cleanup = () => {
  rmSync(generatedConfigPath, { force: true });
};

child.on('exit', (code, signal) => {
  cleanup();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  cleanup();
  throw error;
});

process.on('SIGINT', () => {
  cleanup();
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  cleanup();
  child.kill('SIGTERM');
});
