import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appendPracticeSkillPrompt,
  fetchAuthenticatedPracticeSkillPrompt,
  fetchPublicPracticeSkillPrompt,
} from '../../../../worker/services/practiceSkills';
import type { Env } from '../../../../worker/types';

const env = { BACKEND_API_URL: 'https://staging-api.blawby.com/' } as Env;
const request = new Request('https://dev.blawby.com/api/ai/chat', {
  headers: { Cookie: 'better-auth.session_token=opaque' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('practice skill prompt contract', () => {
  it('loads the authenticated practice contract and forwards session authority', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          enabled_skills: ['matter_management'],
          prompt_contribution: 'Matter management is enabled.',
          available_skills: [],
          effective_scopes: ['matters:read'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAuthenticatedPracticeSkillPrompt(env, request, 'practice id');

    expect(result.promptContribution).toBe('Matter management is enabled.');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging-api.blawby.com/api/practice/practice%20id/skills',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Cookie')).toBe('better-auth.session_token=opaque');
  });

  it('uses the public slug endpoint for client-facing chat', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          enabled_skills: ['client_intake'],
          prompt_contribution: 'Client intake assistance is enabled.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchPublicPracticeSkillPrompt(env, request, 'example law');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging-api.blawby.com/api/practice/details/example%20law/skills',
      expect.any(Object),
    );
  });

  it('fast-fails malformed or missing prompt context instead of hiding it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ enabled_skills: ['billing'], prompt_contribution: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(fetchPublicPracticeSkillPrompt(env, request, 'example-law')).rejects.toThrow(
      'omitted prompt context',
    );
  });

  it('appends structured skill context without a free-text override channel', () => {
    expect(appendPracticeSkillPrompt('Base rules', 'Client intake assistance is enabled.')).toBe(
      'Base rules\n\nPRACTICE_SKILLS:\nClient intake assistance is enabled.',
    );
    expect(appendPracticeSkillPrompt('Base rules', '')).toBe('Base rules');
  });
});
