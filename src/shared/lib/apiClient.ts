import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import {
  getSubscriptionBillingPortalEndpoint,
  getSubscriptionCancelEndpoint,
  getSubscriptionListEndpoint,
  getConversationLinkEndpoint
} from '@/config/api';
import type { Conversation } from '@/shared/types/conversation';
import type { Address } from '@/shared/types/address';
import type { PracticeTeamResponse } from '@/shared/types/team';
import { getWorkerApiUrl, isWidgetTokenEligibleRequestUrl } from '@/config/urls';
import {
  toMajorUnits,
  toMinorUnitsValue,
  assertMajorUnits,
  assertMinorUnits,
  type MajorAmount
} from '@/shared/utils/money';
import { isTeamRole } from '@/shared/types/team';
import { getWidgetAuthToken } from '@/shared/utils/widgetAuth';

let cachedBaseUrl: string | null = null;
let isHandling401: Promise<void> | null = null;
const ABSOLUTE_URL_PATTERN = /^(https?:)?\/\//i;

const publicPracticeDetailsKey = (slug: string) => `practice:public:${slug}`;

/**
 * Clear the public practice details cache for a specific slug (or all slugs).
 * Call this on logout or when practice data is known to have changed.
 */
export const clearPublicPracticeDetailsCache = (slug?: string) => {
  if (slug) {
    queryCache.invalidate(publicPracticeDetailsKey(slug.trim()));
  } else {
    queryCache.invalidate('practice:public:', true);
  }
};

export const normalizePublicFileUrl = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (ABSOLUTE_URL_PATTERN.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  return `${getWorkerApiUrl()}/api/files/${encodeURIComponent(trimmed)}`;
};

/**
 * Get the base URL for backend API requests via the Worker proxy
 * Uses centralized URL configuration from src/config/urls.ts
 * 
 * Caching strategy:
 * - Development: Never cache (always read the current URL)
 * - Production: Cache after first call
 */
function ensureApiBaseUrl(): string {
  // NEVER cache in development - always get the latest URL.
  if (import.meta.env.DEV) {
    return getWorkerApiUrl();
  }

  // In production, cache after first call
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }

  cachedBaseUrl = getWorkerApiUrl();
  return cachedBaseUrl;
}

export class HttpError extends Error {
  readonly response: { status: number; data: unknown };
  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.name = 'HttpError';
    this.response = { status, data };
  }
}

export const isHttpError = (error: unknown): error is HttpError => error instanceof HttpError;
export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError');

export type ApiRequestConfig = { signal?: AbortSignal };

function extractFetchErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    if (typeof rec.message === 'string' && rec.message) return rec.message;
    if (typeof rec.error === 'string' && rec.error) return rec.error;
  }
  return fallback;
}

type ApiFetchConfig = {
  signal?: AbortSignal;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Abort the request after `timeout` ms. Composes with `signal` if both set. */
  timeout?: number;
  /** Statuses outside 2xx that should resolve (not throw). E.g. [304] for conditional GETs. */
  acceptStatuses?: number[];
};

const composeAbortSignals = (signal: AbortSignal | undefined, timeout: number | undefined): { signal: AbortSignal | undefined; cleanup: () => void } => {
  if (timeout == null) return { signal, cleanup: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout);
  let unlink: (() => void) | null = null;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      controller.abort(signal.reason);
    } else {
      const onAbort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      unlink = () => signal.removeEventListener('abort', onAbort);
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (unlink) unlink();
    },
  };
};

async function apiFetch<T>(
  method: string,
  url: string,
  body?: unknown,
  config?: ApiFetchConfig,
): Promise<{ data: T; status: number; headers: Headers }> {
  const { signal: callerSignal, params, headers: extraHeaders, timeout, acceptStatuses } = config ?? {};
  let fullUrl = /^https?:\/\//.test(url) ? url : `${ensureApiBaseUrl()}${url}`;
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    fullUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${qs}`;
  }
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
  if (body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const widgetToken = getWidgetAuthToken();
  if (widgetToken && isWidgetTokenEligibleRequestUrl(url) && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${widgetToken}`;
  }

  const { signal, cleanup } = composeAbortSignals(callerSignal, timeout);
  let response: Response;
  try {
    response = await fetch(fullUrl, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } finally {
    cleanup();
  }

  if (response.status === 401) {
    if (!isHandling401) {
      const doHandle = async () => {
        try {
          if (typeof window !== 'undefined') {
            try {
              window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            } catch (eventErr) {
              console.error('Error dispatching auth:unauthorized event:', eventErr);
            }
          }
        } finally {
          isHandling401 = null;
        }
      };
      isHandling401 = doHandle();
    }
    await isHandling401;
  }

  const isAccepted = acceptStatuses?.includes(response.status) ?? false;
  // `response.headers` may be missing in test stubs that fake just `{ ok, json }`;
  // prefer Headers when present, fall back to an empty Headers instance.
  const responseHeaders = response.headers ?? new Headers();
  if (response.status === 304 || (isAccepted && response.status === 204)) {
    // 304 Not Modified and 204 No Content carry no body. Don't try to parse.
    return { data: null as T, status: response.status, headers: responseHeaders };
  }

  const contentType = responseHeaders.get?.('content-type') ?? '';
  // Heuristic for environments without a proper Headers instance (some test
  // mocks): if `json()` is callable, prefer JSON.
  const preferJson = contentType.includes('application/json') || typeof response.json === 'function';
  const data: unknown = preferJson
    ? await response.json() as unknown
    : await response.text();

  if (!response.ok && !isAccepted) {
    throw new HttpError(response.status, data, extractFetchErrorMessage(data, `HTTP ${response.status}`));
  }

  return { data: data as T, status: response.status, headers: responseHeaders };
}

type FetchConfig = {
  signal?: AbortSignal;
  params?: Record<string, unknown>;
  baseURL?: string;
  /** Extra request headers (e.g. If-None-Match for conditional GETs). */
  headers?: Record<string, string>;
  /** Abort the request after `timeout` ms. Composes with `signal` if both set. */
  timeout?: number;
  /** Statuses outside 2xx that should resolve (not throw). E.g. [304] for conditional GETs. */
  acceptStatuses?: number[];
  /**
   * Optional JSON body for DELETE. RFC 7231 allows DELETE-with-body, and the
   * conversation-tag endpoint relies on it. POST/PUT/PATCH receive their body
   * via the explicit `body` parameter and ignore this field.
   */
  body?: unknown;
  /**
   * Cache keys/prefixes to invalidate on a successful (2xx) mutation. Items
   * are exact keys; items ending in `:` are treated as prefix invalidations.
   * The wrapper invalidates AFTER the await resolves, so callers don't have
   * to remember to call `queryCache.invalidate(...)` themselves.
   */
  invalidates?: string[];
};

const applyInvalidations = (invalidates: string[] | undefined): void => {
  if (!invalidates || invalidates.length === 0) return;
  for (const key of invalidates) {
    const isPrefix = key.endsWith(':');
    queryCache.invalidate(key, isPrefix);
  }
};

export type UploadProgress = { loaded: number; total: number; percent: number };
export type UploadConfig = {
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

/**
 * Upload a `FormData` body via XMLHttpRequest so the caller can observe
 * real upload progress (which `fetch` doesn't expose without
 * ReadableStream-based upload, which Safari and several other browsers
 * still don't support reliably).
 *
 * Mirrors `apiClient.post` shape — same `{ data, status }` return,
 * same widget-token handling, same 401 → `auth:unauthorized` event,
 * same `HttpError` for non-2xx. The `onProgress` callback fires for
 * each `upload.onprogress` event with `{ loaded, total, percent }`.
 *
 * Replaces hand-rolled XHR + `xhrRef` Map patterns scattered across
 * file-upload hooks.
 */
async function apiUpload<T>(
  url: string,
  body: FormData,
  config?: UploadConfig,
): Promise<{ data: T; status: number }> {
  const fullUrl = /^https?:\/\//.test(url) ? url : `${ensureApiBaseUrl()}${url}`;
  const widgetToken = getWidgetAuthToken();
  const eligibleForWidgetToken = widgetToken && isWidgetTokenEligibleRequestUrl(url);

  return new Promise<{ data: T; status: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', fullUrl, true);
    xhr.withCredentials = true;
    if (eligibleForWidgetToken) xhr.setRequestHeader('Authorization', `Bearer ${widgetToken}`);
    // Don't set Content-Type — the browser injects multipart/form-data with the boundary.

    if (config?.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        config.onProgress!({
          loaded: event.loaded,
          total: event.total,
          percent: Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))),
        });
      };
    }

    if (config?.signal) {
      if (config.signal.aborted) {
        xhr.abort();
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
        return;
      }
      config.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('Content-Type') ?? '';
      let parsed: unknown = xhr.responseText;
      if (contentType.includes('application/json')) {
        try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* keep text */ }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ data: parsed as T, status: xhr.status });
        return;
      }
      reject(new HttpError(xhr.status, parsed, extractFetchErrorMessage(parsed, `HTTP ${xhr.status}`)));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    };

    xhr.send(body);
  });
}

/**
 * Pull `data` out of a backend `ApiResponse<T>` envelope, throwing on the
 * error branch.
 *
 * The backend (and our worker's `createSuccessResponse`) wrap GET responses
 * in `{ success: true, data: T }`. Some endpoints additionally nest the
 * payload under `data.matters` / `data.items` / `data.<resource>`. Callers
 * pass an optional `pluck` to lift the inner array/object after unwrapping
 * the envelope.
 *
 * Replaces the inline `.data ?? .matters ?? .items ?? recurse` patterns
 * (`extractMatterArray`, `extractNotesArray`, `requestData`, …) that each
 * service file used to reinvent.
 */
export function unwrapApiResponse<T>(payload: unknown, fallbackMessage = 'Request failed'): T {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    const env = payload as { success: boolean; data?: unknown; error?: unknown; message?: unknown };
    if (env.success === false) {
      const message = typeof env.error === 'string' && env.error
        ? env.error
        : typeof env.message === 'string' && env.message
          ? env.message
          : fallbackMessage;
      throw new Error(message);
    }
    if ('data' in env) return env.data as T;
  }
  return payload as T;
}

/**
 * After unwrapping the envelope, lift a nested collection out of the resource
 * shape (e.g. `{ matters: [...] }` → `[...]`). Looks at `candidates` keys
 * first, then falls back to one level of `.data` (handles responses that
 * still nest inside an extra `data` wrapper after the envelope is stripped).
 * Returns `[]` if no array can be found.
 */
export function pluckCollection<T>(unwrapped: unknown, candidates: string[]): T[] {
  if (Array.isArray(unwrapped)) return unwrapped as T[];
  if (!unwrapped || typeof unwrapped !== 'object') return [];
  const record = unwrapped as Record<string, unknown>;
  for (const key of candidates) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  if (record.data) return pluckCollection<T>(record.data, candidates);
  return [];
}

/**
 * Pluck a single resource record. Looks at `candidates` keys for a single
 * non-array object, then falls back to one level of `.data`, then to the
 * unwrapped value itself. Returns `null` if none match.
 */
export function pluckRecord<T>(unwrapped: unknown, candidates: string[]): T | null {
  if (!unwrapped || typeof unwrapped !== 'object') return null;
  if (Array.isArray(unwrapped)) {
    return (unwrapped.find((item) => item && typeof item === 'object') ?? null) as T | null;
  }
  const record = unwrapped as Record<string, unknown>;
  for (const key of candidates) {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  }
  if (record.data) return pluckRecord<T>(record.data, candidates);
  return record as T;
}

const mutate = async <T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown,
  config?: FetchConfig,
): Promise<{ data: T; status: number; headers: Headers }> => {
  const result = await apiFetch<T>(method, url, body, config);
  // Invalidate on 2xx only — apiFetch throws HttpError otherwise, so reaching
  // this line means the mutation succeeded.
  applyInvalidations(config?.invalidates);
  return result;
};

type StreamConfig = {
  signal?: AbortSignal;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
};

/**
 * Issue a request and return the raw `Response` with body intact, so the
 * caller can branch on `content-type` (JSON short-circuit vs. SSE) and
 * consume `response.body.getReader()` for streaming.
 *
 * Mirrors `apiClient.{get,post}` for header normalization (Content-Type,
 * widget bearer for allowlisted URLs), URL resolution, and 401 → event
 * dispatch. Throws `HttpError` on non-2xx so caller's catch sees the same
 * error contract as the rest of the API surface.
 */
async function apiStream(
  method: 'GET' | 'POST',
  url: string,
  config?: StreamConfig,
): Promise<Response> {
  const { signal, params, headers: extraHeaders, body } = config ?? {};
  let fullUrl = /^https?:\/\//.test(url) ? url : `${ensureApiBaseUrl()}${url}`;
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    fullUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${qs}`;
  }
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
  if (body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const widgetToken = getWidgetAuthToken();
  if (widgetToken && isWidgetTokenEligibleRequestUrl(url) && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${widgetToken}`;
  }

  const response = await fetch(fullUrl, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (response.status === 401) {
    if (!isHandling401) {
      const doHandle = async () => {
        try {
          if (typeof window !== 'undefined') {
            try {
              window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            } catch (eventErr) {
              console.error('Error dispatching auth:unauthorized event:', eventErr);
            }
          }
        } finally {
          isHandling401 = null;
        }
      };
      isHandling401 = doHandle();
    }
    await isHandling401;
  }

  if (!response.ok) {
    // Drain the body so caller's catch path can read structured error data.
    const contentType = response.headers.get('content-type') ?? '';
    const data: unknown = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');
    throw new HttpError(response.status, data, extractFetchErrorMessage(data, `HTTP ${response.status}`));
  }

  return response;
}

export const apiClient = {
  get: <T>(url: string, config?: FetchConfig) =>
    apiFetch<T>('GET', url, undefined, config),
  post: <T>(url: string, body?: unknown, config?: FetchConfig) =>
    mutate<T>('POST', url, body, config),
  put: <T>(url: string, body?: unknown, config?: FetchConfig) =>
    mutate<T>('PUT', url, body, config),
  patch: <T>(url: string, body?: unknown, config?: FetchConfig) =>
    mutate<T>('PATCH', url, body, config),
  delete: <T>(url: string, config?: FetchConfig) =>
    mutate<T>('DELETE', url, config?.body, config),
  upload: <T>(url: string, body: FormData, config?: UploadConfig) =>
    apiUpload<T>(url, body, config),
  stream: (url: string, config?: StreamConfig & { method?: 'GET' | 'POST' }) =>
    apiStream(config?.method ?? 'POST', url, config),
};

type PracticeMetadata = Record<string, unknown> | null | undefined;

export interface Practice {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: PracticeMetadata;
  businessPhone: string | null;
  businessEmail: string | null;
  consultationFee: MajorAmount | null; // Major currency units (e.g., USD dollars).
  paymentUrl: string | null;
  calendlyUrl: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  billingIncrementMinutes?: number | null;
  website?: string | null;
  address?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;

  // Subscription and practice management properties
  kind?: 'personal' | 'business' | 'practice';
  subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
  seats?: number | null;
  config?: {
    ownerEmail?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown; // Allow additional config properties
  };
  stripeCustomerId?: string | null;
  subscriptionPeriodEnd?: number | null;
  isPersonal?: boolean | null;
  betterAuthOrgId?: string;
  businessOnboardingStatus?: 'not_required' | 'pending' | 'completed' | 'skipped';
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingSkipped?: boolean;
  businessOnboardingHasDraft?: boolean;
  legalDisclaimer?: string | null;
}

export interface CreatePracticeRequest {
  name: string;
  slug?: string;
  logo?: string;
  metadata?: PracticeMetadata;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: MajorAmount;
  paymentUrl?: string;
  calendlyUrl?: string;
}

export interface SupportedStateEntry {
  country: string;
  states?: string[];
}

export interface PracticeDetailsUpdate {
  businessPhone?: string | null;
  businessEmail?: string | null;
  consultationFee?: MajorAmount | null;
  paymentLinkEnabled?: boolean | null;
  paymentUrl?: string | null;
  calendlyUrl?: string | null;
  billingIncrementMinutes?: number | null;
  website?: string | null;
  address?: string | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  introMessage?: string | null;
  legalDisclaimer?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;
  serviceStates?: string[] | null;
  supportedStates?: SupportedStateEntry[] | null;
  /** Map of state code -> array of service ids offered in that state */
  servicesByState?: Record<string, string[]> | null;
  businessOnboardingHasDraft?: boolean;
  businessOnboardingStatus?: 'not_required' | 'pending' | 'completed' | 'skipped';
  /** Raw JSON string stored in the practice settings column. Passed through as-is. */
  settings?: string | null;
  /** Arbitrary practice metadata. */
  metadata?: Record<string, unknown> | null;
}

// Fix: Remove conflicting extension, merge manually if needed
export type UpdatePracticeRequest = Omit<Partial<CreatePracticeRequest>, keyof PracticeDetailsUpdate> & PracticeDetailsUpdate;

export interface PracticeDetails {
  id?: string;
  name?: string | null;
  slug?: string | null;
  logo?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  consultationFee?: MajorAmount | null;
  paymentLinkEnabled?: boolean | null;
  paymentUrl?: string | null;
  calendlyUrl?: string | null;
  billingIncrementMinutes?: number | null;
  website?: string | null;
  address?: string | Record<string, unknown> | null;
  apartment?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  introMessage?: string | null;
  legalDisclaimer?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;
  serviceStates?: string[] | null;
  supportedStates?: SupportedStateEntry[] | null;
  /** Map of state code -> array of service ids offered in that state */
  servicesByState?: Record<string, string[]> | null;
  /** Raw JSON string stored in the practice settings column. */
  settings?: string | null;
  /** Arbitrary practice metadata. */
  metadata?: Record<string, unknown> | null;
}

export interface ConnectedAccountRequest {
  practiceEmail: string;
  practiceUuid: string;
  returnUrl?: string;
  refreshUrl?: string;
}

export interface ConnectedAccountResponse {
  practiceUuid: string;
  stripeAccountId: string;
  clientSecret: string | null;
  onboardingUrl?: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface OnboardingStatus {
  practiceUuid: string;
  stripeAccountId: string | null;
  connectedAccountId: string | null;
  clientSecret?: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  completed?: boolean;
}

export interface BillingPortalPayload {
  practiceId: string;
  returnUrl?: string;
  customerType?: 'user' | 'organization';
}

export interface SubscriptionEndpointResult {
  ok: boolean;
  status: number;
  data: unknown;
}

export interface CurrentSubscriptionPlan {
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
  description?: string | null;
  stripeProductId?: string | null;
  stripeMonthlyPriceId?: string | null;
  stripeYearlyPriceId?: string | null;
  monthlyPrice?: string | null;
  yearlyPrice?: string | null;
  currency?: string | null;
  features?: string[] | null;
  limits?: {
    users?: number | null;
    storageGb?: number | null;
    invoicesPerMonth?: number | null;
  } | null;
  isActive?: boolean | null;
}

export interface CurrentSubscription {
  id?: string | null;
  status?: string | null;
  plan?: CurrentSubscriptionPlan | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}

export interface UpdateConversationMatterRequest {
  matterId?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapApiData(payload: unknown): unknown {
  let current = payload;
  const visited = new Set<unknown>();

  while (isRecord(current) && 'data' in current && !visited.has(current)) {
    visited.add(current);
    current = (current as Record<string, unknown>).data;
  }

  return current;
}

interface LinkConversationOptions {
  previousParticipantId?: string | null;
  anonymousSessionId?: string | null;
}

export async function linkConversationToUser(
  conversationId: string,
  practiceId: string,
  userId?: string | null,
  options?: LinkConversationOptions
): Promise<Conversation> {
  if (!conversationId) {
    throw new Error('conversationId is required to link conversation');
  }
  if (!practiceId) {
    throw new Error('practiceId is required to link conversation');
  }

  const payload: Record<string, unknown> = {};
  if (userId !== undefined) payload.userId = userId;
  if (options?.previousParticipantId !== undefined) {
    payload.previousParticipantId = options.previousParticipantId;
  }
  if (options?.anonymousSessionId !== undefined) {
    payload.anonymousSessionId = options.anonymousSessionId;
  }
  const response = await apiClient.patch(
    `${getConversationLinkEndpoint(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    Object.keys(payload).length > 0 ? payload : undefined
  );

  const conversation = unwrapApiData(response.data) as Conversation | null;
  if (!conversation) {
    throw new Error('Failed to link conversation');
  }

  return conversation;
}

export async function updateConversationMatter(
  conversationId: string,
  matterId: string | null,
  config?: ApiRequestConfig
): Promise<Conversation> {
  if (!conversationId) {
    throw new Error('conversationId is required to update a conversation matter');
  }

  const response = await apiClient.patch(
    `/api/conversations/${encodeURIComponent(conversationId)}/matter`,
    { matterId } satisfies UpdateConversationMatterRequest,
    { signal: config?.signal }
  );

  const data = unwrapApiData(response.data);
  if (!isRecord(data)) {
    throw new Error('Invalid response from updateConversationMatter');
  }

  return data as unknown as Conversation;
}

export type ConversationParticipant = {
  userId: string;
  role: string | null;
  name: string | null;
  image: string | null;
  isTeamMember: boolean;
  canBeMentionedByTeamMember: boolean;
  canBeMentionedByClient: boolean;
  canMentionInternally?: boolean;
};

export async function getConversationParticipants(
  conversationId: string,
  practiceId: string,
  config?: ApiRequestConfig
): Promise<ConversationParticipant[]> {
  if (!conversationId) {
    throw new Error('conversationId is required');
  }
  if (!practiceId) {
    throw new Error('practiceId is required');
  }

  const response = await apiClient.get(
    `/api/conversations/${encodeURIComponent(conversationId)}/participants`,
    {
      params: { practiceId },
      signal: config?.signal
    }
  );
  const payload = unwrapApiData(response.data);
  const rows = isRecord(payload) && Array.isArray(payload.participants)
    ? payload.participants
    : (Array.isArray(payload) ? payload : []);

  return rows
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) => ({
      userId: typeof row.user_id === 'string' ? row.user_id : '',
      role: typeof row.role === 'string' ? row.role : null,
      name: typeof row.name === 'string' ? row.name : null,
      image: typeof row.image === 'string' ? row.image : null,
      isTeamMember: row.is_team_member === true,
      canBeMentionedByTeamMember: row.can_be_mentioned_by_team_member === true,
      canBeMentionedByClient: row.can_be_mentioned_by_client === true,
      canMentionInternally: row.can_mention_internally === true,
    }))
    .filter((row) => row.userId.trim().length > 0);
}

export async function listMatterConversations(
  practiceId: string,
  matterId: string,
  config?: ApiRequestConfig
): Promise<Conversation[]> {
  // Legacy/undocumented: this endpoint is not part of the supplied matters contract.
  if (!practiceId) {
    throw new Error('Missing required parameter: practiceId');
  }
  if (!matterId) {
    throw new Error('Missing required parameter: matterId');
  }

  const response = await apiClient.get(
    `/api/matters/${encodeURIComponent(practiceId)}/${encodeURIComponent(matterId)}/conversations`,
    { signal: config?.signal }
  );

  const data = unwrapApiData(response.data);
  if (!Array.isArray(data)) {
    throw new Error('Invalid response from listMatterConversations');
  }

  return data as Conversation[];
}

async function postSubscriptionEndpoint(
  url: string,
  body: Record<string, unknown>
): Promise<SubscriptionEndpointResult> {
  try {
    const response = await apiClient.post(url, body, {
      baseURL: undefined
    });
    return {
      ok: true,
      status: response.status,
      data: response.data ?? null
    };
  } catch (error) {
    if (isHttpError(error)) {
      return {
        ok: false,
        status: error.response.status,
        data: error.response.data ?? null
      };
    }
    return {
      ok: false,
      status: 0,
      data: null
    };
  }
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function toNullableTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

function normalizeInvitationStatus(value: unknown): 'pending' | 'accepted' | 'declined' | null {
  const normalized = toNullableString(value)?.toLowerCase();
  if (normalized === 'pending' || normalized === 'accepted') {
    return normalized;
  }
  if (normalized === 'declined' || normalized === 'rejected' || normalized === 'canceled' || normalized === 'cancelled') {
    return 'declined';
  }
  return null;
}

function normalizePracticeInvitationPayload(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }

  const id = toNullableString(payload.id);
  const practiceId = toNullableString(payload.organizationId ?? payload.organization_id);
  const email = toNullableString(payload.email);
  const role = toNullableString(payload.role);
  const status = normalizeInvitationStatus(payload.status);
  const invitedBy = toNullableString(payload.inviterId ?? payload.inviter_id);
  const expiresAt = toNullableTimestamp(payload.expiresAt ?? payload.expires_at);
  const createdAt = toNullableTimestamp(payload.createdAt ?? payload.created_at);

  if (!id || !practiceId || !email || !role || !status || !invitedBy || expiresAt === null || createdAt === null) {
    return null;
  }

  return {
    id,
    practiceId,
    practiceName: toNullableString(payload.organizationName ?? payload.organization_name) ?? undefined,
    email,
    role,
    status,
    invitedBy,
    expiresAt,
    createdAt
  };
}

function normalizePracticePayload(payload: unknown): Practice {
  if (!isRecord(payload)) {
    throw new Error('Invalid practice payload');
  }

  const record = isRecord(payload.practice) ? payload.practice : payload;
  const id = String(
    record.id ??
    record.uuid ??
    record.practice_id ??
    record.practice_uuid ??
    ''
  );
  const name = String(record.name ?? 'Practice');
  const slug = toNullableString(record.slug) ?? id;

  return {
    id,
    name,
    slug,
    logo: toNullableString(record.logo),
    metadata: (() => {
      if (isRecord(record.metadata)) return record.metadata;
      if (typeof record.metadata === 'string') {
        try {
          const parsed = JSON.parse(record.metadata);
          return isRecord(parsed) ? parsed : undefined;
        } catch { return undefined; }
      }
      return undefined;
    })(),
    businessPhone: toNullableString(record.business_phone),
    businessEmail: toNullableString(record.business_email),
    consultationFee: (() => {
      const rawFee = record.consultation_fee;
      if (typeof rawFee !== 'number') return null;
      assertMinorUnits(rawFee, 'practice.consultationFee');
      return toMajorUnits(Number(rawFee));
    })() ?? null,
    paymentUrl: toNullableString(record.payment_url),
    calendlyUrl: toNullableString(record.calendly_url),
    createdAt: toNullableString(record.created_at),
    updatedAt: toNullableString(record.updated_at),
    billingIncrementMinutes: (() => {
      const value = record.billing_increment_minutes;
      if (value === null || value === undefined) return null;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })(),
    website: toNullableString(record.website),
    address: toNullableString(record.address ?? record.address_line_1),
    apartment: toNullableString(record.apartment ?? record.address_line_2),
    city: toNullableString(record.city),
    state: toNullableString(record.state),
    postalCode: toNullableString(record.postal_code),
    country: toNullableString(record.country),
    primaryColor: toNullableString(record.primary_color),
    accentColor: toNullableString(record.accent_color),
    legalDisclaimer: toNullableString(record.legal_disclaimer ?? record.overview),
    isPublic: 'is_public' in record
      ? Boolean(record.is_public)
      : null,
    services: Array.isArray(record.services)
      ? (record.services as Array<Record<string, unknown>>)
      : null
  };
}

function unwrapPracticeResponse(data: unknown): Practice {
  if (Array.isArray(data)) {
    throw new Error('Expected a single practice object');
  }

  if (isRecord(data) && 'practice' in data) {
    return normalizePracticePayload((data as Record<string, unknown>).practice);
  }

  if (isRecord(data) && 'data' in data && isRecord(data.data)) {
    return normalizePracticePayload(data.data);
  }

  return normalizePracticePayload(data);
}

function unwrapPracticeListResponse(data: unknown): Practice[] {
  if (Array.isArray(data)) {
    return data.map(normalizePracticePayload);
  }

  if (isRecord(data)) {
    if (Array.isArray(data.practices)) {
      return data.practices.map(normalizePracticePayload);
    }
    if (Array.isArray(data.organizations)) {
      return data.organizations.map(normalizePracticePayload);
    }
    if (Array.isArray(data.data)) {
      return data.data.map(normalizePracticePayload);
    }
    if (isRecord(data.data)) {
      const nested = data.data as Record<string, unknown>;
      if (Array.isArray(nested.practices)) {
        return nested.practices.map(normalizePracticePayload);
      }
      if (Array.isArray(nested.organizations)) {
        return nested.organizations.map(normalizePracticePayload);
      }
      if (Array.isArray(nested.items)) {
        return nested.items.map(normalizePracticePayload);
      }
    }
  }

  return [];
}

function normalizeConnectedAccountResponse(payload: unknown): ConnectedAccountResponse {
  if (!isRecord(payload)) {
    throw new Error('Invalid connected account payload');
  }

  return {
    practiceUuid: String(payload.practice_uuid ?? ''),
    stripeAccountId: String(payload.stripe_account_id ?? ''),
    clientSecret: toNullableString(payload.client_secret),
    onboardingUrl: toNullableString(payload.url),
    chargesEnabled: Boolean(payload.charges_enabled),
    payoutsEnabled: Boolean(payload.payouts_enabled),
    detailsSubmitted: Boolean(payload.details_submitted)
  };
}

function normalizeOnboardingStatus(payload: unknown): OnboardingStatus {
  const normalized = unwrapApiData(payload);
  if (!isRecord(normalized)) {
    throw new Error('Invalid onboarding status payload');
  }

  return {
    practiceUuid: String(normalized.practice_uuid ?? ''),
    stripeAccountId: toNullableString(normalized.stripe_account_id),
    connectedAccountId: toNullableString(normalized.connected_account_id),
    clientSecret: toNullableString(normalized.client_secret),
    chargesEnabled: Boolean(normalized.charges_enabled),
    payoutsEnabled: Boolean(normalized.payouts_enabled),
    detailsSubmitted: Boolean(normalized.details_submitted),
    completed: 'completed' in normalized ? Boolean(normalized.completed) : undefined
  };
}

type ListPracticesOptions = ApiRequestConfig & {
  scope?: 'all' | 'tenant' | 'platform';
};

export async function listPractices(configOrOptions?: ListPracticesOptions): Promise<Practice[]> {
  const opts = configOrOptions ?? {};
  const scope = opts.scope ?? 'tenant';
  const practices = await queryCache.coalesceGet(
    'practices:list',
    async (signal) => {
      const response = await apiClient.get('/api/practice/list', { signal });
      return unwrapPracticeListResponse(response.data);
    },
    { ttl: 60_000, signal: opts.signal as AbortSignal | undefined }
  );
  if (scope === 'platform') {
    return [];
  }
  return practices;
}

export async function getPractice(practiceId: string, config?: ApiRequestConfig): Promise<Practice> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  return queryCache.coalesceGet(
    `practice:${practiceId}`,
    async (signal) => {
      const response = await apiClient.get(`/api/practice/${encodeURIComponent(practiceId)}`, { signal });
      return unwrapPracticeResponse(response.data);
    },
    { ttl: 60_000, signal: config?.signal as AbortSignal | undefined }
  );
}


export async function createPractice(
  payload: CreatePracticeRequest,
  config?: ApiRequestConfig
): Promise<Practice> {
  const response = await apiClient.post('/api/practice', payload, {
    signal: config?.signal
  });
  return unwrapPracticeResponse(response.data);
}

export async function updatePractice(
  practiceId: string,
  payload: UpdatePracticeRequest,
  config?: ApiRequestConfig
): Promise<Practice> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const normalized = normalizePracticeUpdatePayload(payload);
  if (import.meta.env.DEV) {
    console.info('[apiClient] updatePractice payload', { practiceId, payload: normalized });
  }
  const response = await apiClient.put(
    `/api/practice/${encodeURIComponent(practiceId)}`,
    normalized,
    {
      signal: config?.signal,
      invalidates: [`practice:${practiceId}`, 'practices:list'],
    }
  );
  // publicPracticeDetailsCache lives under `practice:public:` — also clear.
  clearPublicPracticeDetailsCache();
  return unwrapPracticeResponse(response.data);
}

export async function deletePractice(
  practiceId: string,
  config?: ApiRequestConfig
): Promise<void> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  await apiClient.delete(`/api/practice/${encodeURIComponent(practiceId)}`, {
    signal: config?.signal,
    invalidates: [`practice:${practiceId}`, 'practices:list'],
  });
  clearPublicPracticeDetailsCache();
}

export async function setActivePractice(practiceId: string): Promise<void> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  await apiClient.put(`/api/practice/${encodeURIComponent(practiceId)}/active`);
}

export async function listPracticeInvitations(
  practiceId: string,
  config?: ApiRequestConfig
): Promise<unknown[]> {
  if (!practiceId || practiceId.trim().length === 0) {
    throw new Error('practiceId is required');
  }
  const response = await apiClient.get(
    '/api/auth/organization/list-invitations',
    {
      params: { organizationId: practiceId },
      signal: config?.signal
    }
  );
  const payload = unwrapApiData(response.data);
  const invitations = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.invitations)
      ? payload.invitations
      : [];

  return invitations
    .map((invitation) => normalizePracticeInvitationPayload(invitation))
    .filter((invitation): invitation is Record<string, unknown> => Boolean(invitation));
}

export async function createPracticeInvitation(
  practiceId: string,
  payload: { email: string; role: string }
): Promise<{ inviteUrl?: string; invitationId?: string } | null> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const requestBody = {
    ...payload,
    organizationId: practiceId
  };
  const response = await apiClient.post(
    '/api/auth/organization/invite-member',
    requestBody
  );
  const data = unwrapApiData(response.data);
  if (!isRecord(data)) {
    return null;
  }
  const inviteUrl = toNullableString(
    data.inviteUrl ??
    data.inviteLink ??
    data.url ??
    (isRecord(data.invitation)
      ? ((data.invitation as Record<string, unknown>).inviteUrl
        ?? (data.invitation as Record<string, unknown>).inviteLink)
      : null)
  );
  const invitationId = toNullableString(
    data.invitationId ??
    data.id ??
    (isRecord(data.invitation) ? (data.invitation as Record<string, unknown>).id : null)
  );
  if (!inviteUrl && !invitationId) {
    return null;
  }
  return {
    inviteUrl: inviteUrl ?? undefined,
    invitationId: invitationId ?? undefined
  };
}

export async function respondToPracticeInvitation(
  invitationId: string,
  action: 'accept' | 'decline'
): Promise<void> {
  if (!invitationId) {
    throw new Error('invitationId is required');
  }
  await apiClient.post(
    action === 'accept'
      ? '/api/auth/organization/accept-invitation'
      : '/api/auth/organization/reject-invitation',
    { invitationId }
  );
}

export async function cancelPracticeInvitation(invitationId: string): Promise<void> {
  if (!invitationId) {
    throw new Error('invitationId is required');
  }
  await apiClient.post('/api/auth/organization/cancel-invitation', { invitationId });
}

export async function listPracticeTeam(
  practiceId: string,
  config?: ApiRequestConfig
): Promise<PracticeTeamResponse> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }

  const response = await apiClient.get(
    `/api/practice/${encodeURIComponent(practiceId)}/team`,
    { signal: config?.signal }
  );
  const payload = unwrapApiData(response.data);
  if (!isRecord(payload)) {
    throw new Error('Invalid practice team response');
  }

  const members = Array.isArray(payload.members) ? payload.members : [];
  const rawSummary = isRecord(payload.summary) ? payload.summary : {};

  return {
    members: members
      .filter((member): member is Record<string, unknown> => isRecord(member))
      .map<PracticeTeamResponse['members'][number] | null>((member) => {
        const role = isTeamRole(member.role) ? member.role : null;
        if (role === null) {
          return null;
        }

        return {
          userId: typeof member.user_id === 'string' ? member.user_id : '',
          email: typeof member.email === 'string' ? member.email : '',
          name: typeof member.name === 'string' ? member.name : undefined,
          image: typeof member.image === 'string' ? member.image : null,
          role,
          createdAt: typeof member.created_at === 'number' ? member.created_at : null,
          canAssignToMatter: member.can_assign_to_matter === true,
          canMentionInternally: member.can_mention_internally === true,
        };
      })
      .filter((member): member is PracticeTeamResponse['members'][number] => (
        member !== null
        && member !== undefined
        && member.userId.trim().length > 0
      )),
    summary: {
      seatsIncluded: typeof rawSummary.seats_included === 'number' ? rawSummary.seats_included : 1,
      seatsUsed: typeof rawSummary.seats_used === 'number' ? rawSummary.seats_used : 0,
    }
  };
}

export async function updatePracticeMemberRole(
  practiceId: string,
  payload: { userId: string; role: string }
): Promise<void> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  await apiClient.patch(
    `/api/practice/${encodeURIComponent(practiceId)}/members`,
    payload,
    { invalidates: ['practice:team:'] },
  );
}

export async function deletePracticeMember(
  practiceId: string,
  userId: string
): Promise<void> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  await apiClient.delete(
    `/api/practice/${encodeURIComponent(practiceId)}/members/${encodeURIComponent(userId)}`,
    { invalidates: ['practice:team:'] },
  );
}

export type UserDetailStatus = 'lead' | 'active' | 'inactive' | 'archived';

export type UserDetailRecord = {
  id: string;
  organization_id: string;
  user_id: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  address_id: string | null;
  status: UserDetailStatus;
  currency: string | null;
  created_at: string;
  updated_at: string;
};

export type UserDetailListResponse = {
  data: UserDetailRecord[];
  total: number;
};

export async function listUserDetails(
  practiceId: string,
  params?: {
    search?: string;
    status?: UserDetailStatus;
    limit?: number;
    offset?: number;
    // Backend contract field name; maps to user-details lookup key.
    client_id?: string;
    signal?: AbortSignal;
  }
): Promise<UserDetailListResponse> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const { signal, ...queryParams } = params ?? {};
  const response = await apiClient.get(
    `/api/clients/${encodeURIComponent(practiceId)}`,
    { params: queryParams, signal }
  );
  const payload = response.data;
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return {
      data: payload.data as UserDetailRecord[],
      total: typeof payload.total === 'number' ? payload.total : payload.data.length
    };
  }
  return {
    data: [],
    total: 0
  };
}

export async function getUserDetail(
  practiceId: string,
  userDetailId: string,
  config?: ApiRequestConfig
): Promise<UserDetailRecord | null> {
  if (!practiceId || !userDetailId) {
    throw new Error('practiceId and userDetailId are required');
  }
  const response = await apiClient.get(
    `/api/clients/${encodeURIComponent(practiceId)}`,
    // Backend contract uses `client_id` even though this record is presented as Person in UI.
    { params: { client_id: userDetailId }, signal: config?.signal }
  );
  const payload = response.data;
  if (isRecord(payload) && Array.isArray(payload.data) && payload.data.length > 0) {
    return payload.data[0] as UserDetailRecord;
  }
  if (isRecord(payload) && isRecord(payload.data)) {
    return payload.data as UserDetailRecord;
  }
  return null;
}

export async function getUserDetailAddressById(
  practiceId: string,
  addressId: string,
  config?: ApiRequestConfig
): Promise<Record<string, unknown> | null> {
  if (!practiceId || !addressId) {
    throw new Error('practiceId and addressId are required');
  }
  const response = await apiClient.get(
    `/api/clients/${encodeURIComponent(practiceId)}/addresses/${encodeURIComponent(addressId)}`,
    { signal: config?.signal }
  );
  const payload = unwrapApiData(response.data);
  const container = isRecord(payload) && isRecord(payload.data)
    ? payload.data
    : (isRecord(payload) ? payload : null);
  if (!container) return null;
  const address = isRecord(container.address) ? container.address : container;
  return isRecord(address) ? address : null;
}

export type CreateUserDetailPayload = {
  email: string;
};

type UserDetailBasePayload = {
  name?: string;
  email?: string;
  phone?: string;
  status?: UserDetailStatus;
  currency?: string;
  address?: Partial<Address>;
  event_name?: string;
};

type UpdateUserDetailPayload = UserDetailBasePayload & Record<string, unknown>;

const normalizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeUserDetailAddress = (address?: Partial<Address>): Record<string, unknown> | undefined => {
  if (!address) return undefined;
  const normalized: Record<string, unknown> = {};
  
  const line1 = normalizeOptionalText(address.address);
  if (line1 !== undefined) normalized.line1 = line1;
  
  const line2 = normalizeOptionalText(address.apartment);
  if (line2 !== undefined) normalized.line2 = line2;
  
  const city = normalizeOptionalText(address.city);
  if (city !== undefined) normalized.city = city;
  
  const state = normalizeOptionalText(address.state);
  if (state !== undefined) normalized.state = state;
  
  const postalCode = normalizeOptionalText(address.postalCode);
  if (postalCode !== undefined) normalized.postal_code = postalCode;
  
  const country = normalizeOptionalText(address.country);
  if (country !== undefined) normalized.country = country.toUpperCase();

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeUserDetailPayload = (payload: UserDetailBasePayload): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  const name = normalizeOptionalText(payload.name);
  if (name !== undefined) normalized.name = name;
  const email = normalizeOptionalText(payload.email);
  if (email !== undefined) normalized.email = email;
  const phone = normalizeOptionalText(payload.phone);
  if (phone !== undefined) normalized.phone = phone;
  if (payload.status !== undefined) normalized.status = payload.status;
  const currency = normalizeOptionalText(payload.currency);
  if (currency !== undefined) normalized.currency = currency;
  const address = normalizeUserDetailAddress(payload.address);
  if (address) normalized.address = address;
  const eventName = normalizeOptionalText(payload.event_name);
  if (eventName !== undefined) normalized.event_name = eventName;
  return normalized;
};

export async function createUserDetail(
  practiceId: string,
  payload: CreateUserDetailPayload
): Promise<void> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }

  const normalizedEmail = payload.email?.trim() || '';

  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  // Use Better Auth organization invitation instead of direct user-details creation.
  const { getClient } = await import('@/shared/lib/authClient');
  const authClient = getClient();

  try {
    if (import.meta.env.DEV) {
      console.info('[apiClient] inviteMember', {
        organizationId: practiceId,
        email: normalizedEmail,
        role: 'client'
      });
    }
    const inviteClient = authClient as unknown as {
      organization?: {
        inviteMember?: (payload: { email: string; role: string; organizationId: string }) => Promise<unknown>;
      };
    };
    await inviteClient.organization?.inviteMember?.({
      email: normalizedEmail,
      role: 'client',
      organizationId: practiceId,
    });
  } catch (error) {
    console.error('Failed to invite client:', error);
    throw error;
  }
}

export async function updateUserDetail(
  practiceId: string,
  userDetailId: string,
  payload: UpdateUserDetailPayload
): Promise<UserDetailRecord | null> {
  if (!practiceId || !userDetailId) {
    throw new Error('practiceId and userDetailId are required');
  }
  const { address, name, email, phone, status, currency, event_name, ...rest } = payload;
  const normalized = normalizeUserDetailPayload({ address, name, email, phone, status, currency, event_name });
  const response = await apiClient.patch(
    `/api/clients/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}`,
    { ...rest, ...normalized },
    { invalidates: ['clients:'] }
  );
  const data = response.data;
  if (isRecord(data) && isRecord(data.data)) {
    return data.data as UserDetailRecord;
  }
  return null;
}

export async function deleteUserDetail(
  practiceId: string,
  userDetailId: string
): Promise<void> {
  if (!practiceId || !userDetailId) {
    throw new Error('practiceId and userDetailId are required');
  }
  await apiClient.delete(
    `/api/clients/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}`,
    { invalidates: ['clients:'] }
  );
}

export type UserDetailMemoRecord = {
  id: string;
  content?: string | null;
  event_time?: string | null;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

export async function listUserDetailMemos(
  practiceId: string,
  userDetailId: string
): Promise<UserDetailMemoRecord[]> {
  if (!practiceId || !userDetailId) {
    throw new Error('practiceId and userDetailId are required');
  }
  const response = await apiClient.get(
    `/api/clients/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos`
  );
  const payload = response.data;
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data as UserDetailMemoRecord[];
  }
  if (Array.isArray(payload)) {
    return payload as UserDetailMemoRecord[];
  }
  return [];
}

export async function createUserDetailMemo(
  practiceId: string,
  userDetailId: string,
  payload: Record<string, unknown>
): Promise<UserDetailMemoRecord | null> {
  if (!practiceId || !userDetailId) {
    throw new Error('practiceId and userDetailId are required');
  }
  const response = await apiClient.post(
    `/api/clients/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos`,
    payload
  );
  const data = response.data;
  if (isRecord(data) && isRecord(data.data)) {
    return data.data as UserDetailMemoRecord;
  }
  return null;
}

export async function updateUserDetailMemo(
  practiceId: string,
  userDetailId: string,
  memoId: string,
  payload: Record<string, unknown>
): Promise<UserDetailMemoRecord | null> {
  if (!practiceId || !userDetailId || !memoId) {
    throw new Error('practiceId, userDetailId, and memoId are required');
  }
  const response = await apiClient.patch(
    `/api/clients/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos/${encodeURIComponent(memoId)}`,
    payload
  );
  const data = response.data;
  if (isRecord(data) && isRecord(data.data)) {
    return data.data as UserDetailMemoRecord;
  }
  return null;
}

export async function deleteUserDetailMemo(
  practiceId: string,
  userDetailId: string,
  memoId: string
): Promise<void> {
  if (!practiceId || !userDetailId || !memoId) {
    throw new Error('practiceId, userDetailId, and memoId are required');
  }
  await apiClient.delete(
    `/api/clients/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos/${encodeURIComponent(memoId)}`
  );
}

export async function getOnboardingStatus(
  organizationId: string,
  config?: ApiRequestConfig
): Promise<OnboardingStatus> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  const response = await apiClient.get(
    `/api/onboarding/organization/${encodeURIComponent(organizationId)}/status`,
    { signal: config?.signal }
  );
  return normalizeOnboardingStatus(response.data);
}

export async function getOnboardingStatusPayload(
  organizationId: string,
  config?: ApiRequestConfig
): Promise<unknown> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  const cacheKey = `onboarding:status:${organizationId}`;
  return queryCache.coalesceGet(
    cacheKey,
    async (signal) => {
      const response = await apiClient.get(
        `/api/onboarding/organization/${encodeURIComponent(organizationId)}/status`,
        { signal }
      );
      return response.data;
    },
    { ttl: 60_000, signal: config?.signal as AbortSignal | undefined }
  );
}

export async function createConnectedAccount(
  payload: ConnectedAccountRequest
): Promise<ConnectedAccountResponse> {
  if (!payload.practiceEmail || !payload.practiceUuid) {
    throw new Error('practiceEmail and practiceUuid are required');
  }

  const response = await apiClient.post('/api/onboarding/connected-accounts', {
    practice_email: payload.practiceEmail,
    practice_uuid: payload.practiceUuid,
    return_url: payload.returnUrl,
    refresh_url: payload.refreshUrl
  });

  return normalizeConnectedAccountResponse(response.data);
}

export async function updatePracticeDetails(
  practiceId: string,
  details: PracticeDetailsUpdate,
  config?: ApiRequestConfig
): Promise<PracticeDetails | null> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const normalized = normalizePracticeDetailsPayload(details);
  const response = await apiClient.put(
    `/api/practice/${encodeURIComponent(practiceId)}/details`,
    normalized,
    {
      signal: config?.signal,
      invalidates: [`practice:details:${practiceId}`],
    }
  );
  clearPublicPracticeDetailsCache();
  return normalizePracticeDetailsResponse(response.data);
}

export async function getPracticeDetails(
  practiceId: string,
  config?: ApiRequestConfig
): Promise<PracticeDetails | null> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  return queryCache.coalesceGet(
    `practice:details:${practiceId}`,
    async (signal) => {
      const response = await apiClient.get(
        `/api/practice/${encodeURIComponent(practiceId)}/details`,
        { signal }
      );
      return normalizePracticeDetailsResponse(response.data);
    },
    { ttl: 60_000, signal: config?.signal as AbortSignal | undefined }
  );
}

export async function getPracticeDetailsBySlug(
  slug: string,
  config?: ApiRequestConfig
): Promise<PracticeDetails | null> {
  if (!slug) {
    throw new Error('practice slug is required');
  }
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    throw new Error('practice slug is required');
  }
  const response = await apiClient.get(
    `/api/practice/details/${encodeURIComponent(normalizedSlug)}`,
    { signal: config?.signal }
  );
  return normalizePracticeDetailsResponse(response.data);
}

export interface PublicPracticeDetails {
  practiceId?: string;
  slug?: string;
  details: PracticeDetails | null;
  name?: string | null;
  logo?: string | null;
}

export async function getPublicPracticeDetails(
  slug: string,
  config?: ApiRequestConfig
): Promise<PublicPracticeDetails | null> {
  if (!slug) {
    throw new Error('practice slug is required');
  }
  const normalizedSlug = slug.trim();
  const cacheKey = publicPracticeDetailsKey(normalizedSlug);

  return queryCache.coalesceGet<PublicPracticeDetails | null>(
    cacheKey,
    async (signal) => {
      const apiUrl = `${getWorkerApiUrl()}/api/practice/details/${encodeURIComponent(normalizedSlug)}`;
      try {
        const response = await apiFetch<unknown>('GET', apiUrl, undefined, { signal });
        const details = normalizePracticeDetailsResponse(response.data);
        if (!details) return null;
        const displayDetails = extractPublicPracticeDisplayDetails(response.data);
        const practiceId = extractPublicPracticeId(response.data);
        return {
          practiceId: practiceId ?? undefined,
          slug: normalizedSlug,
          details,
          name: displayDetails.name,
          logo: displayDetails.logo,
        };
      } catch (error) {
        if (isHttpError(error) && error.response.status === 404) {
          // Cache null on 404 so we don't keep retrying for a missing practice.
          return null;
        }
        // Re-throw transient errors (rate limit, network) — coalesceGet
        // doesn't cache thrown values, so callers can retry.
        throw error;
      }
    },
    { ttl: policyTtl(cacheKey), signal: config?.signal }
  );
}

function normalizePracticeUpdatePayload(payload: UpdatePracticeRequest): Record<string, unknown> {
  const normalized = normalizePracticeDetailsPayload(payload);

  if ('name' in payload && payload.name !== undefined) normalized.name = payload.name;
  if ('slug' in payload && payload.slug !== undefined) normalized.slug = payload.slug;
  if ('logo' in payload && payload.logo !== undefined) normalized.logo = payload.logo;
  if ('metadata' in payload && payload.metadata !== undefined) {
    normalized.metadata = payload.metadata;
  }

  return normalized;
}

function extractPublicPracticeDisplayDetails(
  payload: unknown
): { name?: string | null; logo?: string | null } {
  if (!isRecord(payload)) {
    return {};
  }

  const candidates: Record<string, unknown>[] = [];
  const pushCandidate = (value: unknown) => {
    if (isRecord(value)) {
      candidates.push(value);
    }
  };

  if ('details' in payload && isRecord(payload.details)) {
    if ('data' in payload.details && isRecord(payload.details.data)) {
      pushCandidate(payload.details.data);
    }
    pushCandidate(payload.details);
  }

  if ('data' in payload && isRecord(payload.data)) {
    if ('details' in payload.data && isRecord(payload.data.details)) {
      pushCandidate(payload.data.details);
    }
    pushCandidate(payload.data);
  }

  pushCandidate(payload);

  for (const candidate of candidates) {
    const name = toNullableString(candidate.name ?? candidate.practice_name);
    const rawLogo = toNullableString(candidate.logo ?? candidate.practice_logo);
    const logo = normalizePublicFileUrl(rawLogo);
    if (name || logo) {
      return { name, logo };
    }
  }

  return {};
}

function extractPublicPracticeId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const candidates: Record<string, unknown>[] = [];
  if ('details' in payload && isRecord(payload.details)) {
    if ('data' in payload.details && isRecord(payload.details.data)) {
      candidates.push(payload.details.data);
    }
    candidates.push(payload.details);
  }
  if ('data' in payload && isRecord(payload.data)) {
    if ('details' in payload.data && isRecord(payload.data.details)) {
      candidates.push(payload.data.details);
    }
    candidates.push(payload.data);
  }
  if ('organization' in payload && isRecord(payload.organization)) {
    candidates.push(payload.organization);
  }
  candidates.push(payload);

  for (const candidate of candidates) {
    const id = toNullableString(
      candidate.organization_id ??
      candidate.practice_id ??
      candidate.id
    );
    if (id) return id;
    if ('organization' in candidate && isRecord(candidate.organization)) {
      const nested = toNullableString(
        (candidate.organization as Record<string, unknown>).id ??
        (candidate.organization as Record<string, unknown>).organization_id
      );
      if (nested) return nested;
    }
    if ('practice' in candidate && isRecord(candidate.practice)) {
      const practice = candidate.practice as Record<string, unknown>;
      const practiceId = toNullableString(
        practice.practice_id ??
        practice.organization_id ?? practice.id
      );
      if (practiceId) return practiceId;
      if ('organization' in practice && isRecord(practice.organization)) {
        const nested = toNullableString(
          (practice.organization as Record<string, unknown>).id ??
          (practice.organization as Record<string, unknown>).organization_id
        );
        if (nested) return nested;
      }
    }
  }
  return null;
}

function normalizePracticeDetailsPayload(payload: PracticeDetailsUpdate): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const normalizeTextOrUndefined = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined; // Do not send nulls
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const normalizeServiceKey = (value: string): string => (
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  );

  const businessEmail = normalizeTextOrUndefined(payload.businessEmail);
  if (businessEmail !== undefined) normalized.business_email = businessEmail;
  const businessPhone = normalizeTextOrUndefined(payload.businessPhone);
  if (businessPhone !== undefined) normalized.business_phone = businessPhone;
  if ('consultationFee' in payload && payload.consultationFee !== undefined && payload.consultationFee !== null) {
    if (typeof payload.consultationFee === 'number') {
      assertMajorUnits(payload.consultationFee, 'practice.consultationFee');
    }
    normalized.consultation_fee = toMinorUnitsValue(payload.consultationFee);
  }
  if ('paymentLinkEnabled' in payload && payload.paymentLinkEnabled !== undefined) {
    normalized.payment_link_enabled = payload.paymentLinkEnabled;
  }
  const paymentUrl = normalizeTextOrUndefined(payload.paymentUrl);
  if (paymentUrl !== undefined) normalized.payment_url = paymentUrl;
  const calendlyUrl = normalizeTextOrUndefined(payload.calendlyUrl);
  if (calendlyUrl !== undefined) normalized.calendly_url = calendlyUrl;
  if ('billingIncrementMinutes' in payload) {
    if (payload.billingIncrementMinutes === null) {
      normalized.billing_increment_minutes = null;
    } else if (typeof payload.billingIncrementMinutes === 'number' && Number.isFinite(payload.billingIncrementMinutes)) {
      normalized.billing_increment_minutes = Math.round(payload.billingIncrementMinutes);
    }
  }
  const website = normalizeTextOrUndefined(payload.website);
  if (website !== undefined) normalized.website = website;
  const address: Record<string, unknown> = {};
  const addressField = normalizeTextOrUndefined(payload.address);
  if (addressField !== undefined) address.line1 = addressField;
  const apartmentField = normalizeTextOrUndefined(payload.apartment);
  if (apartmentField !== undefined) address.line2 = apartmentField;
  const city = normalizeTextOrUndefined(payload.city);
  if (city !== undefined) address.city = city;
  const state = normalizeTextOrUndefined(payload.state);
  if (state !== undefined) address.state = state;
  const postalCode = normalizeTextOrUndefined(payload.postalCode);
  if (postalCode !== undefined) address.postal_code = postalCode;
  const country = normalizeTextOrUndefined(payload.country);
  if (country !== undefined) address.country = country;
  if (Object.keys(address).length > 0) {
    normalized.address = address;
  }
  if ('primaryColor' in payload && payload.primaryColor !== undefined) {
    normalized.primary_color = payload.primaryColor;
  }
  if ('accentColor' in payload && payload.accentColor !== undefined) {
    normalized.accent_color = payload.accentColor;
  }
  if ('legalDisclaimer' in payload) {
    if (payload.legalDisclaimer === null) {
      normalized.overview = '';
    } else if (typeof payload.legalDisclaimer === 'string') {
      normalized.overview = payload.legalDisclaimer.trim();
    }
  }
  if ('introMessage' in payload) {
    if (payload.introMessage === null) {
      normalized.intro_message = '';
    } else if (typeof payload.introMessage === 'string') {
      normalized.intro_message = payload.introMessage.trim();
    }
  }
  if ('isPublic' in payload && payload.isPublic !== undefined) {
    normalized.is_public = payload.isPublic;
  }
  if ('services' in payload && payload.services !== undefined) {
    if (Array.isArray(payload.services)) {
      normalized.services = payload.services
        .map((service) => {
          if (!isRecord(service)) {
            return null;
          }
          const rawId = toNullableString(service.id);
          const id = rawId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)
            ? rawId
            : null;
          const name = toNullableString(service.name ?? service.title);
          if (!name) {
            return null;
          }
          const rawKey = toNullableString(service.key);
          const baseKey = rawKey ?? name ?? id;
          const key = baseKey ? normalizeServiceKey(baseKey) : '';
          if (!key) {
            return null;
          }
          const next: Record<string, unknown> = { name, key };
          if (id) {
            next.id = id;
          }
          return next;
        })
        .filter((service): service is Record<string, unknown> => Boolean(service));
    } else {
      normalized.services = payload.services;
    }
  }

  if (payload.businessOnboardingStatus !== undefined) {
    normalized.business_onboarding_status = payload.businessOnboardingStatus;
  }
  if (payload.businessOnboardingHasDraft !== undefined) {
    normalized.business_onboarding_has_draft = payload.businessOnboardingHasDraft;
  }

  // Pass settings through as-is — it is an opaque JSON string owned by the caller.
  if ('settings' in payload && payload.settings !== undefined) {
    normalized.settings = payload.settings;
  }
  if ('metadata' in payload && payload.metadata !== undefined) {
    normalized.metadata = payload.metadata;
  }

  if ('serviceStates' in payload && payload.serviceStates !== undefined) {
    normalized.service_states = Array.isArray(payload.serviceStates)
      ? payload.serviceStates
          .filter((state): state is string => typeof state === 'string')
          .map((state) => state.trim().toUpperCase())
          .filter(Boolean)
      : payload.serviceStates;
  }

  // If callers provided a top-level `servicesByState`, serialize and merge
  // it into the opaque `settings` JSON so the backend receives the
  // `services_by_state` key. This preserves the write-time type while
  // ensuring the data is sent inside `settings` as expected by the API.
  if ('servicesByState' in payload && payload.servicesByState !== undefined) {
    const existingSettingsRaw = (payload as Record<string, unknown>).settings;
    let base: Record<string, unknown> = {};
    if (typeof existingSettingsRaw === 'string' && existingSettingsRaw.trim().length > 0) {
      try {
        const parsed = JSON.parse(existingSettingsRaw);
        if (!isRecord(parsed)) {
          throw new Error('Practice settings must be a JSON object when servicesByState is provided.');
        }
        base = parsed;
      } catch (err) {
        throw new Error(`Invalid JSON in payload.settings: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Only set normalized.settings here if it hasn't already been set, otherwise merge
    if (typeof normalized.settings === 'string') {
      try {
        const current = JSON.parse(normalized.settings);
        if (isRecord(current)) {
          base = { ...current, ...base };
        }
      } catch {
        // If normalized.settings is invalid, overwrite with base
      }
    }
    base.services_by_state = payload.servicesByState;
    normalized.settings = JSON.stringify(base);
  }

  if ('supportedStates' in payload && payload.supportedStates !== undefined) {
    if (Array.isArray(payload.supportedStates)) {
      normalized.supported_states = payload.supportedStates
        .map((entry) => {
          if (!isRecord(entry) || typeof entry.country !== 'string') {
            return null;
          }
          const country = entry.country.trim().toUpperCase();
          if (!country) {
            return null;
          }
          const result: Record<string, unknown> = { country };
          if (Array.isArray(entry.states)) {
            const states = entry.states
              .filter((state): state is string => typeof state === 'string')
              .map((state) => state.trim().toUpperCase())
              .filter(Boolean);
            if (states.length > 0) {
              result.states = states;
            }
          }
          return result;
        })
        .filter((entry): entry is Record<string, unknown> => entry !== null);
    } else {
      normalized.supported_states = payload.supportedStates;
    }
  }

  // NOTE: Persist `services_by_state` inside `settings` (opaque JSON string).
  // The frontend MUST set `payload.settings` to a JSON string that contains
  // a `services_by_state` property when saving per-state services. Do NOT
  // create a top-level `services_by_state` field — the backend does not accept it.

  return normalized;
}

export function normalizePracticeDetailsResponse(payload: unknown): PracticeDetails | null {
  if (!isRecord(payload)) {
    return null;
  }
  const hasMappedDetailKey = (value: Record<string, unknown>): boolean => ([
    'name',
    'logo',
    'slug',
    'overview',
    'legal_disclaimer',
    'intro_message',
    'business_phone',
    'business_email',
    'consultation_fee',
    'payment_link_enabled',
    'billing_increment_minutes',
    'payment_url',
    'calendly_url',
    'website',
    'accent_color',
    'primary_color',
    'is_public',
    'services',
    'address',
    'service_states',
    'supported_states',
    'settings',
  ].some((key) => key in value));
  const resolveCandidate = (value: unknown): Record<string, unknown> | null =>
    isRecord(value) && hasMappedDetailKey(value) ? value : null;
  const container = (() => {
    if ('details' in payload && isRecord(payload.details)) {
      if ('data' in payload.details && isRecord(payload.details.data)) {
        const nested = resolveCandidate(payload.details.data);
        if (nested) return nested;
      }
      const direct = resolveCandidate(payload.details);
      if (direct) return direct;
    }
    if ('data' in payload && isRecord(payload.data)) {
      if ('details' in payload.data && isRecord(payload.data.details)) {
        const nested = resolveCandidate(payload.data.details);
        if (nested) return nested;
      }
      if ('practice' in payload.data && isRecord(payload.data.practice)) {
        const nested = resolveCandidate(payload.data.practice);
        if (nested) return nested;
      }
      if ('organization' in payload.data && isRecord(payload.data.organization)) {
        const nested = resolveCandidate(payload.data.organization);
        if (nested) return nested;
      }
      const direct = resolveCandidate(payload.data);
      if (direct) return direct;
    }
    if ('practice' in payload && isRecord(payload.practice)) {
      const nested = resolveCandidate(payload.practice);
      if (nested) return nested;
    }
    if ('organization' in payload && isRecord(payload.organization)) {
      const nested = resolveCandidate(payload.organization);
      if (nested) return nested;
    }
    return resolveCandidate(payload);
  })();
  if (!container) {
    return null;
  }

  const address = isRecord(container.address) ? container.address : {};
  const getOptionalNullableString = (
    source: Record<string, unknown>,
    keys: string[]
  ): string | null | undefined => {
    for (const key of keys) {
      if (key in source) {
        return toNullableString(source[key]);
      }
    }
    return undefined;
  };
  const getOptionalNullableNumber = (
    source: Record<string, unknown>,
    keys: string[]
  ): number | null | undefined => {
    for (const key of keys) {
      if (key in source) {
        const value = source[key];
        if (value === null) return null;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim().length > 0) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
      }
    }
    return undefined;
  };

  return {
    id: getOptionalNullableString(container, ['id', 'uuid', 'practice_id', 'organization_id']) ?? undefined,
    businessPhone: getOptionalNullableString(container, ['business_phone']),
    businessEmail: getOptionalNullableString(container, ['business_email']),
    name: getOptionalNullableString(container, ['name', 'practice_name', 'business_name']),
    logo: normalizePublicFileUrl(getOptionalNullableString(container, ['logo', 'logo_url', 'profile_image'])),
    slug: getOptionalNullableString(container, ['slug', 'practice_slug']),
    consultationFee: (() => {
      if ('consultation_fee' in container) {
        const value = container.consultation_fee;
        if (typeof value === 'number') {
          assertMinorUnits(value, 'practice.details.consultationFee');
          return toMajorUnits(value);
        }
        return null;
      }
      return undefined;
    })(),
    paymentLinkEnabled: (() => {
      if ('payment_link_enabled' in container) {
        const value = container.payment_link_enabled;
        return typeof value === 'boolean' ? value : null;
      }
      return undefined;
    })(),
    paymentUrl: getOptionalNullableString(container, ['payment_url']),
    calendlyUrl: getOptionalNullableString(container, ['calendly_url']),
    billingIncrementMinutes: getOptionalNullableNumber(container, ['billing_increment_minutes']),
    website: getOptionalNullableString(container, ['website']),
    introMessage: getOptionalNullableString(container, ['intro_message']),
    legalDisclaimer: getOptionalNullableString(container, ['overview', 'legal_disclaimer']),
    isPublic: 'is_public' in container
      ? Boolean(container.is_public)
      : undefined,
    services: 'services' in container
      ? (Array.isArray(container.services) ? (container.services as Array<Record<string, unknown>>) : null)
      : undefined,
    address: getOptionalNullableString(address, ['line1', 'address']) ?? getOptionalNullableString(container, ['address']),
    apartment: getOptionalNullableString(address, ['line2', 'apartment']) ?? getOptionalNullableString(container, ['apartment']),
    city: getOptionalNullableString(address, ['city']) ?? getOptionalNullableString(container, ['city']),
    state: getOptionalNullableString(address, ['state']) ?? getOptionalNullableString(container, ['state']),
    postalCode: getOptionalNullableString(address, ['postal_code'])
      ?? getOptionalNullableString(container, ['postal_code']),
    country: getOptionalNullableString(address, ['country']) ?? getOptionalNullableString(container, ['country']),
     primaryColor: getOptionalNullableString(container, ['primary_color']),
     accentColor: getOptionalNullableString(container, ['accent_color']),
     serviceStates: (() => {
       const raw = 'service_states' in container ? container.service_states : undefined;
       if (raw === undefined) return undefined;
       if (!Array.isArray(raw)) return null;
       return raw
         .filter((state): state is string => typeof state === 'string')
         .map((state) => state.trim().toUpperCase())
         .filter(Boolean);
     })(),
     supportedStates: (() => {
       const raw = 'supported_states' in container ? container.supported_states : undefined;
       if (raw === undefined) return undefined;
       if (!Array.isArray(raw)) return null;
       const result = raw
         .map((entry) => {
           if (!isRecord(entry)) return null;
           const country = typeof entry.country === 'string' ? entry.country.trim().toUpperCase() : '';
           if (!country) return null;
           const states = Array.isArray(entry.states)
             ? (entry.states as unknown[])
                 .filter((s): s is string => typeof s === 'string')
                 .map((s) => s.trim().toUpperCase())
                 .filter(Boolean)
             : undefined;
           const entryResult: SupportedStateEntry = { country };
           if (states !== undefined) entryResult.states = states;
           return entryResult;
         })
         .filter((e): e is SupportedStateEntry => e !== null);
       return result;
     })(),
    servicesByState: (() => {
      // Persisted location: `settings.services_by_state` (opaque JSON string).
      // No fallbacks: if not present in `settings`, treat as undefined.
      if (!('settings' in container)) return undefined;
      const rawSettings = container.settings;
      if (typeof rawSettings !== 'string') return undefined;
      try {
        const parsed = JSON.parse(rawSettings);
        if (!isRecord(parsed) || !('services_by_state' in parsed)) return undefined;
        const raw = (parsed as Record<string, unknown>).services_by_state;
        if (!isRecord(raw)) return null;
        const result: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (!Array.isArray(v)) continue;
          const services = v.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean);
          if (services.length > 0) {
            result[k.trim().toUpperCase()] = services;
          }
        }
        return result;
      } catch {
        return undefined;
      }
    })(),
     // Pass settings through as an opaque string so the UI can read/write it.
     settings: 'settings' in container
       ? (typeof container.settings === 'string' ? container.settings : null)
       : undefined,
     // Pass metadata through, parsing if it's a string
    metadata: 'metadata' in container
      ? (typeof container.metadata === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(container.metadata);
                return isRecord(parsed) ? parsed : undefined;
              } catch { return undefined; }
            })()
          : isRecord(container.metadata) ? container.metadata : undefined)
      : undefined,
   };
 }

export async function requestBillingPortalSession(
  payload: BillingPortalPayload
): Promise<SubscriptionEndpointResult> {
  return postSubscriptionEndpoint(getSubscriptionBillingPortalEndpoint(), {
    referenceId: payload.practiceId,
    customerType: payload.customerType,
    returnUrl: payload.returnUrl
  });
}

export async function getCurrentSubscription(
  config?: ApiRequestConfig
): Promise<CurrentSubscription | null> {
  const response = await apiClient.get('/api/subscriptions/current', {
    signal: config?.signal
  });
  const payload = response.data;
  if (!isRecord(payload) || !('subscription' in payload)) {
    throw new Error('Invalid /api/subscriptions/current payload: missing subscription.');
  }

  const container = payload.subscription;
  if (container === null) {
    return null;
  }
  if (!isRecord(container)) {
    throw new Error('Invalid /api/subscriptions/current payload: subscription must be an object or null.');
  }

  if (!isRecord(container.plan)) {
    throw new Error('Invalid /api/subscriptions/current payload: subscription is missing plan metadata.');
  }

  const planName = toNullableString(container.plan.name);
  const planDisplayName = toNullableString(container.plan.display_name);
  if (!planName && !planDisplayName) {
    throw new Error('Invalid /api/subscriptions/current payload: subscription plan is missing name metadata.');
  }

  if (!Array.isArray(container.plan.features)) {
    throw new Error('Invalid /api/subscriptions/current payload: subscription plan is missing features metadata.');
  }

  const plan = {
    id: toNullableString(container.plan.id),
    name: planName,
    displayName: planDisplayName,
    description: toNullableString(container.plan.description),
    stripeProductId: toNullableString(container.plan.stripe_product_id),
    stripeMonthlyPriceId: toNullableString(container.plan.stripe_monthly_price_id),
    stripeYearlyPriceId: toNullableString(container.plan.stripe_yearly_price_id),
    monthlyPrice: toNullableString(container.plan.monthly_price),
    yearlyPrice: toNullableString(container.plan.yearly_price),
    currency: toNullableString(container.plan.currency),
    features: container.plan.features.filter((feature): feature is string => typeof feature === 'string'),
    limits: isRecord(container.plan.limits)
      ? {
        users: typeof container.plan.limits.users === 'number' ? container.plan.limits.users : null,
        storageGb: typeof container.plan.limits.storage_gb === 'number' ? container.plan.limits.storage_gb : null,
        invoicesPerMonth: typeof container.plan.limits.invoices_per_month === 'number'
          ? container.plan.limits.invoices_per_month
          : null
      }
      : null,
    isActive: typeof container.plan.is_active === 'boolean' ? container.plan.is_active : null
  };

  return {
    id: toNullableString(container.id),
    status: toNullableString(container.status),
    plan,
    cancelAtPeriodEnd: typeof container.cancel_at_period_end === 'boolean' ? container.cancel_at_period_end : null,
    currentPeriodStart: toNullableString(container.period_start ?? container.current_period_start),
    currentPeriodEnd: toNullableString(container.period_end ?? container.current_period_end)
  };
}

export async function requestSubscriptionCancellation(
  practiceId: string
): Promise<SubscriptionEndpointResult> {
  return postSubscriptionEndpoint(getSubscriptionCancelEndpoint(), { practiceId });
}

export interface SubscriptionListItem {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface SubscriptionListResponse {
  subscriptions?: SubscriptionListItem[];
  data?: SubscriptionListItem[];
}

export interface AuthSubscriptionListItem {
  id?: string | null;
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  cancel_at_period_end?: boolean | null;
  currentPeriodEnd?: string | null;
  current_period_end?: string | null;
  plan?: Record<string, unknown> | null;
  [key: string]: unknown;
}

function normalizeSubscriptionListResponse(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (isRecord(payload)) {
    const subscriptions = payload.subscriptions;
    if (Array.isArray(subscriptions)) {
      return subscriptions.filter(isRecord);
    }
    const data = payload.data;
    if (Array.isArray(data)) {
      return data.filter(isRecord);
    }
  }
  return [];
}

export async function listAuthSubscriptions(
  referenceId: string,
  config?: ApiRequestConfig
): Promise<AuthSubscriptionListItem[]> {
  if (!referenceId) {
    throw new Error('referenceId is required');
  }

  const response = await apiClient.get(
    getSubscriptionListEndpoint(),
    {
      params: { referenceId },
      baseURL: undefined, // Use full URL from getSubscriptionListEndpoint
      signal: config?.signal
    }
  );

  return normalizeSubscriptionListResponse(response.data) as AuthSubscriptionListItem[];
}

export async function listSubscriptions(
  referenceId: string,
  config?: ApiRequestConfig
): Promise<SubscriptionListItem[]> {
  if (!referenceId) {
    throw new Error('referenceId is required');
  }

  // Use GET request with referenceId as query parameter
  const response = await apiClient.get(
    getSubscriptionListEndpoint(),
    {
      params: { referenceId },
      baseURL: undefined, // Use full URL from getSubscriptionListEndpoint
      signal: config?.signal
    }
  );

  // Handle different response shapes
  const data = response.data as SubscriptionListResponse;
  return normalizeSubscriptionListResponse(data) as SubscriptionListItem[];
}
