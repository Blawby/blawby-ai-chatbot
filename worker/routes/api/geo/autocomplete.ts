/**
 * Geoapify autocomplete API endpoint
 * Route: GET /api/geo/autocomplete
 */

import { Env } from '../../../types';
import { callGeoapifyAutocomplete, validateAutocompleteRequest } from '../../../lib/geoapify';
import { incrementDailyCounter, incrementRateLimitCounter } from '../../../lib/kvCounters';
import { withCORS, getCorsConfig } from '../../../middleware/cors';
import type { AutocompleteResponse, AutocompleteError } from '../../../types/address';

interface AutocompleteQuery {
  text: string;
  limit?: string;
  lang?: string;
  country?: string;
}

/**
 * Handle autocomplete request with rate limiting and quota controls
 */
async function handleAutocomplete(request: Request, env: Env): Promise<Response> {
  // Parse query parameters
  const url = new URL(request.url);
  const query: AutocompleteQuery = {
    text: url.searchParams.get('text') || '',
    limit: url.searchParams.get('limit') || undefined,
    lang: url.searchParams.get('lang') || undefined,
    country: url.searchParams.get('country') || undefined,
  };

  // Get configuration from environment
  const dailyLimit = parseInt(env.GEOAPIFY_DAILY_LIMIT || '1000', 10);
  const rpmPerIp = parseInt(env.GEOAPIFY_RPM_PER_IP || '60', 10);
  const minChars = parseInt(env.GEOAPIFY_MIN_CHARS || '3', 10);

  // Validate request parameters
  const validation = validateAutocompleteRequest(
    query.text,
    query.limit,
    query.lang,
    query.country,
    minChars
  );

  if (!validation.valid) {
    return new Response(JSON.stringify(validation.error), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get client IP for rate limiting
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  
  // Check daily quota
  const dailyResult = await incrementDailyCounter(env, 'geo:day', dailyLimit);
  if (dailyResult.exceeded) {
    const error: AutocompleteError = { code: 'AUTOCOMPLETE_DISABLED' };
    return new Response(JSON.stringify(error), {
      status: 429,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Check per-minute rate limit
  const rateLimitResult = await incrementRateLimitCounter(env, `geo:rpm:${clientIp}`, rpmPerIp);
  if (rateLimitResult.exceeded) {
    const error: AutocompleteError = { code: 'AUTOCOMPLETE_DISABLED' };
    return new Response(JSON.stringify(error), {
      status: 429,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Check API key availability
  if (!env.GEOAPIFY_API_KEY) {
    console.error('[Autocomplete] GEOAPIFY_API_KEY not configured');
    const error: AutocompleteError = { code: 'UPSTREAM_ERROR' };
    return new Response(JSON.stringify(error), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Call Geoapify API
    const result = await callGeoapifyAutocomplete({
      text: query.text,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      lang: query.lang,
      country: query.country,
      apiKey: env.GEOAPIFY_API_KEY,
    });

    if ('code' in result) {
      // Error response from Geoapify
      return new Response(JSON.stringify(result), {
        status: result.code === 'UPSTREAM_ERROR' ? 502 : 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Success response
    const response: AutocompleteResponse = {
      suggestions: result.suggestions,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
        'Vary': 'Accept-Encoding',
      },
    });

  } catch (error) {
    console.error('[Autocomplete] Unexpected error:', error);
    const errorResponse: AutocompleteError = { code: 'UPSTREAM_ERROR' };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Export the handler wrapped with CORS middleware
export const handleAutocompleteWithCORS = (request: Request, env: Env, ctx: ExecutionContext) => 
  withCORS(handleAutocomplete, getCorsConfig(env))(request, env, ctx);
