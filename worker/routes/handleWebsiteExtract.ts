/**
 * handleWebsiteExtract
 *
 * Fetches a public website URL, strips it to plain text, then calls the AI
 * to extract structured practice profile fields. Used by the onboarding chat
 * to pre-populate contact info, services, and description from an existing site.
 *
 * POST /api/ai/extract-website
 * Body: { practiceId: string, url: string }
 * Returns: { fields: ExtractedPracticeFields; confidence: Record<string, 'high'|'medium'|'low'> }
 */

import { parseJsonBody } from '../utils.js';
import { HttpErrors } from '../errorHandler.js';
import type { Env } from '../types.js';
import { requirePracticeMember } from '../middleware/auth.js';
import { createAiClient } from '../utils/aiClient.js';
import { Logger } from '../utils/logger.js';

const FETCH_TIMEOUT_MS = 8_000;
const AI_TIMEOUT_MS   = 10_000;
const MAX_HTML_CHARS  = 80_000; // trim before sending to AI
const MAX_TEXT_CHARS  = 12_000; // after strip

export interface ExtractedPracticeFields {
  name?:         string;
  description?:  string;
  website?:      string;
  contactPhone?: string;
  businessEmail?: string;
  address?: {
    address?:    string;
    city?:       string;
    state?:      string;
    postalCode?: string;
    country?:    string;
  };
  services?: Array<{ name: string; description?: string }>;
  accentColor?:  string; // hex, if brand color is detectable
}

// ── HTML → plain text (no DOM parser in Workers) ──────────────────────────────

function stripHtml(html: string): string {
  return html
    .slice(0, MAX_HTML_CHARS)
    // Remove script / style blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    // Replace block elements with newlines
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|td|th|br)>/gi, '\n')
    // Remove remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode basic HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleWebsiteExtract(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') throw HttpErrors.methodNotAllowed('Method not allowed');

  const body = await parseJsonBody(request) as { practiceId?: string; url?: string };
  if (!body.practiceId) throw HttpErrors.badRequest('practiceId is required');
  await requirePracticeMember(request, env, body.practiceId);
  const rawUrl = (body.url ?? '').trim();
  if (!rawUrl) throw HttpErrors.badRequest('url is required');

  let normalizedUrl: string;
  try {
    const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    normalizedUrl = parsed.toString();
  } catch {
    throw HttpErrors.badRequest('url must be a valid http/https URL');
  }

  // ── 1. Fetch the website ───────────────────────────────────────────────────
  let siteText: string;
  try {
    const fetchResponse = await Promise.race([
      fetch(normalizedUrl, {
        headers: {
          // Polite bot UA — some sites block missing user-agents
          'User-Agent': 'Mozilla/5.0 (compatible; BlawbyBot/1.0; +https://blawby.com/bot)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FETCH_TIMEOUT')), FETCH_TIMEOUT_MS)
      ),
    ]);

    if (!fetchResponse.ok) {
      throw HttpErrors.badGateway(
        `Could not fetch ${normalizedUrl} — server responded with ${fetchResponse.status}`
      );
    }

    const contentType = fetchResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      throw HttpErrors.badRequest(`URL does not appear to be an HTML page (content-type: ${contentType})`);
    }

    const html = await fetchResponse.text();
    siteText = stripHtml(html);

    if (siteText.length < 50) {
      throw HttpErrors.badGateway('Fetched page appears to be empty or JavaScript-rendered only');
    }
  } catch (err) {
    if (err instanceof Response) throw err; // re-throw HttpErrors
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'FETCH_TIMEOUT') {
      throw HttpErrors.gatewayTimeout(`${normalizedUrl} did not respond within ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    Logger.warn('[WebsiteExtract] Fetch failed', { url: normalizedUrl, error: message });
    throw HttpErrors.badGateway(`Could not fetch website: ${message}`);
  }

  // ── 2. Extract fields via AI ───────────────────────────────────────────────
  const aiClient = createAiClient(env);
  const model = env.AI_MODEL || 'gpt-4o-mini';

  const extractionTool = {
    type: 'function',
    function: {
      name: 'extract_practice_fields',
      description: 'Extract structured practice/business profile fields from website text',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Business/practice name' },
          description: { type: 'string', description: 'What the business does, 1-3 sentences, plain English' },
          website: { type: 'string', description: 'Canonical website URL' },
          contactPhone: { type: 'string', description: 'Primary phone number' },
          businessEmail: { type: 'string', description: 'Primary contact email' },
          address: {
            type: 'object',
            properties: {
              address:    { type: 'string', description: 'Street address' },
              city:       { type: 'string' },
              state:      { type: 'string', description: '2-letter state code if US' },
              postalCode: { type: 'string' },
              country:    { type: 'string' },
            },
          },
          services: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name:        { type: 'string', description: 'Service or practice area name' },
                description: { type: 'string', description: 'One sentence description' },
              },
              required: ['name'],
            },
            description: 'List of distinct services or practice areas offered',
            maxItems: 12,
          },
          confidence: {
            type: 'object',
            description: 'Your confidence for each extracted field',
            properties: {
              name:          { type: 'string', enum: ['high', 'medium', 'low'] },
              description:   { type: 'string', enum: ['high', 'medium', 'low'] },
              contactPhone:  { type: 'string', enum: ['high', 'medium', 'low'] },
              businessEmail: { type: 'string', enum: ['high', 'medium', 'low'] },
              address:       { type: 'string', enum: ['high', 'medium', 'low'] },
              services:      { type: 'string', enum: ['high', 'medium', 'low'] },
            },
          },
        },
        required: ['confidence'],
      },
    },
  };

  let extracted: ExtractedPracticeFields = {};
  let confidence: Record<string, string> = {};

  try {
    const aiResponse = await Promise.race([
      aiClient.requestChatCompletions({
        model,
        temperature: 0,
        tool_choice: { type: 'function', function: { name: 'extract_practice_fields' } },
        tools: [extractionTool],
        messages: [
          {
            role: 'system',
            content:
              'You are a data extraction assistant. Extract structured business profile information ' +
              'from the provided website text. Only extract what is clearly present — do not invent or infer. ' +
              'For services/practice areas, list each distinct offering separately. ' +
              'Set confidence to "high" only if the value appears explicitly and unambiguously.',
          },
          {
            role: 'user',
            content: `Website URL: ${normalizedUrl}\n\nWebsite text:\n${siteText}`,
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS)
      ),
    ]);

    if (!aiResponse.ok) {
      throw new Error(`AI returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json() as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.name === 'extract_practice_fields' && toolCall.function.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments) as ExtractedPracticeFields & {
        confidence?: Record<string, string>;
      };
      confidence = parsed.confidence ?? {};
      const { confidence: _c, ...fields } = parsed;
      extracted = fields;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.warn('[WebsiteExtract] AI extraction failed', { url: normalizedUrl, error: message });
    // Return empty extraction rather than a hard error — the user can fill manually
    return new Response(
      JSON.stringify({ fields: {}, confidence: {}, warning: 'AI extraction failed — please fill fields manually.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ fields: extracted, confidence, sourceUrl: normalizedUrl }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
