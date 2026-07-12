import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAuthSessionPayload, requireAuth, requirePracticeMember } from '../../../worker/middleware/auth';
import type { Env } from '../../../worker/types';

describe('auth middleware membership resolution', () => {
  const env = {
    BACKEND_API_URL: 'https://api.example.test',
  } as Env;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses active membership role from Better Auth routing claims', () => {
    const payload = parseAuthSessionPayload({
      data: {
        user: {
          id: 'user-1',
          email: 'owner@test-blawby.com',
          name: 'Owner User',
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
          activeOrganizationId: 'practice-1',
        },
        routing: {
          active_membership_role: ' OwNeR ',
        },
      },
    });

    expect(payload.activeOrganizationId).toBe('practice-1');
    expect(payload.activeMembershipRole).toBe('owner');
  });

  it('parses active organization id from root-level Better Auth payload fields', () => {
    const payload = parseAuthSessionPayload({
      data: {
        user: {
          id: 'user-1',
          email: 'owner@test-blawby.com',
          name: 'Owner User',
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
        },
      },
      activeOrganizationId: 'practice-1',
      active_membership_role: 'owner',
    });

    expect(payload.activeOrganizationId).toBe('practice-1');
    expect(payload.activeMembershipRole).toBe('owner');
  });

  it('uses active org membership claims without fetching remote practice membership again', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://api.example.test/api/auth/get-session') {
        return new Response(JSON.stringify({
          data: {
            user: {
              id: 'user-1',
              email: 'owner@test-blawby.com',
              name: 'Owner User',
              emailVerified: true,
            },
            session: {
              id: 'session-1',
              expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
              activeOrganizationId: 'practice-1',
            },
            routing: {
              active_membership_role: 'owner',
            },
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const request = new Request('https://worker.example.test/api/conversations/conv-1?practiceId=practice-1', {
      method: 'PATCH',
      headers: {
        Cookie: 'better-auth.session_token=session-1',
      },
    });

    const result = await requirePracticeMember(request, env, 'practice-1', 'paralegal');

    expect(result.memberRole).toBe('owner');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.test/api/auth/get-session',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('fetches active member role from Better Auth organization endpoint when session role is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://api.example.test/api/auth/get-session') {
        return new Response(JSON.stringify({
          data: {
            user: {
              id: 'user-nested',
              email: 'owner@test-blawby.com',
              name: 'Owner User',
              emailVerified: true,
            },
            session: {
              id: 'session-nested',
              expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
            },
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.example.test/api/auth/organization/get-active-member-role?organizationId=practice-nested') {
        return new Response(JSON.stringify({
          role: 'owner',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const request = new Request('https://worker.example.test/api/conversations/conv-1?practiceId=practice-nested', {
      method: 'PATCH',
      headers: {
        Cookie: 'better-auth.session_token=session-nested',
      },
    });

    const result = await requirePracticeMember(request, env, 'practice-nested', 'paralegal');

    expect(result.memberRole).toBe('owner');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/api/auth/organization/get-active-member-role?organizationId=practice-nested',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it.each([
    'https://worker.example.test/api/reports/practice-b/revenue',
    'https://worker.example.test/api/activity?practiceId=practice-b',
  ])('does not let an active Practice A session authorize Practice B identifiers: %s', async (url) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const requestUrl = String(input);
      if (requestUrl === 'https://api.example.test/api/auth/get-session') {
        return Response.json({
          data: {
            user: {
              id: 'user-isolated',
              email: 'owner@test-blawby.com',
              name: 'Owner',
              emailVerified: true,
            },
            session: {
              id: 'session-isolated',
              expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
              activeOrganizationId: 'practice-a',
            },
            routing: { active_membership_role: 'owner' },
          },
        });
      }
      if (requestUrl.includes('organizationId=practice-b')) {
        return Response.json({ message: 'not a member' }, { status: 403 });
      }
      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    const request = new Request(url, {
      method: url.includes('/activity') ? 'POST' : 'GET',
      headers: {
        Cookie: `better-auth.session_token=${crypto.randomUUID()}`,
        'Content-Type': 'application/json',
      },
      body: url.includes('/activity') ? JSON.stringify({ practiceId: 'practice-b' }) : undefined,
    });

    await expect(requirePracticeMember(request, env, 'practice-b')).rejects.toMatchObject({ status: 403 });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('organizationId=practice-b'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('observes backend session revocation on the next request', async () => {
    let validationCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.example.test/api/auth/get-session');
      validationCount += 1;
      if (validationCount === 1) {
        return Response.json({
          data: {
            user: {
              id: 'user-revoked',
              email: 'client@test-blawby.com',
              name: 'Client',
              emailVerified: true,
            },
            session: {
              id: 'session-revoked',
              expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
            },
          },
        });
      }
      return Response.json({ error: 'revoked' }, { status: 401, statusText: 'Unauthorized' });
    });

    const request = new Request('https://worker.example.test/api/conversations', {
      headers: { Cookie: 'better-auth.session_token=revoked-session' },
    });

    await expect(requireAuth(request, env)).resolves.toMatchObject({ user: { id: 'user-revoked' } });
    await expect(requireAuth(request, env)).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
