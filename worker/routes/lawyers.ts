import type { Env } from '../types';
import { HttpErrors } from '../errorHandler';

interface LawyerSearchApiResponse {
  source: string;
  query: Record<string, unknown>;
  lawyers: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export async function handleLawyers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'GET') {
    return await handleGetLawyers(request, env, url);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleGetLawyers(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const apiKey = env.LAWYER_SEARCH_API_KEY;
    const apiUrl = env.LAWYER_SEARCH_API_URL || 'https://search.blawby.com';

    if (!apiKey) {
      throw HttpErrors.internalServerError('Lawyer search API key not configured');
    }

    // Extract query parameters
    const state = url.searchParams.get('state');
    const city = url.searchParams.get('city');
    const practiceArea = url.searchParams.get('practice_area') || url.searchParams.get('practiceArea');
    const zipCode = url.searchParams.get('zipCode') || url.searchParams.get('zip_code');
    
    // Parse and validate integer parameters to avoid forwarding NaN
    const pageRaw = parseInt(url.searchParams.get('page') || '1', 10);
    const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
    const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
    const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 20 : limitRaw;
    
    const all = url.searchParams.get('all') === 'true';

    // Build search URL
    let searchUrl = `${apiUrl}/lawyers`;
    if (all) {
      searchUrl = `${apiUrl}/lawyers/all`;
    }

    const searchParams = new URLSearchParams();
    if (state) searchParams.set('state', state);
    if (city) searchParams.set('city', city);
    if (practiceArea) searchParams.set('practice_area', practiceArea);
    if (zipCode) searchParams.set('zipCode', zipCode);
    if (page > 1) searchParams.set('page', String(page));
    if (limit !== 20) searchParams.set('limit', String(limit));

    const fullUrl = searchParams.toString() ? `${searchUrl}?${searchParams.toString()}` : searchUrl;

    // Call external API
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw HttpErrors.badGateway(`Lawyer search API error: ${response.status} - ${errorText}`);
    }

    const data: LawyerSearchApiResponse = await response.json();

    // Return all data from API (no transformation/filtering)
    return new Response(JSON.stringify({
      success: true,
      data: {
        lawyers: data.lawyers,
        pagination: data.pagination,
        source: data.source,
        query: data.query
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }
    console.error('Error in lawyer search:', error);
    throw HttpErrors.internalServerError('Failed to search lawyers');
  }
}

