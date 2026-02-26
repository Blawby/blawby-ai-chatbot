/**
 * Navigation utilities for the application
 * Provides programmatic navigation using preact-iso's routing system
 */

import { useLocation } from 'preact-iso';
import { useMemo } from 'preact/hooks';

/**
 * Hook for programmatic navigation
 * @returns Object with navigation functions
 */
export function useNavigation() {
  const location = useLocation();

  // Memoize to avoid re-creating functions every render.
  // This prevents effects that depend on navigation callbacks from re-running.
  return useMemo(() => ({
    /**
     * Navigate to a new URL
     * @param url - The URL to navigate to
     * @param replace - Whether to replace the current history entry instead of adding a new one
     */
    navigate: (url: string, replace = false) => {
      location.route(url, replace);
    },

    /**
     * Navigate to the auth page
     * @param mode - Optional auth mode (signin, signup, etc.)
     */
    navigateToAuth: (mode?: string) => {
      const url = mode ? `/auth?mode=${mode}` : '/auth';
      location.route(url);
    },

    /**
     * Navigate to pricing and preserve a safe in-app return path.
     */
    navigateToPricing: (replace = false) => {
      const currentUrl = location.url.startsWith('/')
        ? location.url
        : `/${location.url.replace(/^\/+/, '')}`;
      const target = `/pricing?returnTo=${encodeURIComponent(currentUrl)}`;
      location.route(target, replace);
    },

    /**
     * Navigate to the home page
     */
    navigateToHome: () => {
      location.route('/');
    },

    /**
     * Get current location information
     */
    getCurrentLocation: () => ({
      url: location.url,
      path: location.path,
      query: location.query
    })
  }), [location]);
}
