import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { 
  getOrganizationsEndpoint, 
  getOrganizationWorkspaceEndpoint 
} from '../config/api';
import { useSession } from '../contexts/AuthContext';

// Types
export type Role = 'owner' | 'admin' | 'attorney' | 'paralegal';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  description?: string;
  stripeCustomerId?: string | null;
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number | null;
  config?: {
    metadata?: {
      subscriptionPlan?: string;
      planStatus?: string;
    };
  };
  isPersonal?: boolean | null;
}

export interface Member {
  userId: string;
  role: Role;
  email: string;
  name?: string;
  image?: string;
  createdAt: string;
}

export interface Invitation {
  id: string;
  organizationId: string;
  organizationName?: string;
  email: string;
  role: Role;
  status: 'pending' | 'accepted' | 'declined';
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface ApiToken {
  id: string;
  name: string;
  permissions: string[];
  createdAt: string;
  lastUsed?: string;
}

export interface CreateOrgData {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateOrgData {
  name?: string;
  description?: string;
}

interface UseOrganizationManagementReturn {
  // Organization CRUD
  organizations: Organization[];
  currentOrganization: Organization | null;
  loading: boolean;
  error: string | null;
  
  // Organization operations
  createOrganization: (data: CreateOrgData) => Promise<Organization>;
  updateOrganization: (id: string, data: UpdateOrgData) => Promise<void>;
  deleteOrganization: (id: string) => Promise<void>;
  
  // Team management
  getMembers: (orgId: string) => Member[];
  fetchMembers: (orgId: string) => Promise<void>;
  updateMemberRole: (orgId: string, userId: string, role: Role) => Promise<void>;
  removeMember: (orgId: string, userId: string) => Promise<void>;
  
  // Invitations
  invitations: Invitation[];
  sendInvitation: (orgId: string, email: string, role: Role) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  
  // API Tokens
  getTokens: (orgId: string) => ApiToken[];
  fetchTokens: (orgId: string) => Promise<void>;
  createToken: (orgId: string, name: string) => Promise<{ token: string; tokenId: string }>;
  revokeToken: (orgId: string, tokenId: string) => Promise<void>;
  
  // Workspace data
  getWorkspaceData: (orgId: string, resource: string) => Record<string, unknown>[];
  fetchWorkspaceData: (orgId: string, resource: string) => Promise<void>;
  
  refetch: () => Promise<void>;
}

export function useOrganizationManagement(): UseOrganizationManagementReturn {
  const { data: session, isPending: sessionLoading } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tokens, setTokens] = useState<Record<string, ApiToken[]>>({});
  const [workspaceData, setWorkspaceData] = useState<Record<string, Record<string, Record<string, unknown>[]>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const personalOrgEnsuredRef = useRef(false);
  const personalOrgEnsurePromiseRef = useRef<Promise<void> | null>(null);

  // Helper function to make API calls
  const apiCall = useCallback(async (url: string, options: RequestInit = {}, timeoutMs: number = 15000) => {
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      // Clear timeout since request completed
      clearTimeout(timeoutId);

      // Helper function to safely parse JSON response
      const safeJsonParse = async (response: Response) => {
        // Check for no-content responses
        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return { success: true, data: null };
        }
        
        // Check content-type for JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          return { success: true, data: null };
        }
        
        // Safe JSON parsing with fallback
        try {
          return await response.json();
        } catch {
          return { success: true, data: null };
        }
      };

      if (!response.ok) {
        const errorData = await safeJsonParse(response);
        throw new Error((errorData as Record<string, unknown>)?.error as string || `HTTP ${response.status}`);
      }

      const data = await safeJsonParse(response);
      if (!(data as Record<string, unknown>)?.success) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'API call failed');
      }

      return (data as Record<string, unknown>)?.data;
    } catch (error) {
      // Clear timeout in case of error
      clearTimeout(timeoutId);
      
      // Handle AbortError (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      
      // Re-throw other errors (preserve existing error handling)
      throw error;
    }
  }, []);

  // Helper functions to get data by orgId
  const getMembers = useCallback((orgId: string): Member[] => {
    return members[orgId] || [];
  }, [members]);

  const getTokens = useCallback((orgId: string): ApiToken[] => {
    return tokens[orgId] || [];
  }, [tokens]);

  const getWorkspaceData = useCallback((orgId: string, resource: string): Record<string, unknown>[] => {
    return workspaceData[orgId]?.[resource] || [];
  }, [workspaceData]);

  const ensurePersonalOrganization = useCallback(async () => {
    if (personalOrgEnsuredRef.current) {
      return;
    }

    if (!personalOrgEnsurePromiseRef.current) {
      personalOrgEnsurePromiseRef.current = (async () => {
        try {
          await apiCall(`${getOrganizationsEndpoint()}/me/ensure-personal`, {
            method: 'POST',
          });
          personalOrgEnsuredRef.current = true;
        } catch (error) {
          personalOrgEnsuredRef.current = false;
          throw error;
        } finally {
          personalOrgEnsurePromiseRef.current = null;
        }
      })();
    }

    return personalOrgEnsurePromiseRef.current;
  }, [apiCall]);

  // Fetch user's organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check authentication status first
      if (!session?.user) {
        // User is not authenticated - skip organization fetch
        setOrganizations([]);
        setCurrentOrganization(null);
        setLoading(false);
        return;
      }
      
      // Only fetch user orgs if authenticated
      let data = await apiCall(`${getOrganizationsEndpoint()}/me`);

      if ((!Array.isArray(data) || data.length === 0) && !personalOrgEnsuredRef.current) {
        try {
          await ensurePersonalOrganization();
          data = await apiCall(`${getOrganizationsEndpoint()}/me`);
        } catch (ensureError) {
          console.error('Failed to ensure personal organization:', ensureError);
        }
      }

      const orgList = Array.isArray(data) ? data : [];
      if (orgList.some(org => org?.isPersonal)) {
        personalOrgEnsuredRef.current = true;
      }
      const personalOrg = orgList.find(org => org?.isPersonal);
      setOrganizations(orgList);
      setCurrentOrganization(personalOrg || orgList[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch organizations');
    } finally {
      setLoading(false);
    }
  }, [apiCall, session, ensurePersonalOrganization]);

  // Fetch pending invitations
  const fetchInvitations = useCallback(async () => {
    try {
      // Check authentication status first
      if (!session?.user) {
        // User is not authenticated - skip invitations fetch
        setInvitations([]);
        return;
      }
      
      // Only fetch invitations if authenticated
      const data = await apiCall(`${getOrganizationsEndpoint()}/me/invitations`) as Invitation[];
      setInvitations(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch invitations');
      setInvitations([]);
    }
  }, [apiCall, session]);

  // Create organization
  const createOrganization = useCallback(async (data: CreateOrgData): Promise<Organization> => {
    const result = await apiCall(getOrganizationsEndpoint(), {
      method: 'POST',
      body: JSON.stringify(data),
    }) as Organization;
    await fetchOrganizations(); // Refresh list
    return result;
  }, [apiCall, fetchOrganizations]);

  // Update organization
  const updateOrganization = useCallback(async (id: string, data: UpdateOrgData): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    await fetchOrganizations(); // Refresh list
  }, [apiCall, fetchOrganizations]);

  // Delete organization
  const deleteOrganization = useCallback(async (id: string): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${id}`, {
      method: 'DELETE',
    });
    await fetchOrganizations(); // Refresh list
  }, [apiCall, fetchOrganizations]);

  // Fetch members
  const fetchMembers = useCallback(async (orgId: string): Promise<void> => {
    try {
      const data = await apiCall(`${getOrganizationsEndpoint()}/${orgId}/member`) as { members: Member[] };
      setMembers(prev => ({ ...prev, [orgId]: data.members || [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch members');
    }
  }, [apiCall]);

  // Update member role
  const updateMemberRole = useCallback(async (orgId: string, userId: string, role: Role): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${orgId}/member`, {
      method: 'PATCH',
      body: JSON.stringify({ userId, role }),
    });
    await fetchMembers(orgId); // Refresh members
  }, [apiCall, fetchMembers]);

  // Remove member
  const removeMember = useCallback(async (orgId: string, userId: string): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${orgId}/member?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    await fetchMembers(orgId); // Refresh members
  }, [apiCall, fetchMembers]);

  // Send invitation
  const sendInvitation = useCallback(async (orgId: string, email: string, role: Role): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ organizationId: orgId, email, role }),
    });
    await fetchInvitations(); // Refresh invitations
  }, [apiCall, fetchInvitations]);

  // Accept invitation
  const acceptInvitation = useCallback(async (invitationId: string): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${invitationId}/accept-invitation`, {
      method: 'POST',
    });
    await fetchInvitations(); // Refresh invitations
    await fetchOrganizations(); // Refresh organizations
  }, [apiCall, fetchInvitations, fetchOrganizations]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${invitationId}/decline-invitation`, {
      method: 'POST',
    });
    await fetchInvitations(); // Refresh invitations
  }, [apiCall, fetchInvitations]);

  // Fetch API tokens
  const fetchTokens = useCallback(async (orgId: string): Promise<void> => {
    try {
      const data = await apiCall(`${getOrganizationsEndpoint()}/${orgId}/tokens`) as Record<string, unknown>[];
      // Map API response to ApiToken shape
      const mappedTokens: ApiToken[] = (data || []).map((token: Record<string, unknown>) => ({
        id: token.id as string,
        name: token.tokenName as string,
        permissions: (token.permissions as string[]) || [],
        createdAt: token.createdAt as string,
        lastUsed: token.lastUsedAt as string,
        ...token // Include any other fields
      }));
      setTokens(prev => ({ ...prev, [orgId]: mappedTokens }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens');
    }
  }, [apiCall]);

  // Create API token
  const createToken = useCallback(async (orgId: string, name: string): Promise<{ token: string; tokenId: string }> => {
    const result = await apiCall(`${getOrganizationsEndpoint()}/${orgId}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ tokenName: name }),
    }) as { token: string; tokenId: string };
    await fetchTokens(orgId); // Refresh tokens
    return { token: result.token, tokenId: result.tokenId };
  }, [apiCall, fetchTokens]);

  // Revoke API token
  const revokeToken = useCallback(async (orgId: string, tokenId: string): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${orgId}/tokens/${tokenId}`, {
      method: 'DELETE',
    });
    await fetchTokens(orgId); // Refresh tokens
  }, [apiCall, fetchTokens]);

  // Fetch workspace data
  const fetchWorkspaceData = useCallback(async (orgId: string, resource: string): Promise<void> => {
    try {
      const data = await apiCall(getOrganizationWorkspaceEndpoint(orgId, resource));
      setWorkspaceData(prev => ({
        ...prev,
        [orgId]: {
          ...prev[orgId],
          [resource]: data[resource] || []
        }
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workspace data');
    }
  }, [apiCall]);

  // Refetch all data
  const refetch = useCallback(async () => {
    await Promise.all([
      fetchOrganizations(),
      fetchInvitations(),
    ]);
  }, [fetchOrganizations, fetchInvitations]);

  // Refetch when session changes
  useEffect(() => {
    if (!sessionLoading) {
      refetch();
    }
  }, [session, sessionLoading, refetch]);

  return {
    organizations,
    currentOrganization,
    loading,
    error,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    getMembers,
    fetchMembers,
    updateMemberRole,
    removeMember,
    invitations,
    sendInvitation,
    acceptInvitation,
    declineInvitation,
    getTokens,
    fetchTokens,
    createToken,
    revokeToken,
    getWorkspaceData,
    fetchWorkspaceData,
    refetch,
  };
}
