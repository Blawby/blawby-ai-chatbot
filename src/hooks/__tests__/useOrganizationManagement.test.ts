import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useOrganizationManagement } from '../useOrganizationManagement';

// Mock the API endpoints
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper function to create mock Response objects
const createMockResponse = (data: unknown, options: { ok?: boolean; status?: number; statusText?: string } = {}) => ({
  ok: options.ok ?? true,
  status: options.status ?? 200,
  statusText: options.statusText ?? 'OK',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
});

// Mock the toast context
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('../../contexts/ToastContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/ToastContext')>(
    '../../contexts/ToastContext'
  );
  return {
    ...actual,
    useToastContext: () => ({
      showSuccess: mockShowSuccess,
      showError: mockShowError,
    }),
  };
});

// Mock the auth client
vi.mock('../../lib/authClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/authClient')>(
    '../../lib/authClient'
  );
  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
      }),
    },
  };
});

// Mock the API config
vi.mock('../../config/api', async () => {
  const actual = await vi.importActual<typeof import('../../config/api')>(
    '../../config/api'
  );
  return {
    ...actual,
    getOrganizationsEndpoint: () => 'http://localhost:8787/api/organizations',
    getOrganizationWorkspaceEndpoint: (orgId: string, resource: string) => 
      `http://localhost:8787/api/organizations/${orgId}/workspace/${resource}`,
  };
});

describe('useOrganizationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    // Default successful fetch response
    mockFetch.mockResolvedValue(createMockResponse({ success: true, data: [] }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe('loadOrganizations', () => {
    it('should load organizations successfully', async () => {
      const mockOrganizations = [
        {
          id: 'org-1',
          name: 'Test Organization',
          slug: 'test-org',
          config: {
            consultationFee: 150,
            requiresPayment: true,
            availableServices: ['Family Law'],
          },
        },
      ];

      // Mock all 4 calls: 2 on mount (useEffect) + 2 on refetch()
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, data: mockOrganizations })); // mount: organizations
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, data: [] })); // mount: invitations
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, data: mockOrganizations })); // refetch: organizations
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true, data: [] })); // refetch: invitations

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.refetch();
      });


      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/organizations/me',
        expect.objectContaining({
          credentials: 'include',
        })
      );

      expect(result.current.organizations).toHaveLength(1);
      expect(result.current.organizations[0]).toMatchObject({
        id: 'org-1',
        name: 'Test Organization',
        businessOnboardingStatus: 'pending',
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle API errors when loading organizations', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(
        { success: false, error: 'Failed to load organizations' },
        { ok: false, status: 500, statusText: 'Internal Server Error' }
      ));

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.organizations).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Failed to load organizations');
    });

    it('should handle network errors when loading organizations', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.organizations).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Failed to load organizations');
    });
  });

  describe('loadInvitations', () => {
    it('should load invitations successfully', async () => {
      const mockInvitations = [
        {
          id: 'inv-1',
          email: 'user@example.com',
          role: 'attorney',
          status: 'pending',
          organizationId: 'org-1',
          organizationName: 'Test Organization',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockInvitations }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/organizations/me/invitations',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );

      expect(result.current.invitations).toEqual(mockInvitations);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle API errors when loading invitations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.invitations).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Failed to fetch invitations');
      expect(mockShowError).toHaveBeenCalledWith(
        'Failed to fetch invitations',
        'Unable to load invitations. Please try again.'
      );
    });
  });

  describe('createOrganization', () => {
    it('should create organization successfully', async () => {
      const newOrgData = {
        name: 'New Organization',
        slug: 'new-org',
        config: {
          consultationFee: 100,
          requiresPayment: false,
          availableServices: ['General Consultation'],
        },
      };

      const createdOrg = {
        id: 'org-new',
        ...newOrgData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: createdOrg }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.createOrganization(newOrgData);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/organizations',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newOrgData),
          credentials: 'include',
        })
      );

      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Organization created',
        'Your organization has been created successfully.'
      );
    });

    it('should handle validation errors when creating organization', async () => {
      const invalidOrgData = {
        name: '', // Invalid: empty name
        slug: 'new-org',
        config: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: 'Name is required',
        }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.createOrganization(invalidOrgData);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        'Failed to create organization',
        'Name is required'
      );
    });
  });

  describe('inviteMember', () => {
    it('should invite member successfully', async () => {
      const inviteData = {
        email: 'newuser@example.com',
        role: 'attorney' as const,
        organizationId: 'org-1',
      };

      const mockInvitation = {
        id: 'inv-new',
        email: inviteData.email,
        role: inviteData.role,
        status: 'pending',
        organizationId: inviteData.organizationId,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockInvitation }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.sendInvitation('org-1', inviteData.email, inviteData.role);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/organizations/org-1/members',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: inviteData.email,
            role: inviteData.role,
          }),
          credentials: 'include',
        })
      );

      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Invitation sent',
        'An invitation has been sent to newuser@example.com'
      );
    });

    it('should handle duplicate invitation errors', async () => {
      const inviteData = {
        email: 'existing@example.com',
        role: 'attorney' as const,
        organizationId: 'org-1',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: 'User is already a member of this organization',
        }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.sendInvitation('org-1', inviteData.email, inviteData.role);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        'Failed to send invitation',
        'User is already a member of this organization'
      );
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.updateMemberRole('org-1', 'user-1', 'admin');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/organizations/org-1/members',
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: 'user-1', role: 'admin' }),
          credentials: 'include',
        })
      );

      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Role updated',
        'Member role has been updated successfully.'
      );
    });
  });

  describe('removeMember', () => {
    it('should remove member successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.removeMember('org-1', 'user-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/organizations/org-1/members?userId=user-1',
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'include',
        })
      );

      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Member removed',
        'Member has been removed from the organization.'
      );
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation successfully', async () => {
      const invitationId = 'inv-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.acceptInvitation(invitationId);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/organizations/me/invitations/inv-1/accept',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );

      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Invitation accepted',
        'You have successfully joined the organization.'
      );
    });
  });


  describe('getter functions', () => {
    it('should return empty arrays for non-existent organization data', () => {
      const { result } = renderHook(() => useOrganizationManagement());

      expect(result.current.getMembers('non-existent-org')).toEqual([]);
      expect(result.current.getTokens('non-existent-org')).toEqual([]);
      expect(result.current.getWorkspaceData('non-existent-org', 'contact-forms')).toEqual([]);
    });

    it('should return members for specific organization', async () => {
      const mockMembers = [
        {
          userId: 'user-1',
          role: 'owner' as const,
          email: 'owner@example.com',
          name: 'Owner User',
          createdAt: new Date().toISOString(),
        },
        {
          userId: 'user-2',
          role: 'attorney' as const,
          email: 'attorney@example.com',
          name: 'Attorney User',
          createdAt: new Date().toISOString(),
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { members: mockMembers } }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.fetchMembers('org-1');
      });

      expect(result.current.getMembers('org-1')).toEqual(mockMembers);
      expect(result.current.getMembers('org-2')).toEqual([]);
    });

    it('should return tokens for specific organization', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'API Token 1',
          permissions: ['read', 'write'],
          createdAt: new Date().toISOString(),
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTokens }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.fetchTokens('org-1');
      });

      expect(result.current.getTokens('org-1')).toEqual(mockTokens);
      expect(result.current.getTokens('org-2')).toEqual([]);
    });

    it('should return workspace data for specific organization and resource', async () => {
      const mockWorkspaceData = {
        'contact-forms': [
          { id: 'form-1', name: 'Contact Form 1' },
          { id: 'form-2', name: 'Contact Form 2' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockWorkspaceData }),
      });

      const { result } = renderHook(() => useOrganizationManagement());

      await act(async () => {
        await result.current.fetchWorkspaceData('org-1', 'contact-forms');
      });

      expect(result.current.getWorkspaceData('org-1', 'contact-forms')).toEqual(mockWorkspaceData['contact-forms']);
      expect(result.current.getWorkspaceData('org-1', 'sessions')).toEqual([]);
      expect(result.current.getWorkspaceData('org-2', 'contact-forms')).toEqual([]);
    });
  });

  describe('initialization', () => {
    it('should initialize with default state', async () => {
      const { result } = renderHook(() => useOrganizationManagement());

      // Wait for initial refetch to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.organizations).toEqual([]);
      expect(result.current.invitations).toEqual([]);
      expect(result.current.getMembers('test-org')).toEqual([]);
      expect(result.current.getTokens('test-org')).toEqual([]);
      expect(result.current.getWorkspaceData('test-org', 'contact-forms')).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
