import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { z } from 'zod';
import type { PracticeConfig } from '../../../worker/types';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { getPractice, getPublicPracticeDetails } from '@/shared/lib/apiClient';
import { setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';

// Zod schema for API response validation
// Note: createdAt/updatedAt can be either number (timestamp) or string (ISO date) depending on the API
const PracticeSchema = z.object({
  slug: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  domain: z.string().nullable().optional(), // API can return null
  createdAt: z.union([z.number(), z.string()]).optional(),
  updatedAt: z.union([z.number(), z.string()]).nullable().optional(), // API can return null or string
  stripeCustomerId: z.string().nullable().optional(), // API can return null
  seats: z.number().optional(),
  kind: z.enum(['personal', 'business']).optional(),
  subscriptionStatus: z.enum(['none', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused']).optional()
});

// Extended config with name for UI convenience (name comes from Practice, not config)
export interface UIPracticeConfig extends PracticeConfig {
  id?: string; // Optional - comes from Practice object
  slug?: string; // Optional - comes from Practice object
  name?: string; // Optional - comes from Practice object
}

const buildDefaultPracticeConfig = (overrides: Partial<UIPracticeConfig> = {}): UIPracticeConfig => ({
  id: '',
  slug: '',
  name: '',
  profileImage: null,
  introMessage: '',
  description: '',
  availableServices: [],
  serviceQuestions: {},
  domain: '',
  brandColor: '#000000',
  accentColor: 'gold',
  voice: {
    enabled: false,
    provider: 'cloudflare',
    voiceId: null,
    displayName: null,
    previewUrl: null
  },
  ...overrides
});


interface UsePracticeConfigOptions {
  onError?: (error: string) => void;
  practiceId?: string; // Optional explicit override
  allowUnauthenticated?: boolean;
  refreshKey?: string | number | null;
}

export const usePracticeConfig = ({
  onError,
  practiceId: explicitPracticeId,
  allowUnauthenticated = false,
  refreshKey
}: UsePracticeConfigOptions = {}) => {
  const { session } = useSessionContext();
  const isAuthenticated = Boolean(session?.user);
  const practiceId = typeof explicitPracticeId === 'string' ? explicitPracticeId.trim() : '';
  const [practiceNotFound, setPracticeNotFound] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [practiceConfig, setPracticeConfig] = useState<UIPracticeConfig>(() => buildDefaultPracticeConfig());
  const refreshKeyRef = useRef<string | number | null | undefined>(refreshKey);

  // Store onError in a ref so it never appears in useCallback deps.
  // This prevents fetchPracticeConfig from being recreated every render when
  // callers pass inline arrow functions (which is the common pattern in route components).
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Use ref to track if we've already fetched for this practiceId and auth mode
  // Cache key format: "${practiceId}|${isAuthenticated?'auth':'unauth'}"
  const fetchedPracticeIds = useRef<Set<string>>(new Set());
  
  // Track current request to prevent stale responses from clobbering state
  const currentRequestRef = useRef<{
    practiceId: string;
    abortController: AbortController;
  } | null>(null);

  // Helper to create cache key including auth mode
  const getCacheKey = useCallback((pId: string, isAuth: boolean): string => {
    return `${pId}|${isAuth ? 'auth' : 'unauth'}`;
  }, []);

  // Fetch practice configuration
  const fetchPracticeConfig = useCallback(async (currentPracticeId: string) => {
    const requestedPracticeId = currentPracticeId;
    const cacheKey = getCacheKey(currentPracticeId, isAuthenticated);
    
    if (fetchedPracticeIds.current.has(cacheKey)) {
      return; // Don't fetch if we've already fetched for this practiceId+auth mode
    }

    // Mark as fetching immediately to prevent duplicate calls
    fetchedPracticeIds.current.add(cacheKey);

    // Abort any existing request
    if (currentRequestRef.current) {
      currentRequestRef.current.abortController.abort();
    }

    // Create new request tracking
    const controller = new AbortController();
    currentRequestRef.current = {
      practiceId: currentPracticeId,
      abortController: controller
    };

    setIsLoading(true);

    const isStaleRequest = (): boolean => {
      const isStale =
        !currentRequestRef.current ||
        currentRequestRef.current.practiceId !== requestedPracticeId ||
        controller.signal.aborted;
      if (isStale) {
        fetchedPracticeIds.current.delete(cacheKey);
      }
      return isStale;
    };

    try {
      if (allowUnauthenticated) {
        const publicDetails = await getPublicPracticeDetails(currentPracticeId, { signal: controller.signal });
        if (isStaleRequest()) {
          return;
        }

        if (publicDetails) {
          const details = publicDetails.details;
          const resolvedDetailsId = publicDetails.practiceId ?? currentPracticeId;
          if (details) {
            setPracticeDetailsEntry(currentPracticeId, details);
          }
          if (details && resolvedDetailsId && resolvedDetailsId !== currentPracticeId) {
            setPracticeDetailsEntry(resolvedDetailsId, details);
          }
          const config = buildDefaultPracticeConfig({
            id: publicDetails.practiceId,
            slug: publicDetails.slug ?? currentPracticeId,
            name: publicDetails.name ?? '',
            profileImage: publicDetails.logo ?? null,
            introMessage: details?.introMessage ?? '',
            description: details?.description ?? '',
            accentColor: details?.accentColor ?? 'gold',
            isPublic: details?.isPublic
          });

          setPracticeConfig(config);
          setPracticeNotFound(false);
          setIsLoading(false);
          return;
        }

        // No public details available - mark as not found for unauthenticated access.
        fetchedPracticeIds.current.delete(cacheKey);
        setPracticeNotFound(true);
        setIsLoading(false);
        return;
      }

      // Try to get specific practice by ID or slug only
      let practice: z.infer<typeof PracticeSchema> | undefined;
      try {
        const practiceData = await getPractice(currentPracticeId, { signal: controller.signal });
        if (isStaleRequest()) {
          return;
        }
        if (practiceData) {
          practice = PracticeSchema.parse(practiceData as unknown as Record<string, unknown>);
        }
      } catch (e) {
        // If direct fetch fails, fall through to list approach when authenticated
        console.debug('[usePracticeConfig] Direct practice fetch failed, falling back to list', e);
      }

      // Check again before processing practice data
      if (isStaleRequest()) {
        return; // Request is stale or aborted, don't update state
      }

      if (practice) {
        // Practice exists, use its config or defaults
        // Parse config safely - config is Record<string, unknown> from API
        const cfg = practice.config as Partial<PracticeConfig> || {};

          const config: UIPracticeConfig = {
          id: practice.id,
          slug: practice.slug,
          name: practice.name || '',
          profileImage: cfg.profileImage ?? null,
          introMessage: cfg.introMessage ?? '',
          description: cfg.description ?? '',
          availableServices: cfg.availableServices ?? [],
          serviceQuestions: cfg.serviceQuestions ?? {},
          domain: cfg.domain ?? '',
          brandColor: cfg.brandColor ?? '#000000',
          accentColor: cfg.accentColor ?? 'gold',
          voice: {
            enabled: typeof cfg.voice?.enabled === 'boolean' ? cfg.voice.enabled : false,
            provider: cfg.voice?.provider ?? 'cloudflare',
            voiceId: cfg.voice?.voiceId ?? null,
            displayName: cfg.voice?.displayName ?? null,
            previewUrl: cfg.voice?.previewUrl ?? null
          }
        };

        setPracticeConfig(config);
        setPracticeNotFound(false);
      } else {
        // Practice not found in the list - this indicates a 404-like scenario
        // Remove from fetched set so it can be retried
        fetchedPracticeIds.current.delete(cacheKey);
        setPracticeNotFound(true);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted; allow a new attempt to proceed
        fetchedPracticeIds.current.delete(cacheKey);
        return;
      }
      console.warn('Failed to fetch practice config:', error);
      setPracticeNotFound(true);
      onErrorRef.current?.('Failed to load practice configuration');
    } finally {
      // Clear the current request ref and reset loading state
      if (currentRequestRef.current?.practiceId === currentPracticeId) {
        currentRequestRef.current = null;
        // Only clear loading state if no newer request replaced this one
        setIsLoading(false);
      }
    }
  }, [allowUnauthenticated, isAuthenticated]);

  // Retry function for practice config
  const handleRetryPracticeConfig = useCallback(() => {
    setPracticeNotFound(false);
    // Remove from fetched set so we can retry
    const cacheKey = getCacheKey(practiceId, isAuthenticated);
    fetchedPracticeIds.current.delete(cacheKey);
    // Clear any current request to allow retry
    if (currentRequestRef.current) {
      currentRequestRef.current.abortController.abort();
      currentRequestRef.current = null;
    }
    fetchPracticeConfig(practiceId);
  }, [practiceId, fetchPracticeConfig, getCacheKey, isAuthenticated]);

  // Fetch practice config when explicit practiceId changes
  useEffect(() => {
    if ((isAuthenticated || allowUnauthenticated) && practiceId) {
      fetchPracticeConfig(practiceId);
    } else if (!practiceId) {
      setPracticeNotFound(false);
      setIsLoading(false);
      setPracticeConfig(buildDefaultPracticeConfig());
    }

    // Cleanup: abort any in-flight requests when effect unmounts or dependencies change
    return () => {
      if (currentRequestRef.current) {
        currentRequestRef.current.abortController.abort();
      }
    };
  }, [practiceId, isAuthenticated, allowUnauthenticated, fetchPracticeConfig]);

  useEffect(() => {
    if (!practiceId) return;
    if (refreshKey === undefined) return;
    if (refreshKeyRef.current === refreshKey) return;
    refreshKeyRef.current = refreshKey;
    const cacheKey = getCacheKey(practiceId, isAuthenticated);
    fetchedPracticeIds.current.delete(cacheKey);
    fetchPracticeConfig(practiceId);
  }, [fetchPracticeConfig, practiceId, refreshKey, isAuthenticated, getCacheKey]);

  return {
    practiceId,
    practiceConfig,
    practiceNotFound,
    isLoading,
    handleRetryPracticeConfig,
  };
}; 
