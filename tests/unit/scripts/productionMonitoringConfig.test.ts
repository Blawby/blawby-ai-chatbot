import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('production monitoring configuration', () => {
  it('uses bounded native checks and a two-failure repository notification threshold', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/production-health.yml'), 'utf8');

    expect(workflow).toContain("cron: '*/15 * * * *'");
    expect(workflow).toContain('timeout-minutes: 10');
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).toContain("previous?.conclusion !== 'failure'");
    expect(workflow).toContain('[production monitor] Production origin health failure');
    expect(workflow).toContain("state_reason: 'completed'");
    expect(workflow).not.toMatch(/datadog|new relic|sentry|pagerduty/i);
  });

  it('documents every launch incident path and backend ownership boundary', () => {
    const runbook = readFileSync(resolve(root, 'docs/operations/incident-response.md'), 'utf8');

    for (const heading of [
      'Auth outage',
      'Backend outage',
      'AI outage',
      'Stripe or webhook failure',
      'Queue or scheduled-job failure',
      'Bad frontend release',
      'Bad Worker release',
      'Migration failure',
    ]) {
      expect(runbook).toContain(`### ${heading}`);
    }
    expect(runbook).toContain('require a human backend operator');
    expect(runbook).toContain('Two consecutive failed workflows');
  });
});
