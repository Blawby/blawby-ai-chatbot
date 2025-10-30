import { useState, useCallback } from 'preact/hooks';
import {
  getSubscriptionUpgradeEndpoint,
  getSubscriptionBillingPortalEndpoint,
  getSubscriptionSyncEndpoint,
} from '../config/api';
import { useToastContext } from '../contexts/ToastContext';

// Helper functions for safe type extraction from API responses
function extractUrl(result: unknown): string | undefined {
  if (result && typeof result === 'object' && result !== null) {
    // Check for direct url property
    if ('url' in result && typeof result.url === 'string') {
      return result.url;
    }
    
    // Check for url in data property
    if ('data' in result && result.data && typeof result.data === 'object' && result.data !== null) {
      if ('url' in result.data && typeof result.data.url === 'string') {
        return result.data.url;
      }
    }
  }
  return undefined;
}

function extractErrorMessage(result: unknown, fallback: string): string {
  if (result && typeof result === 'object' && result !== null) {
    // Check for direct error property
    if ('error' in result && typeof result.error === 'string') {
      return result.error;
    }
    
    // Check for error in data property
    if ('data' in result && result.data && typeof result.data === 'object' && result.data !== null) {
      if ('error' in result.data && typeof result.data.error === 'string') {
        return result.data.error;
      }
    }
  }
  return fallback;
}

function extractSubscription(result: unknown): unknown {
  if (result && typeof result === 'object' && result !== null) {
    // Check for direct subscription property
    if ('subscription' in result) {
      return result.subscription;
    }
    
    // Check for subscription in data property
    if ('data' in result && result.data && typeof result.data === 'object' && result.data !== null) {
      if ('subscription' in result.data) {
        return result.data.subscription;
      }
    }
  }
  return null;
}

function extractProperty<T>(result: unknown, property: string): T | undefined {
  if (result && typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    if (property in obj) {
      return obj[property] as T;
    }
  }
  return undefined;
}

// Error codes for subscription operations (matching backend)
enum SubscriptionErrorCode {
  SUBSCRIPTION_ALREADY_ACTIVE = 'SUBSCRIPTION_ALREADY_ACTIVE',
  EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED',
  ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  STRIPE_CHECKOUT_FAILED = 'STRIPE_CHECKOUT_FAILED',
  STRIPE_BILLING_PORTAL_FAILED = 'STRIPE_BILLING_PORTAL_FAILED',
  STRIPE_CUSTOMER_NOT_FOUND = 'STRIPE_CUSTOMER_NOT_FOUND',
  STRIPE_SUBSCRIPTION_NOT_FOUND = 'STRIPE_SUBSCRIPTION_NOT_FOUND',
  INVALID_ORGANIZATION_ID = 'INVALID_ORGANIZATION_ID',
  INVALID_SEAT_COUNT = 'INVALID_SEAT_COUNT',
  INVALID_PLAN_TYPE = 'INVALID_PLAN_TYPE',
  SUBSCRIPTION_SYNC_FAILED = 'SUBSCRIPTION_SYNC_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Enhanced API response interface
interface SubscriptionApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: SubscriptionErrorCode;
  details?: unknown;
}

// Error titles for UI display
const ERROR_TITLES: Record<SubscriptionErrorCode, string> = {
  [SubscriptionErrorCode.SUBSCRIPTION_ALREADY_ACTIVE]: 'Subscription Active',
  [SubscriptionErrorCode.EMAIL_VERIFICATION_REQUIRED]: 'Verify Email',
  [SubscriptionErrorCode.ORGANIZATION_NOT_FOUND]: 'Organization Not Found',
  [SubscriptionErrorCode.INSUFFICIENT_PERMISSIONS]: 'Access Denied',
  [SubscriptionErrorCode.STRIPE_CHECKOUT_FAILED]: 'Upgrade Failed',
  [SubscriptionErrorCode.STRIPE_BILLING_PORTAL_FAILED]: 'Billing Portal Error',
  [SubscriptionErrorCode.STRIPE_CUSTOMER_NOT_FOUND]: 'Customer Not Found',
  [SubscriptionErrorCode.STRIPE_SUBSCRIPTION_NOT_FOUND]: 'Subscription Not Found',
  [SubscriptionErrorCode.INVALID_ORGANIZATION_ID]: 'Invalid Request',
  [SubscriptionErrorCode.INVALID_SEAT_COUNT]: 'Invalid Request',
  [SubscriptionErrorCode.INVALID_PLAN_TYPE]: 'Invalid Request',
  [SubscriptionErrorCode.SUBSCRIPTION_SYNC_FAILED]: 'Subscription Sync Error',
  [SubscriptionErrorCode.INTERNAL_ERROR]: 'System Error',
};

// Helper function to get error title
function getErrorTitle(errorCode: SubscriptionErrorCode): string {
  return ERROR_TITLES[errorCode] || 'Error';
}

export interface SubscriptionUpgradeRequest {
  organizationId: string;
  seats?: number | null;
  annual?: boolean;
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
}

export interface BillingPortalRequest {
  organizationId: string;
  returnUrl?: string;
}

export const usePaymentUpgrade = () => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showError, showSuccess } = useToastContext();

  const buildSuccessUrl = useCallback((organizationId: string) => {
    if (typeof window === 'undefined') return '/business-onboarding';
    const url = new URL(`${window.location.origin}/business-onboarding`);
    url.searchParams.set('organizationId', organizationId);
    url.searchParams.set('sync', '1');
    return url.toString();
  }, []);

  const buildCancelUrl = useCallback((organizationId: string) => {
    if (typeof window === 'undefined') return '/settings/account';
    const url = new URL(`${window.location.origin}/settings/account`);
    url.searchParams.set('organizationId', organizationId);
    url.searchParams.set('cancelled', '1');
    return url.toString();
  }, []);

  const openBillingPortal = useCallback(
    async ({ organizationId, returnUrl }: BillingPortalRequest) => {
      try {
        const response = await fetch(getSubscriptionBillingPortalEndpoint(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceId: organizationId,
            returnUrl: returnUrl ?? '/settings/account',
          }),
        });

        const result = await response.json().catch(() => ({}));
        
        const url = extractUrl(result);
        if (!url) {
          console.error('Invalid response structure: missing or invalid url property', result);
        }
        if (!response.ok || !url) {
          // Handle specific error codes
          if (result && typeof result === 'object' && 'errorCode' in result) {
            throw new Error(JSON.stringify({
              errorCode: result.errorCode,
              message: extractErrorMessage(result, 'Unable to open billing portal'),
              details: (result && typeof result === 'object' && 'details' in result) ? result.details : undefined
            }));
          }
          
          const message = extractErrorMessage(result, 'Unable to open billing portal');
          throw new Error(message);
        }

        window.location.href = url;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to open billing portal';
        
        // Try to parse structured error response
        let errorCode: SubscriptionErrorCode | null = null;
        let errorMessage = message;
        
        try {
          const parsedError = JSON.parse(message);
          if (parsedError.errorCode && Object.values(SubscriptionErrorCode).includes(parsedError.errorCode)) {
            errorCode = parsedError.errorCode as SubscriptionErrorCode;
            errorMessage = parsedError.message || message;
          }
        } catch {
          // Not a structured error, use original message
        }

        const title = errorCode ? getErrorTitle(errorCode) : 'Billing Portal Error';
        showError(title, errorMessage);
      }
    },
    [showError]
  );

  const handleAlreadySubscribed = useCallback(
    async (organizationId: string, returnUrl: string) => {
      setError(null);
      // Redirect directly to billing portal to manage current subscription
      await openBillingPortal({ organizationId, returnUrl });
    },
    [openBillingPortal]
  );

  const submitUpgrade = useCallback(
    async ({ organizationId, seats = 1, annual = false, successUrl, cancelUrl, returnUrl }: SubscriptionUpgradeRequest): Promise<void> => {
      setSubmitting(true);
      setError(null);

      const resolvedSuccessUrl = successUrl ?? buildSuccessUrl(organizationId);
      const resolvedCancelUrl = cancelUrl ?? buildCancelUrl(organizationId);
      const resolvedReturnUrl = returnUrl ?? resolvedSuccessUrl;

      // Frontend pre-flight: if org already on a paid tier, send user to billing portal
      // Note: backend remains the source of truth for final decision to prevent race conditions
      try {
        const orgRes = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}`, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        if (orgRes.ok) {
          const org = await orgRes.json().catch(() => ({} as Record<string, unknown>));
          const orgData = org as Record<string, unknown>;
          const tier = (orgData as Record<string, unknown>)?.subscriptionTier || (orgData as Record<string, unknown>)?.subscription_tier;
          const isPaidTier = Boolean(tier) && tier !== 'free' && tier !== 'trial';
          if (isPaidTier) {
            // User is already on a paid plan, redirect to billing management
            await openBillingPortal({ organizationId, returnUrl: resolvedReturnUrl });
            return;
          }
        }
      } catch (preflight) {
        // Fail open to backend guard
        if (import.meta.env.DEV) {
          console.warn('Upgrade pre-flight check failed; proceeding to backend:', preflight);
        }
      }

      try {
        const requestBody: Record<string, unknown> = {
          plan: 'business',
          referenceId: organizationId,
          annual,
          successUrl: resolvedSuccessUrl,
          cancelUrl: resolvedCancelUrl,
          returnUrl: resolvedReturnUrl,
        };
        if (seats > 1) {
          requestBody.seats = seats;
        }
        
        if (import.meta.env.DEV) {
          console.debug('[UPGRADE] POST', getSubscriptionUpgradeEndpoint(), 'body:', requestBody);
        }
        const response = await fetch(getSubscriptionUpgradeEndpoint(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const result = await response.json().catch(() => ({}));
        // Always log status; only log body in development to avoid leaking sensitive data in production
        console.debug('[UPGRADE] Response status:', response.status);
        if (import.meta.env.DEV) {
          console.debug('[UPGRADE] Response body:', result);
        }
        const checkoutUrl = extractUrl(result);

        if (!response.ok || !checkoutUrl) {
          // Handle Better Auth raw code: YOURE_ALREADY_SUBSCRIBED_TO_THIS_PLAN
          const rawCode = extractProperty<string>(result, 'code');
          if (rawCode && rawCode.toUpperCase() === 'YOURE_ALREADY_SUBSCRIBED_TO_THIS_PLAN') {
            await handleAlreadySubscribed(organizationId, resolvedReturnUrl);
            return;
          }

          if (import.meta.env.DEV) {
            // Only log in development, and sanitize sensitive data
            const sanitizedResult = {
              error: extractProperty<string>(result, 'error'),
              success: extractProperty<boolean>(result, 'success'),
              errorCode: extractProperty<string>(result, 'errorCode'),
              code: extractProperty<string>(result, 'code'),
              // Exclude sensitive fields like organizationId, subscription details, etc.
            };
            console.error('❌ Subscription upgrade failed with response:', sanitizedResult);
          }
          
          // Handle specific error codes
          const errorCode = extractProperty<string>(result, 'errorCode');
          if (errorCode) {
            throw new Error(JSON.stringify({
              errorCode,
              message: extractErrorMessage(result, 'Subscription upgrade failed'),
              details: extractProperty<unknown>(result, 'details')
            }));
          }
          
          const message = extractErrorMessage(result, 'Unable to initiate Stripe checkout');
          throw new Error(message);
        }

        window.location.href = checkoutUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upgrade failed';
        
        // Try to parse structured error response
        let errorCode: SubscriptionErrorCode | null = null;
        let errorMessage = message;
        
        try {
          const parsedError = JSON.parse(message);
          if (parsedError.errorCode && Object.values(SubscriptionErrorCode).includes(parsedError.errorCode)) {
            errorCode = parsedError.errorCode as SubscriptionErrorCode;
            errorMessage = parsedError.message || message;
          }
        } catch {
          // Not a structured error, fall back to string matching for backward compatibility
        }

        // Handle specific error codes with robust logic
        if (errorCode === SubscriptionErrorCode.SUBSCRIPTION_ALREADY_ACTIVE) {
          await handleAlreadySubscribed(organizationId, resolvedReturnUrl);
          return;
        }

        if (errorCode === SubscriptionErrorCode.EMAIL_VERIFICATION_REQUIRED) {
          setError(errorMessage);
          showError(
            'Verify Email',
            'Please verify your email address before upgrading. Check your inbox for the verification link.'
          );
          return;
        }

        // Handle other specific error codes
        if (errorCode) {
          setError(errorMessage);
          const title = getErrorTitle(errorCode);
          showError(title, errorMessage);
          return;
        }

        // Fallback to original string matching for backward compatibility
        const normalizedMessage = message.toLowerCase();
        if (normalizedMessage.includes("already subscribed to this plan")) {
          await handleAlreadySubscribed(organizationId, resolvedReturnUrl);
          return;
        }

        if (normalizedMessage.includes('email verification is required')) {
          setError(message);
          showError(
            'Verify Email',
            'Please verify your email address before upgrading. Check your inbox for the verification link.'
          );
          return;
        }

        setError(message);
        showError('Upgrade Failed', message);
      } finally {
        setSubmitting(false);
      }
    },
    [buildCancelUrl, buildSuccessUrl, handleAlreadySubscribed, showError]
  );

  const syncSubscription = useCallback(
    async (organizationId: string) => {
      try {
        const response = await fetch(getSubscriptionSyncEndpoint(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId }),
        });

        const result = await response.json().catch(() => ({})) as SubscriptionApiResponse<{ subscription: unknown }>;
        const success = extractProperty<boolean>(result, 'success');
        if (!response.ok || success === false) {
          // Handle specific error codes
          const errorCode = extractProperty<string>(result, 'errorCode');
          if (errorCode) {
            throw new Error(JSON.stringify({
              errorCode,
              message: extractErrorMessage(result, 'Failed to refresh subscription status'),
              details: extractProperty<unknown>(result, 'details')
            }));
          }
          
          const message = extractErrorMessage(result, 'Failed to refresh subscription status');
          throw new Error(message);
        }

        showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        return extractSubscription(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refresh subscription status';
        
        // Try to parse structured error response
        let errorCode: SubscriptionErrorCode | null = null;
        let errorMessage = message;
        
        try {
          const parsedError = JSON.parse(message);
          if (parsedError.errorCode && Object.values(SubscriptionErrorCode).includes(parsedError.errorCode)) {
            errorCode = parsedError.errorCode as SubscriptionErrorCode;
            errorMessage = parsedError.message || message;
          }
        } catch {
          // Not a structured error, use original message
        }

        const title = errorCode ? getErrorTitle(errorCode) : 'Subscription Sync Error';
        showError(title, errorMessage);
        return null;
      }
    },
    [showError, showSuccess]
  );

  return {
    submitting,
    error,
    submitUpgrade,
    openBillingPortal,
    syncSubscription,
  };
};
