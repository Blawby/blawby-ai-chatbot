// API Configuration
// Environment-aware configuration that uses hardcoded production URL for CORS fix
// and explicit URLs in development

/**
 * Get the base URL for API requests
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
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return 'http://localhost:8787';
    }
  }

  // Default to production domain when not running in a browser (SSR/build) or when on a custom domain.
  return 'https://ai.blawby.com';
}

const API_CONFIG = {
  baseUrl: getBaseUrl(),
  chatEndpoint: '/api/chat',
  organizationsEndpoint: '/api/organizations',
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

export const getOrganizationsEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.organizationsEndpoint}`;
};

export const getHealthEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.healthEndpoint}`;
};

export const getMatterCreationEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}${config.matterCreationEndpoint}`;
};

export const getPaymentUpgradeEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/payment/upgrade`;
};

export const getPaymentStatusEndpoint = (paymentId: string) => {
  const config = getApiConfig();
  const encodedId = encodeURIComponent(paymentId);
  return `${config.baseUrl}/api/payment/status/${encodedId}`;
};

export const getSubscriptionUpgradeEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/auth/subscription/upgrade`;
};

export const getSubscriptionBillingPortalEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/auth/subscription/billing-portal`;
};

export const getSubscriptionSyncEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/subscription/sync`;
};

export const getSubscriptionCancelEndpoint = () => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/subscription/cancel`;
};

export const getOrganizationWorkspaceEndpoint = (orgId: string, resource: string) => {
  const config = getApiConfig();
  return `${config.baseUrl}/api/organizations/${encodeURIComponent(orgId)}/workspace/${encodeURIComponent(resource)}`;
};
