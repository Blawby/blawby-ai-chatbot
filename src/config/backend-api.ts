// Blawby Backend API Configuration
// Environment-aware configuration for the new backend API

/**
 * Get the base URL for Blawby Backend API requests
 * - Production: Requires VITE_BACKEND_API_URL to be set
 * - Development: Allows fallback to localhost for convenience
 * 
 * Note: VITE_BACKEND_API_URL should include the /api prefix if using a local backend
 * Example: VITE_BACKEND_API_URL=http://localhost:3000/api
 */
function getBackendBaseUrl(): string {
  // Check for explicit backend API URL
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_API_URL) {
    const url = import.meta.env.VITE_BACKEND_API_URL;
    return normalizeUrl(url);
  }
  
  // In production, require the environment variable
  // Safely check for production environment with fallback to false
  const isProd = typeof import.meta !== 'undefined' && 
                 import.meta.env && 
                 import.meta.env.PROD === true;
  
  // Only throw error in browser environment, not during build
  if (isProd && typeof window !== 'undefined') {
    throw new Error('VITE_BACKEND_API_URL environment variable is required in production. Set it to your backend API URL (e.g., https://your-api.com/api)');
  }
  
  // Development fallback - allow localhost for convenience
  return normalizeUrl('http://localhost:3000/api');
}

/**
 * Normalize URL by trimming trailing slashes and validating protocol
 */
function normalizeUrl(url: string): string {
  // Trim trailing slashes
  const normalized = url.replace(/\/+$/, '');
  
  // Validate URL starts with http:// or https://
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    throw new Error(`Invalid backend URL: ${url}. URL must start with http:// or https://`);
  }
  
  return normalized;
}

const BACKEND_API_CONFIG = {
  baseUrl: getBackendBaseUrl(),
  authEndpoint: '/auth',
  practiceEndpoint: '/practice',
  healthEndpoint: '/health'
};

export const getBackendApiConfig = () => {
  return BACKEND_API_CONFIG;
};

export const getAuthEndpoint = () => {
  const config = getBackendApiConfig();
  return `${config.baseUrl}${config.authEndpoint}`;
};

export const getPracticeEndpoint = () => {
  const config = getBackendApiConfig();
  return `${config.baseUrl}${config.practiceEndpoint}`;
};

export const getHealthEndpoint = () => {
  const config = getBackendApiConfig();
  return `${config.baseUrl}${config.healthEndpoint}`;
};
