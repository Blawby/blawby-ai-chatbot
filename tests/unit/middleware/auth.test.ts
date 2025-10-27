import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';

// Mock external dependencies - HttpErrors is imported and used by the actual middleware

// Mock validation schema
vi.mock('../../../worker/schemas/validation.js', () => ({
  organizationMembershipSchema: {
    safeParse: vi.fn((data: any) => {
      if (data && typeof data.role === 'string' && ['owner', 'admin', 'attorney', 'paralegal'].includes(data.role)) {
        return { success: true, data };
      }
      return { 
        success: false, 
        error: { issues: [{ message: 'Invalid role' }] }
      };
    })
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import the actual middleware functions
import { 
  requireAuth, 
  optionalAuth, 
  requireOrganizationMember,
  requireOrgMember,
  requireOrgOwner,
  checkOrgAccess,
  type AuthenticatedUser,
  type AuthContext
} from '../../../worker/middleware/auth.js';

describe('Auth Middleware - Unit Tests', () => {
  let mockEnv: Env;
  let mockRequest: Request;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock database with prepared statement chain
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn()
    };
    
    // Mock environment
    mockEnv = {
      BLAWBY_API_URL: 'https://test-api.example.com/api',
      DB: mockDb,
      AI: {} as any,
      CHAT_SESSIONS: {} as any,
      RESEND_API_KEY: 'test-key',
      DOC_EVENTS: {} as any,
      PARALEGAL_TASKS: {} as any,
    } as Env;

    // Mock request
    mockRequest = new Request('https://example.com/api/test', {
      headers: {
        'Cookie': 'better-auth.session_token=test-session-token-123'
      }
    });
  });

  // Helper function to create mock authenticated user
  function createMockUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: true,
      details: null,
      ...overrides
    };
  }

  // Helper function to create mock auth context
  function createMockAuthContext(user: AuthenticatedUser, sessionToken: string = 'test-session-token-123'): AuthContext {
    return {
      user,
      sessionToken
    };
  }

  // Helper function to setup successful auth API responses
  function setupSuccessfulAuthResponses(user: AuthenticatedUser, details: Record<string, unknown> | null = null) {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ details })
      });
  }

  // Helper function to setup failed auth API responses
  function setupFailedAuthResponses(status: number = 401) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status
    });
  }

  describe('requireAuth', () => {
    it('should return auth context when valid session token is provided', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);

      const result = await requireAuth(mockRequest, mockEnv);

      expect(result).toEqual(createMockAuthContext(mockUser));
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.example.com/api/auth/get-session',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Cookie: 'better-auth.session_token=test-session-token-123',
            Accept: 'application/json'
          })
        })
      );
    });

    it('should throw error when no session token is provided', async () => {
      const requestWithoutToken = new Request('https://example.com/api/test');

      await expect(requireAuth(requestWithoutToken, mockEnv))
        .rejects.toThrow('Authentication required');
    });

    it('should throw error when session token is invalid', async () => {
      setupFailedAuthResponses(401);

      await expect(requireAuth(mockRequest, mockEnv))
        .rejects.toThrow('Authentication required');
    });

    it('should throw error when auth API returns no user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null })
      });

      await expect(requireAuth(mockRequest, mockEnv))
        .rejects.toThrow('Authentication required');
    });

    it('should include user details when available', async () => {
      const mockUser = createMockUser();
      const mockDetails = { phone: '555-1234', preferences: { theme: 'dark' } };
      setupSuccessfulAuthResponses(mockUser, mockDetails);

      const result = await requireAuth(mockRequest, mockEnv);

      expect(result.user.details).toEqual(mockDetails);
    });

    it('should handle user details fetch failure gracefully', async () => {
      const mockUser = createMockUser();
      
      // First call succeeds (session), second call fails (details)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: mockUser })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500
        });

      const result = await requireAuth(mockRequest, mockEnv);

      expect(result.user.details).toBeNull();
    });

    it('should throw error when BLAWBY_API_URL is not configured', async () => {
      const envWithoutApiUrl = { ...mockEnv, BLAWBY_API_URL: undefined };

      await expect(requireAuth(mockRequest, envWithoutApiUrl))
        .rejects.toThrow('BLAWBY_API_URL is not configured. This environment variable is required for authentication to work properly.');
    });
  });

  describe('optionalAuth', () => {
    it('should return null when authentication fails', async () => {
      setupFailedAuthResponses(401);

      const result = await optionalAuth(mockRequest, mockEnv);

      expect(result).toBeNull();
    });

    it('should return auth context when authentication succeeds', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);

      const result = await optionalAuth(mockRequest, mockEnv);

      expect(result).toEqual(createMockAuthContext(mockUser));
    });

    it('should return null when no session token is provided', async () => {
      const requestWithoutToken = new Request('https://example.com/api/test');

      const result = await optionalAuth(requestWithoutToken, mockEnv);

      expect(result).toBeNull();
    });

    it('should return null when auth API returns no user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null })
      });

      const result = await optionalAuth(mockRequest, mockEnv);

      expect(result).toBeNull();
    });
  });

  describe('requireOrganizationMember', () => {
    it('should validate organizationId parameter', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);

      await expect(requireOrganizationMember(mockRequest, mockEnv, '', 'owner'))
        .rejects.toThrow('Invalid or missing organizationId');
    });

    it('should check organization membership', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      
      // Mock database to return no membership
      mockDb.first.mockResolvedValue(null);

      await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'owner'))
        .rejects.toThrow('User is not a member of this organization');

      expect(mockDb.prepare).toHaveBeenCalledWith(`
      SELECT role FROM members 
      WHERE organization_id = ? AND user_id = ?
    `);
      expect(mockDb.bind).toHaveBeenCalledWith('org-123', 'user-123');
    });

    it('should enforce role requirements', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      
      // Mock database to return paralegal role
      mockDb.first.mockResolvedValue({ role: 'paralegal' });

      await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'attorney'))
        .rejects.toThrow('Insufficient permissions. Required role: attorney, user role: paralegal');
    });

    it('should return auth context with member role when successful', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      
      // Mock database to return admin role
      mockDb.first.mockResolvedValue({ role: 'admin' });

      const result = await requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'admin');

      expect(result).toEqual({
        ...createMockAuthContext(mockUser),
        memberRole: 'admin'
      });
    });

    it('should allow access when user role meets minimum requirement', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      
      // Mock database to return attorney role
      mockDb.first.mockResolvedValue({ role: 'attorney' });

      const result = await requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'paralegal');

      expect(result.memberRole).toBe('attorney');
    });

    it('should work without minimum role requirement', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      
      // Mock database to return any role
      mockDb.first.mockResolvedValue({ role: 'paralegal' });

      const result = await requireOrganizationMember(mockRequest, mockEnv, 'org-123');

      expect(result.memberRole).toBe('paralegal');
    });

    it('should handle invalid user role from database', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      
      // Mock database to return invalid role
      mockDb.first.mockResolvedValue({ role: 'invalid-role' });

      await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'paralegal'))
        .rejects.toThrow('User is not a member of this organization');
    });

    it('should handle database errors gracefully', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      
      // Mock database to throw error
      mockDb.first.mockRejectedValue(new Error('Database connection failed'));

      await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'owner'))
        .rejects.toThrow('Failed to verify organization membership');
    });
  });

  describe('requireOrgMember', () => {
    it('should delegate to requireOrganizationMember', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      mockDb.first.mockResolvedValue({ role: 'attorney' });

      const result = await requireOrgMember(mockRequest, mockEnv, 'org-123', 'attorney');

      expect(result).toEqual({
        ...createMockAuthContext(mockUser),
        memberRole: 'attorney'
      });
    });
  });

  describe('requireOrgOwner', () => {
    it('should call requireOrgMember with owner role', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      mockDb.first.mockResolvedValue({ role: 'owner' });

      const result = await requireOrgOwner(mockRequest, mockEnv, 'org-123');

      expect(result).toEqual({
        ...createMockAuthContext(mockUser),
        memberRole: 'owner'
      });
    });
  });

  describe('checkOrgAccess', () => {
    it('should return hasAccess: false when user is not a member', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      mockDb.first.mockResolvedValue(null);

      const result = await checkOrgAccess(mockRequest, mockEnv, 'org-123');

      expect(result).toEqual({ hasAccess: false });
    });

    it('should return hasAccess: true with member role when user is a member', async () => {
      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);
      mockDb.first.mockResolvedValue({ role: 'admin' });

      const result = await checkOrgAccess(mockRequest, mockEnv, 'org-123');

      expect(result).toEqual({
        hasAccess: true,
        memberRole: 'admin'
      });
    });

    it('should return hasAccess: false when authentication fails', async () => {
      setupFailedAuthResponses(401);

      const result = await checkOrgAccess(mockRequest, mockEnv, 'org-123');

      expect(result).toEqual({ hasAccess: false });
    });
  });

  describe('Role Hierarchy Validation', () => {
    it('should validate role hierarchy correctly', async () => {
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
        vi.clearAllMocks();
        
        const mockUser = createMockUser();
        setupSuccessfulAuthResponses(mockUser);
        mockDb.first.mockResolvedValue({ role: test.userRole });

        if (test.shouldPass) {
          const result = await requireOrganizationMember(mockRequest, mockEnv, 'org-123', test.requiredRole as any);
          expect(result.memberRole).toBe(test.userRole);
        } else {
          await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', test.requiredRole as any))
            .rejects.toThrow(`Insufficient permissions. Required role: ${test.requiredRole}, user role: ${test.userRole}`);
        }
      }
    });
  });

  describe('Environment Configuration', () => {
    it('should handle custom API URL configuration', async () => {
      const customEnv = {
        ...mockEnv,
        BLAWBY_API_URL: 'https://custom-api.example.com/api'
      };

      const mockUser = createMockUser();
      setupSuccessfulAuthResponses(mockUser);

      const result = await requireAuth(mockRequest, customEnv);

      expect(result).toEqual(createMockAuthContext(mockUser));
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/api/auth/get-session',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Cookie: 'better-auth.session_token=test-session-token-123',
            Accept: 'application/json'
          })
        })
      );
    });

    it('should throw error when BLAWBY_API_URL is not configured', async () => {
      const envWithoutApiUrl = {
        ...mockEnv,
        BLAWBY_API_URL: undefined
      };

      await expect(requireAuth(mockRequest, envWithoutApiUrl))
        .rejects.toThrow('BLAWBY_API_URL is not configured. This environment variable is required for authentication to work properly.');
    });
  });
});
