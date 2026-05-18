#!/usr/bin/env node
/**
 * Bundle-stats baseline check.
 *
 * Walks `dist/assets/*.js`, gzip-sizes each chunk, and groups by stable
 * label (`vendor`, `i18n`, `markdown`, `stripe`, `prerenderEntry`, etc.
 * — derived from the leading filename segment). Compares the per-label
 * total gzip size against `scripts/bundle-baseline.json`.
 *
 * Run after `npm run build`. Use `--update` to record the current
 * snapshot as the new baseline.
 *
 * Why label-grouping rather than per-file? Vite emits hashed chunk
 * names that change across builds. Per-file baselines would be noise.
 * Per-label totals are stable across hash churn but still surface
 * regressions when a label's total grows.
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const baselinePath = resolve(repoRoot, 'scripts/bundle-baseline.json');
const distAssets = resolve(repoRoot, 'dist/assets');

// Per-label budget in KB gzipped. If a label's total exceeds the
// baseline by more than the global tolerance %, fail.
const TOLERANCE_PERCENT = 10;

const labelOf = (file) => {
  // Filename pattern: `<name>-<hash>.js` (Vite, hash is base64url-ish, 8 chars).
  // The hash itself can include `-` and `_`, so anchor on the last dash that
  // separates a hash-shaped suffix and strip everything from there.
  const name = basename(file, '.js');
  const m = name.match(/^(.+?)-[A-Za-z0-9_-]{6,}$/);
  return m ? m[1] : name;
};

const gzipKB = (buf) => Math.round(zlib.gzipSync(buf).length / 1024);

const collectStats = async () => {
  let entries;
  try {
    entries = await readdir(distAssets);
  } catch {
    console.error(`✖ ${distAssets} not found. Run \`npm run build\` first.`);
    process.exit(2);
  }
  const labelTotals = new Map();
  for (const entry of entries) {
    if (!entry.endsWith('.js')) continue;
    const path = resolve(distAssets, entry);
    const stats = await stat(path);
    if (!stats.isFile()) continue;
    const buf = await readFile(path);
    const label = labelOf(entry);
    const gz = gzipKB(buf);
    labelTotals.set(label, (labelTotals.get(label) ?? 0) + gz);
  }
  const result = {};
  for (const [label, kb] of [...labelTotals.entries()].sort()) {
    result[label] = kb;
  }
  return result;
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
  const current = await collectStats();
  const baseline = await loadBaseline();

  if (update || baseline === null) {
    const record = {
      capturedAt: new Date().toISOString().slice(0, 10),
      tolerancePercent: TOLERANCE_PERCENT,
      labels: current,
    };
    await writeFile(baselinePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(`✓ Bundle baseline updated:`);
    for (const [label, kb] of Object.entries(current)) {
      console.log(`    ${label}: ${kb}KB gz`);
    }
    return;
  }

  const tolerance = baseline.tolerancePercent ?? TOLERANCE_PERCENT;
  const violations = [];
  console.log(`Bundle stats (gz KB, baseline +${tolerance}% tolerance):`);
  for (const [label, kb] of Object.entries(current)) {
    const baseKb = baseline.labels?.[label];
    if (baseKb === undefined) {
      // New label — note but don't fail. Run with --update to record.
      console.log(`    ${label}: ${kb}KB (new — record baseline)`);
      continue;
    }
    const allowedKb = Math.max(baseKb + 5, Math.ceil(baseKb * (1 + tolerance / 100)));
    const flag = kb > allowedKb ? ' ✖' : '';
    console.log(`    ${label}: ${kb}KB (was ${baseKb}KB, allowed ${allowedKb}KB)${flag}`);
    if (kb > allowedKb) violations.push({ label, kb, baseKb, allowedKb });
  }

  if (violations.length > 0) {
    console.error(
      `\n✖ Bundle size regressed for ${violations.length} label(s).\n` +
      `  Either reduce the size, or run \`node scripts/check-bundle-baseline.mjs --update\`\n` +
      `  after a deliberate increase to record the new baseline.\n`,
    );
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
