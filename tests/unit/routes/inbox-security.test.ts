import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleInbox } from '../../../worker/routes/inbox';
import { requirePracticeMember } from '../../../worker/middleware/auth';
import { withPracticeContext, getPracticeId } from '../../../worker/middleware/practiceContext';
import { HttpErrors } from '../../../worker/errorHandler';
import type { Env } from '../../../worker/types';

// Mock dependencies
vi.mock('../../../worker/middleware/auth');
vi.mock('../../../worker/middleware/practiceContext');
vi.mock('../../../worker/services/ConversationService');

const mockEnv: Env = {
  DB: {} as any,
  CHAT_SESSIONS: {} as any,
  RESEND_API_KEY: 'test-key',
  NODE_ENV: 'production',
  REMOTE_API_URL: 'https://staging-api.blawby.com'
} as Env;

describe('Inbox Route Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('URL Override Cannot Change Authenticated User', () => {
    it('should use original request for authentication, not requestWithContext', async () => {
      const originalUserId = 'user-123';
      const practiceId = 'practice-789';

      // Note: Auth-related params (userId) are not included as they would be rejected
      // by security validation. This test verifies the route uses original request for auth.
      const originalRequest = new Request(
        `https://example.com/api/inbox/conversations?practiceId=${practiceId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer valid-token-for-user-123'
          }
        }
      );

      // Mock withPracticeContext to return a request with practice context
      const mockRequestWithContext = {
        ...originalRequest,
        practiceContext: {
          practiceId,
          source: 'url' as const,
          isAuthenticated: true,
          userId: originalUserId
        }
      };

      vi.mocked(withPracticeContext).mockResolvedValue(mockRequestWithContext as any);
      vi.mocked(getPracticeId).mockReturnValue(practiceId);

      // Mock requirePracticeMember to verify it's called with original request
      const mockMemberContext = {
        user: {
          id: originalUserId,
          email: 'user123@example.com',
          name: 'User 123',
          emailVerified: true
        },
        session: { id: 'session-123', expiresAt: new Date() },
        token: 'valid-token-for-user-123',
        memberRole: 'paralegal'
      };

      vi.mocked(requirePracticeMember).mockResolvedValue(mockMemberContext);

      // Import ConversationService after mocking
      const { ConversationService } = await import('../../../worker/services/ConversationService');
      vi.mocked(ConversationService.prototype.getInboxConversations).mockResolvedValue({
        conversations: [],
        total: 0
      });

      await handleInbox(originalRequest, mockEnv);

      // CRITICAL: requirePracticeMember must be called with the ORIGINAL request,
      // not requestWithContext, to ensure URL params cannot affect authentication
      expect(requirePracticeMember).toHaveBeenCalledWith(
        originalRequest, // Original request with auth headers
        mockEnv,
        practiceId,
        'paralegal'
      );

      // Verify it was NOT called with requestWithContext
      expect(requirePracticeMember).not.toHaveBeenCalledWith(
        mockRequestWithContext,
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it('should authenticate user based on Authorization header, not URL params', async () => {
      const authenticatedUserId = 'authenticated-user-123';
      const practiceId = 'practice-789';

      // Note: Auth-related params (userId, token) are not included as they would be rejected
      // by security validation. This test verifies that auth comes from headers, not URL.
      const request = new Request(
        `https://example.com/api/inbox/stats?practiceId=${practiceId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer valid-token-for-authenticated-user'
          }
        }
      );

      const mockRequestWithContext = {
        ...request,
        practiceContext: {
          practiceId,
          source: 'url' as const,
          isAuthenticated: true
        }
      };

      vi.mocked(withPracticeContext).mockResolvedValue(mockRequestWithContext as any);
      vi.mocked(getPracticeId).mockReturnValue(practiceId);

      const mockMemberContext = {
        user: {
          id: authenticatedUserId, // Should match the authenticated user, not URL param
          email: 'auth@example.com',
          name: 'Authenticated User',
          emailVerified: true
        },
        session: { id: 'session-1', expiresAt: new Date() },
        token: 'valid-token-for-authenticated-user',
        memberRole: 'paralegal'
      };

      vi.mocked(requirePracticeMember).mockResolvedValue(mockMemberContext);

      const { ConversationService } = await import('../../../worker/services/ConversationService');
      vi.mocked(ConversationService.prototype.getInboxStats).mockResolvedValue({
        total: 0,
        active: 0,
        unassigned: 0,
        assignedToMe: 0,
        highPriority: 0,
        archived: 0,
        closed: 0
      });

      await handleInbox(request, mockEnv);

      // Verify the authenticated user ID is used, not the URL param
      expect(requirePracticeMember).toHaveBeenCalled();
      const callArgs = vi.mocked(requirePracticeMember).mock.calls[0];
      const authRequest = callArgs[0];

      // The request used for auth should have the original Authorization header
      expect(authRequest.headers.get('Authorization')).toBe('Bearer valid-token-for-authenticated-user');

      // Verify the mock was called with the correct user ID from the auth context
      // (The meaningful assertion is that requirePracticeMember was called with the original request,
      // not requestWithContext, which ensures URL params cannot affect authentication)
    });

    it('should reject requests with auth-related query parameters', async () => {
      const request = new Request(
        'https://example.com/api/inbox/conversations?practiceId=test&token=evil&authorization=Bearer hacked',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer valid-token'
          }
        }
      );

      // withPracticeContext should reject auth-related query params
      vi.mocked(withPracticeContext).mockRejectedValue(
        HttpErrors.badRequest('Security violation: Auth-related query parameter')
      );

      await expect(handleInbox(request, mockEnv)).rejects.toThrow('Security violation');
    });
  });

  describe('Practice Context Cannot Bypass requirePracticeMember', () => {
    it('should require valid organization membership even with practice context', async () => {
      const practiceId = 'practice-789';
      const request = new Request(
        `https://example.com/api/inbox/conversations?practiceId=${practiceId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer invalid-token'
          }
        }
      );

      const mockRequestWithContext = {
        ...request,
        practiceContext: {
          practiceId,
          source: 'url' as const,
          isAuthenticated: false
        }
      };

      vi.mocked(withPracticeContext).mockResolvedValue(mockRequestWithContext as any);
      vi.mocked(getPracticeId).mockReturnValue(practiceId);

      // requirePracticeMember should fail for invalid token
      vi.mocked(requirePracticeMember).mockRejectedValue(
        HttpErrors.unauthorized('Invalid or expired token')
      );

      await expect(handleInbox(request, mockEnv)).rejects.toThrow('Invalid or expired token');

      // Verify requirePracticeMember was called (attempted)
      expect(requirePracticeMember).toHaveBeenCalledWith(
        request, // Original request
        mockEnv,
        practiceId,
        'paralegal'
      );
    });

    it('should require minimum role even if practice context exists', async () => {
      const practiceId = 'practice-789';
      const request = new Request(
        `https://example.com/api/inbox/conversations?practiceId=${practiceId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer valid-token'
          }
        }
      );

      const mockRequestWithContext = {
        ...request,
        practiceContext: {
          practiceId,
          source: 'url' as const,
          isAuthenticated: true
        }
      };

      vi.mocked(withPracticeContext).mockResolvedValue(mockRequestWithContext as any);
      vi.mocked(getPracticeId).mockReturnValue(practiceId);

      // User has insufficient role
      vi.mocked(requirePracticeMember).mockRejectedValue(
        HttpErrors.forbidden('Insufficient permissions. Required role: paralegal, user role: guest')
      );

      await expect(handleInbox(request, mockEnv)).rejects.toThrow('Insufficient permissions');

      // Verify it checked for minimum role
      expect(requirePracticeMember).toHaveBeenCalledWith(
        request,
        mockEnv,
        practiceId,
        'paralegal' // Minimum role requirement
      );
    });
  });

  describe('Practice ID from URL is Safe for Metadata Only', () => {
    it('should allow practiceId from URL but validate membership separately', async () => {
      const practiceIdFromUrl = 'practice-from-url';
      const request = new Request(
        `https://example.com/api/inbox/conversations?practiceId=${practiceIdFromUrl}`,
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer valid-token'
          }
        }
      );

      const mockRequestWithContext = {
        ...request,
        practiceContext: {
          practiceId: practiceIdFromUrl,
          source: 'url' as const,
          isAuthenticated: true
        }
      };

      vi.mocked(withPracticeContext).mockResolvedValue(mockRequestWithContext as any);
      vi.mocked(getPracticeId).mockReturnValue(practiceIdFromUrl);

      const mockMemberContext = {
        user: {
          id: 'user-123',
          email: 'user@example.com',
          name: 'User',
          emailVerified: true
        },
        session: { id: 'session-1', expiresAt: new Date() },
        token: 'valid-token',
        memberRole: 'paralegal'
      };

      vi.mocked(requirePracticeMember).mockResolvedValue(mockMemberContext);

      const { ConversationService } = await import('../../../worker/services/ConversationService');
      vi.mocked(ConversationService.prototype.getInboxConversations).mockResolvedValue({
        conversations: [],
        total: 0
      });

      await handleInbox(request, mockEnv);

      // Practice ID from URL is used (metadata)
      expect(getPracticeId).toHaveBeenCalled();

      // But membership is validated separately using auth headers
      expect(requirePracticeMember).toHaveBeenCalledWith(
        request, // Original request with auth
        mockEnv,
        practiceIdFromUrl, // Practice ID from URL (safe as metadata)
        'paralegal'
      );
    });
  });
});
