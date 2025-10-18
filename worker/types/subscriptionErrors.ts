/**
 * Error codes for subscription-related operations
 * These provide stable, versioned error identifiers that won't break
 * when error messages change.
 */
export enum SubscriptionErrorCode {
  // General subscription errors
  SUBSCRIPTION_ALREADY_ACTIVE = 'SUBSCRIPTION_ALREADY_ACTIVE',
  EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED',
  ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Stripe-specific errors
  STRIPE_CHECKOUT_FAILED = 'STRIPE_CHECKOUT_FAILED',
  STRIPE_BILLING_PORTAL_FAILED = 'STRIPE_BILLING_PORTAL_FAILED',
  STRIPE_CUSTOMER_NOT_FOUND = 'STRIPE_CUSTOMER_NOT_FOUND',
  STRIPE_SUBSCRIPTION_NOT_FOUND = 'STRIPE_SUBSCRIPTION_NOT_FOUND',
  
  // Validation errors
  INVALID_ORGANIZATION_ID = 'INVALID_ORGANIZATION_ID',
  INVALID_SEAT_COUNT = 'INVALID_SEAT_COUNT',
  INVALID_PLAN_TYPE = 'INVALID_PLAN_TYPE',
  
  // System errors
  SUBSCRIPTION_SYNC_FAILED = 'SUBSCRIPTION_SYNC_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * User-friendly error messages mapped to error codes
 */
export const SUBSCRIPTION_ERROR_MESSAGES: Record<SubscriptionErrorCode, string> = {
  [SubscriptionErrorCode.SUBSCRIPTION_ALREADY_ACTIVE]: 'Your organization already has an active Business subscription. Redirecting to the Stripe billing portal so you can manage it.',
  [SubscriptionErrorCode.EMAIL_VERIFICATION_REQUIRED]: 'Please verify your email address before upgrading. Check your inbox for the verification link.',
  [SubscriptionErrorCode.ORGANIZATION_NOT_FOUND]: 'Organization not found. Please check your organization ID and try again.',
  [SubscriptionErrorCode.INSUFFICIENT_PERMISSIONS]: 'You do not have permission to manage subscriptions for this organization.',
  
  [SubscriptionErrorCode.STRIPE_CHECKOUT_FAILED]: 'Unable to initiate Stripe checkout. Please try again or contact support.',
  [SubscriptionErrorCode.STRIPE_BILLING_PORTAL_FAILED]: 'Unable to open billing portal. Please try again or contact support.',
  [SubscriptionErrorCode.STRIPE_CUSTOMER_NOT_FOUND]: 'Stripe customer not found. Please contact support.',
  [SubscriptionErrorCode.STRIPE_SUBSCRIPTION_NOT_FOUND]: 'Stripe subscription not found. Please contact support.',
  
  [SubscriptionErrorCode.INVALID_ORGANIZATION_ID]: 'Invalid organization ID provided.',
  [SubscriptionErrorCode.INVALID_SEAT_COUNT]: 'Invalid seat count. Must be a positive number.',
  [SubscriptionErrorCode.INVALID_PLAN_TYPE]: 'Invalid plan type specified.',
  
  [SubscriptionErrorCode.SUBSCRIPTION_SYNC_FAILED]: 'Failed to refresh subscription status. Please try again.',
  [SubscriptionErrorCode.INTERNAL_ERROR]: 'An internal error occurred. Please try again or contact support.',
};

/**
 * Error titles for UI display
 */
export const SUBSCRIPTION_ERROR_TITLES: Record<SubscriptionErrorCode, string> = {
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

/**
 * Enhanced API response interface with error codes
 */
export interface SubscriptionApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: SubscriptionErrorCode;
  details?: unknown;
}

/**
 * Helper function to create error responses with error codes
 */
export function createSubscriptionErrorResponse(
  errorCode: SubscriptionErrorCode,
  customMessage?: string,
  details?: unknown
): SubscriptionApiResponse {
  return {
    success: false,
    error: customMessage || SUBSCRIPTION_ERROR_MESSAGES[errorCode],
    errorCode,
    ...(details && { details }),
  };
}

/**
 * Helper function to create success responses
 */
export function createSubscriptionSuccessResponse<T>(data: T): SubscriptionApiResponse<T> {
  return {
    success: true,
    data,
  };
}
