#!/usr/bin/env node
/**
 * State-management baseline check.
 *
 * Counts `useState` references across `src/` (excluding tests) and asserts
 * the count stays at-or-below a baseline. The plan-stated goal was a
 * ≥30% reduction from pre-refactor; this script captures the post-refactor
 * baseline so further increases (creep back to ad-hoc state) are visible
 * in CI without prescribing exact numbers.
 *
 * Run with `--update` to record the current count as the new baseline.
 *
 * Why a script and not an ESLint rule? `useState` is the legitimate
 * primitive for ephemeral UI state (per docs/architecture/state.md);
 * banning it is wrong. A budget keeps the trend visible without
 * blocking new uses.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const baselinePath = resolve(repoRoot, 'scripts/state-baseline.json');

// rg / grep gives the most reliable cross-platform count via shell.
const countUseState = () => {
  // Resolve TS/TSX files under src, excluding test files, then count `useState`
  // identifier occurrences. Uses a regex with word boundary so it doesn't
  // match `useStateMachine` or other prefixes/suffixes.
  const cmd = process.platform === 'win32'
    ? `git grep -E -c "\\buseState\\b" -- "src/*.ts" "src/*.tsx" "src/**/*.ts" "src/**/*.tsx"`
    : `git grep -E -c "\\buseState\\b" -- 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'`;

  try {
    const out = execSync(cmd, { cwd: repoRoot, encoding: 'utf8' });
    let total = 0;
    for (const line of out.split('\n')) {
      const colon = line.lastIndexOf(':');
      if (colon === -1) continue;
      const path = line.slice(0, colon);
      // Exclude test files explicitly (git grep doesn't have file pattern excl built in)
      if (path.includes('.test.') || path.includes('.spec.') || path.includes('__tests__/')) continue;
      const count = parseInt(line.slice(colon + 1), 10);
      if (Number.isFinite(count)) total += count;
    }
    return total;
  } catch (err) {
    console.error('Failed to count useState references:', err.message);
    process.exit(2);
  }
};

const loadBaseline = async () => {
  try {
    const raw = await readFile(baselinePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const main = async () => {
  const update = process.argv.includes('--update');
  const current = countUseState();
  const baseline = await loadBaseline();

  if (update || baseline === null) {
    const record = {
      useState: current,
      capturedAt: new Date().toISOString().slice(0, 10),
      // tolerance: how many *more* we'll allow before failing CI.
      // Reset to 0 after intentional refactor work; ratchet down by
      // re-running with --update.
      tolerance: 25,
    };
    await writeFile(baselinePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(`✓ Baseline updated: useState=${current}`);
    return;
  }

  const allowed = baseline.useState + (baseline.tolerance ?? 0);
  console.log(`useState: ${current} (baseline ${baseline.useState}, allowed ${allowed})`);

  if (current > allowed) {
    console.error(
      `\n✖ useState count exceeded the baseline + tolerance.\n` +
      `  current=${current}, baseline=${baseline.useState}, tolerance=${baseline.tolerance ?? 0}\n` +
      `  Either: (a) refactor the new uses to useSignal / useQuery per docs/architecture/state.md,\n` +
      `  or (b) intentionally raise the baseline via \`node scripts/check-state-baseline.mjs --update\`.\n`,
    );
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
