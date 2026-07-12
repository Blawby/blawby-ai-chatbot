import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('launch dependency security baseline', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
  ) as { dependencies: Record<string, string>; overrides: Record<string, string> };

  it('keeps the Better Auth client packages on the remediated stable line', () => {
    expect(packageJson.dependencies['better-auth']).toBe('^1.6.23');
    expect(packageJson.dependencies['@better-auth/oauth-provider']).toBe('^1.6.23');
    expect(packageJson.dependencies['@better-auth/stripe']).toBe('^1.6.23');
  });

  it('keeps direct sanitization and query-string fixes pinned', () => {
    expect(packageJson.dependencies.dompurify).toBe('^3.4.12');
    expect(packageJson.dependencies.lodash).toBe('4.18.1');
    expect(packageJson.overrides.qs).toBe('^6.15.1');
  });
});
