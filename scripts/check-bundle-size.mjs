#!/usr/bin/env node
// Checks gzip sizes of dist chunks against budgets. Exit 1 on violation.
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';

const DIST = 'dist/assets';
const BUDGETS = {
  vendor: 80 * 1024,  // 80KB gz
  main:   180 * 1024, // 180KB gz
  total:  300 * 1024, // 300KB gz total JS first-load
};

function gzSize(filePath) {
  return gzipSync(readFileSync(filePath), { level: 9 }).length;
}

let failed = false;
let totalJs = 0;

const files = readdirSync(DIST).filter(f => f.endsWith('.js'));

for (const file of files) {
  const gz = gzSize(join(DIST, file));
  totalJs += gz;
  const kb = (gz / 1024).toFixed(1);

  if (file.startsWith('vendor') && gz > BUDGETS.vendor) {
    console.error(`❌ vendor chunk ${file}: ${kb}KB gz > ${BUDGETS.vendor / 1024}KB budget`);
    failed = true;
  } else if (file.startsWith('index') && gz > BUDGETS.main) {
    console.error(`❌ main chunk ${file}: ${kb}KB gz > ${BUDGETS.main / 1024}KB budget`);
    failed = true;
  }
}

const totalKb = (totalJs / 1024).toFixed(1);
if (totalJs > BUDGETS.total) {
  console.error(`❌ Total JS: ${totalKb}KB gz > ${BUDGETS.total / 1024}KB budget`);
  failed = true;
} else {
  console.log(`✅ Total JS: ${totalKb}KB gz (budget: ${BUDGETS.total / 1024}KB)`);
}

if (failed) process.exit(1);
