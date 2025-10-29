/**
 * Production-safe error handling utilities for frontend components
 * Sanitizes errors to prevent exposure of sensitive information
 */

import { isProduction } from './environment';

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

interface SanitizedError {
  message: string;
  name: string;
  timestamp: string;
  context: ErrorContext;
  isProduction: boolean;
}

/**
 * Sanitizes error data to remove sensitive information
 */
function sanitizeError(error: unknown, context: ErrorContext = {}, visited: WeakSet<object> = new WeakSet()): SanitizedError {
  const isProd = isProduction();
  
  // Extract safe error information
  let message = 'An unexpected error occurred';
  let name = 'Error';
  
  if (error instanceof Error) {
    message = error.message || message;
    name = error.name || name;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    message = (error as { message?: string }).message || message;
    name = (error as { name?: string }).name || name;
  }

  // Sanitize context to remove PII and sensitive data
  const sanitizedContext: ErrorContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      // Allow componentStack in development for debugging
      if (key === 'componentStack' && !isProd) {
        sanitizedContext[key] = value;
      } else if (key.toLowerCase().includes('token') || 
          key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key') ||
          value.includes('@') ||
          value.startsWith('http')) {
        sanitizedContext[key] = '[REDACTED]';
      } else {
        sanitizedContext[key] = value;
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitizedContext[key] = value;
    } else if (value && typeof value === 'object') {
      // Check for circular references
      if (visited.has(value)) {
        sanitizedContext[key] = '[Circular]';
        continue;
      }
      
      // Add to visited set before recursing
      visited.add(value);
      
      try {
        if (Array.isArray(value)) {
          // Preserve array structure by mapping each element
          sanitizedContext[key] = value.map(item => {
            if (item && typeof item === 'object') {
              if (visited.has(item)) {
                return '[Circular]';
              }
              visited.add(item);
              try {
                const result = sanitizeError(error, item, visited).context;
                return result;
              } finally {
                visited.delete(item);
              }
            }
            return item;
          });
        } else {
          // Recursively sanitize nested objects
          sanitizedContext[key] = sanitizeError(error, value as Record<string, unknown>, visited).context;
        }
      } finally {
        // Remove from visited set after processing
        visited.delete(value);
      }
    }
  }

  return {
    message,
    name,
    timestamp: new Date().toISOString(),
    context: sanitizedContext,
    isProduction: isProd
  };
}

/**
 * Checks if Sentry is available for error tracking
 */
function isSentryAvailable(): boolean {
  return typeof window !== 'undefined' && 
         typeof (window as { Sentry?: { captureException?: (error: unknown, context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }) => void } }).Sentry !== 'undefined' &&
         typeof (window as { Sentry?: { captureException?: (error: unknown, context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }) => void } }).Sentry?.captureException === 'function';
}

/**
 * Production-safe error handler that:
 * 1. Captures errors in Sentry if available
 * 2. Logs sanitized errors to console in development
 * 3. Logs minimal information in production
 * 4. Never exposes stack traces or sensitive data
 */
export function handleError(
  error: unknown, 
  context: ErrorContext = {},
  options: {
    component?: string;
    action?: string;
    silent?: boolean;
  } = {}
): void {
  const sanitized = sanitizeError(error, {
    ...context,
    component: options.component,
    action: options.action
  });

  // Always try to capture in Sentry if available
  if (isSentryAvailable()) {
    try {
      (window as { Sentry?: { captureException?: (error: unknown, context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }) => void } }).Sentry?.captureException?.(error, {
        tags: {
          component: options.component,
          action: options.action
        },
        extra: sanitized.context
      });
    } catch (sentryError) {
      // If Sentry fails, fall back to console logging only if not in production and not silent
      if (!sanitized.isProduction && !options.silent) {
        console.warn('[ErrorHandler] Sentry capture failed:', sentryError);
      }
    }
  }

  // Only log to console in development or if explicitly not silent
  if (!sanitized.isProduction && !options.silent) {
    console.error(`[${options.component || 'ErrorHandler'}] ${sanitized.message}`, {
      error: sanitized.name,
      context: sanitized.context,
      timestamp: sanitized.timestamp
    });
  } else if (!options.silent) {
    // In production, log minimal information without context to prevent sensitive data leakage
    console.error(`[${options.component || 'ErrorHandler'}] ${sanitized.message}`, {
      timestamp: sanitized.timestamp
    });
  }
}

/**
 * Async error handler for promise rejections and async operations
 */
export async function handleAsyncError<T>(
  operation: () => Promise<T>,
  context: ErrorContext = {},
  options: {
    component?: string;
    action?: string;
    fallback?: T;
    silent?: boolean;
  } = {}
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    handleError(error, context, options);
    return options.fallback;
  }
}

/**
 * Error boundary helper for React components
 */
export function createErrorBoundaryHandler(componentName: string) {
  return (error: Error, errorInfo: { componentStack: string }) => {
    handleError(error, {
      component: componentName,
      action: 'error-boundary',
      componentStack: errorInfo.componentStack
    });
  };
}

/**
 * Safe console logging that respects production environment
 */
export function safeLog(
  level: 'log' | 'warn' | 'error' | 'info',
  message: string,
  data?: unknown,
  options: { component?: string; force?: boolean } = {}
): void {
  const isProd = isProduction();
  
  if (!isProd || options.force) {
    const prefix = options.component ? `[${options.component}]` : '';
    console[level](`${prefix} ${message}`, data);
  }
}
