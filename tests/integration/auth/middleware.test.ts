import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '@cloudflare/vitest-pool-workers/testing';
import { requireAuth, optionalAuth, requireOrganizationMember } from '../../../worker/middleware/auth.js';
import type { Env } from '../../../worker/types.js';

const ORG_ID = 'org-auth-integration';
const USER_ID = 'user-auth-integration';
const NOW = new Date().toISOString();

// Capture original fetch to restore in afterEach
const originalFetch = global.fetch;

async function seedOrganization() {
  await env.DB.prepare(`
    INSERT INTO organizations (
      id, name, slug, domain, config,
      subscription_tier, seats, is_personal,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    ORG_ID,
    'Auth Integration Org',
    'auth-integration',
    'auth-integration.example.com',
    JSON.stringify({}),
    'free',
    1,
    0,
    NOW,
    NOW
  ).run();
}

async function seedUser() {
  await env.DB.prepare(`
    INSERT INTO users (
      id, email, name, email_verified,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    USER_ID,
    'test@auth-integration.com',
    'Auth Test User',
    1,
    NOW,
    NOW
  ).run();
}

async function seedMembership(role: 'owner' | 'admin' | 'attorney' | 'paralegal' = 'owner') {
  await env.DB.prepare(`
    INSERT INTO members (
      id, organization_id, user_id, role,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(
    `member-${ORG_ID}-${USER_ID}`,
    ORG_ID,
    USER_ID,
    role,
    NOW
  ).run();
}

describe('Auth Middleware - Integration Tests', () => {
  let mockEnv: Env;
  let mockRequest: Request;

  beforeEach(async () => {
    // Clear database
    await env.DB.prepare('DELETE FROM members').run();
    await env.DB.prepare('DELETE FROM users').run();
    await env.DB.prepare('DELETE FROM organizations').run();

    // Seed test data
    await seedOrganization();
    await seedUser();
    await seedMembership('owner');

    // Mock environment
    mockEnv = {
      BLAWBY_API_URL: 'https://staging-api.blawby.com/api',
      DB: env.DB,
      AI: {} as any,
      CHAT_SESSIONS: {} as any,
      RESEND_API_KEY: 'test-key',
      DOC_EVENTS: {} as any,
      PARALEGAL_TASKS: {} as any,
    } as Env;

    // Mock request with valid session cookie
    mockRequest = new Request('https://example.com/api/test', {
      headers: {
        'Cookie': 'better-auth.session_token=valid-session-token'
      }
    });
  });

  afterEach(async () => {
    // Clean up database
    await env.DB.prepare('DELETE FROM members').run();
    await env.DB.prepare('DELETE FROM users').run();
    await env.DB.prepare('DELETE FROM organizations').run();
    
    // Restore original fetch to prevent test pollution
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  describe('requireAuth Integration', () => {
    it('should authenticate user with valid session', async () => {
      // Mock successful external API responses
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: USER_ID,
              email: 'test@auth-integration.com',
              name: 'Auth Test User',
              emailVerified: true,
              image: null
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            details: {
              phone: '+1234567890',
              dob: '1990-01-01',
              product_usage: ['personal_legal_issue']
            }
          })
        });

      global.fetch = mockFetch;

      const result = await requireAuth(mockRequest, mockEnv);

      expect(result.user.id).toBe(USER_ID);
      expect(result.user.email).toBe('test@auth-integration.com');
      expect(result.user.name).toBe('Auth Test User');
      expect(result.user.emailVerified).toBe(true);
      expect(result.sessionToken).toBe('valid-session-token');
      expect(result.user.details).toEqual({
        phone: '+1234567890',
        dob: '1990-01-01',
        product_usage: ['personal_legal_issue']
      });

      // Verify API calls were made
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://staging-api.blawby.com/api/auth/get-session',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Cookie': 'better-auth.session_token=valid-session-token',
            'Accept': 'application/json'
          })
        })
      );
    });

    it('should handle authentication failure', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      });

      global.fetch = mockFetch;

      await expect(requireAuth(mockRequest, mockEnv)).rejects.toThrow('Authentication required');
    });

    it('should handle user details fetch failure gracefully', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: USER_ID,
              email: 'test@auth-integration.com',
              name: 'Auth Test User',
              emailVerified: true
            }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal server error' })
        });

      global.fetch = mockFetch;

      const result = await requireAuth(mockRequest, mockEnv);

      expect(result.user.id).toBe(USER_ID);
      expect(result.user.details).toBeNull();
    });
  });

  describe('optionalAuth Integration', () => {
    it('should return null when authentication fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      });

      global.fetch = mockFetch;

      const result = await optionalAuth(mockRequest, mockEnv);

      expect(result).toBeNull();
    });

    it('should return auth context when authentication succeeds', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: USER_ID,
              email: 'test@auth-integration.com',
              name: 'Auth Test User',
              emailVerified: true
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ details: null })
        });

      global.fetch = mockFetch;

      const result = await optionalAuth(mockRequest, mockEnv);

      expect(result).not.toBeNull();
      expect(result!.user.id).toBe(USER_ID);
      expect(result!.sessionToken).toBe('valid-session-token');
    });
  });

  describe('requireOrganizationMember Integration', () => {
    beforeEach(async () => {
      // Mock successful authentication
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: USER_ID,
              email: 'test@auth-integration.com',
              name: 'Auth Test User',
              emailVerified: true
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ details: null })
        });

      global.fetch = mockFetch;
    });

    it('should validate organization membership with real database', async () => {
      const result = await requireOrganizationMember(mockRequest, mockEnv, ORG_ID, 'owner');

      expect(result.user.id).toBe(USER_ID);
      expect(result.memberRole).toBe('owner');
    });

    it('should throw error when user is not a member', async () => {
      // Remove membership
      await env.DB.prepare('DELETE FROM members WHERE organization_id = ? AND user_id = ?')
        .bind(ORG_ID, USER_ID).run();

      await expect(requireOrganizationMember(mockRequest, mockEnv, ORG_ID, 'owner'))
        .rejects.toThrow('User is not a member of this organization');
    });

    it('should enforce role requirements', async () => {
      // Change user role to paralegal
      await env.DB.prepare('UPDATE members SET role = ? WHERE organization_id = ? AND user_id = ?')
        .bind('paralegal', ORG_ID, USER_ID).run();

      await expect(requireOrganizationMember(mockRequest, mockEnv, ORG_ID, 'attorney'))
        .rejects.toThrow('Insufficient permissions. Required role: attorney, user role: paralegal');
    });

    it('should allow higher roles to access lower role requirements', async () => {
      // User is owner, should be able to access admin requirement
      const result = await requireOrganizationMember(mockRequest, mockEnv, ORG_ID, 'admin');

      expect(result.memberRole).toBe('owner');
    });

    it('should handle invalid organizationId', async () => {
      await expect(requireOrganizationMember(mockRequest, mockEnv, '', 'owner'))
        .rejects.toThrow('Invalid or missing organizationId');

      await expect(requireOrganizationMember(mockRequest, mockEnv, '   ', 'owner'))
        .rejects.toThrow('Invalid or missing organizationId');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error by using invalid SQL
      const invalidEnv = {
        ...mockEnv,
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockRejectedValue(new Error('Database connection failed'))
            })
          })
        }
      } as any;

      await expect(requireOrganizationMember(mockRequest, invalidEnv, ORG_ID))
        .rejects.toThrow('Failed to verify organization membership');
    });
  });

  describe('Role Hierarchy Integration', () => {
    it('should correctly validate all role combinations', async () => {
      const roleTests = [
        { userRole: 'paralegal', requiredRole: 'paralegal', shouldPass: true },
        { userRole: 'paralegal', requiredRole: 'attorney', shouldPass: false },
        { userRole: 'attorney', requiredRole: 'paralegal', shouldPass: true },
        { userRole: 'attorney', requiredRole: 'attorney', shouldPass: true },
        { userRole: 'attorney', requiredRole: 'admin', shouldPass: false },
        { userRole: 'admin', requiredRole: 'attorney', shouldPass: true },
        { userRole: 'admin', requiredRole: 'admin', shouldPass: true },
        { userRole: 'admin', requiredRole: 'owner', shouldPass: false },
        { userRole: 'owner', requiredRole: 'admin', shouldPass: true },
        { userRole: 'owner', requiredRole: 'owner', shouldPass: true }
      ];

      for (const test of roleTests) {
        // Mock successful authentication for each iteration
        const mockFetch = vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              user: {
                id: USER_ID,
                email: 'test@auth-integration.com',
                name: 'Auth Test User',
                emailVerified: true
              }
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ details: null })
          });

        global.fetch = mockFetch;

        // Update user role in database
        await env.DB.prepare('UPDATE members SET role = ? WHERE organization_id = ? AND user_id = ?')
          .bind(test.userRole, ORG_ID, USER_ID).run();

        if (test.shouldPass) {
          const result = await requireOrganizationMember(mockRequest, mockEnv, ORG_ID, test.requiredRole as any);
          expect(result.memberRole).toBe(test.userRole);
        } else {
          await expect(requireOrganizationMember(mockRequest, mockEnv, ORG_ID, test.requiredRole as any))
            .rejects.toThrow(`Insufficient permissions. Required role: ${test.requiredRole}, user role: ${test.userRole}`);
        }
      }
    });
  });
});
