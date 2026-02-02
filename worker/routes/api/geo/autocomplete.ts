/**
 * Geoapify autocomplete API endpoint
 * Route: GET /api/geo/autocomplete
 */

import { Env } from '../../../types';
import { callGeoapifyAutocompleteMultiPass, validateAutocompleteRequest } from '../../../lib/geoapify';
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
export async function handleAutocomplete(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const query: AutocompleteQuery = {
      text: url.searchParams.get('text') || '',
      limit: url.searchParams.get('limit') || '5',
      lang: url.searchParams.get('lang') || 'en',
      country: url.searchParams.get('country') || undefined,
    };

    // Get Cloudflare geolocation context
    const cfGeo = request.cf as {
      country?: string;
      city?: string;
      region?: string;
      postalCode?: string;
      latitude?: number;
      longitude?: number;
      timezone?: string;
    };

    console.log('[Autocomplete] Cloudflare geolocation:', cfGeo);

    // Use Cloudflare country as default if no country specified
    if (!query.country && cfGeo.country) {
      query.country = cfGeo.country;
      console.log('[Autocomplete] Using Cloudflare country:', cfGeo.country);
    }

    // Only apply bias when Cloudflare country matches requested country
    const shouldApplyBias = query.country && cfGeo.country && 
      query.country.toUpperCase() === cfGeo.country.toUpperCase();
    
    console.log('[Autocomplete] Bias context:', {
      requestedCountry: query.country,
      cfCountry: cfGeo.country,
      shouldApplyBias
    });

    // Get configuration from environment
    const minChars = parseInt(env.GEOAPIFY_MIN_CHARS || '3', 10);
    const dailyLimit = parseInt(env.GEOAPIFY_DAILY_LIMIT || '1000', 10);
    const rpmPerIp = parseInt(env.GEOAPIFY_RPM_PER_IP || '60', 10);

    console.log('[Autocomplete] Debug:', {
      text: query.text,
      textLength: query.text.length,
      minChars,
      dailyLimit,
      rpmPerIp,
      hasApiKey: !!env.GEOAPIFY_API_KEY,
      cfCountry: cfGeo.country,
      cfCity: cfGeo.city,
      cfRegion: cfGeo.region,
    });

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
    
    // Check per-minute rate limit first
    const rpmResult = await incrementRateLimitCounter(env, `geo:rpm:${clientIp}`, rpmPerIp);
    if (rpmResult.exceeded) {
      const error: AutocompleteError = { code: 'AUTOCOMPLETE_DISABLED' };
      return new Response(JSON.stringify(error), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Check daily quota after RPM passes
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

    // Call Geoapify API with multi-pass fallback
    const result = await callGeoapifyAutocompleteMultiPass({
      text: query.text,
      limit: parseInt(query.limit, 10),
      lang: query.lang,
      country: query.country,
      apiKey: env.GEOAPIFY_API_KEY,
      bias: shouldApplyBias && cfGeo.latitude && cfGeo.longitude ? {
        lat: cfGeo.latitude,
        lon: cfGeo.longitude,
        radius: 50000, // 50km radius
      } : undefined,
    }, { DEBUG_GEO: env.DEBUG_GEO });

    if ('code' in result) {
      return new Response(JSON.stringify(result), {
        status: result.code === 'AUTOCOMPLETE_DISABLED' ? 429 : 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response: AutocompleteResponse = result;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60, public', // Edge cache for 60 seconds
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
