import axios from 'axios';
import { atom } from 'nanostores';
import { useStore } from '@nanostores/preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { getPracticeWorkspaceEndpoint } from '@/config/api';
import { getBackendApiUrl } from '@/config/urls';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import {
  listPractices,
  createPractice as apiCreatePractice,
  updatePractice as apiUpdatePractice,
  type PracticeDetailsUpdate,
  type PracticeDetails,
  getPracticeDetails,
  getOnboardingStatusPayload,
  updatePracticeDetails as apiUpdatePracticeDetails,
  deletePractice as apiDeletePractice,
  listPracticeInvitations,
  createPracticeInvitation,
  respondToPracticeInvitation,
  listPracticeMembers,
  updatePracticeMemberRole as apiUpdatePracticeMemberRole,
  deletePracticeMember as apiDeletePracticeMember
} from '@/shared/lib/apiClient';
import { resolvePracticeKind as resolvePracticeKind, normalizeSubscriptionStatus as normalizePracticeStatus } from '@/shared/utils/subscription';
import { resetPracticeDetailsStore, setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type SharedPracticeSnapshot = {
  practices: Practice[];
  currentPractice: Practice | null;
};

let sharedPracticeSnapshot: SharedPracticeSnapshot | null = null;
let sharedPracticePromise: Promise<SharedPracticeSnapshot> | null = null;
let sharedPracticeUserId: string | null = null;
let sharedPracticeIncludesDetails = false;

const resetSharedPracticeCache = () => {
  sharedPracticeSnapshot = null;
  sharedPracticePromise = null;
  sharedPracticeUserId = null;
  sharedPracticeIncludesDetails = false;
};

const membersStore = atom<Record<string, Member[]>>({});
const membersLoaded = new Set<string>();
const membersInFlight = new Map<string, Promise<Member[]>>();
let membersCacheUserId: string | null = null;

const resetMembersCache = () => {
  membersStore.set({});
  membersLoaded.clear();
  membersInFlight.clear();
  membersCacheUserId = null;
};

const setMembersForPractice = (practiceId: string, nextMembers: Member[]) => {
  if (!practiceId) return;
  const snapshot = membersStore.get();
  membersStore.set({ ...snapshot, [practiceId]: nextMembers });
};

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

// Practice interface - matches apiClient.ts but kept here for backward compatibility
// and to include additional properties specific to practice management
export interface Practice {
  id: string;
  slug: string;
  name: string;
  description?: string;
  betterAuthOrgId?: string;
  stripeCustomerId?: string | null;
  consultationFee: number | null;
  paymentUrl: string | null;
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number | null;
  subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
  subscriptionPeriodEnd?: number | null;
  config?: {
    ownerEmail?: string;
    metadata?: Record<string, unknown>;
    description?: string;
    [key: string]: unknown; // Allow additional config properties
  };
  kind?: 'personal' | 'business' | 'practice';
  isPersonal?: boolean | null;
  businessOnboardingStatus?: BusinessOnboardingStatus;
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingSkipped?: boolean;
  businessOnboardingHasDraft?: boolean;
  // Additional fields from apiClient
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  businessPhone: string | null;
  businessEmail: string | null;
  calendlyUrl: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  introMessage?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;
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
  practiceId: string;
  practiceName?: string;
  email: string;
  role: Role;
  status: 'pending' | 'accepted' | 'declined';
  invitedBy: string;
  expiresAt: number;
  createdAt: number;
}

export interface CreatePracticeData {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdatePracticeData {
  name?: string;
  slug?: string;
  description?: string;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: number | null;
  logo?: string;
  metadata?: Record<string, unknown>;
}

interface UsePracticeManagementOptions {
  /**
   * When true (default), the hook will automatically fetch practices
   * once the session is available. Tests and advanced callers can disable
   * this to take full control over when loading happens via `refetch()`.
   */
  autoFetchPractices?: boolean;
  /**
   * When true (default), the hook will fetch pending invitations for the
   * current user. Disable this if you don't need invitations for a given
   * screen or test.
   */
  fetchInvitations?: boolean;
  /**
   * When true, fetches practice details for the active practice and merges
   * them into the practice list snapshot.
   */
  fetchPracticeDetails?: boolean;
}

interface UsePracticeManagementReturn {
  // Practice CRUD
  practices: Practice[];
  currentPractice: Practice | null;
  loading: boolean;
  error: string | null;
  
  // Practice operations
  createPractice: (data: CreatePracticeData) => Promise<Practice>;
  updatePractice: (id: string, data: UpdatePracticeData) => Promise<void>;
  updatePracticeDetails: (id: string, details: PracticeDetailsUpdate) => Promise<PracticeDetails | null>;
  deletePractice: (id: string) => Promise<void>;
  
  // Team management
  getMembers: (practiceId: string) => Member[];
  fetchMembers: (practiceId: string, options?: { force?: boolean }) => Promise<void>;
  updateMemberRole: (practiceId: string, userId: string, role: Role) => Promise<void>;
  removeMember: (practiceId: string, userId: string) => Promise<void>;
  
  // Invitations
  invitations: Invitation[];
  sendInvitation: (practiceId: string, email: string, role: Role) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  
  // Workspace data
  getWorkspaceData: (practiceId: string, resource: string) => Record<string, unknown>[];
  fetchWorkspaceData: (practiceId: string, resource: string) => Promise<void>;
  
  // Matter workflows
  acceptMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
  rejectMatter: (practiceId: string, matterId: string, reason?: string) => Promise<MatterTransitionResult>;
  updateMatterStatus: (practiceId: string, matterId: string, status: MatterWorkflowStatus, reason?: string) => Promise<MatterTransitionResult>;
  
  refetch: () => Promise<void>;
}

function normalizePracticeRecord(raw: Record<string, unknown>): Practice {
  const id = typeof raw.id === 'string' ? raw.id : String(raw.id ?? '');
  const slug = typeof raw.slug === 'string' ? raw.slug : id;
  const name = typeof raw.name === 'string' ? raw.name : 'Practice';

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

  const resolvedKind = resolvePracticeKind(typeof raw.kind === 'string' ? raw.kind : undefined, rawIsPersonal);
  const normalizedStatus = normalizePracticeStatus(rawStatus, resolvedKind);

  const subscriptionTier = typeof raw.subscriptionTier === 'string'
    ? raw.subscriptionTier
    : typeof raw.subscription_tier === 'string'
      ? raw.subscription_tier
      : null;

  const allowedTiers = new Set(['free', 'plus', 'business', 'enterprise']);
  const normalizedTier = (typeof subscriptionTier === 'string' && allowedTiers.has(subscriptionTier))
    ? (subscriptionTier as Practice['subscriptionTier'])
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
      return c as Practice['config'] & { description?: string };
    }
    const metadata = (raw as Record<string, unknown>).metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return {
        metadata: metadata as Record<string, unknown>
      } as Practice['config'] & { description?: string };
    }
    return undefined as Practice['config'] & { description?: string } | undefined;
  })();
  const metadataRecord = (() => {
    const direct = (raw as Record<string, unknown>).metadata;
    if (isPlainObject(direct)) {
      return direct as Record<string, unknown>;
    }
    if (cfg && isPlainObject(cfg.metadata)) {
      return cfg.metadata as Record<string, unknown>;
    }
    return null;
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

  const getDetailString = (camel: string, snake: string): string | null | undefined => {
    const candidate =
      (raw as Record<string, unknown>)[camel] ?? (raw as Record<string, unknown>)[snake];
    if (candidate === null) return null;
    if (typeof candidate === 'string') {
      return candidate;
    }
    return undefined;
  };

  const getDetailBoolean = (camel: string, snake: string): boolean | null | undefined => {
    const candidate =
      (raw as Record<string, unknown>)[camel] ?? (raw as Record<string, unknown>)[snake];
    if (candidate === null) return null;
    if (typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') return candidate === 1;
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return undefined;
  };

  const services = (() => {
    const candidate =
      (raw as Record<string, unknown>).services ?? (raw as Record<string, unknown>).services_list;
    if (candidate === null) return null;
    if (Array.isArray(candidate)) return candidate as Array<Record<string, unknown>>;
    return undefined;
  })();

  const topLevelDescription = (() => {
    const candidate = raw.description ?? raw.overview;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
  })();
  const configDescription = (() => {
    const desc = cfg && (cfg as Record<string, unknown>).description;
    return typeof desc === 'string' && desc.trim().length > 0 ? desc : undefined;
  })();
  const metadataDescription = (() => {
    const metadata = cfg && (cfg as Record<string, unknown>).metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const desc = (metadata as Record<string, unknown>).description;
    return typeof desc === 'string' && desc.trim().length > 0 ? desc : undefined;
  })();

  return {
    id,
    slug,
    name,
    description: topLevelDescription ?? configDescription ?? metadataDescription,
    stripeCustomerId: (() => {
      const val = (raw.stripeCustomerId ?? raw.stripe_customer_id ?? null);
      return typeof val === 'string' && val.trim().length > 0 ? val : null;
    })(),
    consultationFee: (() => {
      const val = raw.consultationFee ?? raw.consultation_fee ?? null;
      if (val === null) return null;
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (typeof val === 'string' && val.trim().length > 0) {
        const num = Number(val);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    })(),
    paymentUrl: (() => {
      const val = raw.paymentUrl ?? raw.payment_url ?? null;
      return typeof val === 'string' && val.trim().length > 0 ? val : null;
    })(),
    businessPhone: getDetailString('businessPhone', 'business_phone') ?? null,
    businessEmail: getDetailString('businessEmail', 'business_email') ?? null,
    calendlyUrl: getDetailString('calendlyUrl', 'calendly_url') ?? null,
    logo: getDetailString('logo', 'logo') ?? null,
    subscriptionTier: normalizedTier,
    seats,
    subscriptionStatus: normalizedStatus,
    subscriptionPeriodEnd,
    metadata: metadataRecord,
    config: cfg,
    betterAuthOrgId,
    kind: resolvedKind,
    isPersonal: rawIsPersonal ?? (resolvedKind === 'personal'),
    businessOnboardingCompletedAt: onboardingCompletedAt,
    businessOnboardingSkipped: onboardingSkipped,
    businessOnboardingHasDraft: onboardingData != null && Object.keys(onboardingData).length > 0,
    businessOnboardingStatus: onboardingStatus,
    website: getDetailString('website', 'website'),
    addressLine1: getDetailString('addressLine1', 'address_line_1'),
    addressLine2: getDetailString('addressLine2', 'address_line_2'),
    city: getDetailString('city', 'city'),
    state: getDetailString('state', 'state'),
    postalCode: getDetailString('postalCode', 'postal_code'),
    country: getDetailString('country', 'country'),
    primaryColor: getDetailString('primaryColor', 'primary_color'),
    accentColor: getDetailString('accentColor', 'accent_color'),
    introMessage: getDetailString('introMessage', 'intro_message'),
    isPublic: getDetailBoolean('isPublic', 'is_public'),
    services
  };
}

function mergePracticeDetails(practice: Practice, details: PracticeDetails | null): Practice {
  if (!details) {
    return practice;
  }
  const patch: Partial<Practice> = {};
  const setIfDefined = <K extends keyof Practice>(key: K, value: Practice[K] | undefined) => {
    if (value !== undefined) {
      patch[key] = value;
    }
  };
  const setIfNonNull = <K extends keyof Practice>(key: K, value: Practice[K] | undefined | null) => {
    if (value !== undefined && value !== null) {
      patch[key] = value as Practice[K];
    }
  };

  setIfDefined('businessPhone', details.businessPhone as Practice['businessPhone'] | undefined);
  setIfDefined('businessEmail', details.businessEmail as Practice['businessEmail'] | undefined);
  setIfDefined('consultationFee', details.consultationFee as Practice['consultationFee'] | undefined);
  setIfDefined('paymentUrl', details.paymentUrl as Practice['paymentUrl'] | undefined);
  setIfDefined('calendlyUrl', details.calendlyUrl as Practice['calendlyUrl'] | undefined);
  setIfNonNull('website', details.website as Practice['website'] | undefined | null);
  setIfNonNull('addressLine1', details.addressLine1 as Practice['addressLine1'] | undefined | null);
  setIfNonNull('addressLine2', details.addressLine2 as Practice['addressLine2'] | undefined | null);
  setIfNonNull('city', details.city as Practice['city'] | undefined | null);
  setIfNonNull('state', details.state as Practice['state'] | undefined | null);
  setIfNonNull('postalCode', details.postalCode as Practice['postalCode'] | undefined | null);
  setIfNonNull('country', details.country as Practice['country'] | undefined | null);
  setIfNonNull('primaryColor', details.primaryColor as Practice['primaryColor'] | undefined | null);
  setIfNonNull('accentColor', details.accentColor as Practice['accentColor'] | undefined | null);
  setIfNonNull('introMessage', details.introMessage as Practice['introMessage'] | undefined | null);
  setIfNonNull('description', details.description as Practice['description'] | undefined | null);
  setIfDefined('isPublic', details.isPublic as Practice['isPublic'] | undefined);
  setIfDefined('services', details.services as Practice['services'] | undefined);
  return {
    ...practice,
    ...patch
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

function resolveStripeDetailsSubmitted(payload: unknown): boolean | null {
  let current = payload;
  const visited = new Set<unknown>();

  while (
    current &&
    typeof current === 'object' &&
    'data' in (current as Record<string, unknown>) &&
    (current as Record<string, unknown>).data !== undefined &&
    !visited.has(current)
  ) {
    visited.add(current);
    current = (current as Record<string, unknown>).data;
  }

  if (!current || typeof current !== 'object') {
    return null;
  }

  const record = current as Record<string, unknown>;
  const candidate = record.details_submitted ?? record.detailsSubmitted;
  return typeof candidate === 'boolean' ? candidate : null;
}

function _generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function usePracticeManagement(options: UsePracticeManagementOptions = {}): UsePracticeManagementReturn {
  const {
    autoFetchPractices = true,
    fetchInvitations: shouldFetchInvitations = true,
    fetchPracticeDetails = false,
  } = options;
  const { session, isPending: sessionLoading, isAnonymous, activeOrganizationId } = useSessionContext();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [currentPractice, setCurrentPractice] = useState<Practice | null>(null);
  const members = useStore(membersStore);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [workspaceData, setWorkspaceData] = useState<Record<string, Record<string, Record<string, unknown>[]>>>({});
  // Initialize loading to true when autoFetchPractices is enabled
  // This ensures the UI shows a loading state during the first render before the fetch effect runs
  const [loading, setLoading] = useState(autoFetchPractices);
  const [error, setError] = useState<string | null>(null);
  
  // Track if we've already fetched practices to prevent duplicate calls
  const practicesFetchedRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const resolvedUserId = !session?.user || isAnonymous ? null : session.user.id;

  useEffect(() => {
    if (membersCacheUserId !== resolvedUserId) {
      resetMembersCache();
      membersCacheUserId = resolvedUserId;
    }
  }, [resolvedUserId]);

  // Helper for workspace/local endpoints still served by the Worker
  const workspaceCall = useCallback(async (url: string, options: RequestInit = {}, timeoutMs: number = 15000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');

      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers,
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

  // Helper functions to get data by practiceId
  const getMembers = useCallback((practiceId: string): Member[] => {
    return members[practiceId] || [];
  }, [members]);


  const getWorkspaceData = useCallback((practiceId: string, resource: string): Record<string, unknown>[] => {
    return workspaceData[practiceId]?.[resource] || [];
  }, [workspaceData]);

  // Fetch user's practices
  const fetchPractices = useCallback(async () => {
    let currentFetchPromise: Promise<SharedPracticeSnapshot> | null = null;
    try {
      if (practicesFetchedRef.current && session?.user && (!fetchPracticeDetails || sharedPracticeIncludesDetails)) {
        return;
      }

      const userId = session?.user?.id ?? null;
      if (!userId || isAnonymous) {
        setPractices([]);
        setCurrentPractice(null);
        setLoading(false);
        practicesFetchedRef.current = false;
        resetSharedPracticeCache();
        resetPracticeDetailsStore();
        return;
      }

      if (sharedPracticeUserId && sharedPracticeUserId !== userId) {
        resetSharedPracticeCache();
      }

      const applySnapshot = (snapshot: SharedPracticeSnapshot) => {
        setPractices(snapshot.practices);
        setCurrentPractice(snapshot.currentPractice);
        setLoading(false);
        practicesFetchedRef.current = true;
      };

      const hydrateSnapshotDetails = async (snapshot: SharedPracticeSnapshot) => {
        if (!fetchPracticeDetails) return snapshot;
        if (!snapshot.currentPractice) return snapshot;

        if (currentRequestRef.current) {
          currentRequestRef.current.abort();
        }

        const controller = new AbortController();
        currentRequestRef.current = controller;

        let details: PracticeDetails | null = null;
        try {
          details = await getPracticeDetails(snapshot.currentPractice.id, { signal: controller.signal });
          setPracticeDetailsEntry(snapshot.currentPractice.id, details);
        } catch (detailsError) {
          console.warn('Failed to fetch practice details:', detailsError);
        }

        if (!details) {
          return snapshot;
        }

        const updatedCurrentPractice = mergePracticeDetails(snapshot.currentPractice, details);
        const updatedPractices = snapshot.practices.map((practice) =>
          practice.id === snapshot.currentPractice?.id
            ? mergePracticeDetails(practice, details)
            : practice
        );

        const updatedSnapshot = {
          practices: updatedPractices,
          currentPractice: updatedCurrentPractice
        };
        sharedPracticeSnapshot = updatedSnapshot;
        sharedPracticeIncludesDetails = true;
        return updatedSnapshot;
      };

      if (sharedPracticeSnapshot) {
        if (!fetchPracticeDetails || sharedPracticeIncludesDetails || !sharedPracticeSnapshot.currentPractice) {
          applySnapshot(sharedPracticeSnapshot);
          return;
        }

        setLoading(true);
        setError(null);
        const hydrated = await hydrateSnapshotDetails(sharedPracticeSnapshot);
        applySnapshot(hydrated);
        return;
      }

      if (sharedPracticePromise) {
        const cachedPromise = sharedPracticePromise;
        try {
          const cached = await sharedPracticePromise;
          if (fetchPracticeDetails && !sharedPracticeIncludesDetails && cached.currentPractice) {
            setLoading(true);
            setError(null);
            const hydrated = await hydrateSnapshotDetails(cached);
            applySnapshot(hydrated);
            return;
          }
          applySnapshot(cached);
          return;
        } catch (_err) {
          console.warn('Cached practice promise failed, retrying with fresh fetch.');
          if (sharedPracticePromise === cachedPromise) {
            sharedPracticePromise = null;
          }
        }
      }

      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }

      const controller = new AbortController();
      currentRequestRef.current = controller;

      setLoading(true);
      setError(null);

      sharedPracticePromise = (async () => {
        const rawPracticeList = await listPractices({ signal: controller.signal, scope: 'all' });

        const normalizedList = rawPracticeList
          .filter((item): item is Practice => typeof item === 'object' && item !== null)
          .map((practice) => normalizePracticeRecord(practice as unknown as Record<string, unknown>))
          .filter((practice) => practice.id.length > 0);

        const activeOrgId = activeOrganizationId ?? null;
        const activePractice = activeOrgId
          ? normalizedList.find(practice =>
            practice.betterAuthOrgId === activeOrgId || practice.id === activeOrgId
          )
          : undefined;
        const currentPracticeNext = activePractice || normalizedList[0] || null;
        let details: PracticeDetails | null = null;
        let stripeDetailsSubmitted: boolean | null = null;
        if (currentPracticeNext) {
          if (fetchPracticeDetails) {
            try {
              details = await getPracticeDetails(currentPracticeNext.id, { signal: controller.signal });
              setPracticeDetailsEntry(currentPracticeNext.id, details);
            } catch (detailsError) {
              console.warn('Failed to fetch practice details:', detailsError);
            }
          }
          try {
            const payload = await getOnboardingStatusPayload(
              currentPracticeNext.betterAuthOrgId ?? currentPracticeNext.id,
              { signal: controller.signal }
            );
            stripeDetailsSubmitted = resolveStripeDetailsSubmitted(payload);
          } catch (stripeError) {
            if (axios.isAxiosError(stripeError) && stripeError.response?.status === 404) {
              stripeDetailsSubmitted = false;
            } else {
              console.warn('Failed to fetch onboarding status:', stripeError);
            }
          }
        }

        const applyStripeOverride = (practice: Practice): Practice => {
          if (stripeDetailsSubmitted === null || practice.id !== currentPracticeNext?.id) {
            return practice;
          }
          return {
            ...practice,
            businessOnboardingStatus: stripeDetailsSubmitted ? 'completed' : 'pending',
            businessOnboardingCompletedAt: stripeDetailsSubmitted
              ? practice.businessOnboardingCompletedAt ?? Date.now()
              : null
          };
        };

        const mergedPractices = details
          ? normalizedList.map((practice) =>
            practice.id === currentPracticeNext?.id
              ? applyStripeOverride(mergePracticeDetails(practice, details))
              : practice
          )
          : normalizedList.map((practice) =>
            practice.id === currentPracticeNext?.id
              ? applyStripeOverride(practice)
              : practice
          );
        const mergedCurrentPractice = currentPracticeNext
          ? applyStripeOverride(mergePracticeDetails(currentPracticeNext, details))
          : null;

        sharedPracticeIncludesDetails = Boolean(details);

        return { practices: mergedPractices, currentPractice: mergedCurrentPractice };
      })();
      currentFetchPromise = sharedPracticePromise;

      const snapshot = await sharedPracticePromise;
      sharedPracticeSnapshot = snapshot;
      sharedPracticeUserId = userId;

      setPractices(snapshot.practices);
      setCurrentPractice(snapshot.currentPractice);
      practicesFetchedRef.current = true;
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return;
      }
      console.error('Error in fetchPractices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch practices');
      setCurrentPractice(null);
      setPractices([]);
    } finally {
      setLoading(false);
      currentRequestRef.current = null;
      if (sharedPracticePromise === currentFetchPromise) {
        sharedPracticePromise = null;
      }
    }
  }, [activeOrganizationId, fetchPracticeDetails, isAnonymous, session]);

  // Fetch practice invitations
  const fetchInvitations = useCallback(async () => {
    if (!session?.user?.id || isAnonymous) return;

    // Skip on staging due to backend routing bug (shadowed endpoint)
    // The endpoint /api/practice/invitations is shadowed by /api/practice/:uuid
    if (getBackendApiUrl().includes('staging')) {
      console.debug('Skipping fetchInvitations on staging due to known backend routing bug');
      return;
    }

    try {
      // Use imported function directly
      const rawInvitations = await listPracticeInvitations();

      // Define valid role and status values
      const validRoles: Role[] = ['owner', 'admin', 'attorney', 'paralegal'];
      const validStatuses: Array<'pending' | 'accepted' | 'declined'> = ['pending', 'accepted', 'declined'];

      const validatedInvitations = rawInvitations
        .map(invitation => {
          // Validate invitation structure manually
          if (!invitation || typeof invitation !== 'object') {
            return null;
          }
          const inv = invitation as Record<string, unknown>;
          if (
            typeof inv.id === 'string' &&
            typeof inv.practiceId === 'string' &&
            typeof inv.email === 'string' &&
            typeof inv.role === 'string' &&
            typeof inv.status === 'string' &&
            typeof inv.invitedBy === 'string' &&
            typeof inv.expiresAt === 'number' &&
            typeof inv.createdAt === 'number'
          ) {
            // Validate role is one of the allowed values
            if (!validRoles.includes(inv.role as Role)) {
              console.error('Invalid invitation role:', inv.role, 'Expected one of:', validRoles, 'Invitation:', invitation);
              return null;
            }
            // Validate status is one of the allowed values
            if (!validStatuses.includes(inv.status as 'pending' | 'accepted' | 'declined')) {
              console.error('Invalid invitation status:', inv.status, 'Expected one of:', validStatuses, 'Invitation:', invitation);
              return null;
            }
            return {
              id: inv.id,
              practiceId: inv.practiceId,
              practiceName: typeof inv.practiceName === 'string' ? inv.practiceName : undefined,
              email: inv.email,
              role: inv.role as Role,
              status: inv.status as 'pending' | 'accepted' | 'declined',
              invitedBy: inv.invitedBy,
              expiresAt: inv.expiresAt,
              createdAt: inv.createdAt,
            } as Invitation;
          }
          console.error('Invalid invitation data:', invitation);
          return null;
        })
        .filter((invitation): invitation is Invitation => invitation !== null);

      setInvitations(validatedInvitations);
    } catch (err: unknown) {
      // Don't set global error for invitation failures as it blocks the main UI
      const axiosError = err as { response?: { status: number, data: unknown }, message?: string };
      if (axiosError.response) {
        // Use debug for expected API errors (like 400 Invalid Practice UUID) to avoid console noise
        console.debug('Failed to fetch invitations:', axiosError.response.status, axiosError.response.data);
      } else {
        console.debug('Failed to fetch invitations:', axiosError.message || err);
      }
      setInvitations([]);
    }
  }, [isAnonymous, session]);

  // Create practice
  const createPractice = useCallback(async (data: CreatePracticeData): Promise<Practice> => {
    if (!data?.name || data.name.trim().length === 0) {
      throw new Error('Practice name is required');
    }

    // Only include slug if user explicitly provided one - API will auto-generate otherwise
    const slug = data.slug && data.slug.trim().length > 0 ? data.slug.trim() : undefined;
    const metadata = data.description
      ? { description: data.description }
      : undefined;

    const practice = await apiCreatePractice({
      name: data.name,
      ...(slug ? { slug } : {}),
      ...(metadata ? { metadata } : {})
    });

    const normalized = normalizePracticeRecord(practice as unknown as Record<string, unknown>);
    practicesFetchedRef.current = false;
    await fetchPractices();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
    return normalized;
  }, [fetchPractices, fetchInvitations, shouldFetchInvitations]);

  // Update practice
  const updatePractice = useCallback(async (id: string, data: UpdatePracticeData): Promise<void> => {
    if (!id) {
      throw new Error('Practice id is required for update');
    }

    const payload: Parameters<typeof apiUpdatePractice>[1] = {};

    if (typeof data.name === 'string' && data.name.trim().length > 0) {
      payload.name = data.name.trim();
    }

    if (typeof data.slug === 'string' && data.slug.trim().length > 0) {
      // API handles slug normalization - just pass through user input
      payload.slug = data.slug.trim();
    }

    if (typeof data.businessPhone === 'string' && data.businessPhone.trim().length > 0) {
      payload.businessPhone = data.businessPhone.trim();
    }

    if (typeof data.businessEmail === 'string' && data.businessEmail.trim().length > 0) {
      payload.businessEmail = data.businessEmail.trim();
    }

    if (data.consultationFee === null) {
      payload.consultationFee = null;
    } else if (typeof data.consultationFee === 'number' && Number.isFinite(data.consultationFee)) {
      payload.consultationFee = data.consultationFee;
    }

    if (typeof data.logo === 'string' && data.logo.trim().length > 0) {
      payload.logo = data.logo.trim();
    }

    const existingPractice = practices.find(practice => practice.id === id);
    const metadataBase = (() => {
      const direct = existingPractice?.metadata;
      if (isPlainObject(direct)) {
        return direct;
      }
      const config = existingPractice?.config;
      if (isPlainObject(config)) {
        const configMetadata = (config as Record<string, unknown>).metadata;
        if (isPlainObject(configMetadata)) {
          return configMetadata;
        }
        if ('conversationConfig' in config || 'onboarding' in config) {
          return config;
        }
      }
      return {};
    })();

    let metadataNext: Record<string, unknown> | null = null;

    if (isPlainObject(data.metadata)) {
      metadataNext = {
        ...metadataBase,
        ...data.metadata
      };
    }

    if (typeof data.description === 'string') {
      metadataNext = {
        ...(metadataNext ?? metadataBase),
        description: data.description
      };
    }

    if (metadataNext) {
      payload.metadata = metadataNext;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    const updatedPractice = normalizePracticeRecord(
      await apiUpdatePractice(id, payload) as unknown as Record<string, unknown>
    );

    if (sharedPracticeSnapshot) {
      const nextPractices = sharedPracticeSnapshot.practices.map((practice) =>
        practice.id === id ? updatedPractice : practice
      );
      const nextCurrentPractice = sharedPracticeSnapshot.currentPractice?.id === id
        ? updatedPractice
        : sharedPracticeSnapshot.currentPractice;
      sharedPracticeSnapshot = {
        practices: nextPractices,
        currentPractice: nextCurrentPractice
      };
    }

    setCurrentPractice((prev) => (prev?.id === id ? updatedPractice : prev));
    setPractices((prev) =>
      prev.map((practice) => (practice.id === id ? updatedPractice : practice))
    );

    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [fetchInvitations, practices, shouldFetchInvitations]);

  const updatePracticeDetails = useCallback(async (id: string, details: PracticeDetailsUpdate): Promise<PracticeDetails | null> => {
    if (!id) {
      throw new Error('Practice id is required for details update');
    }
    const updatedDetails = await apiUpdatePracticeDetails(id, details);
    setPracticeDetailsEntry(id, updatedDetails);
    if (updatedDetails) {
      if (sharedPracticeSnapshot) {
        const nextPractices = sharedPracticeSnapshot.practices.map((practice) =>
          practice.id === id ? mergePracticeDetails(practice, updatedDetails) : practice
        );
        const nextCurrentPractice = sharedPracticeSnapshot.currentPractice?.id === id
          ? mergePracticeDetails(sharedPracticeSnapshot.currentPractice, updatedDetails)
          : sharedPracticeSnapshot.currentPractice;
        sharedPracticeSnapshot = {
          practices: nextPractices,
          currentPractice: nextCurrentPractice
        };
        if (sharedPracticeSnapshot.currentPractice?.id === id) {
          sharedPracticeIncludesDetails = true;
        }
      }
      setCurrentPractice((prev) => {
        if (!prev || prev.id !== id) return prev;
        return mergePracticeDetails(prev, updatedDetails);
      });
      setPractices((prev) =>
        prev.map((practice) =>
          practice.id === id ? mergePracticeDetails(practice, updatedDetails) : practice
        )
      );
    }
    return updatedDetails;
  }, []);

  // Delete practice
  const deletePractice = useCallback(async (id: string): Promise<void> => {
    if (!id) {
      throw new Error('Practice id is required for deletion');
    }
    await apiDeletePractice(id);
    practicesFetchedRef.current = false;
    await fetchPractices();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [fetchPractices, fetchInvitations, shouldFetchInvitations]);

  // Fetch members
  const fetchMembers = useCallback(async (
    practiceId: string,
    options: { force?: boolean } = {}
  ): Promise<void> => {
    if (!practiceId) return;

    const force = options.force ?? false;
    if (!force && membersLoaded.has(practiceId)) {
      return;
    }

    const inFlight = membersInFlight.get(practiceId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const promise = (async () => {
      const data = await listPracticeMembers(practiceId);
      // Validate and normalize members manually
      const validRoles: Role[] = ['owner', 'admin', 'attorney', 'paralegal'];

      return (Array.isArray(data) ? data : [])
        .map(m => {
          if (!m || typeof m !== 'object') {
            return null;
          }
          const member = m as Record<string, unknown>;
          const userId = typeof member.userId === 'string'
            ? member.userId
            : (typeof member.user_id === 'string' ? member.user_id : null);
          const rawRole = typeof member.role === 'string' ? member.role.trim().toLowerCase() : '';
          const normalizedRole = rawRole === 'member' ? 'paralegal' : rawRole;
          const createdAtValue = member.createdAt ?? member.created_at ?? member.joined_at;
          const createdAt = typeof createdAtValue === 'number'
            ? createdAtValue
            : (typeof createdAtValue === 'string' && createdAtValue.trim()
              ? Number(createdAtValue)
              : null);
          const email = typeof member.email === 'string'
            ? member.email
            : (typeof (member.user as Record<string, unknown> | undefined)?.email === 'string'
              ? (member.user as Record<string, unknown>).email as string
              : '');

          if (!userId) {
            console.error('Invalid or missing member userId:', member);
            return null;
          }

          if (!validRoles.includes(normalizedRole as Role)) {
            console.error('Invalid member role:', member.role, 'Expected one of:', validRoles, 'Member:', member);
            return null;
          }

          if (typeof email !== 'string' || !email.trim()) {
            console.error('Invalid or missing member email:', member.email, 'Member:', member);
            return null;
          }

          return {
            userId,
            role: normalizedRole as Role,
            email,
            name: typeof member.name === 'string' ? member.name : undefined,
            image: typeof member.image === 'string' ? member.image : undefined,
            createdAt: Number.isFinite(createdAt ?? NaN) ? (createdAt as number) : Date.now(),
          } as Member;
        })
        .filter((m): m is Member => m !== null);
    })();

    membersInFlight.set(practiceId, promise);
    try {
      const normalizedMembers = await promise;
      membersLoaded.add(practiceId);
      setMembersForPractice(practiceId, normalizedMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch members');
      membersLoaded.delete(practiceId);
      setMembersForPractice(practiceId, []);
      throw err;
    } finally {
      membersInFlight.delete(practiceId);
    }
  }, []);

  // Update member role
  const updateMemberRole = useCallback(async (practiceId: string, userId: string, role: Role): Promise<void> => {
    await apiUpdatePracticeMemberRole(practiceId, { userId, role });
    await fetchMembers(practiceId, { force: true });
  }, [fetchMembers]);

  // Remove member
  const removeMember = useCallback(async (practiceId: string, userId: string): Promise<void> => {
    await apiDeletePracticeMember(practiceId, userId);
    await fetchMembers(practiceId, { force: true });
  }, [fetchMembers]);

  // Send invitation
  const sendInvitation = useCallback(async (practiceId: string, email: string, role: Role): Promise<void> => {
    await createPracticeInvitation(practiceId, { email, role });
    await fetchInvitations();
  }, [fetchInvitations]);

  // Accept invitation
  const acceptInvitation = useCallback(async (invitationId: string): Promise<void> => {
    await respondToPracticeInvitation(invitationId, 'accept');
    practicesFetchedRef.current = false;
    await fetchPractices();
    if (shouldFetchInvitations) {
      await fetchInvitations();
    }
  }, [fetchPractices, fetchInvitations, shouldFetchInvitations]);

  const declineInvitation = useCallback(async (invitationId: string): Promise<void> => {
    await respondToPracticeInvitation(invitationId, 'decline');
    await fetchInvitations();
  }, [fetchInvitations]);

  // Fetch workspace data
  const fetchWorkspaceData = useCallback(async (practiceId: string, resource: string): Promise<void> => {
    try {
      const data = await workspaceCall(getPracticeWorkspaceEndpoint(practiceId, resource));
      setWorkspaceData(prev => ({
        ...prev,
        [practiceId]: {
          ...prev[practiceId],
          [resource]: (data && data[resource]) || []
        }
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workspace data');
    }
  }, [workspaceCall]);

  const acceptMatter = useCallback(async (practiceId: string, matterId: string): Promise<MatterTransitionResult> => {
    if (!practiceId || !matterId) {
      throw new Error('Practice ID and matter ID are required');
    }

    // Deterministic idempotency key derived from operation params
    const idempotencyKey = `matter:${practiceId}:${matterId}:accept`;
    const endpoint = `${getPracticeWorkspaceEndpoint(practiceId, 'matters')}/${encodeURIComponent(matterId)}/accept`;
    const response = await workspaceCall(endpoint, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey
      }
    });

    return normalizeMatterTransitionResult(response);
  }, [workspaceCall]);

  const rejectMatter = useCallback(async (practiceId: string, matterId: string, reason?: string): Promise<MatterTransitionResult> => {
    if (!practiceId || !matterId) {
      throw new Error('Practice ID and matter ID are required');
    }

    const endpoint = `${getPracticeWorkspaceEndpoint(practiceId, 'matters')}/${encodeURIComponent(matterId)}/reject`;
    const payload: Record<string, unknown> = {};
    if (typeof reason === 'string' && reason.trim().length > 0) {
      payload.reason = reason.trim();
    }

    const response = await workspaceCall(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        // Deterministic idempotency key derived from operation params
        'Idempotency-Key': `matter:${practiceId}:${matterId}:reject:${payload.reason ?? ''}`
      }
    });

    return normalizeMatterTransitionResult(response);
  }, [workspaceCall]);

  const updateMatterStatus = useCallback(async (practiceId: string, matterId: string, status: MatterWorkflowStatus, reason?: string): Promise<MatterTransitionResult> => {
    if (!practiceId || !matterId) {
      throw new Error('Practice ID and matter ID are required');
    }

    const endpoint = `${getPracticeWorkspaceEndpoint(practiceId, 'matters')}/${encodeURIComponent(matterId)}/status`;
    const payload: Record<string, unknown> = { status };
    if (typeof reason === 'string' && reason.trim().length > 0) {
      payload.reason = reason.trim();
    }

    const response = await workspaceCall(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      headers: {
        // Deterministic idempotency key derived from operation params
        'Idempotency-Key': `matter:${practiceId}:${matterId}:status:${status}:${payload.reason ?? ''}`
      }
    });

    return normalizeMatterTransitionResult(response);
  }, [workspaceCall]);

  // Refetch all data
  const refetch = useCallback(async () => {
    // Reset the fetched flag to ensure we actually refetch
    practicesFetchedRef.current = false;
    resetSharedPracticeCache();
    
    const promises = [fetchPractices()];
    
    // Only fetch invitations if explicitly requested
    if (shouldFetchInvitations) {
      promises.push(fetchInvitations());
    }
    
    await Promise.all(promises);
  }, [fetchPractices, fetchInvitations, shouldFetchInvitations]);

  // Refetch when session changes
  useEffect(() => {
    if (!autoFetchPractices || sessionLoading || isAnonymous) {
      return;
    }

    void fetchPractices().then(() => {
      if (shouldFetchInvitations) {
        void fetchInvitations();
      }
    });

    return () => {
      currentRequestRef.current?.abort();
    };
  }, [
    autoFetchPractices,
    sessionLoading,
    session?.user?.id,
    isAnonymous,
    fetchPractices,
    fetchInvitations,
    shouldFetchInvitations
  ]);

  return {
    practices,
    currentPractice,
    loading,
    error,
    createPractice,
    updatePractice,
    updatePracticeDetails,
    deletePractice,
    getMembers,
    fetchMembers,
    updateMemberRole,
    removeMember,
    invitations,
    sendInvitation,
    acceptInvitation,
    declineInvitation,
    getWorkspaceData,
    fetchWorkspaceData,
    acceptMatter,
    rejectMatter,
    updateMatterStatus,
    refetch,
  };
}
