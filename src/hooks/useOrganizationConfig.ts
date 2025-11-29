import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { z } from 'zod';
import type { OrganizationConfig } from '../../worker/types';
import { useSessionContext } from '../contexts/SessionContext.js';
import { useSession } from '../lib/authClient.js';
import { DEFAULT_ORGANIZATION_ID } from '../utils/constants.js';
import { apiClient } from '../lib/apiClient.js';

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

const OrganizationsResponseSchema = z.object({
  data: z.array(OrganizationSchema)
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
    name: 'Blawby AI',
    profileImage: '/blawby-favicon-iframe.png',
    introMessage: "Hello! I'm Blawby AI, your intelligent legal assistant. I can help you with family law, business law, contract review, intellectual property, employment law, personal injury, criminal law, civil law, and general legal consultation. How can I assist you today?",
    description: 'AI-powered legal assistance for businesses and individuals',
    availableServices: ['Family Law', 'Business Law', 'Contract Review', 'Intellectual Property', 'Employment Law', 'Personal Injury', 'Criminal Law', 'Civil Law', 'General Consultation'],
    serviceQuestions: {
      'Family Law': [
        "I understand this is a difficult time. Can you tell me what type of family situation you're dealing with?",
        "What are the main issues you're facing?",
        "Have you taken any steps to address this situation?",
        "What would a good outcome look like for you?"
      ],
      'Business Law': [
        "What type of business entity are you operating or planning to start?",
        "What specific legal issue are you facing with your business?",
        "Are you dealing with contracts, employment issues, or regulatory compliance?",
        "What is the size and scope of your business operations?"
      ],
      'Contract Review': [
        "What type of contract do you need reviewed?",
        "What is the value or importance of this contract?",
        "Are there any specific concerns or red flags you've noticed?",
        "What is the timeline for this contract?"
      ],
      'Intellectual Property': [
        "What type of intellectual property are you dealing with?",
        "Are you looking to protect, license, or enforce IP rights?",
        "What is the nature of your IP (patent, trademark, copyright, trade secret)?",
        "What is the commercial value or importance of this IP?"
      ],
      'Employment Law': [
        "What specific employment issue are you facing?",
        "Are you an employer or employee in this situation?",
        "Have you taken any steps to address this issue?",
        "What is the timeline or urgency of your situation?"
      ],
      'Personal Injury': [
        "Can you tell me about the incident that caused your injury?",
        "What type of injuries did you sustain?",
        "Have you received medical treatment?",
        "What is the current status of your recovery?"
      ],
      'Criminal Law': [
        "What type of legal situation are you facing?",
        "Are you currently facing charges or under investigation?",
        "Have you been arrested or contacted by law enforcement?",
        "Do you have an attorney representing you?"
      ],
      'Civil Law': [
        "What type of civil legal issue are you dealing with?",
        "Are you involved in a lawsuit or considering legal action?",
        "What is the nature of the dispute?",
        "What outcome are you hoping to achieve?"
      ],
      'General Consultation': [
        "Thanks for reaching out! I'd love to help. Can you tell me what legal situation you're dealing with?",
        "Have you been able to take any steps to address this yet?",
        "What would a good outcome look like for you?",
        "Do you have any documents or information that might be relevant?"
      ]
    },
    jurisdiction: {
      type: 'national',
      description: 'Available nationwide',
      supportedStates: ['all'],
      supportedCountries: ['US']
    },
    voice: {
      enabled: false,
      provider: 'cloudflare',
      voiceId: null,
      displayName: null,
      previewUrl: null
    }
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
          const response = await apiClient.get(`/api/practice/${encodeURIComponent(currentOrganizationId)}`, { signal: controller.signal });
          if (isStaleRequest()) {
            return;
          }
          const practice = response.data?.practice || response.data;
          if (practice) {
            organization = OrganizationSchema.parse(practice);
          }
        } catch (e) {
          // If direct fetch fails, fall through to list approach
          console.debug('[useOrganizationConfig] Direct practice fetch failed, falling back to list', e);
        }
      }
      
      // If we don't have the organization yet, list all practices and find the matching one
      if (!organization) {
        const response = await apiClient.get('/api/practice/list', { signal: controller.signal });
        
        // Check if this request is still current before processing response
        if (isStaleRequest()) {
          return; // Request is stale or aborted, don't update state
        }

        const practices = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.practices)
            ? response.data.practices
            : [];
        
        organization = practices.find((t: any) => t.slug === currentOrganizationId || t.id === currentOrganizationId);
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
          type: cfg.jurisdiction?.type ?? 'national',
          description: cfg.jurisdiction?.description ?? 'Available nationwide',
          supportedStates: cfg.jurisdiction?.supportedStates ?? ['all'],
          supportedCountries: cfg.jurisdiction?.supportedCountries ?? ['US'],
          primaryState: cfg.jurisdiction?.primaryState
        };

        const config: UIOrganizationConfig = {
          name: organization.name || 'Blawby AI',
          profileImage: cfg.profileImage ?? '/blawby-favicon-iframe.png',
          introMessage: cfg.introMessage ?? null,
          description: cfg.description ?? null,
          availableServices: cfg.availableServices ?? [],
          serviceQuestions: cfg.serviceQuestions ?? {},
          jurisdiction: normalizedJurisdiction,
          voice: {
            enabled: Boolean(cfg.voice?.enabled),
            provider: cfg.voice?.provider ?? 'cloudflare',
            voiceId: cfg.voice?.voiceId ?? null,
            displayName: cfg.voice?.displayName ?? null,
            previewUrl: cfg.voice?.previewUrl ?? null
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
