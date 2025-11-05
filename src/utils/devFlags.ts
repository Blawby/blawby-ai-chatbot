/**
 * Determines whether the client should force paid state in development/test environments.
 * Consolidates logic shared between cart and onboarding flows.
 */
export function isForcePaidEnabled(): boolean {
  if (import.meta.env.MODE === 'production') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('forcePaid') === '1') {
      return true;
    }

    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('forcePaid') === '1';
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[devFlags] Failed to resolve forcePaid flag:', error);
    }
  }

  return false;
}
