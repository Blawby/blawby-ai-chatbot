import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { z } from 'zod';
import type { PracticeConfig } from '../../worker/types';
import { useSessionContext } from '../contexts/SessionContext.js';
import { useSession } from '../lib/authClient.js';
import { DEFAULT_PRACTICE_ID } from '../utils/constants.js';
import { listPractices, getPractice } from '../lib/apiClient.js';
import { PLATFORM_SETTINGS } from '../config/platform.js';
import { isPlatformPractice } from '../utils/practice.js';

// Zod schema for API response validation
const PracticeSchema = z.object({
  slug: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  domain: z.string().nullable().optional(), // API can return null
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  stripeCustomerId: z.string().nullable().optional(), // API can return null
  subscriptionTier: z.string().optional(),
  seats: z.number().optional(),
  kind: z.enum(['personal', 'business']).optional(),
  subscriptionStatus: z.enum(['none', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused']).optional()
});

// Extended config with name for UI convenience (name comes from Practice, not config)
export interface UIPracticeConfig extends PracticeConfig {
  name?: string; // Optional - comes from Practice object
}

interface UsePracticeConfigOptions {
  onError?: (error: string) => void;
  practiceId?: string; // Optional explicit override
}

export const usePracticeConfig = ({ onError, practiceId: explicitPracticeId }: UsePracticeConfigOptions = {}) => {
  const { activePracticeId } = useSessionContext();
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const [practiceId, setPracticeId] = useState<string>('');
  const [practiceNotFound, setPracticeNotFound] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [practiceConfig, setPracticeConfig] = useState<UIPracticeConfig>({
    ...PLATFORM_SETTINGS
  });

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
      const hostname = window.location.hostname;
      

      // Domain-based practice routing
      if (hostname === 'northcarolinalegalservices.blawby.com') {
        setPracticeId('north-carolina-legal-services');
        return;
      }

      // Priority: URL param > explicit param > active practice > constant (only if authenticated)
      if (practiceIdParam) {
        setPracticeId(practiceIdParam);
      } else {
        // Only default to DEFAULT_PRACTICE_ID if user is authenticated
        // Unauthenticated users should have empty practiceId (will show auth page)
        const resolved = (explicitPracticeId ?? activePracticeId ?? (isAuthenticated ? DEFAULT_PRACTICE_ID : ''));
        setPracticeId(resolved);
      }
    }
  }, [explicitPracticeId, activePracticeId, isAuthenticated]);

  // Fetch practice configuration
  const fetchPracticeConfig = useCallback(async (currentPracticeId: string) => {
    const requestedPracticeId = currentPracticeId;
    // Always fetch the specified practice configuration
    // No need for personal practice fallback since we default to blawby-ai
    if (isPlatformPractice(currentPracticeId)) {
      fetchedPracticeIds.current.add(currentPracticeId);
      setPracticeConfig({ ...PLATFORM_SETTINGS });
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
      // Try to get specific practice by ID first, then fall back to listing all practices
      let practice: z.infer<typeof PracticeSchema> | undefined;
      
      // If practiceId looks like a UUID, try to fetch it directly
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentPracticeId) ||
                     /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(currentPracticeId); // Also support shorter IDs (ULID with Crockford Base32)
      
      if (isUuid) {
        try {
          const practiceData = await getPractice(currentPracticeId, { signal: controller.signal });
          if (isStaleRequest()) {
            return;
          }
          if (practiceData) {
            practice = PracticeSchema.parse(practiceData as unknown as Record<string, unknown>);
          }
        } catch (e) {
          // If direct fetch fails, fall through to list approach
          console.debug('[usePracticeConfig] Direct practice fetch failed, falling back to list', e);
        }
      }
      
      // If we don't have the practice yet, list all practices and find the matching one
      if (!practice) {
        const practices = await listPractices({ signal: controller.signal, scope: 'all' });
        
        if (isStaleRequest()) {
          return;
        }

        practice = practices.find(
          (t) => t.id === currentPracticeId
        ) as unknown as z.infer<typeof PracticeSchema> | undefined;
      }

      // Check again before processing practice data
      if (isStaleRequest()) {
        return; // Request is stale or aborted, don't update state
      }

      if (practice) {
        // Practice exists, use its config or defaults
        // Parse config safely - config is Record<string, unknown> from API
        const cfg = practice.config as Partial<PracticeConfig> || {};
        const normalizedJurisdiction: PracticeConfig['jurisdiction'] = {
          type: cfg.jurisdiction?.type ?? PLATFORM_SETTINGS.jurisdiction.type,
          description: cfg.jurisdiction?.description ?? PLATFORM_SETTINGS.jurisdiction.description,
          supportedStates: cfg.jurisdiction?.supportedStates ?? PLATFORM_SETTINGS.jurisdiction.supportedStates,
          supportedCountries: cfg.jurisdiction?.supportedCountries ?? PLATFORM_SETTINGS.jurisdiction.supportedCountries,
          primaryState: cfg.jurisdiction?.primaryState
        };

        const config: UIPracticeConfig = {
          name: practice.name || PLATFORM_SETTINGS.name,
          profileImage: cfg.profileImage ?? PLATFORM_SETTINGS.profileImage,
          introMessage: cfg.introMessage ?? PLATFORM_SETTINGS.introMessage,
          description: cfg.description ?? PLATFORM_SETTINGS.description,
          availableServices: cfg.availableServices ?? PLATFORM_SETTINGS.availableServices,
          serviceQuestions: cfg.serviceQuestions ?? PLATFORM_SETTINGS.serviceQuestions,
          jurisdiction: normalizedJurisdiction,
          voice: {
            enabled: typeof cfg.voice?.enabled === 'boolean' ? cfg.voice.enabled : PLATFORM_SETTINGS.voice.enabled,
            provider: cfg.voice?.provider ?? PLATFORM_SETTINGS.voice.provider,
            voiceId: cfg.voice?.voiceId ?? PLATFORM_SETTINGS.voice.voiceId,
            displayName: cfg.voice?.displayName ?? PLATFORM_SETTINGS.voice.displayName,
            previewUrl: cfg.voice?.previewUrl ?? PLATFORM_SETTINGS.voice.previewUrl
          }
        };
        setPracticeConfig(config);
        setPracticeNotFound(false);
      } else {
        // Practice not found in the list - this indicates a 404-like scenario
        // Remove from fetched set so it can be retried
        fetchedPracticeIds.current.delete(currentPracticeId);
        setPracticeNotFound(true);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted; remove fetched marker so a new attempt can proceed
        fetchedPracticeIds.current.delete(currentPracticeId);
        return;
      }
      // Remove from fetched set so it can be retried
      fetchedPracticeIds.current.delete(currentPracticeId);
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
  }, [onError]);

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
  // Only fetch if authenticated and practiceId is not empty
  useEffect(() => {
    if (isAuthenticated && practiceId) {
      fetchPracticeConfig(practiceId);
    }
  }, [practiceId, isAuthenticated, fetchPracticeConfig]);

  return {
    practiceId,
    practiceConfig,
    practiceNotFound,
    isLoading,
    handleRetryPracticeConfig,
    setPracticeId
  };
}; 
