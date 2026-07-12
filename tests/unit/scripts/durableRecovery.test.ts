import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('durable recovery contract', () => {
  it('keeps customer-authored report schedules and search pins out of rebuildable KV', () => {
    const schedules = source('worker/services/ReportScheduleService.ts');
    const search = source('worker/routes/search.ts');
    const migration = source('worker/migrations/20260712_add_report_schedules.sql');

    expect(schedules).toContain('this.env.DB.prepare');
    expect(schedules).not.toContain('CHAT_SESSIONS');
    expect(search).toContain('FROM search_pins');
    expect(search).toContain('INSERT INTO search_pins');
    expect(search).not.toContain('search-pin:');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS report_schedules');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS search_pins');
  });

  it('applies additive D1 migrations before staging and production Worker deploys', () => {
    const staging = source('.github/workflows/deploy.yml');
    const production = source('.github/workflows/launch-production.yml');

    const stagingMigration = staging.indexOf('wrangler d1 migrations apply DB --env staging');
    const productionMigration = production.indexOf('wrangler d1 migrations apply DB --env production');
    expect(stagingMigration).toBeGreaterThan(0);
    expect(staging.indexOf('wrangler deploy --env staging', stagingMigration)).toBeGreaterThan(stagingMigration);
    expect(productionMigration).toBeGreaterThan(0);
    expect(production.indexOf('wrangler deploy --env production', productionMigration)).toBeGreaterThan(
      productionMigration,
    );
  });

  it('documents durable and rebuildable ownership plus explicit provider gates', () => {
    const runbook = source('docs/operations/durable-recovery.md');

    for (const required of [
      'Railway PostgreSQL PITR',
      'D1 Time Travel',
      'bucket-lock',
      'Recovery point objective (RPO)',
      'Recovery time objective (RTO)',
      'Until that artifact exists',
    ]) {
      expect(runbook).toContain(required);
    }
  });
});
