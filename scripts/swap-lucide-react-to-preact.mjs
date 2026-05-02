#!/usr/bin/env node
// Swap every `from 'lucide-react'` import to `from 'lucide-preact'` across src/.
// Preact-native build avoids React<>Preact compat issues in jsdom (QName errors).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');

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

let touched = 0;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes("'lucide-react'") && !src.includes('"lucide-react"')) continue;
  const next = src
    .replace(/from\s+'lucide-react'/g, "from 'lucide-preact'")
    .replace(/from\s+"lucide-react"/g, 'from "lucide-preact"');
  fs.writeFileSync(file, next, 'utf8');
  touched += 1;
}
console.log(`Swapped lucide-react → lucide-preact in ${touched} files.`);
