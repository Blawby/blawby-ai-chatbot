/**
 * Vite plugin that enforces gzipped chunk-size budgets.
 *
 * Each output chunk is gzipped and compared against a budget keyed off
 * a substring of the chunk filename (`vendor`, `i18n`, `main`). Misses
 * fall back to the `main` budget. Violations log a warning locally and
 * throw in CI (process.env.CI truthy).
 *
 * Pulled out of vite.config.ts so it can be unit-tested in isolation.
 */

import zlib from 'zlib';
import type { Plugin } from 'vite';
import type { OutputBundle, OutputChunk, NormalizedOutputOptions } from 'rollup';

export const CHUNK_BUDGETS: Record<string, number> = {
  vendor: 80,
  i18n: 60,
  main: 180,
};

export interface BundleBudgetOptions {
  budgets?: Record<string, number>;
  /** When true, exceedances throw. Defaults to `process.env.CI` truthy. */
  failOnExceed?: boolean;
}

export interface BundleBudgetResult {
  violations: string[];
}

/** Pure budget evaluation — given a bundle, return the list of violation lines. */
export function evaluateBundleBudget(
  bundle: OutputBundle,
  budgets: Record<string, number> = CHUNK_BUDGETS,
): BundleBudgetResult {
  const violations: string[] = [];
  const fallback = budgets.main ?? Number.POSITIVE_INFINITY;
  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (chunk.type !== 'chunk') continue;
    const gzSize = zlib.gzipSync(Buffer.from((chunk as OutputChunk).code)).length;
    const gzKB = Math.round(gzSize / 1024);
    const label = Object.keys(budgets).find((k) => fileName.includes(k));
    const budget = label ? budgets[label] : fallback;
    if (gzKB > budget) {
      violations.push(`  ${fileName}: ${gzKB}KB gz (budget: ${budget}KB)`);
    }
  }
  return { violations };
}

export function bundleBudgetPlugin(options: BundleBudgetOptions = {}): Plugin {
  const failOnExceed = options.failOnExceed ?? Boolean(process.env.CI);
  const budgets = options.budgets ?? CHUNK_BUDGETS;
  return {
    name: 'bundle-budget',
    apply: 'build',
    generateBundle(_options: NormalizedOutputOptions, bundle: OutputBundle) {
      const { violations } = evaluateBundleBudget(bundle, budgets);
      if (violations.length === 0) return;
      const msg = `Bundle budget exceeded:\n${violations.join('\n')}`;
      if (failOnExceed) {
        throw new Error(msg);
      }
      console.warn(`\n⚠️ ${msg}\n`);
    },
  };
}
