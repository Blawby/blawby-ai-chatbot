import { useState, useCallback } from 'preact/hooks';
import {
  getSubscriptionUpgradeEndpoint,
  getSubscriptionBillingPortalEndpoint,
  getSubscriptionSyncEndpoint,
} from '../config/api';
import { useToastContext } from '../contexts/ToastContext';

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
    if (typeof window === 'undefined') return '/settings/account';
    const url = new URL(`${window.location.origin}/settings/account`);
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

        const result = await response.json().catch(() => ({})) as Record<string, unknown>;
        const url: string | undefined = result?.url ?? result?.data?.url;
        if (!response.ok || !url) {
          // Handle specific error codes
          if (result?.errorCode) {
            throw new Error(JSON.stringify({
              errorCode: result.errorCode,
              message: result.error || 'Unable to open billing portal',
              details: result.details
            }));
          }
          
          const message = result?.error || 'Unable to open billing portal';
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

  const submitUpgrade = useCallback(
    async ({ organizationId, seats = 1, annual = false, successUrl, cancelUrl, returnUrl }: SubscriptionUpgradeRequest): Promise<void> => {
      setSubmitting(true);
      setError(null);

      const resolvedSuccessUrl = successUrl ?? buildSuccessUrl(organizationId);
      const resolvedCancelUrl = cancelUrl ?? buildCancelUrl(organizationId);
      const resolvedReturnUrl = returnUrl ?? resolvedSuccessUrl;

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
        

        const response = await fetch(getSubscriptionUpgradeEndpoint(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const result = await response.json().catch(() => ({})) as Record<string, unknown>;
        const checkoutUrl: string | undefined = result?.url ?? result?.data?.url;

        if (!response.ok || !checkoutUrl) {
          if (import.meta.env.DEV) {
            // Only log in development, and sanitize sensitive data
            const sanitizedResult = {
              error: result?.error,
              success: result?.success,
              errorCode: result?.errorCode,
              // Exclude sensitive fields like organizationId, subscription details, etc.
            };
            console.error('❌ Subscription upgrade failed with response:', sanitizedResult);
          }
          
          // Handle specific error codes
          if (result?.errorCode) {
            throw new Error(JSON.stringify({
              errorCode: result.errorCode,
              message: result.error || 'Subscription upgrade failed',
              details: result.details
            }));
          }
          
          const message = result?.error || 'Unable to initiate Stripe checkout';
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
          // Treat already-subscribed as a soft success: send the user to the billing portal so they can manage seats.
          setError(null);
          showSuccess(
            'Subscription Active',
            'Your organization already has an active Business subscription. Redirecting to the Stripe billing portal so you can manage it.'
          );
          
          // Open billing portal and handle any errors gracefully
          try {
            await openBillingPortal({ organizationId, returnUrl: resolvedReturnUrl });
          } catch (_billingError) {
            // If billing portal fails, show a different message to avoid confusion
            showError(
              'Billing Portal Unavailable',
              'Your subscription is active, but we couldn\'t open the billing portal. Please try again or contact support.'
            );
          }
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
          setError(null);
          showSuccess(
            'Subscription Active',
            'Your organization already has an active Business subscription. Redirecting to the Stripe billing portal so you can manage it.'
          );
          try {
            await openBillingPortal({ organizationId, returnUrl: resolvedReturnUrl });
          } catch (_billingError) {
            showError(
              'Billing Portal Unavailable',
              'Your subscription is active, but we couldn\'t open the billing portal. Please try again or contact support.'
            );
          }
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
    [buildCancelUrl, buildSuccessUrl, openBillingPortal, showError, showSuccess]
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
        if (!response.ok || result?.success === false) {
          // Handle specific error codes
          if (result?.errorCode) {
            throw new Error(JSON.stringify({
              errorCode: result.errorCode,
              message: result.error || 'Failed to refresh subscription status',
              details: result.details
            }));
          }
          
          const message = result?.error || 'Failed to refresh subscription status';
          throw new Error(message);
        }

        showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        return result?.subscription ?? null;
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
