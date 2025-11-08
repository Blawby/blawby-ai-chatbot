import { SubscriptionErrorCode, createSubscriptionErrorResponse } from '../types/subscriptionErrors.js';
import type { Env } from '../types.js';

/**
 * Enhanced error handler for subscription-related operations
 * This middleware intercepts Better Auth errors and converts them to structured error codes
 */
export class SubscriptionErrorHandler {
  /**
   * Maps Better Auth error messages to structured error codes
   */
  private static readonly ERROR_MESSAGE_MAPPINGS: Array<{
    pattern: RegExp;
    errorCode: SubscriptionErrorCode;
  }> = [
    {
      pattern: /already subscribed to this plan/i,
      errorCode: SubscriptionErrorCode.SUBSCRIPTION_ALREADY_ACTIVE,
    },
    {
      pattern: /email verification is required/i,
      errorCode: SubscriptionErrorCode.EMAIL_VERIFICATION_REQUIRED,
    },
    {
      pattern: /organization not found/i,
      errorCode: SubscriptionErrorCode.ORGANIZATION_NOT_FOUND,
    },
    {
      pattern: /insufficient permissions/i,
      errorCode: SubscriptionErrorCode.INSUFFICIENT_PERMISSIONS,
    },
    {
      pattern: /stripe checkout failed/i,
      errorCode: SubscriptionErrorCode.STRIPE_CHECKOUT_FAILED,
    },
    {
      pattern: /billing portal failed/i,
      errorCode: SubscriptionErrorCode.STRIPE_BILLING_PORTAL_FAILED,
    },
    {
      pattern: /customer not found/i,
      errorCode: SubscriptionErrorCode.STRIPE_CUSTOMER_NOT_FOUND,
    },
    {
      pattern: /subscription not found/i,
      errorCode: SubscriptionErrorCode.STRIPE_SUBSCRIPTION_NOT_FOUND,
    },
    {
      pattern: /invalid organization/i,
      errorCode: SubscriptionErrorCode.INVALID_ORGANIZATION_ID,
    },
    {
      pattern: /invalid seat/i,
      errorCode: SubscriptionErrorCode.INVALID_SEAT_COUNT,
    },
    {
      pattern: /invalid plan/i,
      errorCode: SubscriptionErrorCode.INVALID_PLAN_TYPE,
    },
    {
      pattern: /sync failed/i,
      errorCode: SubscriptionErrorCode.SUBSCRIPTION_SYNC_FAILED,
    },
  ];

  /**
   * Determines if an error is subscription-related based on the request path
   */
  private static isSubscriptionRequest(path: string): boolean {
    return path.includes('/subscription/') || path.includes('/billing/');
  }

  /**
   * Maps an error message to a structured error code
   */
  private static mapErrorToCode(errorMessage: string): SubscriptionErrorCode | null {
    for (const mapping of this.ERROR_MESSAGE_MAPPINGS) {
      if (mapping.pattern.test(errorMessage)) {
        return mapping.errorCode;
      }
    }
    return null;
  }

  /**
   * Enhanced error handler that adds error codes to subscription-related errors
   */
  static handleError(error: unknown, request: Request, _env: Env): Response {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Only enhance subscription-related errors
    if (!this.isSubscriptionRequest(path)) {
      // For non-subscription requests, use the standard error handler
      return this.createStandardErrorResponse(error);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = this.mapErrorToCode(errorMessage);

    if (errorCode) {
      // Create enhanced response with error code
      const response = createSubscriptionErrorResponse(errorCode, errorMessage);
      
      // Determine appropriate HTTP status code
      let status = 500;
      switch (errorCode) {
        case SubscriptionErrorCode.SUBSCRIPTION_ALREADY_ACTIVE:
          status = 409; // Conflict
          break;
        case SubscriptionErrorCode.EMAIL_VERIFICATION_REQUIRED:
          status = 403; // Forbidden
          break;
        case SubscriptionErrorCode.ORGANIZATION_NOT_FOUND:
        case SubscriptionErrorCode.STRIPE_CUSTOMER_NOT_FOUND:
        case SubscriptionErrorCode.STRIPE_SUBSCRIPTION_NOT_FOUND:
          status = 404; // Not Found
          break;
        case SubscriptionErrorCode.INSUFFICIENT_PERMISSIONS:
          status = 403; // Forbidden
          break;
        case SubscriptionErrorCode.INVALID_ORGANIZATION_ID:
        case SubscriptionErrorCode.INVALID_SEAT_COUNT:
        case SubscriptionErrorCode.INVALID_PLAN_TYPE:
          status = 400; // Bad Request
          break;
        case SubscriptionErrorCode.STRIPE_CHECKOUT_FAILED:
        case SubscriptionErrorCode.STRIPE_BILLING_PORTAL_FAILED:
        case SubscriptionErrorCode.SUBSCRIPTION_SYNC_FAILED:
          status = 502; // Bad Gateway
          break;
        default:
          status = 500; // Internal Server Error
      }

      return new Response(JSON.stringify(response), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fall back to standard error handling for unmapped errors
    return this.createStandardErrorResponse(error);
  }

  /**
   * Creates a standard error response for non-subscription errors
   */
  private static createStandardErrorResponse(error: unknown): Response {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const response = {
      success: false,
      error: errorMessage,
      errorCode: 'INTERNAL_ERROR',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
