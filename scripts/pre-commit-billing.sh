#!/bin/bash

set -e

echo "[pre-commit] Running billing feature checks..."

echo "[pre-commit] Running TypeScript compilation..."
if ! npm run type-check; then
  echo "[pre-commit] TypeScript errors found"
  exit 1
fi

echo "[pre-commit] Running ESLint..."
if ! npm run lint; then
  echo "[pre-commit] Lint errors found"
  exit 1
fi

echo "[pre-commit] Checking for unresolved TODOs..."
if rg --files-with-matches "TODO|FIXME" src/features/matters/components/billing/ src/features/matters/services/invoicesApi.ts >/dev/null; then
  echo "[pre-commit] Found TODOs or FIXMEs in billing files. Review before committing."
fi

echo "[pre-commit] Verifying UUID validation..."
if ! rg -q "UUID_REGEX" src/features/matters/components/billing/InvoiceBuilder.tsx; then
  echo "[pre-commit] Missing UUID validation in InvoiceBuilder.tsx"
  exit 1
fi

echo "[pre-commit] All billing checks passed."
