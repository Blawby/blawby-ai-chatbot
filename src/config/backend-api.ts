// Blawby Backend API Configuration
// Environment-aware configuration for the new backend API

/**
 * Get the base URL for Blawby Backend API requests
 * - Development & Production: Uses Railway production backend
 * - Supports VITE_BACKEND_API_URL override for local development if needed
 * 
 * Note: VITE_BACKEND_API_URL should include the /api prefix if using a local backend
 * Example: VITE_BACKEND_API_URL=http://localhost:3000/api
 */
function getBackendBaseUrl(): string {
  // Check for explicit backend API URL (development/override)
  if (import.meta.env.VITE_BACKEND_API_URL) {
    // VITE_BACKEND_API_URL should include /api prefix for local development
    return import.meta.env.VITE_BACKEND_API_URL;
  }
  
  // Use Railway backend for both development and production
  // Include /api prefix to match backend routing
  return 'https://blawby-backend-production.up.railway.app/api';
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
