import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { optionalAuth } from '../middleware/auth.js';
import { handleBackendProxy } from './authProxy.js';

type BackendMatter = Record<string, unknown>;
type BackendMatterActivity = {
  id?: string | null;
  matter_id?: string | null;
  user_id?: string | null;
  action?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

const UPDATE_PATTERN = /^\/api\/matters\/([^/]+)\/update\/([^/]+)$/;
const ACTIVITY_PATTERN = /^\/api\/matters\/([^/]+)\/matters\/([^/]+)\/activity$/;
const DOMAIN_PATTERN = /;\s*domain=[^;]+/i;

const resolveRequestHost = (request: Request): string => {
  const forwardedHost = request.headers.get('X-Forwarded-Host');
  if (forwardedHost) {
    return forwardedHost.split(',')[0].trim();
  }
  const forwarded = request.headers.get('Forwarded');
  if (forwarded) {
    const entries = forwarded.split(',').map((entry) => entry.trim());
    for (const entry of entries) {
      const match = entry.match(/host=([^;]+)/i);
      if (match) {
        const rawHost = match[1].trim();
        return rawHost.replace(/^"|"$|^'|'$/g, '');
      }
    }
  }
  return new URL(request.url).host;
};

const normalizeCookieDomain = (value: string, requestHost: string): string => {
  const cookieName = value.split('=')[0]?.trim().toLowerCase() ?? '';
  if (cookieName.startsWith('__host-')) {
    return value.replace(DOMAIN_PATTERN, '');
  }
  const hostParts = requestHost.split(':')[0].split('.');
  if (hostParts.length < 2) {
    return value.replace(DOMAIN_PATTERN, '');
  }
  const baseDomain = hostParts.slice(-2).join('.');
  const domainValue = `.${baseDomain}`;
  if (DOMAIN_PATTERN.test(value)) {
    return value.replace(DOMAIN_PATTERN, `; Domain=${domainValue}`);
  }
  return value;
};

const buildProxyHeaders = (response: Response, requestHost: string): Headers => {
  const proxyHeaders = new Headers(response.headers);
  proxyHeaders.delete('Set-Cookie');
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    const cookies = headersWithSetCookie.getSetCookie();
    for (const cookie of cookies) {
      proxyHeaders.append('Set-Cookie', normalizeCookieDomain(cookie, requestHost));
    }
    return proxyHeaders;
  }
  const setCookie = response.headers.get('Set-Cookie');
  if (setCookie) {
    proxyHeaders.set('Set-Cookie', normalizeCookieDomain(setCookie, requestHost));
  }
  return proxyHeaders;
};

const resolveBackendUrl = (env: Env): string => {
  if (!env.BACKEND_API_URL) {
    throw HttpErrors.internalServerError('BACKEND_API_URL must be configured for matters proxy');
  }
  return env.BACKEND_API_URL;
};

const extractMatter = (payload: unknown): BackendMatter | null => {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    return (payload.find((item) => item && typeof item === 'object') ?? null) as BackendMatter | null;
  }
  const record = payload as Record<string, unknown>;
  if (record.matter && typeof record.matter === 'object') {
    return record.matter as BackendMatter;
  }
  if (record.data) {
    return extractMatter(record.data);
  }
  return record as BackendMatter;
};

const extractActivityArray = (payload: unknown): BackendMatterActivity[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is BackendMatterActivity => !!item && typeof item === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.activity)) {
    return record.activity.filter((item): item is BackendMatterActivity => !!item && typeof item === 'object');
  }
  if (record.data) {
    return extractActivityArray(record.data);
  }
  return [];
};

const enrichActivityPayload = (
  payload: unknown,
  diffs: Record<string, { fields: string[] }>
): unknown => {
  if (Array.isArray(payload)) {
    return payload.map((item) => enrichActivityPayload(item, diffs));
  }
  if (!payload || typeof payload !== 'object') return payload;
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.activity)) {
    return {
      ...record,
      activity: record.activity.map((item) => enrichActivityPayload(item, diffs))
    };
  }
  if (record.data) {
    return {
      ...record,
      data: enrichActivityPayload(record.data, diffs)
    };
  }
  const item = record as BackendMatterActivity;
  const activityId = typeof item.id === 'string' ? item.id : '';
  const diff = activityId ? diffs[activityId] : undefined;
  if (!diff || !diff.fields?.length) return item;
  return {
    ...item,
    metadata: {
      ...(item.metadata ?? {}),
      changed_fields: diff.fields
    }
  };
};

const isEmptyValue = (value: unknown): boolean => value === null || value === undefined || value === '';

const areEquivalentValues = (left: unknown, right: unknown): boolean => {
  if (isEmptyValue(left) && isEmptyValue(right)) return true;
  if (Object.is(left, right)) return true;
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType !== rightType) return false;
  if (left && right && leftType === 'object') {
    try {
      // Stable stringify by sorting keys
      const stableStringify = (obj: unknown): string => {
        if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
        if (Array.isArray(obj)) {
          return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
        }
        const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
        const parts = sortedKeys.map(key => `${JSON.stringify(key)}:${stableStringify((obj as Record<string, unknown>)[key])}`);
        return `{${parts.join(',')}}`;
      };
      return stableStringify(left) === stableStringify(right);
    } catch {
      return false;
    }
  }
  return false;
};

const areEquivalentArrays = (left: string[] = [], right: string[] = []): boolean => {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

const extractAssigneeIds = (matter: BackendMatter): string[] => {
  const assigneeIds = matter.assignee_ids;
  if (Array.isArray(assigneeIds)) {
    return assigneeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }
  const assignees = matter.assignees;
  if (Array.isArray(assignees)) {
    return assignees
      .map((assignee) => {
        if (typeof assignee === 'string') return assignee;
        if (!assignee || typeof assignee !== 'object') return '';
        const record = assignee as Record<string, unknown>;
        return typeof record.id === 'string' ? record.id : '';
      })
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }
  return [];
};

const buildMatterUpdateFields = (before: BackendMatter, after: BackendMatter): string[] => {
  const changes: string[] = [];
  if (!areEquivalentValues(before.title, after.title)) changes.push('title');
  if (!areEquivalentValues(before.status, after.status)) changes.push('status');
  if (!areEquivalentValues(before.client_id, after.client_id)) changes.push('client_id');
  if (!areEquivalentValues(before.description, after.description)) changes.push('description');
  if (!areEquivalentValues(before.billing_type, after.billing_type)) changes.push('billing_type');
  if (!areEquivalentValues(before.admin_hourly_rate, after.admin_hourly_rate)) changes.push('admin_hourly_rate');
  if (!areEquivalentValues(before.attorney_hourly_rate, after.attorney_hourly_rate)) changes.push('attorney_hourly_rate');
  if (!areEquivalentValues(before.practice_service_id, after.practice_service_id)) changes.push('practice_service_id');
  if (!areEquivalentValues(before.payment_frequency, after.payment_frequency)) changes.push('payment_frequency');
  if (!areEquivalentValues(before.total_fixed_price, after.total_fixed_price)) changes.push('total_fixed_price');
  if (!areEquivalentValues(before.contingency_percentage, after.contingency_percentage)) changes.push('contingency_percentage');
  if (!areEquivalentValues(before.settlement_amount, after.settlement_amount)) changes.push('settlement_amount');
  if (!areEquivalentArrays(extractAssigneeIds(before), extractAssigneeIds(after))) changes.push('assignee_ids');
  return changes;
};

const fetchBackend = async (
  env: Env,
  request: Request,
  targetPath: string,
  init?: globalThis.RequestInit
): Promise<Response> => {
  const backendUrl = resolveBackendUrl(env);
  const url = new URL(targetPath, backendUrl);
  const headers = new Headers(request.headers);
  const response = await fetch(url.toString(), {
    method: init?.method ?? request.method,
    headers,
    redirect: 'manual',
    body: init?.body
  });
  return response;
};

const fetchMatterSnapshot = async (
  env: Env,
  request: Request,
  practiceId: string,
  matterId: string
): Promise<BackendMatter | null> => {
  const params = new URLSearchParams({ matter_uuid: matterId });
  const response = await fetchBackend(env, request, `/api/matters/${practiceId}?${params.toString()}`, {
    method: 'GET'
  });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json().catch(() => null);
  return extractMatter(payload);
};

const fetchActivityList = async (
  env: Env,
  request: Request,
  practiceId: string,
  matterId: string
): Promise<BackendMatterActivity[]> => {
  const response = await fetchBackend(
    env,
    request,
    `/api/matters/${practiceId}/matters/${matterId}/activity`,
    { method: 'GET' }
  );
  if (!response.ok) {
    return [];
  }
  const payload = await response.json().catch(() => null);
  return extractActivityArray(payload);
};

export async function handleMatters(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/matters')) {
    throw HttpErrors.notFound('Matters route not found');
  }

  const updateMatch = url.pathname.match(UPDATE_PATTERN);
  if (updateMatch) {
    if (!['PUT', 'PATCH', 'POST'].includes(request.method.toUpperCase())) {
      return new Response('Method not allowed', { status: 405 });
    }
    const [, practiceId, matterId] = updateMatch;
    const requestHost = resolveRequestHost(request);
    const authContext = await optionalAuth(request, env);
    const before = await fetchMatterSnapshot(env, request, practiceId, matterId);
    const requestBody = await request.arrayBuffer();

    const updateResponse = await fetchBackend(
      env,
      request,
      url.pathname + url.search,
      {
        method: request.method,
        body: requestBody
      }
    );

    const proxyHeaders = buildProxyHeaders(updateResponse, requestHost);
    const updateBuffer = await updateResponse.arrayBuffer();
    let afterMatter: BackendMatter | null = null;
    if (updateBuffer.byteLength > 0) {
      try {
        const text = new TextDecoder().decode(updateBuffer);
        const payload = JSON.parse(text) as unknown;
        afterMatter = extractMatter(payload);
      } catch {
        // ignore parsing failures
      }
    }
    if (!afterMatter) {
      afterMatter = await fetchMatterSnapshot(env, request, practiceId, matterId);
    }

    if (before && afterMatter) {
      const fields = buildMatterUpdateFields(before, afterMatter);
      console.log('[MatterDiff] computed fields', { matterId, fields });
      if (fields.length > 0 && env.MATTER_DIFFS) {
        let candidate: { item: BackendMatterActivity; delta: number } | undefined;
        const delays = [100, 300, 700];
        const now = Date.now();

        for (let i = 0; i <= delays.length; i++) {
          const activities = await fetchActivityList(env, request, practiceId, matterId);
          const candidates = activities
            .filter((item) => item.action === 'matter_updated')
            .filter((item) => !authContext?.user?.id || item.user_id === authContext.user.id)
            .map((item) => ({
              item,
              createdAt: new Date(item.created_at ?? 0).getTime()
            }))
            .filter((record) => Number.isFinite(record.createdAt) && record.createdAt > 0)
            .map((record) => ({
              ...record,
              delta: Math.abs(record.createdAt - now)
            }))
            .sort((a, b) => a.delta - b.delta);

          candidate = candidates[0];
          if (candidate?.item?.id) break;

          if (i < delays.length) {
            console.log(`[MatterDiff] matching activity not found, retrying in ${delays[i]}ms (attempt ${i + 1})`);
            await new Promise((resolve) => setTimeout(resolve, delays[i]));
          }
        }

        if (candidate?.item?.id) {
          console.log('[MatterDiff] storing diff', {
            activityId: candidate.item.id,
            matterId,
            fields
          });
          try {
            const stub = env.MATTER_DIFFS.get(env.MATTER_DIFFS.idFromName(matterId));
            await stub.fetch('https://matter-diffs/internal/diffs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entries: [{
                  activityId: candidate.item.id,
                  matterId,
                  fields,
                  userId: authContext?.user?.id ?? null,
                  createdAt: candidate.item.created_at ?? null
                }]
              })
            });
          } catch (error) {
            console.warn('[MatterDiff] Failed to store diff', error);
          }
        } else {
          console.warn('[MatterDiff] Could not associate diff: no matching activity found after retries', { matterId, fields });
        }
      }
    }

    return new Response(updateBuffer, {
      status: updateResponse.status,
      statusText: updateResponse.statusText,
      headers: proxyHeaders
    });
  }

  const activityMatch = url.pathname.match(ACTIVITY_PATTERN);
  if (activityMatch) {
    if (request.method.toUpperCase() !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }
    const [, _practiceId, matterId] = activityMatch;
    const requestHost = resolveRequestHost(request);
    const backendResponse = await fetchBackend(env, request, url.pathname + url.search, {
      method: 'GET'
    });
    const proxyHeaders = buildProxyHeaders(backendResponse, requestHost);
    
    // Attempt to parse JSON; if it fails, fallback to passing through the raw response
    let payload: unknown;
    try {
      payload = await backendResponse.clone().json();
    } catch {
      // JSON parsing failed, return original body as simple pass-through
      return new Response(await backendResponse.clone().text(), {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: proxyHeaders
      });
    }

    const activities = extractActivityArray(payload);
    const activityIds = activities
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

    let diffs: Record<string, { fields: string[] }> = {};
    if (activityIds.length > 0 && env.MATTER_DIFFS) {
      try {
        const stub = env.MATTER_DIFFS.get(env.MATTER_DIFFS.idFromName(matterId));
        const response = await stub.fetch('https://matter-diffs/internal/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activityIds })
        });
        const json = await response.json().catch(() => null) as { diffs?: Record<string, { fields: string[] }> } | null;
        diffs = json?.diffs ?? {};
        console.log('[MatterDiff] lookup', { matterId, activityIds, diffs });
      } catch (error) {
        console.error('[MatterDiff] lookup failed', { matterId, error });
        diffs = {};
      }
    }

    const enriched = enrichActivityPayload(payload, diffs);
    proxyHeaders.set('Content-Type', 'application/json');
    return new Response(JSON.stringify(enriched), {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: proxyHeaders
    });
  }

  return handleBackendProxy(request, env);
}
