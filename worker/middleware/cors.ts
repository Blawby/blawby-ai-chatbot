/// <reference types="@cloudflare/workers-types" />

import { Env } from '../types';

// CORS configuration options
export interface CorsOptions {
  /** Allowed origins - use '*' for all origins or specific domains */
  allowedOrigins?: string | string[];
  /** Allowed HTTP methods */
  allowedMethods?: string[];
  /** Allowed headers */
  allowedHeaders?: string[];
  /** Whether to allow credentials */
  allowCredentials?: boolean;
  /** Max age for preflight cache */
  maxAge?: number;
  /** Whether to expose headers to the client */
  exposeHeaders?: string[];
}

// Default CORS configuration
const DEFAULT_CORS_OPTIONS: Required<CorsOptions> = {
  allowedOrigins: '*',
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowCredentials: false,
  maxAge: 86400, // 24 hours
  exposeHeaders: ['Content-Disposition', 'Content-Length']
};

// Security headers following Cloudflare best practices
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

/**
 * Creates CORS headers based on the request and configuration
 */
function createCorsHeaders(request: Request, options: Required<CorsOptions>, isSSEResponse: boolean = false): Record<string, string> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {};

  // Handle origin validation - SECURITY CRITICAL
  if (options.allowedOrigins === '*') {
    // Allow all origins (development only)
    // If credentials are allowed, we must use the specific origin, not wildcard
    if (options.allowCredentials && origin) {
      headers['Access-Control-Allow-Origin'] = origin;
    } else {
      headers['Access-Control-Allow-Origin'] = '*';
    }
  } else if (Array.isArray(options.allowedOrigins)) {
    // Validate against allowlist - only set header if origin matches
    if (origin && options.allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
    }
    // If origin doesn't match, don't set Access-Control-Allow-Origin header
    // This will cause the browser to block the request
  } else if (typeof options.allowedOrigins === 'string') {
    // Validate against single allowed origin
    if (origin === options.allowedOrigins || options.allowedOrigins === '*') {
      headers['Access-Control-Allow-Origin'] = options.allowedOrigins;
    }
    // If origin doesn't match, don't set Access-Control-Allow-Origin header
    // This will cause the browser to block the request
  }

  // Only add other CORS headers if origin is allowed
  if (headers['Access-Control-Allow-Origin']) {
    // For SSE responses, only add basic CORS headers, not preflight headers
    if (!isSSEResponse) {
      headers['Access-Control-Allow-Methods'] = options.allowedMethods.join(', ');
      headers['Access-Control-Allow-Headers'] = options.allowedHeaders.join(', ');
      headers['Access-Control-Max-Age'] = options.maxAge.toString();
    }

    if (options.allowCredentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    if (options.exposeHeaders.length > 0) {
      headers['Access-Control-Expose-Headers'] = options.exposeHeaders.join(', ');
    }
  }

  return headers;
}

/**
 * CORS middleware wrapper for Cloudflare Workers
 * Handles preflight requests and adds CORS headers to all responses
 */
export function withCORS(
  handler: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response,
  options: CorsOptions | ((env: Env) => CorsOptions) = {}
) {
  return async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const resolvedOptions = typeof options === 'function' ? options(env) : options;
    const corsOptions = { ...DEFAULT_CORS_OPTIONS, ...resolvedOptions };
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const corsHeaders = createCorsHeaders(request, corsOptions);
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          ...SECURITY_HEADERS
        }
      });
    }

    // Run the original handler
    const response = await handler(request, env, ctx);

    // Don't modify WebSocket upgrade responses (status 101)
    if (response.status === 101) {
      return response;
    }

    // Detect SSE responses by checking Content-Type
    const contentType = response.headers.get('Content-Type');
    const isSSEResponse = contentType === 'text/event-stream';

    // Add CORS headers to the response
    const corsHeaders = createCorsHeaders(request, corsOptions, isSSEResponse);
    const newHeaders = new Headers(response.headers);

    // Add CORS headers
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }

    // Add Vary: Origin header when Access-Control-Allow-Origin is set and not '*'
    if (corsHeaders['Access-Control-Allow-Origin'] && corsHeaders['Access-Control-Allow-Origin'] !== '*') {
      newHeaders.append('Vary', 'Origin');
    }

    // Add security headers
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  };
}

/**
 * Production-ready CORS configuration for domain-restricted access
 * Use this for production environments where you want to restrict access to specific domains
 */
export function createProductionCorsOptions(allowedDomains: string[]): CorsOptions {
  return {
    allowedOrigins: allowedDomains,
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
    allowCredentials: true,
    maxAge: 86400,
    exposeHeaders: ['Content-Disposition', 'Content-Length']
  };
}

/**
 * Development CORS configuration that allows all origins
 * ⚠️  SECURITY WARNING: Only use this in development environments!
 * This allows requests from ANY origin, which is a security risk in production.
 */
export function createDevelopmentCorsOptions(): CorsOptions {
  return {
    allowedOrigins: '*',
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
    allowCredentials: false, // Cannot be true with wildcard origin
    maxAge: 86400,
    exposeHeaders: ['Content-Disposition', 'Content-Length']
  };
}

/**
 * Helper function to determine CORS configuration based on environment
 */
export function getCorsConfig(env: Env): CorsOptions {
  const isProduction = env.NODE_ENV === 'production';
  
  if (isProduction) {
    // In production, restrict to specific domains
    const allowedDomains = [
      'https://ai.blawby.com',
      'https://blawby.com',
      'https://www.blawby.com'
    ];
    return createProductionCorsOptions(allowedDomains);
  } else {
    // In development, allow specific localhost origins for credentials
    const allowedDomains = [
      'http://localhost:5173', // Vite dev server
      'http://localhost:5174', // Alternative Vite dev server
      'http://localhost:5137', // Current Vite dev server
      'http://localhost:8787', // Worker dev server
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5137',
      'http://127.0.0.1:8787',
      'https://local.blawby.com'
    ];
    return createProductionCorsOptions(allowedDomains);
  }
}
