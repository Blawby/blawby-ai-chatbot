import { useState, useCallback } from 'preact/hooks';
import { useToastContext } from '../contexts/ToastContext';
import { authClient, getClient } from '../lib/authClient';
import {
  requestBillingPortalSession,
  requestSubscriptionCancellation,
  syncSubscription as syncSubscriptionRequest,
  listPractices,
  listSubscriptions
} from '../lib/apiClient';
import { createOrganizationForSubscription } from '../utils/subscription';

// Default return URL for billing portal redirects
const DEFAULT_RETURN_URL = typeof window !== 'undefined' 
  ? `${window.location.origin}/` 
  : '/';

// Allowlist of trusted hosts for return URLs (beyond same-origin)
// Add trusted external domains here if needed (e.g., ['trusted-partner.com'])
const TRUSTED_RETURN_URL_HOSTS: string[] = [];

// Helper function to ensure a safe, validated return URL
// Prevents open-redirect vulnerabilities by validating URLs before returning them
function ensureValidReturnUrl(url: string | undefined | null, practiceId?: string): string {
  // Treat undefined/null/invalid inputs as unsafe
  if (!url || typeof url !== 'string') {
    return getFallbackUrl(practiceId);
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return getFallbackUrl(practiceId);
  }

  // Parse and validate the URL
  try {
    // Guard against SSR - need window.location.origin for validation
    if (typeof window === 'undefined') {
      return getFallbackUrl(practiceId);
    }

    // Parse the URL - this will throw for invalid URLs
    // Use window.location.origin as base to handle relative URLs
    const parsed = new URL(trimmed, window.location.origin);

    // Guard against dangerous schemes (javascript:, data:, vbscript:, etc.)
    const allowedProtocols = ['http:', 'https:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return getFallbackUrl(practiceId);
    }

    // Ensure it's an absolute URL (not relative)
    // If the URL was relative, it will have been resolved to an absolute URL by the URL constructor
    // But we need to verify it's actually absolute by checking it has a protocol
    if (!parsed.protocol || !parsed.host) {
      return getFallbackUrl(practiceId);
    }

    // Primary validation: allow same-origin URLs
    if (parsed.origin === window.location.origin) {
      return parsed.toString();
    }

    // Secondary validation: check against allowlist of trusted hosts
    if (TRUSTED_RETURN_URL_HOSTS.length > 0 && parsed.host) {
      const hostname = parsed.hostname.toLowerCase();
      const isTrusted = TRUSTED_RETURN_URL_HOSTS.some(
        trustedHost => hostname === trustedHost.toLowerCase() || hostname.endsWith(`.${trustedHost.toLowerCase()}`)
      );
      if (isTrusted) {
        return parsed.toString();
      }
    }

    // URL is not same-origin and not in allowlist - reject it
    return getFallbackUrl(practiceId);
  } catch {
    // URL parsing failed or any other error - treat as unsafe
    return getFallbackUrl(practiceId);
  }
}

// Helper function to get the fallback URL
function getFallbackUrl(practiceId?: string): string {
  // Fallback to business onboarding with practice ID if available
  if (practiceId && typeof window !== 'undefined') {
    return `${window.location.origin}/business-onboarding?sync=1&practiceId=${encodeURIComponent(practiceId)}`;
  }
  return DEFAULT_RETURN_URL;
}

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

    // Better Auth Stripe plugin might return it directly in the response body
    if ('billingPortalUrl' in result && typeof result.billingPortalUrl === 'string') {
      return result.billingPortalUrl;
    }

    // Check nested in data.billingPortalUrl
    if ('data' in result && result.data && typeof result.data === 'object' && result.data !== null) {
      if ('billingPortalUrl' in result.data && typeof result.data.billingPortalUrl === 'string') {
        return result.data.billingPortalUrl;
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
  PRACTICE_NOT_FOUND = 'PRACTICE_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  STRIPE_CHECKOUT_FAILED = 'STRIPE_CHECKOUT_FAILED',
  STRIPE_BILLING_PORTAL_FAILED = 'STRIPE_BILLING_PORTAL_FAILED',
  STRIPE_CUSTOMER_NOT_FOUND = 'STRIPE_CUSTOMER_NOT_FOUND',
  STRIPE_SUBSCRIPTION_NOT_FOUND = 'STRIPE_SUBSCRIPTION_NOT_FOUND',
  INVALID_PRACTICE_ID = 'INVALID_PRACTICE_ID',
  INVALID_SEAT_COUNT = 'INVALID_SEAT_COUNT',
  INVALID_PLAN_TYPE = 'INVALID_PLAN_TYPE',
  SUBSCRIPTION_SYNC_FAILED = 'SUBSCRIPTION_SYNC_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Error titles for UI display
const ERROR_TITLES: Record<SubscriptionErrorCode, string> = {
  [SubscriptionErrorCode.SUBSCRIPTION_ALREADY_ACTIVE]: 'Subscription Active',
  [SubscriptionErrorCode.EMAIL_VERIFICATION_REQUIRED]: 'Verify Email',
  [SubscriptionErrorCode.PRACTICE_NOT_FOUND]: 'Practice Not Found',
  [SubscriptionErrorCode.INSUFFICIENT_PERMISSIONS]: 'Access Denied',
  [SubscriptionErrorCode.STRIPE_CHECKOUT_FAILED]: 'Upgrade Failed',
  [SubscriptionErrorCode.STRIPE_BILLING_PORTAL_FAILED]: 'Billing Portal Error',
  [SubscriptionErrorCode.STRIPE_CUSTOMER_NOT_FOUND]: 'Customer Not Found',
  [SubscriptionErrorCode.STRIPE_SUBSCRIPTION_NOT_FOUND]: 'Subscription Not Found',
  [SubscriptionErrorCode.INVALID_PRACTICE_ID]: 'Invalid Request',
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
  practiceId: string;
  plan: string; // Plan name from API (e.g., "professional", "business_seat")
  seats?: number | null;
  annual?: boolean;
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
}

export interface BillingPortalRequest {
  practiceId: string;
  returnUrl?: string;
}

export const usePaymentUpgrade = () => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showError, showSuccess } = useToastContext();

  const ensureActivePractice = useCallback(async (practiceId: string) => {
    try {
      // Use getClient() directly to bypass proxy issues
      const client = getClient();
      if (client.organization?.setActive) {
        await client.organization.setActive({ organizationId: practiceId });
      } else {
        console.warn('[UPGRADE] organization.setActive not available, skipping');
      }
    } catch (activeErr) {
      const message = activeErr instanceof Error ? activeErr.message : 'Unknown error when setting active practice.';
      console.warn('[UPGRADE] Active practice setup error:', activeErr instanceof Error ? activeErr : message);
      // Don't throw - allow subscription to proceed even if setActive fails
    }
  }, []);

  const buildSuccessUrl = useCallback((practiceId: string) => {
    if (typeof window === 'undefined') return '/business-onboarding?sync=1';
    const url = new URL(`${window.location.origin}/business-onboarding`);
    url.searchParams.set('sync', '1');
    url.searchParams.set('practiceId', practiceId);
    return url.toString();
  }, []);

  const buildCancelUrl = useCallback((_practiceId: string) => {
    if (typeof window === 'undefined') return '/';
    const url = new URL(`${window.location.origin}/`);
    return url.toString();
  }, []);

  const openBillingPortal = useCallback(
    async ({ practiceId, returnUrl }: BillingPortalRequest) => {
      try {
        const safeReturnUrl = ensureValidReturnUrl(returnUrl, practiceId);
        const result = await requestBillingPortalSession({
          practiceId,
          returnUrl: safeReturnUrl
        });

        const url = extractUrl(result.data);
        if (!url) {
          console.error('Invalid response structure: missing or invalid url property', result.data);
        }
        if (!result.ok || !url) {
          const errorCode =
            extractProperty<string>(result.data, 'code') ||
            extractProperty<string>(result.data, 'errorCode');

          let mappedErrorCode: SubscriptionErrorCode | null = null;
          if (typeof errorCode === 'string' && errorCode === 'NO_STRIPE_CUSTOMER_FOUND_FOR_THIS_USER') {
            mappedErrorCode = SubscriptionErrorCode.STRIPE_CUSTOMER_NOT_FOUND;
          } else if (typeof errorCode === 'string') {
            const upperCode = errorCode.toUpperCase();
            if (Object.values(SubscriptionErrorCode).includes(upperCode as SubscriptionErrorCode)) {
              mappedErrorCode = upperCode as SubscriptionErrorCode;
            }
          }

          if (mappedErrorCode || errorCode) {
            throw new Error(JSON.stringify({
              errorCode: mappedErrorCode || errorCode,
              message: extractErrorMessage(result.data, 'Unable to open billing portal'),
              details: extractProperty<unknown>(result.data, 'details')
            }));
          }

          const message = extractErrorMessage(result.data, 'Unable to open billing portal');
          throw new Error(message);
        }

        window.location.href = url;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to open billing portal';

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
    async (practiceId: string, returnUrl: string) => {
      setError(null);
      // Redirect directly to billing portal to manage current subscription
      try {
        await openBillingPortal({ practiceId, returnUrl });
      } finally {
        // Ensure submitting state is cleared even on early redirect
        setSubmitting(false);
      }
    },
    [openBillingPortal]
  );

  const submitUpgrade = useCallback(
    async ({ practiceId, plan, seats = 1, annual = false, successUrl, cancelUrl, returnUrl }: SubscriptionUpgradeRequest): Promise<void> => {
      setSubmitting(true);
      setError(null);

      let resolvedPracticeId = practiceId;
      let resolvedSuccessUrl: string;
      let resolvedCancelUrl: string;
      let resolvedReturnUrl: string;

      try {
        // Step 1: Ensure practice exists, create if needed
        if (!resolvedPracticeId) {
          try {
            const practices = await listPractices({ scope: 'all' });
            
            if (practices.length === 0) {
              // No practices exist, create one using the helper
              const session = await authClient.getSession();
              const userName = session?.data?.user?.name || session?.data?.user?.email?.split('@')[0] || 'User';
              const practice = await createOrganizationForSubscription(userName);
              resolvedPracticeId = practice.id;
            } else {
              // Use first practice or find personal one
              const personal = practices.find((p) => p.kind === 'personal' || (p.metadata as { kind?: string } | undefined)?.kind === 'personal');
              const practice = personal || practices[0];
              if (practice?.id) {
                resolvedPracticeId = practice.id;
              }
            }
          } catch (e) {
            console.error('[UPGRADE] Failed to ensure/fetch practices:', e);
            showError('Setup Required', 'We are preparing your workspace. Please try again in a moment.');
            return;
          }
        }

        if (!resolvedPracticeId) {
          showError('Setup Required', 'We are preparing your workspace. Please try again in a moment.');
          return;
        }

        // Build URLs after practice resolution to ensure resolvedPracticeId is set
        // Validate URLs to prevent open-redirect vulnerabilities
        const rawSuccessUrl = successUrl ?? buildSuccessUrl(resolvedPracticeId);
        const rawCancelUrl = cancelUrl ?? buildCancelUrl(resolvedPracticeId);
        resolvedSuccessUrl = ensureValidReturnUrl(rawSuccessUrl, resolvedPracticeId);
        resolvedCancelUrl = ensureValidReturnUrl(rawCancelUrl, resolvedPracticeId);
        resolvedReturnUrl = ensureValidReturnUrl(returnUrl ?? resolvedSuccessUrl, resolvedPracticeId);

        // Step 2: Set active practice
        await ensureActivePractice(resolvedPracticeId);

        // Step 3: Check for existing subscriptions
        let activeSubscription: { id: string } | undefined;
        try {
          // Use GET request to list subscriptions (instead of POST via Better Auth client)
          const subscriptions = await listSubscriptions(resolvedPracticeId);
          activeSubscription = subscriptions?.find(
            (sub) => sub.status === 'active' || sub.status === 'trialing'
          );
        } catch (e) {
          // Fail loudly on unexpected errors
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          console.error('[UPGRADE] Error checking existing subscriptions:', e);
          showError('Subscription Check Failed', `An error occurred while checking subscriptions: ${errorMsg}. Please try again.`);
          setSubmitting(false);
          return;
        }

        // Step 4: Create or upgrade subscription using Better Auth
        // Use getClient() directly to bypass proxy issues with subscription methods
        const client = getClient();
        if (!client.subscription?.upgrade) {
          throw new Error('Subscription upgrade not available. Please ensure Better Auth Stripe plugin is configured.');
        }

        const { data, error: subscriptionError } = await client.subscription.upgrade({
          plan, // Plan name from API (e.g., "professional", "business_seat")
          referenceId: resolvedPracticeId,
          subscriptionId: activeSubscription?.id, // Only if exists to avoid duplicates
          successUrl: resolvedSuccessUrl,
          cancelUrl: resolvedCancelUrl,
          annual,
          seats: seats > 1 ? seats : undefined,
          disableRedirect: false, // Auto-redirect to Stripe Checkout
        });

        if (subscriptionError) {
          // Handle Better Auth error format
          const errorMessage = subscriptionError.message || 'Subscription upgrade failed';
          const errorCode = (subscriptionError as { code?: string }).code;

          // Handle specific Better Auth error codes
          if (errorCode && errorCode.toUpperCase() === 'YOURE_ALREADY_SUBSCRIBED_TO_THIS_PLAN') {
            await handleAlreadySubscribed(resolvedPracticeId, resolvedReturnUrl);
            return;
          }

          if (import.meta.env.DEV) {
            console.error('❌ Subscription upgrade failed:', {
              error: errorMessage,
              code: errorCode,
            });
          }

          // Check for email verification requirement
          if (errorMessage.toLowerCase().includes('email verification') || errorCode === 'EMAIL_VERIFICATION_REQUIRED') {
            setError(errorMessage);
            showError(
              'Verify Email',
              'Please verify your email address before upgrading. Check your inbox for the verification link.'
            );
            return;
          }

          setError(errorMessage);
          showError('Upgrade Failed', errorMessage);
          return;
        }

        // If disableRedirect is false, Better Auth will auto-redirect
        // If disableRedirect is true, we'd manually redirect using data.url
        // Since we set disableRedirect: false, the redirect happens automatically
        if (data?.url && import.meta.env.DEV) {
          console.debug('[UPGRADE] Checkout URL:', data.url);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upgrade failed';

        // Try to parse structured error response; if detected, rethrow to bubble up
        {
          try {
            const parsedError = JSON.parse(message);
            if (parsedError && typeof parsedError === 'object' && 'errorCode' in parsedError) {
              const code = (parsedError as { errorCode?: string }).errorCode;
              if (code && Object.values(SubscriptionErrorCode).includes(code as SubscriptionErrorCode)) {
                throw err; // bubble structured errors
              }
            }
          } catch {
            // JSON.parse failed or not structured; continue with legacy handling below
          }
        }

        // Fallback to original string matching for backward compatibility
        const normalizedMessage = message.toLowerCase();
        if (normalizedMessage.includes("already subscribed to this plan")) {
          const safeReturnUrl = ensureValidReturnUrl(resolvedReturnUrl || returnUrl, resolvedPracticeId || practiceId);
          await handleAlreadySubscribed(resolvedPracticeId || practiceId, safeReturnUrl);
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
    [buildCancelUrl, buildSuccessUrl, ensureActivePractice, handleAlreadySubscribed, showError]
  );

  const syncSubscription = useCallback(
    async (practiceId: string) => {
      try {
        const result = await syncSubscriptionRequest(practiceId);

        if (!result.synced) {
          throw new Error('Failed to refresh subscription status');
        }

        showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        return result.subscription ?? null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refresh subscription status';

        let errorCode: SubscriptionErrorCode | null = null;
        let errorMessage = message;

        try {
          const parsedError = JSON.parse(message);
          if (parsedError && typeof parsedError === 'object' && 'errorCode' in parsedError) {
            const parsedCode = (parsedError as { errorCode?: string }).errorCode;
            if (parsedCode && Object.values(SubscriptionErrorCode).includes(parsedCode as SubscriptionErrorCode)) {
              errorCode = parsedCode as SubscriptionErrorCode;
              errorMessage = (parsedError as { message?: string }).message || message;
            }
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


  const cancelSubscription = useCallback(
    async (practiceId: string) => {
      try {
        const result = await requestSubscriptionCancellation(practiceId);

        if (!result.ok) {
          const errorCode = extractProperty<string>(result.data, 'errorCode');
          if (errorCode) {
            throw new Error(JSON.stringify({
              errorCode,
              message: extractErrorMessage(result.data, 'Failed to cancel subscription'),
              details: extractProperty<unknown>(result.data, 'details')
            }));
          }

          const message = extractErrorMessage(result.data, 'Failed to cancel subscription');
          throw new Error(message);
        }

        showSuccess('Subscription cancelled', 'Your subscription has been cancelled successfully.');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel subscription';

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

        const title = errorCode ? getErrorTitle(errorCode) : 'Cancellation Error';
        showError(title, errorMessage);
        return false;
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
    cancelSubscription,
  };
};
