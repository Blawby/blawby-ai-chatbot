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
 */
export function getRemoteApiUrl(): string {
  if (import.meta.env.VITE_REMOTE_API_URL) {
    return import.meta.env.VITE_REMOTE_API_URL;
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
  const config = getApiConfig();
  return `${config.baseUrl}/api/forms`;
};

export const getFeedbackEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/feedback`;
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
export const getSubscriptionUpgradeEndpoint = () => {
  return `${getRemoteApiUrl()}/api/auth/subscription/upgrade`;
};

export const getSubscriptionBillingPortalEndpoint = () => {
  return `${getRemoteApiUrl()}/api/auth/subscription/billing-portal`;
};

export const getSubscriptionSyncEndpoint = () => {
  return `${getRemoteApiUrl()}/api/subscription/sync`;
};

export const getSubscriptionCancelEndpoint = () => {
  return `${getRemoteApiUrl()}/api/subscription/cancel`;
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
