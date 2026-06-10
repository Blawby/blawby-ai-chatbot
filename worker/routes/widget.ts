import { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { Logger } from '../utils/logger.js';
import { ConversationService } from '../services/ConversationService.js';
import {
  extractWidgetTokenFromRequest,
  getWidgetTokenTtlForSource,
  issueWidgetAuthToken,
  validateWidgetAuthToken
} from '../utils/widgetAuthToken.js';
import type { IntakeTemplate } from '../../src/shared/types/intake.js';
import type { BackendIntakeTemplatePublic } from '../../src/shared/types/wire.js';
import { STANDARD_FIELD_DEFINITIONS } from '../../src/shared/constants/intakeTemplates.js';

const asNonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
);

const normalizeCrossSiteWidgetCookie = (cookie: string, request: Request): string => {
  const protocol = new URL(request.url).protocol;
  // Secure cookies are ignored on http://localhost in dev; keep upstream cookie
  // as-is unless this request is served over HTTPS.
  if (protocol !== 'https:') {
    return cookie;
  }

  let normalized = cookie;
  if (/;\s*SameSite=/i.test(normalized)) {
    normalized = normalized.replace(/;\s*SameSite=[^;]*/i, '; SameSite=None');
  } else {
    normalized = `${normalized}; SameSite=None`;
  }
  if (!/;\s*Secure\b/i.test(normalized)) {
    normalized = `${normalized}; Secure`;
  }
  if (!/;\s*Partitioned\b/i.test(normalized)) {
    normalized = `${normalized}; Partitioned`;
  }
  return normalized;
};

export async function handleWidgetBootstrap(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    throw HttpErrors.badRequest('slug parameter is required');
  }

  // Define headers for upstream calls
  const incomingCookie = request.headers.get('Cookie');
  // Forward Origin so Better Auth CSRF check doesn't fire when a cookie is present.
  // Browsers omit Origin on same-origin GETs, so fall back to the worker request's origin.
  const incomingOrigin = request.headers.get('Origin') || new URL(request.url).origin;
  const headers = new Headers();
  if (incomingCookie) {
    headers.set('Cookie', incomingCookie);
  }
  headers.set('Origin', incomingOrigin);

  const upstreamHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    upstreamHeaders[key] = value;
  });

  // 1. Fetch practice details + intake settings (in parallel with session check)
  const getPracticeDetails = (async () => {
    const res = await RemoteApiService.getPublicPracticeDetails(env, slug, request);
    if (!res.ok) {
      if (res.status === 404) {
        throw HttpErrors.notFound('Practice not found');
      }
      const text = await res.text().catch(() => 'No body');
      throw new Error(`[Bootstrap] Error fetching practice details: ${res.status} - ${text}`);
    }
    try {
      return await res.json();
    } catch (parseErr) {
      throw new Error(`[Bootstrap] Failed to parse JSON from upstream practice details: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    }
  })();
  const getIntakeSettings = (async () => {
    const res = await RemoteApiService.getPublicPracticeIntakeSettings(env, slug, request);
    if (!res.ok) {
      if (res.status === 404) {
        throw HttpErrors.notFound('Practice intake settings not found');
      }
      const text = await res.text().catch(() => 'No body');
      throw new Error(`[Bootstrap] Error fetching intake settings: ${res.status} - ${text}`);
    }
    try {
      return await res.json();
    } catch (parseErr) {
      throw new Error(`[Bootstrap] Failed to parse JSON from upstream intake settings: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    }
  })();

  // 2. Manage Session (Check session, if none, do anon sign-in)
  let responseCookies: string[] = [];
  let cookieSessionData: { user?: { id?: string; is_anonymous?: boolean }; session?: { id?: string } } | null = null;
  let tokenSessionData: { user?: { id?: string; is_anonymous?: boolean }; session?: { id?: string } } | null = null;
  const requestedWidgetToken = extractWidgetTokenFromRequest(request);
  let validatedWidgetTokenSource: 'authorization' | 'query' | null = null;

  // First, check for a valid session via cookies
  try {
    const sessionController = new AbortController();
    const sessionTimer = setTimeout(() => sessionController.abort(), 5000);

    try {
      const sessionRes = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
        headers: upstreamHeaders,
        signal: sessionController.signal
      });
      if (sessionRes.ok) {
        cookieSessionData = await sessionRes.json().catch(() => null);
      } else if (sessionRes.status !== 401 && sessionRes.status !== 404) {
        const errorText = await sessionRes.text().catch(() => '');
        Logger.warn('[Bootstrap] Optional session check failed', {
          status: sessionRes.status,
          error: errorText
        });
      }
    } finally {
      clearTimeout(sessionTimer);
    }
  } catch (err) {
    Logger.warn('[Bootstrap] Session check error ignored', { error: err instanceof Error ? err.message : String(err) });
  }

  // Second, try to validate the widget token if provided
  if (requestedWidgetToken) {
    try {
      const validatedToken = await validateWidgetAuthToken(requestedWidgetToken.token, env);
      validatedWidgetTokenSource = requestedWidgetToken.tokenSource;
      tokenSessionData = {
        user: {
          id: validatedToken.userId,
          is_anonymous: true,
        },
        session: {
          id: validatedToken.sessionId,
        },
      };

      // IDENTITY RECONCILIATION:
      // If we have both, they MUST match. If they don't (e.g. cookie cleared but token remains),
      // we must trust the cookie/session state (which is the source of truth for the browser's
      // current identity) and discard the stale token.
      if (cookieSessionData?.user?.id && tokenSessionData?.user?.id && cookieSessionData.user.id !== tokenSessionData.user.id) {
        Logger.info('[Bootstrap] Identity mismatch detected; discarding stale widget token', {
          cookieUserId: cookieSessionData.user.id,
          tokenUserId: tokenSessionData.user.id
        });
        tokenSessionData = null;
      }
    } catch {
      // Invalid/expired widget token falls through
    }
  }

  // Final session selection: Prefer the recovered token session (if it matched or was standalone),
  // otherwise use the cookie session.
  let sessionData = tokenSessionData || cookieSessionData;

  // Typing session data for subsequent logic
  const typedSessionData = sessionData as { user?: { id?: string; is_anonymous?: boolean } } | null;


  if (!typedSessionData?.user) {
    try {
      // Need anonymous signin
      const anonHeaders = new Headers(upstreamHeaders);
      if (!anonHeaders.has('Content-Type')) {
        anonHeaders.set('Content-Type', 'application/json');
      }

      const anonController = new AbortController();
      const anonTimer = setTimeout(() => anonController.abort(), 5000);

      try {
        const anonRes = await fetch(`${env.BACKEND_API_URL}/api/auth/sign-in/anonymous`, {
          method: 'POST',
          headers: anonHeaders,
          body: '{}',
          signal: anonController.signal
        });
        if (!anonRes.ok) {
          const errorText = await anonRes.text().catch(() => '');
          if (anonRes.status === 429) {
            throw HttpErrors.tooManyRequests(
              `[Bootstrap] Anonymous sign-in failed: 429${errorText ? ` - ${errorText}` : ''}`
            );
          }
          throw HttpErrors.badGateway(
            `[Bootstrap] Anonymous sign-in failed: ${anonRes.status}${errorText ? ` - ${errorText}` : ''}`
          );
        }

        if (!anonRes.headers.getSetCookie) {
          throw new Error('[Bootstrap] Environment does not support getSetCookie(); cannot reliably extract Set-Cookie headers.');
        }
        const setCookieHeaders = anonRes.headers.getSetCookie();

        responseCookies = responseCookies.concat(setCookieHeaders);
        sessionData = await anonRes.json().catch(() => null);

        // After anonymous sign-in the upstream may return only a `user` object
        // and set a session cookie. Fetch the session wrapper using that
        // cookie so `session.id` is available to downstream logic.
        try {
          const cookieHeader = setCookieHeaders.map(c => c.split(';')[0]).join('; ');
          if (cookieHeader) {
            const followHeaders = Object.assign({}, upstreamHeaders);
            followHeaders['Cookie'] = cookieHeader;
            const followController = new AbortController();
            const followTimer = setTimeout(() => followController.abort(), 5000);
            try {
              const followRes = await fetch(`${env.BACKEND_API_URL}/api/auth/get-session`, {
                headers: followHeaders,
                signal: followController.signal
              }).catch(() => null);
              if (followRes && followRes.ok) {
                const followed = await followRes.json().catch(() => null);
                if (followed) {
                  sessionData = followed;
                }
              }
            } finally {
              clearTimeout(followTimer);
            }
          }
        } catch (_e) {
          // If we fail to follow-up, keep the original anon payload (user only)
        }
      } finally {
        clearTimeout(anonTimer);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('[Bootstrap] Session operation timed out');
      }
      throw err;
    }
  }


  // 3. Wait for practice details
  const practiceDetails = await getPracticeDetails as Record<string, unknown>;
  const intakeSettingsPayload = await getIntakeSettings as Record<string, unknown>;
  const pd = (
    practiceDetails.data &&
    typeof practiceDetails.data === 'object' &&
    !Array.isArray(practiceDetails.data)
      ? practiceDetails.data
      : practiceDetails
  ) as Record<string, unknown>;
  const intakeData = (
    intakeSettingsPayload.data &&
    typeof intakeSettingsPayload.data === 'object' &&
    !Array.isArray(intakeSettingsPayload.data)
      ? intakeSettingsPayload.data
      : intakeSettingsPayload
  ) as Record<string, unknown>;
  const practiceId = asNonEmptyString(pd.id);
  if (!practiceId) {
    throw HttpErrors.badGateway('Unable to resolve practice id from practice details');
  }

  const requestedTemplateSlug = asNonEmptyString(url.searchParams.get('template'));
  if (requestedTemplateSlug && env.MCP_BACKEND_TOKEN) {
    try {
      const templateRes = await RemoteApiService.getPracticeTemplates(env, practiceId);
      const matchedTemplate = templateRes.templates?.find((t) => t.slug === requestedTemplateSlug);
      if (matchedTemplate) {
        intakeData.intake_template = matchedTemplate;
      } else {
        Logger.warn('[Bootstrap] Requested template not found, falling back to default', { requestedTemplateSlug });
      }
    } catch (err) {
      Logger.warn('[Bootstrap] Failed to fetch custom template, falling back to default', { 
        requestedTemplateSlug, 
        error: err instanceof Error ? err.message : String(err) 
      });
    }
  }

  // 4. Bootstrap an anon-safe active conversation so the widget can skip the extra
  // client-side get-or-create round-trip after bootstrap.
  let conversationId: string | null = null;
  let recentConversations: Array<{ id: string, created_at: string, last_message_at: string | null }> = [];
  const typedSessionDataResolved = sessionData as {
    user?: { id?: string; is_anonymous?: boolean };
    session?: { id?: string };
  } | null;
  const sessionUserId = typedSessionDataResolved?.user?.id ?? null;
  const sessionId =
    typeof typedSessionDataResolved?.session?.id === 'string' && typedSessionDataResolved.session.id.trim().length > 0
      ? typedSessionDataResolved.session.id.trim()
      : null;
  const isAnonymous = typedSessionDataResolved?.user?.is_anonymous === true;
  const widgetAuth =
    isAnonymous && sessionUserId && sessionId
      ? await issueWidgetAuthToken(
          env,
          { userId: sessionUserId, sessionId },
          validatedWidgetTokenSource
            ? { ttlSeconds: getWidgetTokenTtlForSource(validatedWidgetTokenSource) }
            : undefined
        )
      : null;
  const widgetQueryAuth =
    isAnonymous && sessionUserId && sessionId
      ? await issueWidgetAuthToken(
          env,
          { userId: sessionUserId, sessionId },
          { ttlSeconds: getWidgetTokenTtlForSource('query') }
        )
      : null;

  if (practiceId && sessionUserId) {
    try {
      const conversationService = new ConversationService(env);

      // Only fetch existing recent conversations; no more creation in bootstrap.
      // Filter for ('active', 'submitted') to avoid showing archived conversations in the widget.
      const userConversations = await conversationService.getConversations({
        practiceId,
        userId: sessionUserId,
        status: 'active',
        limit: 5
      });

      const mostRecent = userConversations[0] || null;
      conversationId = mostRecent?.id ?? null;

      recentConversations = userConversations.map(c => ({
        id: c.id,
        created_at: c.created_at,
        last_message_at: c.last_message_at ?? null
      }));
    } catch (err) {
      console.error('[Bootstrap] Failed to get conversations', { sessionUserId, practiceId, error: err });
    }
  }

  // 5. Resolve intake template from backend response (PR #318).
  // ------------------------------------------------------------------
  // The backend returns the resolved published default as `intake_template`.
  // If absent or null the practice has no published template — fail fast
  // so the root cause is fixed upstream rather than masked here.
  // ------------------------------------------------------------------
  const rawIntakeTemplate = intakeData.intake_template as BackendIntakeTemplatePublic | null | undefined;
  if (!rawIntakeTemplate) {
    throw HttpErrors.badGateway(`[Bootstrap] No published intake template found for practice '${slug}'. Ensure the practice has a published default template.`);
  }

  // Normalise backend shape → app IntakeTemplate (same logic as intakeTemplatesApi.ts edge)
  // ?service=<uuid> from the widget embed URL — pre-seeds practiceServiceUuid so
  // the AI skips asking for it on turn 1 and field conditions evaluate correctly.
  const preSelectedServiceUuid = asNonEmptyString(url.searchParams.get('service'));

  const intakeTemplate: IntakeTemplate = {
    id: rawIntakeTemplate.id,
    slug: rawIntakeTemplate.slug,
    name: rawIntakeTemplate.name,
    is_default: true,
    isDefault: true,
    introMessage: rawIntakeTemplate.intro_message ?? undefined,
    legalDisclaimer: rawIntakeTemplate.legal_disclaimer ?? undefined,
    paymentLinkEnabled: rawIntakeTemplate.payment_link_enabled,
    consultationFee: rawIntakeTemplate.consultation_fee ?? undefined,
    fields: (rawIntakeTemplate.fields ?? [])
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((f) => {
        const rules = f.validation_rules && typeof f.validation_rules === 'object' && !Array.isArray(f.validation_rules)
          ? f.validation_rules as Record<string, unknown>
          : {};
        return {
          key: f.key,
          label: f.label,
          type: (f.field_type === 'textarea' || f.field_type === 'email' || f.field_type === 'phone'
            ? 'text'
            : f.field_type === 'multiselect' ? 'select' : f.field_type) as IntakeTemplate['fields'][number]['type'],
          required: f.required,
          phase: f.phase,
          isStandard: f.is_standard,
          promptHint: f.prompt_hint ?? undefined,
          validationHint: f.help_text ?? undefined,
          options: f.options ? f.options.map((o) => o.value) : undefined,
          condition: rules.condition as IntakeTemplate['fields'][number]['condition'] ?? undefined,
          completenessWeight: typeof rules.completeness_weight === 'number' ? rules.completeness_weight : undefined,
        };
      }),
  };

  // Ensure the three structurally-locked required fields are always present.
  // If the backend template omits them (shouldn't happen but safe to guard),
  // prepend them from STANDARD_FIELD_DEFINITIONS so the AI always collects them.
  const LOCKED_KEYS = new Set(['description', 'city', 'state']);
  const presentKeys = new Set(intakeTemplate.fields.map((f) => f.key));
  const missingLocked = STANDARD_FIELD_DEFINITIONS.filter((f) => LOCKED_KEYS.has(f.key) && !presentKeys.has(f.key));
  if (missingLocked.length > 0) {
    intakeTemplate.fields = [...missingLocked, ...intakeTemplate.fields];
  }

  // Create the response object
  const bootstrapResponse = {
    practiceId,
    practiceDetails,
    session: sessionData,
    conversationId: conversationId,
    conversations: recentConversations,
    widgetAuthToken: widgetAuth?.token ?? null,
    widgetAuthTokenExpiresAt: widgetAuth?.expiresAt ?? null,
    widgetQueryAuthToken: widgetQueryAuth?.token ?? null,
    widgetQueryAuthTokenExpiresAt: widgetQueryAuth?.expiresAt ?? null,
    intakeTemplate,
    preSelectedServiceUuid,
  };

  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });

  // Forward Set-Cookie headers properly, handling multiple values
  // Since Headers class overwrites on set(), we use append() which handles multiple Set-Cookie properly in Cloudflare Workers
  for (const cookie of responseCookies) {
    responseHeaders.append('Set-Cookie', normalizeCrossSiteWidgetCookie(cookie, request));
  }

  return new Response(JSON.stringify(bootstrapResponse), {
    status: 200,
    headers: responseHeaders
  });
}

export async function handlePublicPracticeIntakeSettings(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    throw HttpErrors.methodNotAllowed('Method not allowed');
  }

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/practice-client-intakes\/([^/]+)\/intake$/);
  const slug = match?.[1] ? decodeURIComponent(match[1]).trim() : '';
  if (!slug) {
    throw HttpErrors.badRequest('Practice slug is required');
  }

  const res = await RemoteApiService.getPublicPracticeIntakeSettings(env, slug, request);
  if (!res.ok) {
    if (res.status === 404) {
      throw HttpErrors.notFound('Practice not found');
    }
    const text = await res.text().catch(() => 'No body');
    throw HttpErrors.badGateway(`[Public intake settings] Error fetching intake settings: ${res.status} - ${text}`);
  }

  const intakeSettingsPayload = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!intakeSettingsPayload) {
    throw HttpErrors.badGateway('Failed to parse public intake settings');
  }
  const dataRecord = intakeSettingsPayload.data && typeof intakeSettingsPayload.data === 'object' && !Array.isArray(intakeSettingsPayload.data)
    ? intakeSettingsPayload.data as Record<string, unknown>
    : null;
  const settingsRecord = dataRecord?.settings && typeof dataRecord.settings === 'object'
    ? dataRecord.settings as Record<string, unknown>
    : intakeSettingsPayload.settings && typeof intakeSettingsPayload.settings === 'object'
      ? intakeSettingsPayload.settings as Record<string, unknown>
      : {};
  const organizationRecord = dataRecord?.organization && typeof dataRecord.organization === 'object'
    ? dataRecord.organization as Record<string, unknown>
    : intakeSettingsPayload.organization && typeof intakeSettingsPayload.organization === 'object'
      ? intakeSettingsPayload.organization as Record<string, unknown>
      : {};
  const intakeTemplate = ((dataRecord?.intake_template as unknown) ?? intakeSettingsPayload.intake_template ?? null);

  const settings = {
    payment_link_enabled: Boolean(settingsRecord.payment_link_enabled),
    consultation_fee: typeof settingsRecord.consultation_fee === 'number' ? settingsRecord.consultation_fee : undefined,
  };

  const organization = {
    id: asNonEmptyString(organizationRecord.id) ?? undefined,
    slug: typeof organizationRecord.slug === 'string' ? organizationRecord.slug : slug,
    name: typeof organizationRecord.name === 'string' ? organizationRecord.name : undefined,
    logo: typeof organizationRecord.logo === 'string' ? organizationRecord.logo : undefined,
  };

  return new Response(JSON.stringify({
    success: true,
    settings,
    organization,
    intake_template: intakeTemplate,
    data: { settings, organization, intake_template: intakeTemplate },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
