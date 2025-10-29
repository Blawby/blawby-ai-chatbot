import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { z } from 'zod';

// API endpoints - moved inline since api.ts was removed
const getOrganizationsEndpoint = () => '/api/organizations';

// Zod schema for API response validation
const OrganizationSchema = z.object({
  slug: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  isPersonal: z.boolean().optional(),
  domain: z.string().nullable().optional(), // API can return null
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  stripeCustomerId: z.string().nullable().optional(), // API can return null
  subscriptionTier: z.string().optional(),
  seats: z.number().optional()
});

const OrganizationsResponseSchema = z.object({
  data: z.array(OrganizationSchema)
});

interface OrganizationConfig {
  name: string;
  profileImage: string | null;
  introMessage: string | null;
  description: string | null;
  availableServices: string[];
  serviceQuestions?: Record<string, string[]>;
  jurisdiction?: {
    type: 'national' | 'state';
    description: string;
    supportedStates: string[];
    supportedCountries: string[];
    primaryState?: string;
  };
  voice: {
    enabled: boolean;
    provider: 'cloudflare' | 'elevenlabs' | 'custom';
    voiceId?: string | null;
    displayName?: string | null;
    previewUrl?: string | null;
  };
}

// Schema to validate and narrow the unknown config shape
const OrganizationConfigSchema = z.object({
  profileImage: z.string().nullable().optional(),
  introMessage: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  availableServices: z.array(z.string()).optional(),
  serviceQuestions: z.record(z.string(), z.array(z.string())).optional(),
  jurisdiction: z.object({
    type: z.enum(['national', 'state']).optional(),
    description: z.string().optional(),
    supportedStates: z.array(z.string()).optional(),
    supportedCountries: z.array(z.string()).optional(),
    primaryState: z.string().optional()
  }).optional(),
  voice: z.object({
    enabled: z.boolean().optional(),
    provider: z.enum(['cloudflare', 'elevenlabs', 'custom']).optional(),
    voiceId: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    previewUrl: z.string().nullable().optional()
  }).optional()
});

interface UseOrganizationConfigOptions {
  onError?: (error: string) => void;
}

export const useOrganizationConfig = ({ onError }: UseOrganizationConfigOptions = {}) => {
  // Using our custom organization system instead of Better Auth's organization plugin
  
  const [organizationId, setOrganizationId] = useState<string>('');
  const [organizationNotFound, setOrganizationNotFound] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [organizationConfig, setOrganizationConfig] = useState<OrganizationConfig>({
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

      // Check if we're on the root domain with no parameters - redirect to Blawby AI
      if (hostname === 'ai.blawby.com' &&
        window.location.pathname === '/' &&
        !organizationIdParam) {
        // Redirect to Blawby AI
        window.location.href = 'https://ai.blawby.com/?organizationId=blawby-ai';
        return;
      }

      // Always use blawby-ai for organization configuration (UI display)
      // This ensures chat, profile image, intro message, etc. come from blawby-ai
      if (organizationIdParam) {
        setOrganizationId(organizationIdParam);
      } else {
        // Default to blawby-ai for organization configuration
        setOrganizationId('blawby-ai');
      }
    }
  }, []);

  // Fetch organization configuration
  const fetchOrganizationConfig = useCallback(async (currentOrganizationId: string) => {
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

    try {
      const response = await fetch(getOrganizationsEndpoint(), { signal: controller.signal });

      // Check if this request is still current before processing response
      if (!currentRequestRef.current || 
          currentRequestRef.current.organizationId !== currentOrganizationId ||
          controller.signal.aborted) {
        return; // Request is stale or aborted, don't update state
      }

      if (response.ok) {
        try {
          const rawResponse = await response.json();
          const organizationsResponse = OrganizationsResponseSchema.parse(rawResponse);
          const organization = organizationsResponse.data.find((t) => t.slug === currentOrganizationId || t.id === currentOrganizationId);

          // Check again before processing organization data
          if (!currentRequestRef.current || 
              currentRequestRef.current.organizationId !== currentOrganizationId ||
              controller.signal.aborted) {
            return; // Request is stale or aborted, don't update state
          }

          if (organization) {
            // Organization exists, use its config or defaults
            const parsedConfig = organization.config ? OrganizationConfigSchema.safeParse(organization.config) : { success: true, data: {} as z.infer<typeof OrganizationConfigSchema> };
            const cfg = parsedConfig.success ? parsedConfig.data : {} as z.infer<typeof OrganizationConfigSchema>;
            const normalizedJurisdiction: OrganizationConfig['jurisdiction'] = {
              type: cfg.jurisdiction?.type ?? 'national',
              description: cfg.jurisdiction?.description ?? 'Available nationwide',
              supportedStates: cfg.jurisdiction?.supportedStates ?? ['all'],
              supportedCountries: cfg.jurisdiction?.supportedCountries ?? ['US'],
              primaryState: cfg.jurisdiction?.primaryState
            };

            const config: OrganizationConfig = {
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
        } catch (parseError) {
          // Remove from fetched set so it can be retried
          fetchedOrganizationIds.current.delete(currentOrganizationId);
          console.error('Failed to parse organizations response:', parseError);
          setOrganizationNotFound(true);
          onError?.('Invalid organization configuration data received');
        }
      } else if (response.status === 404) {
        // Only set organization not found for actual 404 responses
        // Remove from fetched set so it can be retried
        fetchedOrganizationIds.current.delete(currentOrganizationId);
        setOrganizationNotFound(true);
      } else {
        // For other HTTP errors, set organization not found as well
        // Remove from fetched set so it can be retried
        fetchedOrganizationIds.current.delete(currentOrganizationId);
        setOrganizationNotFound(true);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted, don't update state
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
  useEffect(() => {
    // Only fetch if organizationId is not empty
    if (organizationId) {
      fetchOrganizationConfig(organizationId);
    }
  }, [organizationId, fetchOrganizationConfig]);

  return {
    organizationId,
    organizationConfig,
    organizationNotFound,
    isLoading,
    handleRetryOrganizationConfig,
    setOrganizationId
  };
}; 
