#!/usr/bin/env node
/**
 * Follow-up to migrate-heroicons-to-lucide: handles the 15 icon names the first
 * pass left unmapped. Their @heroicons imports were already stripped, so we walk
 * each file, detect remaining references, and merge the corresponding Lucide
 * names into the existing lucide-react import.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

const FALLBACK_MAP = {
  AcademicCapIcon: 'GraduationCap',
  ArchiveBoxIcon: 'Archive',
  ArrowUturnRightIcon: 'Redo2',
  ArrowsUpDownIcon: 'ArrowUpDown',
  BanknotesIcon: 'Banknote',
  BuildingOfficeIcon: 'Building2',
  BuildingStorefrontIcon: 'Store',
  ChevronUpDownIcon: 'ChevronsUpDown',
  CloudArrowUpIcon: 'CloudUpload',
  CodeBracketIcon: 'Code',
  DocumentCheckIcon: 'FileCheck2',
  MusicalNoteIcon: 'Music',
  NumberedListIcon: 'ListOrdered',
  PauseCircleIcon: 'CirclePause',
  ShieldExclamationIcon: 'ShieldAlert',
};

const LUCIDE_IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]\s*;?/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
      yield full;
    }
  }
}

function parseSpecifiers(block) {
  return block
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((spec) => {
      const m = spec.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
      if (!m) return null;
      return { source: m[1], alias: m[2] };
    })
    .filter(Boolean);
}

let touched = 0;

for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, 'utf8');
  const needed = new Map();
  for (const [hero, lucide] of Object.entries(FALLBACK_MAP)) {
    if (new RegExp(`\\b${hero}\\b`).test(src)) {
      needed.set(hero, lucide);
    }
  }
  if (needed.size === 0) continue;

  for (const [hero, lucide] of needed) {
    const re = new RegExp(`\\b${hero}\\b`, 'g');
    src = src.replace(re, lucide);
  }

  const existing = src.match(LUCIDE_IMPORT_RE);
  const lucideNames = [...needed.values()];
  if (existing) {
    const specs = parseSpecifiers(existing[1]);
    const present = new Set(specs.map((s) => s.alias ?? s.source));
    const additions = lucideNames.filter((n) => !present.has(n));
    if (additions.length) {
      const merged = [...specs.map((s) => (s.alias ? `${s.source} as ${s.alias}` : s.source)), ...additions];
      src = src.replace(LUCIDE_IMPORT_RE, `import { ${merged.join(', ')} } from 'lucide-react';`);
    }
  } else {
    const newImport = `import { ${lucideNames.join(', ')} } from 'lucide-react';\n`;
    const firstImport = src.match(/^(import[^\n]+\n)+/);
    if (firstImport) {
      src = src.replace(firstImport[0], firstImport[0] + newImport);
    } else {
      src = newImport + src;
    }
  }

  fs.writeFileSync(file, src, 'utf8');
  touched += 1;
}

console.log(`Patched ${touched} files for unmapped icons.`);
