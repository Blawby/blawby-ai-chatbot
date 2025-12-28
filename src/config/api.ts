// API Configuration
// Environment-aware configuration that uses hardcoded production URL for CORS fix
// and explicit URLs in development

/**
 * Get the base URL for chatbot API requests (local worker)
 * - In development: Uses localhost:8787 for local development
 * - In production: Uses hardcoded ai.blawby.com to avoid CORS issues
 * - Supports VITE_API_URL override for custom development setups
 */
function getBaseUrl(): string {
  // Check for explicit API URL (development/override)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In browser environment, check for localhost
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    const origin = window.location.origin;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return 'http://localhost:8787';
    }
  }

  // Default to production domain when not running in a browser (SSR/build) or when on a custom domain.
  return 'https://ai.blawby.com';
}

/**
 * Get the base URL for remote API requests (practice/subscription management)
 * - Uses staging-api.blawby.com for management endpoints
 * - Can be overridden with VITE_REMOTE_API_URL environment variable
 * - In development with mocks: Uses same origin so MSW can intercept
 */
export function getRemoteApiUrl(): string {
  if (import.meta.env.VITE_REMOTE_API_URL) {
    return import.meta.env.VITE_REMOTE_API_URL;
  }
  
  // In development, use same origin ONLY if MSW is enabled
  // MSW service workers can only intercept same-origin requests
  // If MSW is disabled, use staging-api directly
  if (import.meta.env.DEV) {
    const enableMocks = import.meta.env.VITE_ENABLE_MSW === 'true';
    
    if (enableMocks) {
      // MSW enabled - use same origin for interception
      if (typeof window !== 'undefined' && window.location && window.location.origin) {
        const origin = window.location.origin;
        console.log('[getRemoteApiUrl] DEV mode with MSW - returning window.location.origin:', origin);
        return origin;
      }
      // If window isn't available (SSR), MSW can't intercept anyway
      console.warn('[getRemoteApiUrl] MSW enabled but window unavailable (SSR context). Falling back to staging-api.');
      return 'https://staging-api.blawby.com';
    } else {
      // MSW disabled - use staging-api directly
      console.log('[getRemoteApiUrl] DEV mode without MSW - using staging-api directly');
      return 'https://staging-api.blawby.com';
    }
  }
  
  return 'https://staging-api.blawby.com';
}

const API_CONFIG = {
  baseUrl: getBaseUrl(),
  chatEndpoint: '/api/chat',
  practicesEndpoint: '/api/practices',
  healthEndpoint: '/api/health',
  matterCreationEndpoint: '/api/matter-creation'
};

export const getApiConfig = () => {
  return API_CONFIG;
};

export const getChatEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.chatEndpoint}`;
};

export const getFormsEndpoint = () => {
  return `${getRemoteApiUrl()}/api/practice-client-intakes/submit`;
};

// Practice workspace endpoints (chatbot data) - still local
export const getPracticesEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.practicesEndpoint}`;
};

export const getHealthEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.healthEndpoint}`;
};

export const getMatterCreationEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.matterCreationEndpoint}`;
};

// Subscription endpoints - now handled by remote API
export const getSubscriptionBillingPortalEndpoint = () => {
  return `${getRemoteApiUrl()}/api/auth/subscription/billing-portal`;
};

export const getSubscriptionCancelEndpoint = () => {
  return `${getRemoteApiUrl()}/api/subscription/cancel`;
};

export const getSubscriptionListEndpoint = () => {
  return `${getRemoteApiUrl()}/api/auth/subscription/list`;
};

// Practice management endpoints - now handled by remote API
export const getPracticesManagementEndpoint = () => {
  return `${getRemoteApiUrl()}/api/practices`;
};

export const getPracticeManagementEndpoint = (practiceId: string) => {
  return `${getRemoteApiUrl()}/api/practices/${encodeURIComponent(practiceId)}`;
};

export const getPracticeWorkspaceEndpoint = (practiceId: string, resource: string) => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/practices/${encodeURIComponent(practiceId)}/workspace/${encodeURIComponent(resource)}`;
};

// Session endpoints - now handled by remote API
// Session endpoints removed - using conversations instead
/**
 * @deprecated Sessions have been migrated to conversations. Use getConversationsEndpoint() instead.
 * This function is kept for backward compatibility with legacy code.
 */
export const getSessionsEndpoint = () => {
  return `${getRemoteApiUrl()}/api/conversations`;
};

// Conversation endpoints - now handled by remote API
export const getConversationsEndpoint = () => {
  return `${getRemoteApiUrl()}/api/conversations`;
};

export const getConversationEndpoint = (conversationId: string) => {
  return `${getRemoteApiUrl()}/api/conversations/${encodeURIComponent(conversationId)}`;
};

export const getCurrentConversationEndpoint = () => {
  return `${getRemoteApiUrl()}/api/conversations/active`;
};

export const getConversationParticipantsEndpoint = (conversationId: string) => {
  return `${getRemoteApiUrl()}/api/conversations/${encodeURIComponent(conversationId)}/participants`;
};

// Chat message endpoints - now handled by remote API
export const getChatMessagesEndpoint = () => {
  return `${getRemoteApiUrl()}/api/chat/messages`;
};
