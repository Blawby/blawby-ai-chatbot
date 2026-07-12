import { describe, expect, it } from 'vitest';
import { AssistantActivityReportService } from '../../../../worker/services/practiceAssistant/activityReportService';
import type { Env } from '../../../../worker/types';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'action-1',
  conversation_id: 'conversation-1',
  status: 'executed',
  approval_summary_json: JSON.stringify({ title: 'Create follow-up task', description: 'Due tomorrow.' }),
  payload_json: JSON.stringify({ actionType: 'create_entity' }),
  created_at: '2026-07-12T10:00:00.000Z',
  executed_at: '2026-07-12T10:01:00.000Z',
  ...overrides,
});

const makeEnv = (rows: Array<Record<string, unknown>>) => ({
  DB: {
    prepare: () => ({
      bind: () => ({ all: async () => ({ results: rows }) }),
    }),
  },
} as unknown as Env);

describe('AssistantActivityReportService', () => {
  it('returns practice activity with deterministic executed-action estimates', async () => {
    const service = new AssistantActivityReportService(makeEnv([
      row(),
      row({ id: 'action-2', status: 'rejected', executed_at: null }),
    ]));

    const report = await service.get('practice-1');

    expect(report.items).toMatchObject([
      { id: 'action-1', status: 'executed', estimatedMinutesSaved: 10 },
      { id: 'action-2', status: 'rejected', estimatedMinutesSaved: 0 },
    ]);
    expect(report.meta).toMatchObject({
      estimatedMinutesSaved: 10,
      executedCount: 1,
      rejectedCount: 1,
    });
  });

  it('fast fails when an action record violates the stored contract', async () => {
    const service = new AssistantActivityReportService(makeEnv([
      row({ approval_summary_json: JSON.stringify({ description: 'Missing title' }) }),
    ]));

    await expect(service.get('practice-1')).rejects.toThrow('Invalid title');
  });
});
