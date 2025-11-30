import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extractOrganizationContext, withOrganizationContext } from '../../../worker/middleware/organizationContext.js';
import type { Env } from '../../../worker/types.js';
import type { AuthContext } from '../../../worker/middleware/auth.js';
import { SessionService } from '../../../worker/services/SessionService.js';
import { optionalAuth } from '../../../worker/middleware/auth.js';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// Mock environment
const mockEnv: Env = {
  DB: {} as D1Database,
  CHAT_SESSIONS: {} as KVNamespace,
  RESEND_API_KEY: 'test-key',
} as Env;

// Mock SessionService
vi.mock('../../../worker/services/SessionService.js', () => ({
  SessionService: {
    getSessionTokenFromCookie: vi.fn(),
    resolveSession: vi.fn(),
  }
}));

// Mock auth middleware
vi.mock('../../../worker/middleware/auth.js', () => ({
  optionalAuth: vi.fn(),
}));

describe('OrganizationContext Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractOrganizationContext', () => {
    it('should extract organization from URL parameter', async () => {
      const request = new Request('https://example.com/api/test?organizationId=test-org');
      
      const context = await extractOrganizationContext(request, mockEnv, {
        requireOrganization: true,
        defaultOrganizationId: 'default-org'
      });

      expect(context.organizationId).toBe('test-org');
      expect(context.source).toBe('url');
      expect(context.isAuthenticated).toBe(false);
    });

    it('should use default organization when no URL parameter', async () => {
      const request = new Request('https://example.com/api/test');
      
      const context = await extractOrganizationContext(request, mockEnv, {
        requireOrganization: true,
        defaultOrganizationId: 'default-org'
      });

      expect(context.organizationId).toBe('default-org');
      expect(context.source).toBe('default');
      expect(context.isAuthenticated).toBe(false);
    });

    it('should throw error when organization is required but not found', async () => {
      const request = new Request('https://example.com/api/test');
      
      await expect(
        extractOrganizationContext(request, mockEnv, {
          requireOrganization: true,
          defaultOrganizationId: undefined
        })
      ).rejects.toThrow('Organization context is required but could not be determined');
    });

    it('should use default organization when none provided and not required', async () => {
      const request = new Request('https://example.com/api/test');
      
      const context = await extractOrganizationContext(request, mockEnv, {
        requireOrganization: false,
        defaultOrganizationId: 'custom-default'
      });

      expect(context.organizationId).toBe('custom-default');
      expect(context.source).toBe('default');
    });

    it('should return empty organization when not required and no default provided', async () => {
      const request = new Request('https://example.com/api/test');
      
      const context = await extractOrganizationContext(request, mockEnv, {
        requireOrganization: false,
        defaultOrganizationId: undefined
      });

      expect(context.organizationId).toBe('');
      expect(context.source).toBe('default');
    });

    // Authenticated user tests
    it('should extract organization from authenticated user session', async () => {
      const mockAuthContext: AuthContext = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        },
        session: {
          id: 'session-123',
          expiresAt: new Date(Date.now() + 3600000)
        },
        token: 'test-token'
      };

      const mockSessionResolution = {
        session: {
          id: 'session-456',
          organizationId: 'org-from-session',
          state: 'active' as const,
          statusReason: null,
          retentionHorizonDays: 30,
          isHold: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          closedAt: null,
          tokenHash: 'hashed-token'
        },
        sessionToken: 'session-token-123',
        isNew: false
      };

      // Mock authenticated request
      vi.mocked(optionalAuth).mockResolvedValue(mockAuthContext);
      vi.mocked(SessionService.getSessionTokenFromCookie).mockReturnValue('session-token-123');
      vi.mocked(SessionService.resolveSession).mockResolvedValue(mockSessionResolution);

      const request = new Request('https://example.com/api/test');
      
      const context = await extractOrganizationContext(request, mockEnv, {
        requireOrganization: true,
        defaultOrganizationId: 'default-org'
      });

      expect(context.organizationId).toBe('org-from-session');
      expect(context.source).toBe('session');
      expect(context.isAuthenticated).toBe(true);
      expect(context.userId).toBe('user-123');
      expect(context.sessionId).toBe('session-456');
    });

    it('should handle authenticated user without organizationId when requireOrganization is true', async () => {
      const mockAuthContext: AuthContext = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        },
        session: {
          id: 'session-123',
          expiresAt: new Date(Date.now() + 3600000)
        },
        token: 'test-token'
      };

      // Mock authenticated request but no session token
      vi.mocked(optionalAuth).mockResolvedValue(mockAuthContext);
      vi.mocked(SessionService.getSessionTokenFromCookie).mockReturnValue(null);

      const request = new Request('https://example.com/api/test');
      
      await expect(
        extractOrganizationContext(request, mockEnv, {
          requireOrganization: true,
          defaultOrganizationId: undefined
        })
      ).rejects.toThrow('Organization context is required but could not be determined');
    });

    it('should handle authenticated user without organizationId when requireOrganization is false', async () => {
      const mockAuthContext: AuthContext = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        },
        session: {
          id: 'session-123',
          expiresAt: new Date(Date.now() + 3600000)
        },
        token: 'test-token'
      };

      // Mock authenticated request but no session token
      vi.mocked(optionalAuth).mockResolvedValue(mockAuthContext);
      vi.mocked(SessionService.getSessionTokenFromCookie).mockReturnValue(null);

      const request = new Request('https://example.com/api/test');
      
      const context = await extractOrganizationContext(request, mockEnv, {
        requireOrganization: false,
        defaultOrganizationId: undefined
      });

      expect(context.organizationId).toBe('');
      expect(context.source).toBe('default');
      expect(context.isAuthenticated).toBe(false);
      expect(context.userId).toBe(undefined);
    });

    it('should prioritize session organization over URL parameter for authenticated users', async () => {
      const mockAuthContext: AuthContext = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        },
        session: {
          id: 'session-123',
          expiresAt: new Date(Date.now() + 3600000)
        },
        token: 'test-token'
      };

      const mockSessionResolution = {
        session: {
          id: 'session-456',
          organizationId: 'org-from-session',
          state: 'active' as const,
          statusReason: null,
          retentionHorizonDays: 30,
          isHold: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          closedAt: null,
          tokenHash: 'hashed-token'
        },
        sessionToken: 'session-token-123',
        isNew: false
      };

      // Mock authenticated request with both session and URL param
      vi.mocked(optionalAuth).mockResolvedValue(mockAuthContext);
      vi.mocked(SessionService.getSessionTokenFromCookie).mockReturnValue('session-token-123');
      vi.mocked(SessionService.resolveSession).mockResolvedValue(mockSessionResolution);

      const request = new Request('https://example.com/api/test?organizationId=org-from-url');
      
      const context = await extractOrganizationContext(request, mockEnv, {
        requireOrganization: true,
        defaultOrganizationId: 'default-org'
      });

      // Session should take precedence over URL parameter
      expect(context.organizationId).toBe('org-from-session');
      expect(context.source).toBe('session');
      expect(context.isAuthenticated).toBe(true);
      expect(context.userId).toBe('user-123');
      expect(context.sessionId).toBe('session-456');
    });
  });

  describe('withOrganizationContext', () => {
    it('should attach organization context to request', async () => {
      const request = new Request('https://example.com/api/test?organizationId=test-org');
      
      const requestWithContext = await withOrganizationContext(request, mockEnv, {
        requireOrganization: true,
        defaultOrganizationId: 'default-org'
      });

      expect(requestWithContext.organizationContext).toBeDefined();
      expect(requestWithContext.organizationContext?.organizationId).toBe('org-from-session');
      expect(requestWithContext.organizationContext?.source).toBe('session');
    });
  });
});
