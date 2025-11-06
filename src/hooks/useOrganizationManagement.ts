import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { 
  getOrganizationsEndpoint, 
  getOrganizationWorkspaceEndpoint 
} from '../config/api';
import { useSession } from '../contexts/AuthContext';
import { 
  organizationInvitationSchema,
  organizationSchema,
  membersResponseSchema,
  organizationApiTokenSchema,
  createTokenResponseSchema
} from '../../worker/schemas/validation';
import { resolveOrganizationKind as resolveOrgKind, normalizeSubscriptionStatus as normalizeOrgStatus } from '../utils/subscription';

// API Response interfaces
interface ApiErrorResponse {
  error?: string;
}

interface ApiSuccessResponse {
  success?: boolean;
  data?: unknown;
  error?: string;
}

// Types
export type Role = 'owner' | 'admin' | 'attorney' | 'paralegal';
export type BusinessOnboardingStatus = 'not_required' | 'pending' | 'completed' | 'skipped';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  description?: string;
  betterAuthOrgId?: string;
  stripeCustomerId?: string | null;
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number | null;
  subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
  subscriptionPeriodEnd?: number | null;
  config?: {
    ownerEmail?: string;
    metadata?: {
      subscriptionPlan?: string;
      planStatus?: string;
    };
  };
  kind?: 'personal' | 'business';
  isPersonal?: boolean | null;
  businessOnboardingStatus?: BusinessOnboardingStatus;
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingSkipped?: boolean;
  businessOnboardingHasDraft?: boolean;
}

export interface Member {
  userId: string;
  role: Role;
  email: string;
  name?: string;
  image?: string;
  createdAt: number;
}

export interface Invitation {
  id: string;
  organizationId: string;
  organizationName?: string;
  email: string;
  role: Role;
  status: 'pending' | 'accepted' | 'declined';
  invitedBy: string;
  expiresAt: number;
  createdAt: number;
}

export interface ApiToken {
  id: string;
  name: string;
  permissions: string[];
  createdAt: number;
  lastUsed?: number;
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

interface UseOrganizationManagementOptions {
  fetchInvitations?: boolean;
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

function normalizeOrganizationRecord(raw: Record<string, unknown>): Organization {
  const id = typeof raw.id === 'string' ? raw.id : String(raw.id ?? '');
  const slug = typeof raw.slug === 'string' ? raw.slug : id;
  const name = typeof raw.name === 'string' ? raw.name : 'Organization';

  const rawIsPersonal = typeof raw.isPersonal === 'boolean'
    ? raw.isPersonal
    : typeof raw.is_personal === 'number'
      ? raw.is_personal === 1
      : undefined;

  const rawStatus = typeof raw.subscriptionStatus === 'string'
    ? raw.subscriptionStatus
    : typeof raw.subscription_status === 'string'
      ? raw.subscription_status
      : undefined;

  const resolvedKind = resolveOrgKind(typeof raw.kind === 'string' ? raw.kind : undefined, rawIsPersonal);
  const normalizedStatus = normalizeOrgStatus(rawStatus, resolvedKind);

  const subscriptionTier = typeof raw.subscriptionTier === 'string'
    ? raw.subscriptionTier
    : typeof raw.subscription_tier === 'string'
      ? raw.subscription_tier
      : null;

  const allowedTiers = new Set(['free', 'plus', 'business', 'enterprise']);
  const normalizedTier = (typeof subscriptionTier === 'string' && allowedTiers.has(subscriptionTier))
    ? (subscriptionTier as Organization['subscriptionTier'])
    : null;

  const seats = typeof raw.seats === 'number'
    ? raw.seats
    : typeof raw.seats === 'string' && raw.seats.trim().length > 0
      ? Number.parseInt(raw.seats, 10) || null
      : null;

  const subscriptionPeriodEnd = (() => {
    // Preserve explicit null; coalesce camelCase and snake_case; allow undefined if missing
    const camel = (raw as Record<string, unknown>).subscriptionPeriodEnd;
    const snake = (raw as Record<string, unknown>).subscription_period_end;
    const val = camel !== undefined ? camel : snake;
    if (val === null) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.trim().length > 0) {
      const n = Number.parseInt(val, 10);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  })();

  // Parse config once for reuse (may contain profile fields)
  const cfg = (() => {
    const c = (raw as Record<string, unknown>).config as unknown;
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      return c as Organization['config'] & { description?: string };
    }
    return undefined as Organization['config'] & { description?: string } | undefined;
  })();
  const betterAuthOrgId = (() => {
    const direct = (raw as Record<string, unknown>).betterAuthOrgId;
    if (typeof direct === 'string' && direct.trim().length > 0) return direct;
    const fromCfg = cfg && (cfg as unknown as { betterAuthOrgId?: string }).betterAuthOrgId;
    if (typeof fromCfg === 'string' && fromCfg.trim().length > 0) return fromCfg;
    return id; // fallback to our DB id, aligned with backend mapping
  })();

  const onboardingCompletedAt = (() => {
    const camel = (raw as Record<string, unknown>).businessOnboardingCompletedAt;
    const snake = (raw as Record<string, unknown>).business_onboarding_completed_at;
    const value = camel !== undefined ? camel : snake;
    if (value === null) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const ts = new Date(value.trim()).getTime();
      return Number.isFinite(ts) ? ts : null;
    }
    return undefined;
  })();

  const onboardingSkipped = (() => {
    const camel = (raw as Record<string, unknown>).businessOnboardingSkipped;
    const snake = (raw as Record<string, unknown>).business_onboarding_skipped;
    const value = camel !== undefined ? camel : snake;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true';
    }
    return undefined;
  })();

  const onboardingData = (() => {
    const camel = (raw as Record<string, unknown>).businessOnboardingData;
    const snake = (raw as Record<string, unknown>).business_onboarding_data;
    const value = camel !== undefined ? camel : snake;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  })();

  const onboardingStatus: BusinessOnboardingStatus = (() => {
    if (resolvedKind === 'personal') {
      return 'not_required';
    }
    if (typeof onboardingCompletedAt === 'number') {
      return 'completed';
    }
    if (onboardingSkipped) {
      return 'skipped';
    }
    return 'pending';
  })();

  return {
    id,
    slug,
    name,
    // Prefer top-level description; fall back to config.description if present
    description: typeof raw.description === 'string' && raw.description.trim().length > 0
      ? raw.description
      : (cfg && typeof (cfg as Record<string, unknown>).description === 'string'
          ? (cfg as unknown as { description: string }).description
          : undefined),
    stripeCustomerId: (() => {
      const val = (raw.stripeCustomerId ?? raw.stripe_customer_id ?? null);
      return typeof val === 'string' && val.trim().length > 0 ? val : null;
    })(),
    subscriptionTier: normalizedTier,
    seats,
    subscriptionStatus: normalizedStatus,
    subscriptionPeriodEnd,
    config: cfg,
    betterAuthOrgId,
    kind: resolvedKind,
    isPersonal: rawIsPersonal ?? (resolvedKind === 'personal'),
    businessOnboardingCompletedAt: onboardingCompletedAt,
    businessOnboardingSkipped: onboardingSkipped,
    businessOnboardingHasDraft: onboardingData != null && Object.keys(onboardingData).length > 0,
    businessOnboardingStatus: onboardingStatus,
  };
}

export function useOrganizationManagement(options: UseOrganizationManagementOptions = {}): UseOrganizationManagementReturn {
  const { fetchInvitations: shouldFetchInvitations = true } = options;
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
  
  // Track if we've already fetched organizations to prevent duplicate calls
  const organizationsFetchedRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const refetchTriggeredRef = useRef(false);

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
        
        // Runtime guard: verify errorData is a non-null object
        if (typeof errorData === 'object' && errorData !== null && !Array.isArray(errorData)) {
          const errorResponse = errorData as ApiErrorResponse;
          const errorMessage = typeof errorResponse.error === 'string' ? errorResponse.error : `HTTP ${response.status}`;
          throw new Error(errorMessage);
        } else {
          // If parsed data is not an object, include raw value for debugging
          throw new Error(`HTTP ${response.status} - Invalid error response format: ${JSON.stringify(errorData)}`);
        }
      }

      const data = await safeJsonParse(response);

      // Support both wrapped ({ success, data }) and raw array/object payloads
      if (Array.isArray(data)) {
        // Raw array response (e.g., organizations list)
        return data as unknown;
      }

      if (typeof data === 'object' && data !== null) {
        const successResponse = data as ApiSuccessResponse;
        // If success is explicitly false, treat as error
        if (typeof successResponse.success === 'boolean' && !successResponse.success) {
          const errorMessage = typeof successResponse.error === 'string' ? successResponse.error : 'API call failed';
          throw new Error(errorMessage);
        }

        // If it has a data field, return it; otherwise return the object itself
        return (successResponse.data !== undefined ? successResponse.data : data) as unknown;
      }

      // Any other shape is invalid
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
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
      // Check if we've already fetched organizations for this session
      if (organizationsFetchedRef.current && session?.user) {
        return; // Skip if already fetched
      }

      // Abort any existing request
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }

      // Create new request controller
      const controller = new AbortController();
      currentRequestRef.current = controller;

      setLoading(true);
      setError(null);
      
      
      // Check authentication status first
      if (!session?.user) {
        // User is not authenticated - skip organization fetch
        setOrganizations([]);
        setCurrentOrganization(null);
        setLoading(false);
        organizationsFetchedRef.current = false;
        return;
      }
      
      // Only fetch user orgs if authenticated
      const data = await apiCall(`${getOrganizationsEndpoint()}/me`);

      const rawOrgList = Array.isArray(data) ? data : [];
      const normalizedList = rawOrgList
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
        .map((org) => normalizeOrganizationRecord(org))
        .filter((org) => org.id.length > 0);

      if (normalizedList.some(org => org.kind === 'personal')) {
        personalOrgEnsuredRef.current = true;
      }
      const personalOrg = normalizedList.find(org => org.kind === 'personal');

      setOrganizations(normalizedList);
      setCurrentOrganization(personalOrg || normalizedList[0] || null);
      
      // Mark as fetched
      organizationsFetchedRef.current = true;
    } catch (err) {
      console.error('Error in fetchOrganizations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch organizations');
      // Set currentOrganization to null (not undefined) so components know loading is done
      setCurrentOrganization(null);
      setOrganizations([]);
    } finally {
      setLoading(false);
      currentRequestRef.current = null;
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
      const data = await apiCall(`${getOrganizationsEndpoint()}/me/invitations`);
      
      // Validate response with runtime checks
      if (!Array.isArray(data)) {
        console.error('Invalid invitations response: expected array, got', typeof data);
        setInvitations([]);
        return;
      }
      
      // Validate each invitation with Zod schema
      const validatedInvitations = data
        .map(invitation => {
          try {
            return organizationInvitationSchema.parse(invitation);
          } catch (error) {
            console.error('Invalid invitation data:', invitation, error);
            return null;
          }
        })
        .filter((invitation): invitation is Invitation => invitation !== null);
      
      setInvitations(validatedInvitations);
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
    });
    
    // Validate response with runtime checks
    if (typeof result !== 'object' || result === null) {
      throw new Error(`Invalid organization response: expected object, got ${typeof result}`);
    }
    
    // Validate with Zod schema
    try {
      // Ensure slug is present, use id as fallback if missing
      const resultWithSlug = {
        ...result,
        slug: (result as Record<string, unknown>).slug || (result as Record<string, unknown>).id || 'unknown'
      };
      const validatedResult = organizationSchema.parse(resultWithSlug);
      // Force refetch without relying on refetch() to avoid TDZ issues
      organizationsFetchedRef.current = false;
      await fetchOrganizations();
      if (shouldFetchInvitations) {
        await fetchInvitations();
      }
      return normalizeOrganizationRecord(validatedResult as unknown as Record<string, unknown>);
    } catch (error) {
      console.error('Invalid organization data:', result, error);
      throw new Error('Invalid organization response format');
    }
  }, [apiCall, fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  // Update organization
  const updateOrganization = useCallback(async (id: string, data: UpdateOrgData): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    // Force refetch without relying on refetch() to avoid TDZ issues
    organizationsFetchedRef.current = false;
    await fetchOrganizations();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [apiCall, fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  // Delete organization
  const deleteOrganization = useCallback(async (id: string): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${id}`, {
      method: 'DELETE',
    });
    // Force refetch without relying on refetch() to avoid TDZ issues
    organizationsFetchedRef.current = false;
    await fetchOrganizations();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [apiCall, fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  // Fetch members
  const fetchMembers = useCallback(async (orgId: string): Promise<void> => {
    try {
      const data = await apiCall(`${getOrganizationsEndpoint()}/${orgId}/member`);
      
      // Validate response with runtime checks
      if (typeof data !== 'object' || data === null) {
        console.error('Invalid members response: expected object, got', typeof data);
        setMembers(prev => ({ ...prev, [orgId]: [] }));
        return;
      }
      
      // Validate with Zod schema
      try {
        const validatedData = membersResponseSchema.parse(data);
        const normalizedMembers: Member[] = (validatedData.members || []).map(m => ({
          userId: m.userId,
          role: m.role,
          email: m.email ?? '',
          name: m.name ?? undefined,
          image: m.image ?? undefined,
          createdAt: m.createdAt,
        }));
        setMembers(prev => ({ ...prev, [orgId]: normalizedMembers }));
      } catch (error) {
        console.error('Invalid members data:', data, error);
        setMembers(prev => ({ ...prev, [orgId]: [] }));
      }
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
    // Force refetch without relying on refetch() to avoid TDZ issues
    organizationsFetchedRef.current = false;
    await fetchOrganizations();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [apiCall, fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<void> => {
    await apiCall(`${getOrganizationsEndpoint()}/${invitationId}/decline-invitation`, {
      method: 'POST',
    });
    await fetchInvitations(); // Refresh invitations
  }, [apiCall, fetchInvitations]);

  // Fetch API tokens
  const fetchTokens = useCallback(async (orgId: string): Promise<void> => {
    try {
      const data = await apiCall(`${getOrganizationsEndpoint()}/${orgId}/tokens`);
      
      // Validate response with runtime checks
      if (!Array.isArray(data)) {
        console.error('Invalid tokens response: expected array, got', typeof data);
        setTokens(prev => ({ ...prev, [orgId]: [] }));
        return;
      }
      
      // Validate each token with Zod schema and map to ApiToken shape
      const validatedTokens: ApiToken[] = data
        .map((token: unknown) => {
          try {
            const validatedToken = organizationApiTokenSchema.parse(token);
            // Create a clean ApiToken object with only the required fields
            const apiToken: ApiToken = {
              id: validatedToken.id,
              name: validatedToken.tokenName,
              permissions: validatedToken.permissions,
              createdAt: validatedToken.createdAt,
              lastUsed: validatedToken.lastUsedAt,
            };
            return apiToken;
          } catch (error) {
            console.error('Invalid token data:', token, error);
            return null;
          }
        })
        .filter((token): token is ApiToken => token !== null);
      
      setTokens(prev => ({ ...prev, [orgId]: validatedTokens }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens');
    }
  }, [apiCall]);

  // Create API token
  const createToken = useCallback(async (orgId: string, name: string): Promise<{ token: string; tokenId: string }> => {
    const result = await apiCall(`${getOrganizationsEndpoint()}/${orgId}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ tokenName: name }),
    });
    
    // Validate response with runtime checks
    if (typeof result !== 'object' || result === null) {
      throw new Error(`Invalid create token response: expected object, got ${typeof result}`);
    }
    
    // Validate with Zod schema
    try {
      const validatedResult = createTokenResponseSchema.parse(result);
      await fetchTokens(orgId); // Refresh tokens
      return { token: validatedResult.token, tokenId: validatedResult.tokenId };
    } catch (error) {
      console.error('Invalid create token data:', result, error);
      throw new Error('Invalid create token response format');
    }
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
    // Reset the fetched flag to ensure we actually refetch
    organizationsFetchedRef.current = false;
    
    const promises = [fetchOrganizations()];
    
    // Only fetch invitations if explicitly requested
    if (shouldFetchInvitations) {
      promises.push(fetchInvitations());
    }
    
    await Promise.all(promises);
  }, [fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  // Refetch when session changes
  useEffect(() => {
    if (!sessionLoading && session?.user?.id && !refetchTriggeredRef.current) {
      refetchTriggeredRef.current = true;
      fetchOrganizations();
    }
  }, [session?.user?.id, sessionLoading, fetchOrganizations]);

  // Clear fetched flag and abort in-flight requests when session changes
  useEffect(() => {
    // Abort any in-flight request from the previous session
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
      currentRequestRef.current = null;
    }
    
    // Reset the fetched flag and refetch trigger
    organizationsFetchedRef.current = false;
    refetchTriggeredRef.current = false;
  }, [session?.user?.id]);

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
