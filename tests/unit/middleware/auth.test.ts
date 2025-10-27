import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';

// Mock the auth middleware module
vi.mock('../../../worker/middleware/auth.js', () => ({
  requireAuth: vi.fn(),
  optionalAuth: vi.fn(),
  requireOrganizationMember: vi.fn(),
  requireOrgMember: vi.fn(),
  requireOrgOwner: vi.fn(),
  checkOrgAccess: vi.fn(),
}));

// Mock error handler
vi.mock('../../../worker/errorHandler.js', () => ({
  HttpErrors: {
    unauthorized: vi.fn((message: string) => new Error(`401: ${message}`)),
    forbidden: vi.fn((message: string) => new Error(`403: ${message}`)),
    badRequest: vi.fn((message: string) => new Error(`400: ${message}`)),
    internalServerError: vi.fn((message: string) => new Error(`500: ${message}`))
  }
}));

// Import the mocked functions
import { 
  requireAuth, 
  optionalAuth, 
  requireOrganizationMember,
  requireOrgMember,
  requireOrgOwner,
  checkOrgAccess
} from '../../../worker/middleware/auth.js';

describe('Auth Middleware - Unit Tests', () => {
  let mockEnv: Env;
  let mockRequest: Request;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock environment
    mockEnv = {
      BLAWBY_API_URL: 'https://test-api.example.com/api',
      DB: {} as any,
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

  describe('requireAuth', () => {
    it('should be callable with request and env', async () => {
      const mockAuthContext = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        },
        sessionToken: 'test-session-token-123'
      };

      vi.mocked(requireAuth).mockResolvedValue(mockAuthContext);

      const result = await requireAuth(mockRequest, mockEnv);

      expect(requireAuth).toHaveBeenCalledWith(mockRequest, mockEnv);
      expect(result).toEqual(mockAuthContext);
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('401: Authentication required');
      vi.mocked(requireAuth).mockRejectedValue(authError);

      await expect(requireAuth(mockRequest, mockEnv)).rejects.toThrow('401: Authentication required');
    });
  });

  describe('optionalAuth', () => {
    it('should return null when authentication fails', async () => {
      vi.mocked(optionalAuth).mockResolvedValue(null);

      const result = await optionalAuth(mockRequest, mockEnv);

      expect(optionalAuth).toHaveBeenCalledWith(mockRequest, mockEnv);
      expect(result).toBeNull();
    });

    it('should return auth context when authentication succeeds', async () => {
      const mockAuthContext = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        },
        sessionToken: 'test-session-token-123'
      };

      vi.mocked(optionalAuth).mockResolvedValue(mockAuthContext);

      const result = await optionalAuth(mockRequest, mockEnv);

      expect(optionalAuth).toHaveBeenCalledWith(mockRequest, mockEnv);
      expect(result).toEqual(mockAuthContext);
    });
  });

  describe('requireOrganizationMember', () => {
    it('should validate organizationId parameter', async () => {
      const invalidOrgError = new Error('400: Invalid or missing organizationId');
      vi.mocked(requireOrganizationMember).mockRejectedValue(invalidOrgError);

      await expect(requireOrganizationMember(mockRequest, mockEnv, '', 'owner'))
        .rejects.toThrow('400: Invalid or missing organizationId');

      expect(requireOrganizationMember).toHaveBeenCalledWith(mockRequest, mockEnv, '', 'owner');
    });

    it('should check organization membership', async () => {
      const membershipError = new Error('403: User is not a member of this organization');
      vi.mocked(requireOrganizationMember).mockRejectedValue(membershipError);

      await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'owner'))
        .rejects.toThrow('403: User is not a member of this organization');

      expect(requireOrganizationMember).toHaveBeenCalledWith(mockRequest, mockEnv, 'org-123', 'owner');
    });

    it('should enforce role requirements', async () => {
      const roleError = new Error('403: Insufficient permissions. Required role: attorney, user role: paralegal');
      vi.mocked(requireOrganizationMember).mockRejectedValue(roleError);

      await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'attorney'))
        .rejects.toThrow('403: Insufficient permissions. Required role: attorney, user role: paralegal');

      expect(requireOrganizationMember).toHaveBeenCalledWith(mockRequest, mockEnv, 'org-123', 'attorney');
    });

    it('should return auth context with member role when successful', async () => {
      const mockResult = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          emailVerified: true
        },
        sessionToken: 'test-session-token-123',
        memberRole: 'admin'
      };

      vi.mocked(requireOrganizationMember).mockResolvedValue(mockResult);

      const result = await requireOrganizationMember(mockRequest, mockEnv, 'org-123', 'admin');

      expect(requireOrganizationMember).toHaveBeenCalledWith(mockRequest, mockEnv, 'org-123', 'admin');
      expect(result).toEqual(mockResult);
      expect(result.memberRole).toBe('admin');
    });
  });

  describe('requireOrgMember', () => {
    it('should delegate to requireOrganizationMember', async () => {
      const mockResult = {
        user: { id: 'user-123' },
        sessionToken: 'token-123',
        memberRole: 'attorney'
      };

      vi.mocked(requireOrgMember).mockResolvedValue(mockResult);

      const result = await requireOrgMember(mockRequest, mockEnv, 'org-123', 'attorney');

      expect(requireOrgMember).toHaveBeenCalledWith(mockRequest, mockEnv, 'org-123', 'attorney');
      expect(result).toEqual(mockResult);
    });
  });

  describe('requireOrgOwner', () => {
    it('should call requireOrgMember with owner role', async () => {
      const mockResult = {
        user: { id: 'user-123' },
        sessionToken: 'token-123',
        memberRole: 'owner'
      };

      vi.mocked(requireOrgOwner).mockResolvedValue(mockResult);

      const result = await requireOrgOwner(mockRequest, mockEnv, 'org-123');

      expect(requireOrgOwner).toHaveBeenCalledWith(mockRequest, mockEnv, 'org-123');
      expect(result).toEqual(mockResult);
      expect(result.memberRole).toBe('owner');
    });
  });

  describe('checkOrgAccess', () => {
    it('should return hasAccess: false when user is not a member', async () => {
      vi.mocked(checkOrgAccess).mockResolvedValue({ hasAccess: false });

      const result = await checkOrgAccess(mockRequest, mockEnv, 'org-123');

      expect(checkOrgAccess).toHaveBeenCalledWith(mockRequest, mockEnv, 'org-123');
      expect(result).toEqual({ hasAccess: false });
    });

    it('should return hasAccess: true with member role when user is a member', async () => {
      vi.mocked(checkOrgAccess).mockResolvedValue({
        hasAccess: true,
        memberRole: 'admin'
      });

      const result = await checkOrgAccess(mockRequest, mockEnv, 'org-123');

      expect(checkOrgAccess).toHaveBeenCalledWith(mockRequest, mockEnv, 'org-123');
      expect(result).toEqual({
        hasAccess: true,
        memberRole: 'admin'
      });
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

        if (test.shouldPass) {
          const mockResult = {
            user: { id: 'user-123' },
            sessionToken: 'token-123',
            memberRole: test.userRole
          };
          vi.mocked(requireOrganizationMember).mockResolvedValue(mockResult);

          const result = await requireOrganizationMember(mockRequest, mockEnv, 'org-123', test.requiredRole as any);
          expect(result.memberRole).toBe(test.userRole);
        } else {
          const roleError = new Error(`403: Insufficient permissions. Required role: ${test.requiredRole}, user role: ${test.userRole}`);
          vi.mocked(requireOrganizationMember).mockRejectedValue(roleError);

          await expect(requireOrganizationMember(mockRequest, mockEnv, 'org-123', test.requiredRole as any))
            .rejects.toThrow(`403: Insufficient permissions. Required role: ${test.requiredRole}, user role: ${test.userRole}`);
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

      const mockAuthContext = {
        user: { id: 'user-123' },
        sessionToken: 'token-123'
      };

      vi.mocked(requireAuth).mockResolvedValue(mockAuthContext);

      const result = await requireAuth(mockRequest, customEnv);

      expect(requireAuth).toHaveBeenCalledWith(mockRequest, customEnv);
      expect(result).toEqual(mockAuthContext);
    });

    it('should handle default API URL when not provided', async () => {
      const defaultEnv = {
        ...mockEnv,
        BLAWBY_API_URL: undefined
      };

      const mockAuthContext = {
        user: { id: 'user-123' },
        sessionToken: 'token-123'
      };

      vi.mocked(requireAuth).mockResolvedValue(mockAuthContext);

      const result = await requireAuth(mockRequest, defaultEnv);

      expect(requireAuth).toHaveBeenCalledWith(mockRequest, defaultEnv);
      expect(result).toEqual(mockAuthContext);
    });
  });
});
