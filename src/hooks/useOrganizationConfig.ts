import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { z } from 'zod';
import type { OrganizationConfig } from '../../worker/types';
import { useSessionContext } from '../contexts/SessionContext.js';
import { useSession } from '../lib/authClient.js';
import { DEFAULT_ORGANIZATION_ID } from '../utils/constants.js';
import { listPractices, getPractice } from '../lib/apiClient.js';
import { PLATFORM_SETTINGS } from '../config/platform.js';
import { isPlatformOrganization } from '../utils/organization.js';

// Zod schema for API response validation
const OrganizationSchema = z.object({
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

// Extended config with name for UI convenience (name comes from Organization, not config)
export interface UIOrganizationConfig extends OrganizationConfig {
  name?: string; // Optional - comes from Organization object
}

interface UseOrganizationConfigOptions {
  onError?: (error: string) => void;
  organizationId?: string; // Optional explicit override
}

export const useOrganizationConfig = ({ onError, organizationId: explicitOrgId }: UseOrganizationConfigOptions = {}) => {
  const { activeOrganizationId } = useSessionContext();
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const [organizationId, setOrganizationId] = useState<string>('');
  const [organizationNotFound, setOrganizationNotFound] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [organizationConfig, setOrganizationConfig] = useState<UIOrganizationConfig>({
    ...PLATFORM_SETTINGS
  });

  // Use ref to track if we've already fetched for this organizationId
  const fetchedOrganizationIds = useRef<Set<string>>(new Set());
  
  // Track current request to prevent stale responses from clobbering state
  const currentRequestRef = useRef<{
    organizationId: string;
    abortController: AbortController;
  } | null>(null);

  // Parse URL parameters for configuration
  const parseUrlParams = useCallback(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const organizationIdParam = urlParams.get('organizationId');
      const hostname = window.location.hostname;
      

      // Domain-based organization routing
      if (hostname === 'northcarolinalegalservices.blawby.com') {
        setOrganizationId('north-carolina-legal-services');
        return;
      }

      // Priority: URL param > explicit param > active org > constant (only if authenticated)
      if (organizationIdParam) {
        setOrganizationId(organizationIdParam);
      } else {
        // Only default to DEFAULT_ORGANIZATION_ID if user is authenticated
        // Unauthenticated users should have empty organizationId (will show auth page)
        const resolved = (explicitOrgId ?? activeOrganizationId ?? (isAuthenticated ? DEFAULT_ORGANIZATION_ID : ''));
        setOrganizationId(resolved);
      }
    }
  }, [explicitOrgId, activeOrganizationId, isAuthenticated]);

  // Fetch organization configuration
  const fetchOrganizationConfig = useCallback(async (currentOrganizationId: string) => {
    const requestedOrganizationId = currentOrganizationId;
    // Always fetch the specified organization configuration
    // No need for personal organization fallback since we default to blawby-ai
    if (isPlatformOrganization(currentOrganizationId)) {
      fetchedOrganizationIds.current.add(currentOrganizationId);
      setOrganizationConfig({ ...PLATFORM_SETTINGS });
      setOrganizationNotFound(false);
      setIsLoading(false);
      return;
    }
    
    if (fetchedOrganizationIds.current.has(currentOrganizationId)) {
      return; // Don't fetch if we've already fetched for this organizationId
    }

    // Mark as fetching immediately to prevent duplicate calls
    fetchedOrganizationIds.current.add(currentOrganizationId);

    // Abort any existing request
    if (currentRequestRef.current) {
      currentRequestRef.current.abortController.abort();
    }

    // Create new request tracking
    const controller = new AbortController();
    currentRequestRef.current = {
      organizationId: currentOrganizationId,
      abortController: controller
    };

    setIsLoading(true);

    const isStaleRequest = (): boolean => {
      const isStale =
        !currentRequestRef.current ||
        currentRequestRef.current.organizationId !== requestedOrganizationId ||
        controller.signal.aborted;
      if (isStale) {
        fetchedOrganizationIds.current.delete(currentOrganizationId);
      }
      return isStale;
    };

    try {
      // Try to get specific practice by ID first, then fall back to listing all practices
      let organization: z.infer<typeof OrganizationSchema> | undefined;
      
      // If organizationId looks like a UUID, try to fetch it directly
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentOrganizationId) ||
                     /^[A-Z0-9]{26}$/i.test(currentOrganizationId); // Also support shorter IDs
      
      if (isUuid) {
        try {
          const practice = await getPractice(currentOrganizationId, { signal: controller.signal });
          if (isStaleRequest()) {
            return;
          }
          if (practice) {
            organization = OrganizationSchema.parse(practice as unknown as Record<string, unknown>);
          }
        } catch (e) {
          // If direct fetch fails, fall through to list approach
          console.debug('[useOrganizationConfig] Direct practice fetch failed, falling back to list', e);
        }
      }
      
      // If we don't have the organization yet, list all practices and find the matching one
      if (!organization) {
        const practices = await listPractices({ signal: controller.signal });
        
        if (isStaleRequest()) {
          return;
        }

        organization = practices.find(
          (t) => t.slug === currentOrganizationId || t.id === currentOrganizationId
        ) as unknown as z.infer<typeof OrganizationSchema> | undefined;
      }

      // Check again before processing organization data
      if (isStaleRequest()) {
        return; // Request is stale or aborted, don't update state
      }

      if (organization) {
        // Organization exists, use its config or defaults
        // Parse config safely - config is Record<string, unknown> from API
        const cfg = organization.config as Partial<OrganizationConfig> || {};
        const normalizedJurisdiction: OrganizationConfig['jurisdiction'] = {
          type: cfg.jurisdiction?.type ?? PLATFORM_SETTINGS.jurisdiction.type,
          description: cfg.jurisdiction?.description ?? PLATFORM_SETTINGS.jurisdiction.description,
          supportedStates: cfg.jurisdiction?.supportedStates ?? PLATFORM_SETTINGS.jurisdiction.supportedStates,
          supportedCountries: cfg.jurisdiction?.supportedCountries ?? PLATFORM_SETTINGS.jurisdiction.supportedCountries,
          primaryState: cfg.jurisdiction?.primaryState
        };

        const config: UIOrganizationConfig = {
          name: organization.name || PLATFORM_SETTINGS.name,
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
        setOrganizationConfig(config);
        setOrganizationNotFound(false);
      } else {
        // Organization not found in the list - this indicates a 404-like scenario
        // Remove from fetched set so it can be retried
        fetchedOrganizationIds.current.delete(currentOrganizationId);
        setOrganizationNotFound(true);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted; remove fetched marker so a new attempt can proceed
        fetchedOrganizationIds.current.delete(currentOrganizationId);
        return;
      }
      // Remove from fetched set so it can be retried
      fetchedOrganizationIds.current.delete(currentOrganizationId);
      console.warn('Failed to fetch organization config:', error);
      setOrganizationNotFound(true);
      onError?.('Failed to load organization configuration');
    } finally {
      // Clear the current request ref and reset loading state
      if (currentRequestRef.current?.organizationId === currentOrganizationId) {
        currentRequestRef.current = null;
        // Only clear loading state if no newer request replaced this one
        setIsLoading(false);
      }
    }
  }, [onError]);

  // Retry function for organization config
  const handleRetryOrganizationConfig = useCallback(() => {
    setOrganizationNotFound(false);
    // Remove from fetched set so we can retry
    fetchedOrganizationIds.current.delete(organizationId);
    // Clear any current request to allow retry
    if (currentRequestRef.current) {
      currentRequestRef.current.abortController.abort();
      currentRequestRef.current = null;
    }
    fetchOrganizationConfig(organizationId);
  }, [organizationId, fetchOrganizationConfig]);

  // Initialize URL parameters on mount
  useEffect(() => {
    parseUrlParams();
  }, [parseUrlParams]);

  // Fetch organization config when organizationId changes
  // Only fetch if authenticated and organizationId is not empty
  useEffect(() => {
    if (isAuthenticated && organizationId) {
      fetchOrganizationConfig(organizationId);
    }
  }, [organizationId, isAuthenticated, fetchOrganizationConfig]);

  return {
    organizationId,
    organizationConfig,
    organizationNotFound,
    isLoading,
    handleRetryOrganizationConfig,
    setOrganizationId
  };
}; 
