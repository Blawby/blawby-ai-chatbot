import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAuthSessionPayload, requirePracticeMember } from '../../../worker/middleware/auth';
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
          email: 'owner@example.com',
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
    });

    expect(payload.activeOrganizationId).toBe('practice-1');
    expect(payload.activeMembershipRole).toBe('owner');
  });

  it('parses active organization id from root-level Better Auth payload fields', () => {
    const payload = parseAuthSessionPayload({
      data: {
        user: {
          id: 'user-1',
          email: 'owner@example.com',
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
              email: 'owner@example.com',
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

  it('matches remote practice membership when backend member payload uses nested user.id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://api.example.test/api/auth/get-session') {
        return new Response(JSON.stringify({
          data: {
            user: {
              id: 'user-nested',
              email: 'owner@example.com',
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

      if (url === 'https://api.example.test/api/practice/practice-nested') {
        return new Response(JSON.stringify({
          practice: {
            members: [
              {
                id: 'membership-1',
                role: 'owner',
                user: {
                  id: 'user-nested',
                  email: 'owner@example.com',
                },
              },
            ],
          },
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
      'https://api.example.test/api/practice/practice-nested',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });
});
