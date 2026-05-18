#!/usr/bin/env node
// Checks gzip sizes of dist chunks against budgets. Exit 1 on violation.
//
// "First-load" = the entry script + every chunk modulepreloaded by the
// generated dist/index.html. Lazy-loaded route chunks (matters, intakes,
// settings, etc.) are reported separately and do NOT count toward the
// first-load budget — they're paid for at navigation time, not on cold start.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const DIST = 'dist/assets';
const HTML = 'dist/index.html';
const BUDGETS = {
  vendor: 80 * 1024,  // 80KB gz
  main:   180 * 1024, // 180KB gz
  total:  300 * 1024, // 300KB gz first-load JS
};

const gzSize = (filePath) => gzipSync(readFileSync(filePath), { level: 9 }).length;

// Parse the prerendered HTML for first-load JS — the <script type="module">
// entry plus every <link rel="modulepreload"> chunk vite emits. This is the
// JS browsers download before idle.
const html = readFileSync(HTML, 'utf8');
const firstLoadAssets = new Set();
for (const re of [
  /<script[^>]+src="\/assets\/([^"]+\.js)"/g,
  /<link[^>]+rel="modulepreload"[^>]+href="\/assets\/([^"]+\.js)"/g,
]) {
  for (const match of html.matchAll(re)) firstLoadAssets.add(match[1]);
}

if (firstLoadAssets.size === 0) {
  console.error('❌ Could not find any first-load chunks in dist/index.html — was the build run?');
  process.exit(1);
}

const allFiles = readdirSync(DIST).filter((f) => f.endsWith('.js'));
let failed = false;
let firstLoadTotal = 0;
let lazyTotal = 0;

console.log('First-load chunks:');
for (const file of allFiles) {
  const gz = gzSize(join(DIST, file));
  const kb = (gz / 1024).toFixed(1);
  if (firstLoadAssets.has(file)) {
    firstLoadTotal += gz;
    console.log(`  ${file}: ${kb}KB gz`);
    if (file.startsWith('vendor') && gz > BUDGETS.vendor) {
      console.error(`❌ vendor chunk ${file}: ${kb}KB gz > ${BUDGETS.vendor / 1024}KB budget`);
      failed = true;
    } else if (file.startsWith('index') && gz > BUDGETS.main) {
      console.error(`❌ main chunk ${file}: ${kb}KB gz > ${BUDGETS.main / 1024}KB budget`);
      failed = true;
    }
  } else {
    lazyTotal += gz;
  }
}

const firstLoadKb = (firstLoadTotal / 1024).toFixed(1);
const lazyKb = (lazyTotal / 1024).toFixed(1);
console.log(`Lazy-loaded chunks (not in first-load): ${lazyKb}KB gz across ${allFiles.length - firstLoadAssets.size} files`);

if (firstLoadTotal > BUDGETS.total) {
  console.error(`❌ First-load JS: ${firstLoadKb}KB gz > ${BUDGETS.total / 1024}KB budget`);
  failed = true;
} else {
  console.log(`✅ First-load JS: ${firstLoadKb}KB gz (budget: ${BUDGETS.total / 1024}KB)`);
}

if (failed) process.exit(1);
