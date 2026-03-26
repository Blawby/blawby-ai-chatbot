import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { optionalAuth } from '../middleware/auth.js';
import { callGeoapifyAutocomplete } from '../lib/geoapify.js';

export async function handleSearch(request: Request, env: Env): Promise<Response> {
  await optionalAuth(request, env);

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();

  if (!query) {
    throw HttpErrors.badRequest('Query parameter "q" is required');
  }

  if (!env.GEOAPIFY_API_KEY) {
    throw HttpErrors.internalServerError('Search service is not configured (missing Geoapify API key)');
  }

  // Use Geoapify to find the place
  try {
    const searchResult = await callGeoapifyAutocomplete({
      text: query,
      limit: 3, // Allow multiple for ambiguity handling
      apiKey: env.GEOAPIFY_API_KEY,
    });

    if ('code' in searchResult) {
      throw new Error(`Geoapify error: ${searchResult.code}`);
    }

    const suggestions = searchResult.suggestions;
    if (!suggestions || suggestions.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          query,
          contextBlock: `[SEARCH_RESULT] No definitive match found for "${query}". Please ask the user to provide their full address or website so I can try a more specific lookup.`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If we have a single very high confidence result, or just one result
    if (suggestions.length === 1) {
      const suggestion = suggestions[0];
      const { label, address, formatted, properties } = suggestion;
      const propertiesRecord = (properties as Record<string, unknown>) || {};
      const contact = (propertiesRecord.contact as Record<string, unknown>) || {};
      const website = (contact.website as string) || (propertiesRecord.website as string) || '';
      const phone = (contact.phone as string) || (propertiesRecord.phone as string) || '';
      const bio = (propertiesRecord.description as string) || '';

      const contextBlock = [
        `[SEARCH_RESULT] One definitive match found for "${query}":`,
        `Name: ${label}`,
        `Address: ${formatted}`,
        phone ? `Phone: ${phone}` : null,
        website ? `Website: ${website}` : null,
        bio ? `Bio: ${bio}` : null,
        `Fields: { "name": "${label}", "website": "${website}", "contactPhone": "${phone}", "address": { "address": "${address.address || ''}", "city": "${address.city || ''}", "state": "${address.state || ''}", "postalCode": "${address.postalCode || ''}" }, "description": "${bio.slice(0, 300)}" }`,
        `\nINSTRUCTION: 1. Confirm this is correct with the user. 2. Offer Quick Replies: "Yes, that's correct" and "No, that's not it". 3. If they confirm, use update_practice_fields with the provided "Fields" JSON to fill EVERYTHING.`,
      ].filter(Boolean).join('\n');

      return new Response(
        JSON.stringify({
          success: true,
          query,
          result: { name: label, address: formatted, website, phone, city: address.city, state: address.state, postalCode: address.postalCode },
          contextBlock,
          source: 'geoapify_v2_exact'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Multiple matches
    const matchesBlocks = suggestions.map((s, i) => {
      const { label, address, formatted, properties } = s;
      const props = (properties as Record<string, unknown>) || {};
      const contact = (props.contact as Record<string, unknown>) || {};
      const website = (contact.website as string) || (props.website as string) || '';
      const phone = (contact.phone as string) || (props.phone as string) || '';
      return [
        `MATCH ${i + 1}:`,
        `Name: ${label}`,
        `Address: ${formatted}`,
        phone ? `Phone: ${phone}` : null,
        website ? `Website: ${website}` : null,
        `Fields: { "name": "${label}", "website": "${website}", "contactPhone": "${phone}", "address": { "address": "${address.address || ''}", "city": "${address.city || ''}", "state": "${address.state || ''}", "postalCode": "${address.postalCode || ''}" } }`
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const contextBlock = [
      `[SEARCH_RESULT] Multiple matches found for "${query}":`,
      matchesBlocks,
      `\nINSTRUCTION: 1. Present the options to the user clearly. 2. Ask which one is theirs. 3. Use Quick Replies for each (e.g., [ "Match 1", "Match 2", "None of these" ]). 4. When they pick one, use update_practice_fields with the provided "Fields" JSON. 5. If "None of these", ask for details manually.`,
    ].join('\n');

    return new Response(
      JSON.stringify({
        success: true,
        query,
        results: suggestions.map(s => ({ name: s.label, address: s.formatted })),
        contextBlock,
        source: 'geoapify_v2_multiple'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        success: false,
        query,
        error: message,
        contextBlock: `[SEARCH_RESULT] Search for "${query}" failed due to a technical error. Please proceed manually.`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
