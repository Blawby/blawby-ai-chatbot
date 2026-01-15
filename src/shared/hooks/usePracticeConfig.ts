import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { z } from 'zod';
import type { PracticeConfig } from '../../../worker/types';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { DEFAULT_PRACTICE_ID } from '@/shared/utils/constants';
import { getPractice, getPublicPracticeDetails } from '@/shared/lib/apiClient';
import { PLATFORM_SETTINGS } from '@/config/platform';
import { isPlatformPractice } from '@/shared/utils/practice';

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
  subscriptionTier: z.string().optional(),
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
  id: PLATFORM_SETTINGS.id,
  slug: PLATFORM_SETTINGS.slug,
  name: PLATFORM_SETTINGS.name,
  profileImage: PLATFORM_SETTINGS.profileImage ?? null,
  introMessage: PLATFORM_SETTINGS.introMessage ?? '',
  description: PLATFORM_SETTINGS.description ?? '',
  availableServices: PLATFORM_SETTINGS.availableServices,
  serviceQuestions: PLATFORM_SETTINGS.serviceQuestions,
  domain: '',
  brandColor: '#000000',
  accentColor: '#000000',
  voice: PLATFORM_SETTINGS.voice,
  ...overrides
});

interface UsePracticeConfigOptions {
  onError?: (error: string) => void;
  practiceId?: string; // Optional explicit override
  allowUnauthenticated?: boolean;
}

export const usePracticeConfig = ({
  onError,
  practiceId: explicitPracticeId,
  allowUnauthenticated = false
}: UsePracticeConfigOptions = {}) => {
  const { activePracticeId, session } = useSessionContext();
  const isAuthenticated = Boolean(session?.user);
  const [practiceId, setPracticeId] = useState<string>('');
  const [practiceNotFound, setPracticeNotFound] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [practiceConfig, setPracticeConfig] = useState<UIPracticeConfig>(() => buildDefaultPracticeConfig());

  // Use ref to track if we've already fetched for this practiceId
  const fetchedPracticeIds = useRef<Set<string>>(new Set());
  
  // Track current request to prevent stale responses from clobbering state
  const currentRequestRef = useRef<{
    practiceId: string;
    abortController: AbortController;
  } | null>(null);

  // Parse URL parameters for configuration
  const parseUrlParams = useCallback(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const practiceIdParam = urlParams.get('practiceId');

      // Priority: explicit param (slug from path) > URL query param > active practice > constant (only if authenticated)
      // explicitPracticeId takes priority because it comes from path-based routing (guest routes)
      const resolved = (explicitPracticeId ?? practiceIdParam ?? activePracticeId ?? (isAuthenticated ? DEFAULT_PRACTICE_ID : ''));
      setPracticeId(resolved);
    }
  }, [explicitPracticeId, activePracticeId, isAuthenticated]);

  // Fetch practice configuration
  const fetchPracticeConfig = useCallback(async (currentPracticeId: string) => {
    const requestedPracticeId = currentPracticeId;
    // Always fetch the specified practice configuration
    // No need for personal practice fallback since we default to blawby-ai
    if (isPlatformPractice(currentPracticeId)) {
      fetchedPracticeIds.current.add(currentPracticeId);
      setPracticeConfig(buildDefaultPracticeConfig());
      setPracticeNotFound(false);
      setIsLoading(false);
      return;
    }
    
    if (fetchedPracticeIds.current.has(currentPracticeId)) {
      return; // Don't fetch if we've already fetched for this practiceId
    }

    // Mark as fetching immediately to prevent duplicate calls
    fetchedPracticeIds.current.add(currentPracticeId);

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
        fetchedPracticeIds.current.delete(currentPracticeId);
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
          const config = buildDefaultPracticeConfig({
            id: publicDetails.practiceId,
            slug: publicDetails.slug ?? currentPracticeId,
            introMessage: details?.introMessage ?? PLATFORM_SETTINGS.introMessage ?? '',
            description: details?.description ?? PLATFORM_SETTINGS.description ?? '',
            isPublic: details?.isPublic
          });

          setPracticeConfig(config);
          setPracticeNotFound(false);
          setIsLoading(false);
          return;
        }

        // No public details available - mark as not found for unauthenticated access.
        fetchedPracticeIds.current.delete(currentPracticeId);
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
          name: practice.name || PLATFORM_SETTINGS.name,
          profileImage: cfg.profileImage ?? PLATFORM_SETTINGS.profileImage ?? null,
          introMessage: cfg.introMessage ?? PLATFORM_SETTINGS.introMessage ?? '',
          description: cfg.description ?? PLATFORM_SETTINGS.description ?? '',
          availableServices: cfg.availableServices ?? PLATFORM_SETTINGS.availableServices,
          serviceQuestions: cfg.serviceQuestions ?? PLATFORM_SETTINGS.serviceQuestions,
          domain: cfg.domain ?? '',
          brandColor: cfg.brandColor ?? '#000000',
          accentColor: cfg.accentColor ?? '#000000',
          voice: {
            enabled: typeof cfg.voice?.enabled === 'boolean' ? cfg.voice.enabled : PLATFORM_SETTINGS.voice.enabled,
            provider: cfg.voice?.provider ?? PLATFORM_SETTINGS.voice.provider,
            voiceId: cfg.voice?.voiceId ?? PLATFORM_SETTINGS.voice.voiceId,
            displayName: cfg.voice?.displayName ?? PLATFORM_SETTINGS.voice.displayName,
            previewUrl: cfg.voice?.previewUrl ?? PLATFORM_SETTINGS.voice.previewUrl
          }
        };
        setPracticeConfig(config);
        if (practice.id && practice.id !== currentPracticeId) {
          fetchedPracticeIds.current.add(practice.id);
          setPracticeId(practice.id);
        }
        setPracticeNotFound(false);
      } else {
        // Practice not found in the list - this indicates a 404-like scenario
        // Remove from fetched set so it can be retried
        fetchedPracticeIds.current.delete(currentPracticeId);
        setPracticeNotFound(true);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted; allow a new attempt to proceed
        fetchedPracticeIds.current.delete(currentPracticeId);
        return;
      }
      console.warn('Failed to fetch practice config:', error);
      setPracticeNotFound(true);
      onError?.('Failed to load practice configuration');
    } finally {
      // Clear the current request ref and reset loading state
      if (currentRequestRef.current?.practiceId === currentPracticeId) {
        currentRequestRef.current = null;
        // Only clear loading state if no newer request replaced this one
        setIsLoading(false);
      }
    }
  }, [allowUnauthenticated, onError]);

  // Retry function for practice config
  const handleRetryPracticeConfig = useCallback(() => {
    setPracticeNotFound(false);
    // Remove from fetched set so we can retry
    fetchedPracticeIds.current.delete(practiceId);
    // Clear any current request to allow retry
    if (currentRequestRef.current) {
      currentRequestRef.current.abortController.abort();
      currentRequestRef.current = null;
    }
    fetchPracticeConfig(practiceId);
  }, [practiceId, fetchPracticeConfig]);

  // Initialize URL parameters on mount
  useEffect(() => {
    parseUrlParams();
  }, [parseUrlParams]);

  // Fetch practice config when practiceId changes
  // Only fetch if authenticated (or guest access enabled) and practiceId is not empty
  useEffect(() => {
    if ((isAuthenticated || allowUnauthenticated) && practiceId) {
      fetchPracticeConfig(practiceId);
    }
  }, [practiceId, isAuthenticated, allowUnauthenticated, fetchPracticeConfig]);

  return {
    practiceId,
    practiceConfig,
    practiceNotFound,
    isLoading,
    handleRetryPracticeConfig,
    setPracticeId
  };
}; 
