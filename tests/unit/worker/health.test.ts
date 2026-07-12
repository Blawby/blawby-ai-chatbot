import { describe, expect, it } from 'vitest';
import { handleHealth } from '../../../worker/routes/health.js';
import type { Env } from '../../../worker/types.js';

describe('Worker health', () => {
  it('returns safe environment and release identity', async () => {
    const env = {
      NODE_ENV: 'production',
      CF_VERSION_METADATA: {
        id: 'worker-version-id',
        tag: 'frontend-commit',
        timestamp: '2026-07-12T00:00:00Z',
      },
      CF_AIG_TOKEN: 'must-not-be-returned',
    } as Env;

    const response = await handleHealth(new Request('https://ai.blawby.com/api/health'), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        status: 'ok',
        environment: 'production',
        release: {
          commit: 'frontend-commit',
          workerVersionId: 'worker-version-id',
        },
      },
    });
  });

  it('uses explicit unknown markers when local version metadata is unavailable', async () => {
    const response = await handleHealth(new Request('http://localhost/api/health'), {} as Env);

    expect(await response.json()).toMatchObject({
      data: {
        environment: 'unknown',
        release: { commit: 'unknown', workerVersionId: 'unknown' },
      },
    });
  });
});
