import { apiClient, type ApiRequestConfig } from '@/shared/lib/apiClient';
import { useState, useCallback, useEffect, useRef, useContext } from 'preact/hooks';
import { getPracticeWorkspaceEndpoint } from '@/config/api';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { RoutePracticeContext } from '@/shared/contexts/RoutePracticeContext';
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
  updatePracticeMemberRole as apiUpdatePracticeMemberRole,
  deletePracticeMember as apiDeletePracticeMember,
  clearPublicPracticeDetailsCache
} from '@/shared/lib/apiClient';
import { resetPracticeDetailsStore, setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';
import { queryCache } from '@/shared/lib/queryCache';
import { type MajorAmount } from '@/shared/utils/money';
import { type PracticeRole } from '@/shared/utils/practiceRoles';

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
let practicesLoaded = false;
let practicesInFlight: Promise<void> | null = null;
let isGloballyFetching = false;

// Broadcast loading state to all active hook instances so that when any
// instance starts a fetch, ALL instances immediately see loading=true.
const loadingSubscribers = new Set<(v: boolean) => void>();
const setGlobalLoading = (value: boolean) => {
  isGloballyFetching = value;
  for (const sub of loadingSubscribers) sub(value);
};

// Broadcast the fetched snapshot to all active hook instances so that
// regardless of which instance triggered the fetch, all instances get
// their practices/currentPractice state updated from the same data.
type SnapshotSubscriber = (snapshot: SharedPracticeSnapshot, requestedSlug: string | null) => void;
const snapshotSubscribers = new Set<SnapshotSubscriber>();
const broadcastSnapshot = (snapshot: SharedPracticeSnapshot, requestedSlug: string | null) => {
  for (const sub of snapshotSubscribers) sub(snapshot, requestedSlug);
};

const resetSharedPracticeCache = () => {
  sharedPracticeSnapshot = null;
  sharedPracticePromise = null;
  sharedPracticeUserId = null;
  sharedPracticeIncludesDetails = false;
  practicesLoaded = false;
  practicesInFlight = null;
  isGloballyFetching = false;
};

// Types
export type Role = PracticeRole;
export type BusinessOnboardingStatus = 'not_required' | 'pending' | 'completed' | 'skipped';

// Practice interface - matches apiClient.ts but kept here for backward compatibility
// and to include additional properties specific to practice management
export interface Practice {
  id: string;
  slug: string;
  name: string;
  legalDisclaimer?: string | null;
  betterAuthOrgId?: string;
  stripeCustomerId?: string | null;
  currency?: string | null;
  consultationFee: MajorAmount | null;
  paymentUrl: string | null;
  seats?: number | null;
  subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
  subscriptionPeriodEnd?: number | null;
  config?: {
    ownerEmail?: string;
    metadata?: Record<string, unknown>;
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
  billingIncrementMinutes?: number | null;
  website?: string | null;
  address?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
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
  metadata?: Record<string, unknown>;
}

export interface UpdatePracticeData {
  name?: string;
  slug?: string;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: MajorAmount | null;
  logo?: string;
  metadata?: Record<string, unknown>;
  businessOnboardingStatus?: 'not_required' | 'pending' | 'completed' | 'skipped';
  businessOnboardingHasDraft?: boolean;
}

interface UsePracticeManagementOptions {
  /**
   * When true (default), the hook will automatically fetch practices
   * once the session is available. Tests and advanced callers can disable
   * this to take full control over when loading happens via `refetch()`.
   */
  autoFetchPractices?: boolean;
  /**
   * When true, fetches practice details for the active practice and merges
   * them into the practice list snapshot.
   */
  fetchPracticeDetails?: boolean;
  /**
   * Optional practice slug to resolve as the active practice.
   * If provided, will search for a matching practice in the list.
   * Route-unscoped callers use the backend active organization pointer.
   */
  practiceSlug?: string | null;
  /**
   * When true, fetches onboarding status for the active practice so payout UI
   * can show accurate Stripe onboarding banners. Defaults to false to avoid
   * extra network calls on pages that don't need this information.
   */
  fetchOnboardingStatus?: boolean;
}

interface UsePracticeManagementReturn {
  // Practice CRUD
  practices: Practice[];
  currentPractice: Practice | null;
  isLoading: boolean;
  error: string | null;
  
  // Practice operations
  createPractice: (data: CreatePracticeData) => Promise<Practice>;
  updatePractice: (id: string, data: UpdatePracticeData) => Promise<void>;
  updatePracticeDetails: (id: string, details: PracticeDetailsUpdate) => Promise<PracticeDetails | null>;
  deletePractice: (id: string) => Promise<void>;
  
  updateMemberRole: (practiceId: string, userId: string, role: Role) => Promise<void>;
  removeMember: (practiceId: string, userId: string) => Promise<void>;
  
  // Workspace data
  getWorkspaceData: (practiceId: string, resource: string) => Record<string, unknown>[];
  fetchWorkspaceData: (practiceId: string, resource: string) => Promise<void>;
  
  refetch: () => Promise<void>;
}


const fetchPracticeDetailsFor = async (
  practice: Practice,
  config?: ApiRequestConfig
): Promise<PracticeDetails | null> => {
  return getPracticeDetails(practice.id, config);
};

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
  setIfDefined('billingIncrementMinutes', details.billingIncrementMinutes as Practice['billingIncrementMinutes'] | undefined);
  setIfNonNull('website', details.website as Practice['website'] | undefined | null);
  setIfNonNull('address', details.address as Practice['address'] | undefined | null);
  setIfNonNull('apartment', details.apartment as Practice['apartment'] | undefined | null);
  setIfNonNull('city', details.city as Practice['city'] | undefined | null);
  setIfNonNull('state', details.state as Practice['state'] | undefined | null);
  setIfNonNull('postalCode', details.postalCode as Practice['postalCode'] | undefined | null);
  setIfNonNull('country', details.country as Practice['country'] | undefined | null);
  setIfNonNull('primaryColor', details.primaryColor as Practice['primaryColor'] | undefined | null);
  setIfNonNull('accentColor', details.accentColor as Practice['accentColor'] | undefined | null);
  setIfDefined('legalDisclaimer', details.legalDisclaimer as Practice['legalDisclaimer'] | undefined);
  setIfDefined('isPublic', details.isPublic as Practice['isPublic'] | undefined);
  setIfDefined('services', details.services as Practice['services'] | undefined);
  setIfNonNull('metadata', details.metadata as Practice['metadata'] | undefined | null);
  return {
    ...practice,
    ...patch
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

export const updatePracticeDetailsStandalone = async (
  id: string,
  details: PracticeDetailsUpdate
): Promise<PracticeDetails | null> => {
  if (!id) {
    throw new Error('Practice id is required for details update');
  }

  const updatedDetails = await apiUpdatePracticeDetails(id, details);
  setPracticeDetailsEntry(id, updatedDetails);

  if (updatedDetails && sharedPracticeSnapshot) {
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
    broadcastSnapshot(sharedPracticeSnapshot, null);
  }

  return updatedDetails;
};

/**
 * Select the "current practice" for a hook instance.
 *
 * When a slug is in context (route-scoped), match strictly by slug. Otherwise
 * honor the backend's active organization pointer (`session.active_organization_id`)
 * as the source of truth. If the active org is unset or absent from the list,
 * return null so route guards surface the contract failure instead of choosing
 * an arbitrary workspace.
 *
 * Matching on `practice.id` is deliberate: `PracticeAppRoute` compares
 * `active_organization_id` against `currentPractice.id` to decide whether to
 * re-sync the active org. If "current practice" diverges from the active org
 * here, route code can clobber the backend-selected organization and strand the
 * user in the wrong workspace.
 */
function selectCurrentPracticeFromList(
  list: Practice[],
  requestedSlug: string | null,
  session: unknown
): Practice | null {
  if (requestedSlug) {
    return list.find((practice) => practice.slug === requestedSlug) ?? null;
  }
  const sessionRecord = (session as { session?: Record<string, unknown> } | null | undefined)?.session;
  const rawActiveOrgId = sessionRecord?.active_organization_id;
  const activeOrgId =
    typeof rawActiveOrgId === 'string' && rawActiveOrgId.trim().length > 0 ? rawActiveOrgId : null;
  if (activeOrgId) {
    const byActiveOrg = list.find((practice) => practice.id === activeOrgId);
    if (byActiveOrg) return byActiveOrg;
  }
  return null;
}

export function usePracticeManagement(options: UsePracticeManagementOptions = {}): UsePracticeManagementReturn {
  const {
    autoFetchPractices = true,
    fetchPracticeDetails = false,
    practiceSlug,
    fetchOnboardingStatus = false,
  } = options;
  const { session, isPending: sessionLoading, isAnonymous } = useSessionContext();
  const routePractice = useContext(RoutePracticeContext);
  const [practices, setPractices] = useState<Practice[]>([]);
  const [currentPractice, setCurrentPractice] = useState<Practice | null>(null);
  const [workspaceData, setWorkspaceData] = useState<Record<string, Record<string, Record<string, unknown>[]>>>({});
  // Only show loading when we can actually start an authenticated fetch.
  // Starting in "true" before session readiness can deadlock route guards on
  // soft navigations (login -> /practice/:slug) where the first fetch effect
  // is delayed and no network request ever starts.
  const sessionUserId = session?.user?.id ?? null;
  // Refetch when the backend session's active org changes. The list endpoint is
  // org-scoped, so the session field is part of the query identity.
  const sessionActiveOrgIdForDeps = (() => {
    const sessionRecord = session?.session as Record<string, unknown> | undefined;
    const value = sessionRecord?.active_organization_id;
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  })();
  const [isLoading, setIsLoading] = useState(() => isGloballyFetching || Boolean(
    autoFetchPractices && !sessionLoading && sessionUserId && !isAnonymous && !practicesLoaded
  ));

  // Subscribe this instance to the global loading and snapshot broadcasters.
  // This ensures all instances (RootRoute, PracticeAppRoute, etc.) update
  // together when any one instance starts or finishes a fetch.
  useEffect(() => {
    loadingSubscribers.add(setIsLoading);
    const onSnapshot: SnapshotSubscriber = (snapshot, _callerSlug) => {
      // Re-select currentPractice for this instance: by its own requested slug,
      // or by the active organization pointer when route-unscoped (issue #626).
      const selectedCurrentPractice = selectCurrentPracticeFromList(
        snapshot.practices,
        requestedPracticeSlugRef.current,
        sessionRef.current
      );
      setPractices(snapshot.practices);
      setCurrentPractice(selectedCurrentPractice);
    };
    snapshotSubscribers.add(onSnapshot);
    return () => {
      loadingSubscribers.delete(setIsLoading);
      snapshotSubscribers.delete(onSnapshot);
    };
  }, []);

  const [error, setError] = useState<string | null>(null);
  const requestedPracticeSlug = (() => {
    const explicit = typeof practiceSlug === 'string' ? practiceSlug.trim() : '';
    if (explicit.length > 0) return explicit;
    const routeScopedSlug = routePractice?.practiceSlug?.trim() ?? '';
    if (routeScopedSlug.length > 0 && (routePractice?.workspace === 'practice' || routePractice?.workspace === 'client')) {
      return routeScopedSlug;
    }
    return null;
  })();
  
  const requestedPracticeSlugRef = useRef(requestedPracticeSlug);
  requestedPracticeSlugRef.current = requestedPracticeSlug;

  // Track if we've already fetched practices to prevent duplicate calls
  const practicesFetchedRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const resolvedUserId = !session?.user || isAnonymous ? null : session.user.id;

  // Store session in a ref so fetchPractices can read it at call-time
  // without closing over it as a reactive dependency, preventing the
  // re-entrant fetch loop triggered by active-organization session mutations.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // The team cache key in queryCache includes userId, so user change is
  // naturally segregated. We still defensively drop the prefix on user
  // change to free LRU slots for the new session.
  useEffect(() => {
    queryCache.invalidate('practice:team:', /* prefix */ true);
  }, [resolvedUserId]);

  const getWorkspaceData = useCallback((practiceId: string, resource: string): Record<string, unknown>[] => {
    return workspaceData[practiceId]?.[resource] || [];
  }, [workspaceData]);

  // Track the last practice slug we selected to detect when it changes
  const lastSelectedSlugRef = useRef<string | undefined>();

  // Fetch user's practices
  const fetchPractices = useCallback(async () => {
    let currentFetchPromise: Promise<SharedPracticeSnapshot> | null = null;
    setGlobalLoading(true);
    try {
      const userId = sessionRef.current?.user?.id ?? null;
      if (!userId || isAnonymous) {
        setPractices([]);
        setCurrentPractice(null);
        setGlobalLoading(false);
        practicesFetchedRef.current = false;
        resetSharedPracticeCache();
        resetPracticeDetailsStore();
        clearPublicPracticeDetailsCache();
        return;
      }

      // Check if requestedPracticeSlug has changed - if so, we need to re-select even if already fetched
      const slugChanged = lastSelectedSlugRef.current !== requestedPracticeSlug;
      // applySnapshot broadcasts to all instances so every route gets updated data.
      const applySnapshot = (snapshot: SharedPracticeSnapshot) => {
        broadcastSnapshot(snapshot, requestedPracticeSlug);
        // Also update this instance's own state directly (the subscriber fires
        // after the effect loop which is too late for the calling instance).
        const selectedCurrentPractice = selectCurrentPracticeFromList(
          snapshot.practices,
          requestedPracticeSlug,
          sessionRef.current
        );
        setPractices(snapshot.practices);
        setCurrentPractice(selectedCurrentPractice);
        setGlobalLoading(false);
        practicesFetchedRef.current = true;
        lastSelectedSlugRef.current = requestedPracticeSlug ?? undefined;
      };
      
      if (practicesLoaded && sharedPracticeSnapshot && !slugChanged) {
        let selectedCurrentPractice = sharedPracticeSnapshot.currentPractice;
        if (requestedPracticeSlug) {
          const foundBySlug = sharedPracticeSnapshot.practices.find((p) => p.slug === requestedPracticeSlug);
          selectedCurrentPractice = foundBySlug || null;
        }
        applySnapshot({
          ...sharedPracticeSnapshot,
          currentPractice: selectedCurrentPractice
        });

        // Only early-return if no extra data is requested
        if (!fetchPracticeDetails && !fetchOnboardingStatus) {
          return;
        }
      }

      if (practicesFetchedRef.current && sessionRef.current?.user && (!fetchPracticeDetails || sharedPracticeIncludesDetails) && !slugChanged) {
        if (!fetchOnboardingStatus) return;
      }

      if (sharedPracticeUserId && sharedPracticeUserId !== userId) {
        resetSharedPracticeCache();
      }

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
          details = await fetchPracticeDetailsFor(snapshot.currentPractice, { signal: controller.signal });
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

      if (practicesInFlight) {
        try {
          await practicesInFlight;
        } catch (inFlightError) {
          console.warn('[usePracticeManagement] Shared practices fetch failed', inFlightError);
        }
        if (sharedPracticeSnapshot) {
          let selectedCurrentPractice = sharedPracticeSnapshot.currentPractice;
          if (requestedPracticeSlug) {
            const foundBySlug = sharedPracticeSnapshot.practices.find((p) => p.slug === requestedPracticeSlug);
            selectedCurrentPractice = foundBySlug || null;
          }
          applySnapshot({
            ...sharedPracticeSnapshot,
            currentPractice: selectedCurrentPractice
          });
          
          if (!fetchPracticeDetails && !fetchOnboardingStatus) {
            return;
          }
        }
      }

      if (sharedPracticeSnapshot) {
        // Re-select currentPractice based on practiceSlug even when using cached snapshot
        let selectedCurrentPractice = sharedPracticeSnapshot.currentPractice;
        if (requestedPracticeSlug) {
          const foundBySlug = sharedPracticeSnapshot.practices.find((p) => p.slug === requestedPracticeSlug);
          selectedCurrentPractice = foundBySlug || null;
        }

        const snapshotToApply = {
          ...sharedPracticeSnapshot,
          currentPractice: selectedCurrentPractice
        };

        if (!fetchPracticeDetails || sharedPracticeIncludesDetails || !snapshotToApply.currentPractice) {
          applySnapshot(snapshotToApply);
          if (!fetchOnboardingStatus) return;
        } else {
          setGlobalLoading(true);
          setError(null);
          const hydrated = await hydrateSnapshotDetails(snapshotToApply);
          applySnapshot(hydrated);
          if (!fetchOnboardingStatus) return;
        }
      }

      if (sharedPracticePromise) {
        const cachedPromise = sharedPracticePromise;
        try {
          const cached = await sharedPracticePromise;
          
          // Re-select currentPractice based on practiceSlug even when using cached promise
          let selectedCurrentPractice = cached.currentPractice;
          if (requestedPracticeSlug) {
            const foundBySlug = cached.practices.find((p) => p.slug === requestedPracticeSlug);
            selectedCurrentPractice = foundBySlug || null;
          }

          const cachedToApply = {
            ...cached,
            currentPractice: selectedCurrentPractice
          };

          if (fetchPracticeDetails && !sharedPracticeIncludesDetails && cachedToApply.currentPractice) {
            setGlobalLoading(true);
            setError(null);
            const hydrated = await hydrateSnapshotDetails(cachedToApply);
            applySnapshot(hydrated);
            if (!fetchOnboardingStatus) return;
          } else {
            applySnapshot(cachedToApply);
            if (!fetchOnboardingStatus) return;
          }
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

      setGlobalLoading(true);
      setError(null);

      sharedPracticePromise = (async () => {
        const rawPracticeList = await listPractices({ signal: controller.signal, scope: 'all' });

        const normalizedList = rawPracticeList.filter((practice) => practice.id.length > 0);

        const currentPracticeNext = selectCurrentPracticeFromList(
          normalizedList,
          requestedPracticeSlug,
          sessionRef.current
        );
        let details: PracticeDetails | null = null;
        const shouldFetchStripeStatus = fetchOnboardingStatus;
        let stripeDetailsSubmitted: boolean | null = shouldFetchStripeStatus ? null : false;
        if (currentPracticeNext) {
          if (fetchPracticeDetails) {
            try {
              details = await fetchPracticeDetailsFor(currentPracticeNext, { signal: controller.signal });
              setPracticeDetailsEntry(currentPracticeNext.id, details);
            } catch (detailsError) {
              console.warn('Failed to fetch practice details:', detailsError);
            }
          }
          if (shouldFetchStripeStatus) {
            try {
              const payload = await getOnboardingStatusPayload(
                currentPracticeNext.betterAuthOrgId ?? currentPracticeNext.id,
                { signal: controller.signal }
              );
              stripeDetailsSubmitted = resolveStripeDetailsSubmitted(payload);
            } catch (stripeError) {
              console.warn('Failed to fetch onboarding status:', stripeError);
            }
          }
        }

        const applyStripeOverride = (practice: Practice): Practice => {
          if (!shouldFetchStripeStatus || stripeDetailsSubmitted === null || practice.id !== currentPracticeNext?.id) {
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
      practicesInFlight = sharedPracticePromise
        .then(() => undefined)
        .finally(() => {
          practicesInFlight = null;
          practicesLoaded = true;
        });
      currentFetchPromise = sharedPracticePromise;

      const snapshot = await sharedPracticePromise;
      sharedPracticeSnapshot = snapshot;
      sharedPracticeUserId = userId;
      practicesLoaded = true;
      // Successful fetch — clear any stale forbidden flag so future fetches
      // (e.g. after subscription upgrade) are not blocked.
      applySnapshot(snapshot);
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
      setGlobalLoading(false);
      currentRequestRef.current = null;
      if (sharedPracticePromise === currentFetchPromise) {
        sharedPracticePromise = null;
      }
    }
  }, [fetchOnboardingStatus, fetchPracticeDetails, isAnonymous, requestedPracticeSlug]);

  // Create practice
  const createPractice = useCallback(async (data: CreatePracticeData): Promise<Practice> => {
    if (!data?.name || data.name.trim().length === 0) {
      throw new Error('Practice name is required');
    }

    // Only include slug if user explicitly provided one - API will auto-generate otherwise
    const slug = data.slug && data.slug.trim().length > 0 ? data.slug.trim() : undefined;
    const practice = await apiCreatePractice({
      name: data.name,
      ...(slug ? { slug } : {}),
      ...(data.metadata ? { metadata: data.metadata } : {})
    });

    if (practice?.id) {
      try {
        await apiUpdatePracticeDetails(practice.id, { isPublic: true });
        practice.isPublic = true;
      } catch (err) {
        console.warn('[usePracticeManagement] Failed to enable public visibility by default', err);
      }
    }

    const normalized = practice;
    practicesFetchedRef.current = false;
    await fetchPractices();
    return normalized;
  }, [fetchPractices]);

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

      // businessOnboardingStatus is not part of the API update shape (use the
      // details payload fields instead). Only send the draft flag when present.
    
    if (data.businessOnboardingHasDraft !== undefined) {
      payload.businessOnboardingHasDraft = data.businessOnboardingHasDraft;
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

    if (metadataNext) {
      payload.metadata = metadataNext;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    const response = await apiUpdatePractice(id, payload);
    const mergedResponse: Record<string, unknown> = {
      ...(existingPractice ?? {}),
      ...(response as unknown as Record<string, unknown>)
    };
    if (
      existingPractice?.slug &&
      mergedResponse.slug === mergedResponse.id &&
      existingPractice.slug !== mergedResponse.slug
    ) {
      mergedResponse.slug = existingPractice.slug;
    }
    if (
      existingPractice?.name &&
      (mergedResponse.name === 'Practice' || !mergedResponse.name)
    ) {
      mergedResponse.name = existingPractice.name;
    }
    const updatedPractice = mergedResponse;

    // Don't copy businessOnboardingStatus from payload — the API does not
    // accept a canonical status update via this endpoint. The server will
    // return any updated status in the response which will be merged below.
    if (payload.businessOnboardingHasDraft !== undefined) {
      updatedPractice.businessOnboardingHasDraft = payload.businessOnboardingHasDraft;
    }

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

  }, [practices]);

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
  }, [fetchPractices]);

  // Update member role — apiClient invalidates `practice:team:` via the
  // mutation→invalidation contract.
  const updateMemberRole = useCallback(async (practiceId: string, userId: string, role: Role): Promise<void> => {
    await apiUpdatePracticeMemberRole(practiceId, { userId, role });
  }, []);

  const removeMember = useCallback(async (practiceId: string, userId: string): Promise<void> => {
    await apiDeletePracticeMember(practiceId, userId);
  }, []);

  // Fetch workspace data
  const fetchWorkspaceData = useCallback(async (practiceId: string, resource: string): Promise<void> => {
    try {
      const { data } = await apiClient.get<Record<string, unknown>>(
        getPracticeWorkspaceEndpoint(practiceId, resource),
        { timeout: 15_000 },
      );
      const items = data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)[resource]
        : null;
      setWorkspaceData(prev => ({
        ...prev,
        [practiceId]: {
          ...prev[practiceId],
          [resource]: Array.isArray(items) ? items as Record<string, unknown>[] : []
        }
      }));
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'TimeoutError'
        ? 'Request timed out'
        : err instanceof Error ? err.message : 'Failed to fetch workspace data';
      setError(message);
    }
  }, []);

  // Refetch all data
  const refetch = useCallback(async () => {
    // Reset the fetched flag to ensure we actually refetch
    practicesFetchedRef.current = false;
    resetSharedPracticeCache();
    
    await fetchPractices();
  }, [fetchPractices]);

  // Refetch when session changes
  useEffect(() => {
    if (!autoFetchPractices || sessionLoading) {
      return;
    }

    void fetchPractices();
  }, [
    autoFetchPractices,
    sessionLoading,
    sessionUserId,
    sessionActiveOrgIdForDeps,
    isAnonymous,
    fetchPractices
  ]);

  return {
    practices: practices.length > 0 ? practices : (sharedPracticeSnapshot?.practices ?? []),
    currentPractice: currentPractice || (sharedPracticeSnapshot?.currentPractice ?? null),
    isLoading,
    error,
    createPractice,
    updatePractice,
    updatePracticeDetails,
    deletePractice,
    updateMemberRole,
    removeMember,
    getWorkspaceData,
    fetchWorkspaceData,
    refetch,
  };
}
