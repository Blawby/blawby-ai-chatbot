import { useState, useCallback } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getClient } from '@/shared/lib/authClient';
import { requestBillingPortalSession, requestSubscriptionCancellation } from '@/shared/lib/apiClient';
import { getTrustedHosts } from '@/config/urls';

// Trusted hosts for return URL validation
// Uses centralized URL configuration from src/config/urls.ts
const TRUSTED_RETURN_URL_HOSTS: string[] = getTrustedHosts();

// Helper function to ensure a safe, validated return URL
// Prevents open-redirect vulnerabilities by validating URLs before returning them
// Throws errors instead of silently falling back
function ensureValidReturnUrl(url: string | undefined | null, _practiceId?: string): string {
  // Treat undefined/null/invalid inputs as errors
  if (!url || typeof url !== 'string') {
    throw new Error(`Invalid return URL: ${url === null ? 'null' : url === undefined ? 'undefined' : 'not a string'}`);
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new Error('Invalid return URL: empty string');
  }

  // Guard against SSR - need window.location.origin for validation
  if (typeof window === 'undefined') {
    throw new Error('Cannot validate return URL in SSR context');
  }

  // Parse and validate the URL
  let parsed: URL;
  try {
    // Parse the URL - this will throw for invalid URLs
    // Use window.location.origin as base to handle relative URLs
    parsed = new URL(trimmed, window.location.origin);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid return URL format: ${trimmed}. ${errorMessage}`);
  }

  // Guard against dangerous schemes (javascript:, data:, vbscript:, etc.)
  const allowedProtocols = ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Invalid return URL protocol: ${parsed.protocol}. Only http: and https: are allowed.`);
  }

  // Ensure it's an absolute URL (not relative)
  if (!parsed.protocol || !parsed.host) {
    throw new Error(`Invalid return URL: missing protocol or host: ${trimmed}`);
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
  throw new Error(`Invalid return URL: origin ${parsed.origin} is not allowed. Allowed origins: ${window.location.origin}, ${TRUSTED_RETURN_URL_HOSTS.join(', ')}`);
}

// Callback URLs may be relative (path-only) or absolute.
function ensureValidCallbackUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') {
    throw new Error(`Invalid callback URL: ${url === null ? 'null' : url === undefined ? 'undefined' : 'not a string'}`);
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new Error('Invalid callback URL: empty string');
  }

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.includes('://')) {
      throw new Error(`Invalid callback URL format: ${trimmed}`);
    }
    return trimmed;
  }

  return ensureValidReturnUrl(trimmed);
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

function headersToObject(headers: Headers | null): Record<string, string> | null {
  if (!headers) {
    return null;
  }
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
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
  practiceId?: string;
  planId?: string; // UUID of the subscription plan (optional)
  plan?: string; // Stripe price ID (required for /api/subscriptions/create)
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

  const buildSuccessUrl = useCallback((practiceId?: string) => {
    const params = new URLSearchParams();
    params.set('subscription', 'success');
    if (practiceId) {
      params.set('practiceId', practiceId);
    }
    const query = params.toString();
    return `/business-onboarding${query ? `?${query}` : ''}`;
  }, []);

  const buildCancelUrl = useCallback((_practiceId?: string) => {
    return '/?subscription=cancelled';
  }, []);

  const resolveReturnUrl = useCallback(
    (returnUrl: string | undefined, practiceId?: string) => {
      if (returnUrl) {
        return returnUrl;
      }
      if (typeof window !== 'undefined') {
        return window.location.href;
      }
      return buildSuccessUrl(practiceId);
    },
    [buildSuccessUrl]
  );

  const openBillingPortal = useCallback(
    async ({ practiceId, returnUrl }: BillingPortalRequest) => {
      try {
        const rawReturnUrl = resolveReturnUrl(returnUrl, practiceId);
        const safeReturnUrl = ensureValidReturnUrl(rawReturnUrl, practiceId);
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
          if (errorCode === 'NO_STRIPE_CUSTOMER_FOUND_FOR_THIS_USER') {
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
    [resolveReturnUrl, showError]
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
    async ({ practiceId, planId, plan, successUrl, cancelUrl, returnUrl }: SubscriptionUpgradeRequest): Promise<void> => {
      setSubmitting(true);
      setError(null);

      // Stripe price ID is required for /api/subscriptions/create
      if (!plan) {
        setError('Stripe price ID is required');
        showError('Invalid Request', 'Stripe price ID is required to create a subscription.');
        setSubmitting(false);
        return;
      }

      const resolvedPracticeId = practiceId || undefined;

      try {
        // Step 1: Set active practice if we have one using the Better Auth organization plugin
        // The remote API will auto-create and set the active practice if one doesn't exist
        if (resolvedPracticeId) {
          // Set active practice using the Better Auth organization plugin
          const client = getClient();
          await client.organization.setActive({ organizationId: resolvedPracticeId });
        }

        // Step 2: Build URLs for success and cancel callbacks
        // Note: resolvedPracticeId may be undefined - the remote API will handle practice creation
        const rawSuccessUrl = successUrl ?? buildSuccessUrl(resolvedPracticeId);
        const rawCancelUrl = cancelUrl ?? buildCancelUrl(resolvedPracticeId);

        // Ensure URLs are valid
        const validatedSuccessUrl = ensureValidCallbackUrl(rawSuccessUrl);
        const validatedCancelUrl = ensureValidCallbackUrl(rawCancelUrl);

        // Step 3: Create subscription using remote API /api/subscriptions/create endpoint
        try {
          const createPayload = {
            planId: planId || undefined, // UUID of the subscription plan (optional)
            plan, // Stripe price ID (required)
            successUrl: validatedSuccessUrl,
            cancelUrl: validatedCancelUrl,
            disableRedirect: false // Auto-redirect to Stripe Checkout
          };

          // Use fetch with Better Auth token (not axios)
          const response = await getClient().subscription.upgrade(createPayload);
          const isResponseObject = typeof response === 'object' && response !== null;
          const hasHeaders = isResponseObject &&
            'headers' in response &&
            (response as { headers?: Headers }).headers instanceof Headers;
          const headers = hasHeaders ? (response as { headers: Headers }).headers : null;

          const isBetterFetchResponse =
            isResponseObject &&
            'data' in response &&
            'error' in response &&
            !hasHeaders;

          // Log response for debugging
          if (import.meta.env.DEV) {
            const status = isResponseObject && 'status' in response
              ? (response as { status?: number }).status
              : undefined;
            console.log('[UPGRADE] Response status:', status);
            console.log('[UPGRADE] Response headers:', headersToObject(headers));
          }

          // Check for Location header (in case of redirect)
          const locationHeader = headers
            ? headers.get('location') || headers.get('Location')
            : null;

          // Parse response body
          let data: unknown;
          if (isBetterFetchResponse) {
            const { data: responseData, error: responseError } = response as {
              data: unknown;
              error: unknown;
            };
            if (responseError) {
              throw new Error(JSON.stringify(responseError));
            }
            data = responseData;
          } else if (headers) {
            const contentType = headers.get('content-type');
            if (contentType?.includes('application/json')) {
              data = await (response as Response).json();
          } else {
            const text = await (response as Response).text();
            if (text) {
              try {
                data = JSON.parse(text);
              } catch {
                data = { rawText: text };
              }
            } else {
              data = null;
            }
          }
          } else {
            data = response;
          }

          if (import.meta.env.DEV) {
            console.log('[UPGRADE] Response data:', data);
          }

          // Handle different response structures
          let checkoutUrl: string | undefined;

          if (data && typeof data === 'object') {
            // Try different possible response formats
            checkoutUrl = (data as { checkoutUrl?: string }).checkoutUrl ||
              (data as { checkout_url?: string }).checkout_url ||
              (data as { url?: string }).url ||
              ((data as { data?: { checkoutUrl?: string } }).data?.checkoutUrl) ||
              ((data as { data?: { checkout_url?: string } }).data?.checkout_url) ||
              ((data as { data?: { url?: string } }).data?.url);
          }

          // Also check Location header if checkoutUrl not in body (for redirects)
          if (!checkoutUrl && locationHeader) {
            checkoutUrl = locationHeader;
            if (import.meta.env.DEV) {
              console.log('[UPGRADE] Using checkoutUrl from Location header:', checkoutUrl);
            }
          }

          if (!checkoutUrl || typeof checkoutUrl !== 'string') {
            console.error('[UPGRADE] Missing checkoutUrl. Full response:', {
              status: isResponseObject && 'status' in response
                ? (response as { status?: number }).status
                : undefined,
              headers: headersToObject(headers),
              data
            });
            throw new Error(`Invalid response from subscription creation. Expected checkoutUrl, got: ${JSON.stringify(data)}`);
          }

          // Redirect to Stripe Checkout
          window.location.href = checkoutUrl;
        } catch (error) {
          // Handle fetch errors
          if (error instanceof Error) {
            console.error('[UPGRADE] Subscription creation error:', error);
            throw error;
          }
          throw new Error('Failed to create subscription');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Subscription creation failed';

        // Try to parse structured error response
        let errorCode: SubscriptionErrorCode | null = null;
        let errorMessage = message;

        try {
          const parsedError = JSON.parse(message);
          if (parsedError && typeof parsedError === 'object' && 'errorCode' in parsedError) {
            const code = (parsedError as { errorCode?: string }).errorCode;
            if (code && Object.values(SubscriptionErrorCode).includes(code as SubscriptionErrorCode)) {
              errorCode = code as SubscriptionErrorCode;
              errorMessage = (parsedError as { message?: string }).message || message;
            }
          }
        } catch {
          // Not a structured error - use the original message
        }

        // Handle specific error codes
        if (errorCode === SubscriptionErrorCode.SUBSCRIPTION_ALREADY_ACTIVE && resolvedPracticeId) {
          const safeReturnUrl = ensureValidReturnUrl(resolveReturnUrl(returnUrl, resolvedPracticeId), resolvedPracticeId);
          await handleAlreadySubscribed(resolvedPracticeId, safeReturnUrl);
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

        const title = errorCode ? getErrorTitle(errorCode) : 'Upgrade Failed';
        setError(errorMessage);
        showError(title, errorMessage);
      } finally {
        setSubmitting(false);
      }
    },
    [buildCancelUrl, buildSuccessUrl, handleAlreadySubscribed, resolveReturnUrl, showError]
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
    cancelSubscription,
  };
};
