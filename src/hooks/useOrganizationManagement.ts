import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { getOrganizationWorkspaceEndpoint } from '../config/api';
import { useSession } from '../lib/authClient';
import { apiClient } from '../lib/apiClient';
import { 
  organizationInvitationSchema,
  organizationSchema,
  membersResponseSchema,
  organizationApiTokenSchema,
  createTokenResponseSchema
} from '../../worker/schemas/validation';
import { resolveOrganizationKind as resolveOrgKind, normalizeSubscriptionStatus as normalizeOrgStatus } from '../utils/subscription';

// Types
export type Role = 'owner' | 'admin' | 'attorney' | 'paralegal';
export type BusinessOnboardingStatus = 'not_required' | 'pending' | 'completed' | 'skipped';
export type MatterWorkflowStatus = 'lead' | 'open' | 'in_progress' | 'completed' | 'archived';

export interface MatterTransitionResult {
  matterId: string;
  status: MatterWorkflowStatus;
  previousStatus: MatterWorkflowStatus;
  updatedAt: string;
  acceptedBy?: {
    userId: string;
    acceptedAt: string | null;
  } | null;
}

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

const PRACTICE_BASE_PATH = '/api/practice';
const PRACTICE_LIST_PATH = `${PRACTICE_BASE_PATH}/list`;
const PRACTICE_INVITATIONS_PATH = `${PRACTICE_BASE_PATH}/invitations`;

const practicePath = (orgId: string) => `${PRACTICE_BASE_PATH}/${encodeURIComponent(orgId)}`;
const practiceMembersPath = (orgId: string) => `${practicePath(orgId)}/members`;
const practiceOrgInvitationsPath = (orgId: string) => `${practicePath(orgId)}/invitations`;
const practiceTokensPath = (orgId: string) => `${practicePath(orgId)}/tokens`;
const practiceInvitationActionPath = (invitationId: string, action: 'accept' | 'decline') =>
  `${PRACTICE_BASE_PATH}/invitations/${encodeURIComponent(invitationId)}/${action}`;

async function practiceRequest<T>(request: Promise<{ data: T }>): Promise<T> {
  const response = await request;
  return response.data;
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
  
  // Matter workflows
  acceptMatter: (orgId: string, matterId: string) => Promise<MatterTransitionResult>;
  rejectMatter: (orgId: string, matterId: string, reason?: string) => Promise<MatterTransitionResult>;
  updateMatterStatus: (orgId: string, matterId: string, status: MatterWorkflowStatus, reason?: string) => Promise<MatterTransitionResult>;
  
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

function normalizeWorkflowStatus(value: unknown): MatterWorkflowStatus {
  const str = typeof value === 'string' ? value.toLowerCase() : '';
  switch (str) {
    case 'lead':
    case 'open':
    case 'in_progress':
    case 'completed':
    case 'archived':
      return str;
    default:
      try {
        // Use app logger if available; fallback to console
        const maybeLogger = (globalThis as unknown as { appLogger?: { warn: (msg: string, data?: unknown) => void } }).appLogger;
        if (maybeLogger && typeof maybeLogger.warn === 'function') {
          maybeLogger.warn('normalizeWorkflowStatus: unexpected value', { value, type: typeof value });
        } else {
          console.warn('normalizeWorkflowStatus: unexpected value', { value, type: typeof value });
        }
      } catch (e) { void e; }
      return 'lead';
  }
}

function normalizeMatterTransitionResult(raw: unknown): MatterTransitionResult {
  if (!raw || typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid matter transition response');
  }

  const record = raw as Record<string, unknown>;
  const acceptedByRaw = record.acceptedBy as Record<string, unknown> | null | undefined;
  const acceptedBy = acceptedByRaw && typeof acceptedByRaw === 'object'
    ? {
        userId: typeof acceptedByRaw.userId === 'string'
          ? acceptedByRaw.userId
          : String(acceptedByRaw.userId ?? ''),
        acceptedAt: typeof acceptedByRaw.acceptedAt === 'string'
          ? acceptedByRaw.acceptedAt
          : null
      }
    : null;

  return {
    matterId: typeof record.matterId === 'string'
      ? record.matterId
      : String(record.matterId ?? ''),
    status: normalizeWorkflowStatus(record.status),
    previousStatus: normalizeWorkflowStatus(record.previousStatus),
    updatedAt: (() => {
      if (typeof record.updatedAt !== 'string' || record.updatedAt.trim().length === 0) {
        throw new Error('Missing or invalid updatedAt in matter transition response');
      }
      return record.updatedAt;
    })(),
    acceptedBy
  };
}

function _generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function _generateUniqueSlug(): string {
  // Generate a guaranteed unique slug using timestamp + random suffix
  // Format: org-{timestamp}-{random}
  const timestamp = Date.now();
  const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `org-${timestamp}-${randomSuffix}`;
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
  
  // Track if we've already fetched organizations to prevent duplicate calls
  const organizationsFetchedRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const refetchTriggeredRef = useRef(false);

  // Helper for workspace/local endpoints still served by the Worker
  const workspaceCall = useCallback(async (url: string, options: RequestInit = {}, timeoutMs: number = 15000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(response.statusText || `HTTP ${response.status}`);
      }

      if (response.status === 204) {
        return {};
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {};
      }

      try {
        return await response.json();
      } catch {
        return {};
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
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

  // Fetch user's organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      if (organizationsFetchedRef.current && session?.user) {
        return;
      }

      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }

      const controller = new AbortController();
      currentRequestRef.current = controller;

      setLoading(true);
      setError(null);

      if (!session?.user) {
        setOrganizations([]);
        setCurrentOrganization(null);
        setLoading(false);
        organizationsFetchedRef.current = false;
        return;
      }

      const response = await practiceRequest<{ practices?: unknown[] } | unknown[]>(
        apiClient.get(PRACTICE_LIST_PATH, { signal: controller.signal })
      );

      const rawOrgList = Array.isArray(response)
        ? response
        : Array.isArray((response as { practices?: unknown[] }).practices)
          ? ((response as { practices?: unknown[] }).practices ?? [])
          : [];

      const normalizedList = rawOrgList
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
        .map((org) => normalizeOrganizationRecord(org))
        .filter((org) => org.id.length > 0);

      const personalOrg = normalizedList.find(org => org.kind === 'personal');

      setOrganizations(normalizedList);
      setCurrentOrganization(personalOrg || normalizedList[0] || null);
      organizationsFetchedRef.current = true;
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }
      console.error('Error in fetchOrganizations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch organizations');
      setCurrentOrganization(null);
      setOrganizations([]);
    } finally {
      setLoading(false);
      currentRequestRef.current = null;
    }
  }, [session]);

  // Fetch pending invitations
  const fetchInvitations = useCallback(async () => {
    try {
      if (!session?.user) {
        setInvitations([]);
        return;
      }

      const data = await practiceRequest<{ invitations?: unknown[] } | unknown[]>(
        apiClient.get(PRACTICE_INVITATIONS_PATH)
      );

      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { invitations?: unknown[] }).invitations)
          ? ((data as { invitations?: unknown[] }).invitations ?? [])
          : [];

      const validatedInvitations = list
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
  }, [session]);

  // Create organization
  const createOrganization = useCallback(async (data: CreateOrgData): Promise<Organization> => {
    const result = await practiceRequest<Record<string, unknown>>(
      apiClient.post(PRACTICE_BASE_PATH, data)
    );

    try {
      const resultRecord = result as Record<string, unknown>;
      
      // Generate slug: prefer provided slug, fallback to id, or generate unique slug if both missing
      // This ensures we never use 'unknown' which could cause duplicate slugs
      const slug = typeof resultRecord.slug === 'string' && resultRecord.slug.trim().length > 0
        ? resultRecord.slug
        : typeof resultRecord.id === 'string' && resultRecord.id.trim().length > 0
          ? resultRecord.id
          : _generateUniqueSlug();
      
      const resultWithSlug = {
        ...result,
        slug,
      };
      const validatedResult = organizationSchema.parse(resultWithSlug);
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
  }, [fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  // Update organization
  const updateOrganization = useCallback(async (id: string, data: UpdateOrgData): Promise<void> => {
    await apiClient.put(practicePath(id), data);
    organizationsFetchedRef.current = false;
    await fetchOrganizations();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  // Delete organization
  const deleteOrganization = useCallback(async (id: string): Promise<void> => {
    await apiClient.delete(practicePath(id));
    organizationsFetchedRef.current = false;
    await fetchOrganizations();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  // Fetch members
  const fetchMembers = useCallback(async (orgId: string): Promise<void> => {
    try {
      const data = await practiceRequest<Record<string, unknown>>(
        apiClient.get(practiceMembersPath(orgId))
      );

      if (typeof data !== 'object' || data === null) {
        console.error('Invalid members response: expected object, got', typeof data);
        setMembers(prev => ({ ...prev, [orgId]: [] }));
        return;
      }

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
  }, []);

  // Update member role
  const updateMemberRole = useCallback(async (orgId: string, userId: string, role: Role): Promise<void> => {
    await apiClient.patch(practiceMembersPath(orgId), { userId, role });
    await fetchMembers(orgId);
  }, [fetchMembers]);

  // Remove member
  const removeMember = useCallback(async (orgId: string, userId: string): Promise<void> => {
    await apiClient.delete(`${practiceMembersPath(orgId)}/${encodeURIComponent(userId)}`);
    await fetchMembers(orgId);
  }, [fetchMembers]);

  // Send invitation
  const sendInvitation = useCallback(async (orgId: string, email: string, role: Role): Promise<void> => {
    await apiClient.post(practiceOrgInvitationsPath(orgId), { email, role });
    await fetchInvitations();
  }, [fetchInvitations]);

  // Accept invitation
  const acceptInvitation = useCallback(async (invitationId: string): Promise<void> => {
    await apiClient.post(practiceInvitationActionPath(invitationId, 'accept'));
    organizationsFetchedRef.current = false;
    await fetchOrganizations();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [fetchOrganizations, fetchInvitations, shouldFetchInvitations]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<void> => {
    await apiClient.post(practiceInvitationActionPath(invitationId, 'decline'));
    await fetchInvitations();
  }, [fetchInvitations]);

  // Fetch API tokens
  const fetchTokens = useCallback(async (orgId: string): Promise<void> => {
    try {
      const data = await practiceRequest<unknown[]>(
        apiClient.get(practiceTokensPath(orgId))
      );

      if (!Array.isArray(data)) {
        console.error('Invalid tokens response: expected array, got', typeof data);
        setTokens(prev => ({ ...prev, [orgId]: [] }));
        return;
      }

      const validatedTokens: ApiToken[] = data
        .map((token: unknown) => {
          try {
            const validatedToken = organizationApiTokenSchema.parse(token);
            return {
              id: validatedToken.id,
              name: validatedToken.tokenName,
              permissions: validatedToken.permissions,
              createdAt: validatedToken.createdAt,
              lastUsed: validatedToken.lastUsedAt,
            };
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
  }, []);

  // Create API token
  const createToken = useCallback(async (orgId: string, name: string): Promise<{ token: string; tokenId: string }> => {
    const result = await practiceRequest<Record<string, unknown>>(
      apiClient.post(practiceTokensPath(orgId), { tokenName: name })
    );

    if (typeof result !== 'object' || result === null) {
      throw new Error(`Invalid create token response: expected object, got ${typeof result}`);
    }

    try {
      const validatedResult = createTokenResponseSchema.parse(result);
      await fetchTokens(orgId);
      return { token: validatedResult.token, tokenId: validatedResult.tokenId };
    } catch (error) {
      console.error('Invalid create token data:', result, error);
      throw new Error('Invalid create token response format');
    }
  }, [fetchTokens]);

  // Revoke API token
  const revokeToken = useCallback(async (orgId: string, tokenId: string): Promise<void> => {
    await apiClient.delete(`${practiceTokensPath(orgId)}/${encodeURIComponent(tokenId)}`);
    await fetchTokens(orgId);
  }, [fetchTokens]);

  // Fetch workspace data
  const fetchWorkspaceData = useCallback(async (orgId: string, resource: string): Promise<void> => {
    try {
      const data = await workspaceCall(getOrganizationWorkspaceEndpoint(orgId, resource));
      setWorkspaceData(prev => ({
        ...prev,
        [orgId]: {
          ...prev[orgId],
          [resource]: (data && data[resource]) || []
        }
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workspace data');
    }
  }, [workspaceCall]);

  const acceptMatter = useCallback(async (orgId: string, matterId: string): Promise<MatterTransitionResult> => {
    if (!orgId || !matterId) {
      throw new Error('Organization ID and matter ID are required');
    }

    // Deterministic idempotency key derived from operation params
    const idempotencyKey = `matter:${orgId}:${matterId}:accept`;
    const endpoint = `${getOrganizationWorkspaceEndpoint(orgId, 'matters')}/${encodeURIComponent(matterId)}/accept`;
    const response = await workspaceCall(endpoint, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey
      }
    });

    return normalizeMatterTransitionResult(response);
  }, [workspaceCall]);

  const rejectMatter = useCallback(async (orgId: string, matterId: string, reason?: string): Promise<MatterTransitionResult> => {
    if (!orgId || !matterId) {
      throw new Error('Organization ID and matter ID are required');
    }

    const endpoint = `${getOrganizationWorkspaceEndpoint(orgId, 'matters')}/${encodeURIComponent(matterId)}/reject`;
    const payload: Record<string, unknown> = {};
    if (typeof reason === 'string' && reason.trim().length > 0) {
      payload.reason = reason.trim();
    }

    const response = await workspaceCall(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        // Deterministic idempotency key derived from operation params
        'Idempotency-Key': `matter:${orgId}:${matterId}:reject:${payload.reason ?? ''}`
      }
    });

    return normalizeMatterTransitionResult(response);
  }, [workspaceCall]);

  const updateMatterStatus = useCallback(async (orgId: string, matterId: string, status: MatterWorkflowStatus, reason?: string): Promise<MatterTransitionResult> => {
    if (!orgId || !matterId) {
      throw new Error('Organization ID and matter ID are required');
    }

    const endpoint = `${getOrganizationWorkspaceEndpoint(orgId, 'matters')}/${encodeURIComponent(matterId)}/status`;
    const payload: Record<string, unknown> = { status };
    if (typeof reason === 'string' && reason.trim().length > 0) {
      payload.reason = reason.trim();
    }

    const response = await workspaceCall(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: {
        // Deterministic idempotency key derived from operation params
        'Idempotency-Key': `matter:${orgId}:${matterId}:status:${status}:${payload.reason ?? ''}`
      }
    });

    return normalizeMatterTransitionResult(response);
  }, [workspaceCall]);

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
    acceptMatter,
    rejectMatter,
    updateMatterStatus,
    refetch,
  };
}
