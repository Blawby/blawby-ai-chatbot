import axios, { type AxiosRequestConfig, type AxiosRequestHeaders } from 'axios';
import { getTokenAsync, clearToken } from './tokenStorage';
import {
  getSubscriptionBillingPortalEndpoint,
  getSubscriptionCancelEndpoint,
  getSubscriptionListEndpoint,
  getConversationLinkEndpoint
} from '@/config/api';
import { isPlatformPractice } from '@/shared/utils/practice';
import type { Conversation } from '@/shared/types/conversation';
import { getBackendApiUrl } from '@/config/urls';
import { getTurnstileToken } from '@/shared/lib/turnstile';

let cachedBaseUrl: string | null = null;
let isHandling401: Promise<void> | null = null;
const captchaProtectedPath = /\/api\/practice\/details\/[^/]+\b/;
const publicPracticeDetailsInFlight = new Map<string, Promise<PublicPracticeDetails | null>>();

/**
 * Get the base URL for backend API requests
 * Uses centralized URL configuration from src/config/urls.ts
 * 
 * Caching strategy:
 * - Development: Never cache (supports MSW switching)
 * - Production: Cache after first call
 */
function ensureApiBaseUrl(): string {
  // NEVER cache in development - always get fresh URL to support MSW
  if (import.meta.env.DEV) {
    return getBackendApiUrl();
  }

  // In production, cache after first call
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }

  cachedBaseUrl = getBackendApiUrl();
  return cachedBaseUrl;
}

// Create axios instance without default baseURL
// We'll set it dynamically in the interceptor to support MSW in dev
export const apiClient = axios.create({
  // Don't set baseURL here - let interceptor handle it dynamically
});

apiClient.interceptors.request.use(
  async (config) => {
    const requiresCaptcha = (() => {
      const rawUrl = config.url ?? '';
      if (!rawUrl) {
        return false;
      }
      const path = rawUrl.startsWith('http')
        ? (() => {
          try {
            return new URL(rawUrl).pathname;
          } catch {
            return rawUrl;
          }
        })()
        : rawUrl;
      return captchaProtectedPath.test(path.split('?')[0] ?? '');
    })();

    // Always get fresh baseURL in development to support MSW
    // Force override any cached baseURL - this is critical for MSW interception
    const baseUrl = ensureApiBaseUrl();
    // Always set baseURL fresh - don't rely on existing value
    if (config.baseURL !== baseUrl) {
      config.baseURL = baseUrl;
      if (import.meta.env.DEV) {
        console.log('[apiClient] Updated baseURL to:', baseUrl, 'for request:', config.url);
      }
    }

    // Follow Better Auth guide assumptions: calls to staging-api are authenticated.
    // Ensure cookies can be sent cross-origin when backend is configured to allow it.
    config.withCredentials = true;

    const token = await getTokenAsync();
    if (token) {
      if (!config.headers) {
        config.headers = {} as AxiosRequestHeaders;
      }
      const headers = config.headers as AxiosRequestHeaders;
      headers.Authorization = `Bearer ${token}`;
      if (import.meta.env.DEV) {
        console.log('[apiClient] Added token to request:', config.url);
      }
    } else if (import.meta.env.DEV) {
      console.warn('[apiClient] No token available for request:', config.url, 'baseURL:', baseUrl);
    }

    if (requiresCaptcha) {
      const captchaToken = await getTurnstileToken();
      if (captchaToken) {
        if (!config.headers) {
          config.headers = {} as AxiosRequestHeaders;
        }
        const headers = config.headers as AxiosRequestHeaders;
        headers['x-captcha-token'] = captchaToken;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

type PracticeMetadata = Record<string, unknown> | null | undefined;

export interface Practice {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: PracticeMetadata;
  businessPhone: string | null;
  businessEmail: string | null;
  consultationFee: number | null; // USD dollars.
  paymentUrl: string | null;
  calendlyUrl: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  introMessage?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;

  // Subscription and practice management properties
  kind?: 'personal' | 'business' | 'practice';
  subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number | null;
  config?: {
    ownerEmail?: string;
    metadata?: Record<string, unknown>;
    description?: string;
    [key: string]: unknown; // Allow additional config properties
  };
  stripeCustomerId?: string | null;
  subscriptionPeriodEnd?: number | null;
  description?: string;
  isPersonal?: boolean | null;
  betterAuthOrgId?: string;
  businessOnboardingStatus?: 'not_required' | 'pending' | 'completed' | 'skipped';
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingSkipped?: boolean;
  businessOnboardingHasDraft?: boolean;
}

export interface CreatePracticeRequest {
  name: string;
  slug?: string;
  logo?: string;
  metadata?: PracticeMetadata;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: number;
  paymentUrl?: string;
  calendlyUrl?: string;
}

export type UpdatePracticeRequest = Partial<CreatePracticeRequest>;

export interface PracticeDetailsUpdate {
  businessPhone?: string | null;
  businessEmail?: string | null;
  consultationFee?: number | null;
  paymentUrl?: string | null;
  calendlyUrl?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  introMessage?: string | null;
  description?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;
}

export interface PracticeDetails {
  businessPhone?: string | null;
  businessEmail?: string | null;
  consultationFee?: number | null;
  paymentUrl?: string | null;
  calendlyUrl?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  introMessage?: string | null;
  description?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;
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
  clientSecret?: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  completed?: boolean;
}

export interface BillingPortalPayload {
  practiceId: string;
  returnUrl?: string;
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
  isActive?: boolean | null;
}

export interface CurrentSubscription {
  id?: string | null;
  status?: string | null;
  plan?: CurrentSubscriptionPlan | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: string | null;
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

export async function linkConversationToUser(
  conversationId: string,
  practiceId: string,
  userId?: string | null
): Promise<Conversation> {
  if (!conversationId) {
    throw new Error('conversationId is required to link conversation');
  }
  if (!practiceId) {
    throw new Error('practiceId is required to link conversation');
  }

  const response = await apiClient.patch(
    `${getConversationLinkEndpoint(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    {
      userId: userId || undefined
    }
  );

  const conversation = unwrapApiData(response.data) as Conversation | null;
  if (!conversation) {
    throw new Error('Failed to link conversation');
  }

  return conversation;
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
    if (axios.isAxiosError(error)) {
      return {
        ok: false,
        status: error.response?.status ?? 0,
        data: error.response?.data ?? null
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
    record.practiceUuid ??
    ''
  );
  const name = String(record.name ?? 'Practice');
  const slug = toNullableString(record.slug) ?? id;

  return {
    id,
    name,
    slug,
    logo: toNullableString(record.logo),
    metadata: isRecord(record.metadata) ? record.metadata : undefined,
    businessPhone: toNullableString(record.businessPhone ?? record.business_phone),
    businessEmail: toNullableString(record.businessEmail ?? record.business_email),
    consultationFee: typeof (record.consultationFee ?? record.consultation_fee) === 'number'
      ? Number(record.consultationFee ?? record.consultation_fee)
      : null,
    paymentUrl: toNullableString(record.paymentUrl ?? record.payment_url),
    calendlyUrl: toNullableString(record.calendlyUrl ?? record.calendly_url),
    createdAt: toNullableString(record.createdAt ?? record.created_at),
    updatedAt: toNullableString(record.updatedAt ?? record.updated_at),
    website: toNullableString(record.website),
    addressLine1: toNullableString(record.addressLine1 ?? record.address_line_1),
    addressLine2: toNullableString(record.addressLine2 ?? record.address_line_2),
    city: toNullableString(record.city),
    state: toNullableString(record.state),
    postalCode: toNullableString(record.postalCode ?? record.postal_code),
    country: toNullableString(record.country),
    primaryColor: toNullableString(record.primaryColor ?? record.primary_color),
    accentColor: toNullableString(record.accentColor ?? record.accent_color),
    introMessage: toNullableString(record.introMessage ?? record.intro_message),
    description: toNullableString(record.description ?? record.overview),
    isPublic: 'isPublic' in record || 'is_public' in record
      ? Boolean(record.isPublic ?? record.is_public)
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
    if (Array.isArray(data.data)) {
      return data.data.map(normalizePracticePayload);
    }
    if (isRecord(data.data)) {
      const nested = data.data as Record<string, unknown>;
      if (Array.isArray(nested.practices)) {
        return nested.practices.map(normalizePracticePayload);
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
    practiceUuid: String(payload.practice_uuid ?? payload.practiceUuid ?? ''),
    stripeAccountId: String(payload.stripe_account_id ?? payload.stripeAccountId ?? ''),
    clientSecret: toNullableString(payload.client_secret ?? payload.clientSecret),
    onboardingUrl: toNullableString(payload.onboarding_url ?? payload.onboardingUrl ?? payload.url),
    chargesEnabled: Boolean(payload.charges_enabled ?? payload.chargesEnabled),
    payoutsEnabled: Boolean(payload.payouts_enabled ?? payload.payoutsEnabled),
    detailsSubmitted: Boolean(payload.details_submitted ?? payload.detailsSubmitted)
  };
}

function normalizeOnboardingStatus(payload: unknown): OnboardingStatus {
  const normalized = unwrapApiData(payload);
  if (!isRecord(normalized)) {
    throw new Error('Invalid onboarding status payload');
  }

  return {
    practiceUuid: String(normalized.practice_uuid ?? normalized.practiceUuid ?? ''),
    stripeAccountId: toNullableString(normalized.stripe_account_id ?? normalized.stripeAccountId),
    clientSecret: toNullableString(normalized.client_secret ?? normalized.clientSecret),
    chargesEnabled: Boolean(normalized.charges_enabled ?? normalized.chargesEnabled),
    payoutsEnabled: Boolean(normalized.payouts_enabled ?? normalized.payoutsEnabled),
    detailsSubmitted: Boolean(normalized.details_submitted ?? normalized.detailsSubmitted),
    completed: 'completed' in normalized ? Boolean(normalized.completed) : undefined
  };
}

type ListPracticesOptions = Pick<AxiosRequestConfig, 'signal'> & {
  scope?: 'all' | 'tenant' | 'platform';
};

export async function listPractices(configOrOptions?: ListPracticesOptions): Promise<Practice[]> {
  const opts = configOrOptions ?? {};
  const scope = opts.scope ?? 'tenant';
  const response = await apiClient.get('/api/practice/list', {
    signal: opts.signal
  });
  const practices = unwrapPracticeListResponse(response.data);
  if (scope === 'all') {
    return practices;
  }
  return practices.filter((practice) => {
    const platformMatch =
      isPlatformPractice(practice.id) || isPlatformPractice(practice.slug);
    return scope === 'platform' ? platformMatch : !platformMatch;
  });
}

export async function getPractice(practiceId: string, config?: Pick<AxiosRequestConfig, 'signal'>): Promise<Practice> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const response = await apiClient.get(`/api/practice/${encodeURIComponent(practiceId)}`, {
    signal: config?.signal
  });
  return unwrapPracticeResponse(response.data);
}

export async function createPractice(
  payload: CreatePracticeRequest,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<Practice> {
  const response = await apiClient.post('/api/practice', payload, {
    signal: config?.signal
  });
  return unwrapPracticeResponse(response.data);
}

export async function updatePractice(
  practiceId: string,
  payload: UpdatePracticeRequest,
  config?: Pick<AxiosRequestConfig, 'signal'>
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
      signal: config?.signal
    }
  );
  return unwrapPracticeResponse(response.data);
}

export async function deletePractice(
  practiceId: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<void> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  await apiClient.delete(`/api/practice/${encodeURIComponent(practiceId)}`, {
    signal: config?.signal
  });
}

export async function setActivePractice(practiceId: string): Promise<void> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  await apiClient.put(`/api/practice/${encodeURIComponent(practiceId)}/active`);
}

export async function listPracticeInvitations(): Promise<unknown[]> {
  const response = await apiClient.get('/api/practice/invitations');
  const payload = unwrapApiData(response.data);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord(payload) && Array.isArray(payload.invitations)) {
    return payload.invitations as unknown[];
  }
  return [];
}

export async function createPracticeInvitation(
  practiceId: string,
  payload: { email: string; role: string }
): Promise<void> {
  await apiClient.post(
    `/api/practice/${encodeURIComponent(practiceId)}/invitations`,
    payload
  );
}

export async function respondToPracticeInvitation(
  invitationId: string,
  action: 'accept' | 'decline'
): Promise<void> {
  await apiClient.post(
    `/api/practice/invitations/${encodeURIComponent(invitationId)}/${action}`
  );
}

export async function listPracticeMembers(practiceId: string): Promise<unknown[]> {
  const response = await apiClient.get(`/api/practice/${encodeURIComponent(practiceId)}/members`);
  const payload = unwrapApiData(response.data);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord(payload) && Array.isArray(payload.members)) {
    return payload.members as unknown[];
  }
  return [];
}

export async function updatePracticeMemberRole(
  practiceId: string,
  payload: { userId: string; role: string }
): Promise<void> {
  await apiClient.patch(`/api/practice/${encodeURIComponent(practiceId)}/members`, payload);
}

export async function deletePracticeMember(
  practiceId: string,
  userId: string
): Promise<void> {
  await apiClient.delete(
    `/api/practice/${encodeURIComponent(practiceId)}/members/${encodeURIComponent(userId)}`
  );
}

export async function getOnboardingStatus(organizationId: string): Promise<OnboardingStatus> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  const response = await apiClient.get(
    `/api/onboarding/organization/${encodeURIComponent(organizationId)}/status`
  );
  return normalizeOnboardingStatus(response.data);
}

export async function getOnboardingStatusPayload(
  organizationId: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<unknown> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  const response = await apiClient.get(
    `/api/onboarding/organization/${encodeURIComponent(organizationId)}/status`,
    { signal: config?.signal }
  );
  return response.data;
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
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<PracticeDetails | null> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const normalized = normalizePracticeDetailsPayload(details);
  if (import.meta.env.DEV) {
    console.info('[apiClient] updatePracticeDetails payload', { practiceId, payload: normalized });
  }
  const response = await apiClient.put(
    `/api/practice/${encodeURIComponent(practiceId)}/details`,
    normalized,
    { signal: config?.signal }
  );
  return normalizePracticeDetailsResponse(response.data);
}

export async function getPracticeDetails(
  practiceId: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<PracticeDetails | null> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  try {
    const response = await apiClient.get(
      `/api/practice/${encodeURIComponent(practiceId)}/details`,
      { signal: config?.signal }
    );
    return normalizePracticeDetailsResponse(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export interface PublicPracticeDetails {
  practiceId?: string;
  slug?: string;
  details: PracticeDetails | null;
}

export async function getPublicPracticeDetails(
  slug: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<PublicPracticeDetails | null> {
  if (!slug) {
    throw new Error('practice slug is required');
  }
  const normalizedSlug = slug.trim();
  const existing = publicPracticeDetailsInFlight.get(normalizedSlug);
  if (existing) {
    return existing;
  }

  const requestPromise = (async () => {
    try {
      let captchaToken: string;
      try {
        captchaToken = await getTurnstileToken();
        if (import.meta.env.DEV) {
          console.log('[getPublicPracticeDetails] Turnstile token generated:', {
            tokenPrefix: `${captchaToken.substring(0, 20)}...`,
            tokenLength: captchaToken.length,
            currentDomain: window.location.hostname
          });
        }
      } catch (tokenError) {
        console.error('[getPublicPracticeDetails] Failed to generate Turnstile token:', tokenError);
        throw new Error(`Failed to generate CAPTCHA token: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
      }

      const apiUrl = `${getBackendApiUrl()}/api/practice/details/${encodeURIComponent(normalizedSlug)}`;
      if (import.meta.env.DEV) {
        console.log('[getPublicPracticeDetails] Making request to:', apiUrl);
      }

      const response = await axios.get(
        apiUrl,
        {
          signal: config?.signal,
          headers: {
            'x-captcha-token': captchaToken
          },
          withCredentials: true
        }
      );
      const details = normalizePracticeDetailsResponse(response.data);
      const meta = extractPracticeDetailsMeta(response.data);
      if (!details && !meta.practiceId && !meta.slug) {
        return null;
      }
      return {
        practiceId: meta.practiceId,
        slug: meta.slug ?? normalizedSlug,
        details
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return null;
        }
        if (error.response?.status === 403) {
          const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Forbidden';
          const captchaToken = error.config?.headers?.['x-captcha-token'] as string | undefined;
          console.error('[getPublicPracticeDetails] 403 Forbidden:', {
            status: 403,
            message: errorMessage,
            url: error.config?.url,
            hasCaptchaToken: !!captchaToken,
            tokenPrefix: captchaToken ? `${captchaToken.substring(0, 20)}...` : 'none',
            tokenLength: captchaToken?.length || 0,
            responseData: error.response?.data,
            currentDomain: typeof window !== 'undefined' ? window.location.hostname : 'unknown'
          });
          throw new Error(`CAPTCHA validation failed: ${errorMessage}`);
        }
      }
      throw error;
    }
  })();

  publicPracticeDetailsInFlight.set(normalizedSlug, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (publicPracticeDetailsInFlight.get(normalizedSlug) === requestPromise) {
      publicPracticeDetailsInFlight.delete(normalizedSlug);
    }
  }
}

function normalizePracticeUpdatePayload(payload: UpdatePracticeRequest): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  if ('name' in payload && payload.name !== undefined) normalized.name = payload.name;
  if ('slug' in payload && payload.slug !== undefined) normalized.slug = payload.slug;
  if ('logo' in payload && payload.logo !== undefined) normalized.logo = payload.logo;
  if ('metadata' in payload && payload.metadata !== undefined) normalized.metadata = payload.metadata;

  if ('businessEmail' in payload && payload.businessEmail !== undefined) {
    normalized.business_email = payload.businessEmail;
  }
  if ('businessPhone' in payload && payload.businessPhone !== undefined) {
    normalized.business_phone = payload.businessPhone;
  }
  if ('consultationFee' in payload && payload.consultationFee !== undefined) {
    normalized.consultation_fee = payload.consultationFee;
  }
  if ('paymentUrl' in payload && payload.paymentUrl !== undefined) {
    normalized.payment_url = payload.paymentUrl;
  }
  if ('calendlyUrl' in payload && payload.calendlyUrl !== undefined) {
    normalized.calendly_url = payload.calendlyUrl;
  }

  return normalized;
}

function extractPracticeDetailsMeta(payload: unknown): { practiceId?: string; slug?: string } {
  const normalized = unwrapApiData(payload);
  if (!isRecord(normalized)) {
    return {};
  }

  const candidates: Array<Record<string, unknown>> = [];
  const pushCandidate = (value: unknown) => {
    if (isRecord(value)) {
      candidates.push(value);
    }
  };

  pushCandidate(normalized);
  if ('data' in normalized) {
    pushCandidate(normalized.data);
  }
  if ('details' in normalized) {
    pushCandidate(normalized.details);
  }
  if ('data' in normalized && isRecord(normalized.data) && 'details' in normalized.data) {
    pushCandidate(normalized.data.details);
  }

  const getStringValue = (record: Record<string, unknown>, keys: string[]): string | undefined => {
    for (const key of keys) {
      if (key in record) {
        const value = toNullableString(record[key]);
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  };

  let practiceId: string | undefined;
  let slug: string | undefined;

  for (const record of candidates) {
    if (!practiceId) {
      practiceId = getStringValue(record, [
        'practiceId',
        'practice_id',
        'practiceUuid',
        'practice_uuid',
        'uuid',
        'id'
      ]);
    }
    if (!slug) {
      slug = getStringValue(record, ['slug']);
    }
    if (practiceId && slug) {
      break;
    }
  }

  return { practiceId, slug };
}

function normalizePracticeDetailsPayload(payload: PracticeDetailsUpdate): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const normalizeTextOrNull = (value: unknown): string | null | undefined => {
    if (value === undefined) return undefined; // Not provided
    if (value === null) return null; // Explicit clear
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const businessEmail = normalizeTextOrNull(payload.businessEmail);
  if (businessEmail !== undefined) normalized.business_email = businessEmail;
  const businessPhone = normalizeTextOrNull(payload.businessPhone);
  if (businessPhone !== undefined) normalized.business_phone = businessPhone;
  if ('consultationFee' in payload && payload.consultationFee !== undefined) {
    normalized.consultation_fee = payload.consultationFee;
  }
  const paymentUrl = normalizeTextOrNull(payload.paymentUrl);
  if (paymentUrl !== undefined) normalized.payment_url = paymentUrl;
  const calendlyUrl = normalizeTextOrNull(payload.calendlyUrl);
  if (calendlyUrl !== undefined) normalized.calendly_url = calendlyUrl;
  const website = normalizeTextOrNull(payload.website);
  if (website !== undefined) normalized.website = website;
  const address: Record<string, unknown> = {};
  const addressLine1 = normalizeTextOrNull(payload.addressLine1);
  if (addressLine1 !== undefined) address.line1 = addressLine1;
  const addressLine2 = normalizeTextOrNull(payload.addressLine2);
  if (addressLine2 !== undefined) address.line2 = addressLine2;
  const city = normalizeTextOrNull(payload.city);
  if (city !== undefined) address.city = city;
  const state = normalizeTextOrNull(payload.state);
  if (state !== undefined) address.state = state;
  const postalCode = normalizeTextOrNull(payload.postalCode);
  if (postalCode !== undefined) address.postal_code = postalCode;
  const country = normalizeTextOrNull(payload.country);
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
  const introMessage = normalizeTextOrNull(payload.introMessage);
  if (introMessage !== undefined) normalized.intro_message = introMessage;
  const description = normalizeTextOrNull(payload.description);
  if (description !== undefined) normalized.overview = description;
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
          const id = toNullableString(service.id);
          const name = toNullableString(service.name ?? service.title);
          if (!id || !name) {
            return null;
          }
          const description = toNullableString(service.description);
          const next: Record<string, unknown> = { id, name };
          if (description) {
            next.description = description;
          }
          return next;
        })
        .filter((service): service is Record<string, unknown> => Boolean(service));
    } else {
      normalized.services = payload.services;
    }
  }

  return normalized;
}

function normalizePracticeDetailsResponse(payload: unknown): PracticeDetails | null {
  const normalized = unwrapApiData(payload);
  if (!isRecord(normalized)) {
    return null;
  }
  const container = (() => {
    if ('details' in normalized && isRecord(normalized.details)) {
      return normalized.details;
    }
    if ('data' in normalized && isRecord(normalized.data) && 'details' in normalized.data && isRecord(normalized.data.details)) {
      return normalized.data.details;
    }
    return normalized;
  })();

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

  return {
    businessPhone: getOptionalNullableString(container, ['business_phone', 'businessPhone']),
    businessEmail: getOptionalNullableString(container, ['business_email', 'businessEmail']),
    consultationFee: (() => {
      if ('consultation_fee' in container || 'consultationFee' in container) {
        const value = container.consultation_fee ?? container.consultationFee;
        return typeof value === 'number' ? Number(value) : null;
      }
      return undefined;
    })(),
    paymentUrl: getOptionalNullableString(container, ['payment_url', 'paymentUrl']),
    calendlyUrl: getOptionalNullableString(container, ['calendly_url', 'calendlyUrl']),
    website: getOptionalNullableString(container, ['website']),
    introMessage: getOptionalNullableString(container, ['intro_message', 'introMessage']),
    description: getOptionalNullableString(container, ['overview', 'description']),
    isPublic: 'is_public' in container || 'isPublic' in container
      ? Boolean(container.is_public ?? container.isPublic)
      : undefined,
    services: 'services' in container
      ? (Array.isArray(container.services) ? (container.services as Array<Record<string, unknown>>) : null)
      : undefined,
    addressLine1: getOptionalNullableString(address, ['line1', 'line_1', 'address_line_1'])
      ?? getOptionalNullableString(container, ['addressLine1']),
    addressLine2: getOptionalNullableString(address, ['line2', 'line_2', 'address_line_2'])
      ?? getOptionalNullableString(container, ['addressLine2']),
    city: getOptionalNullableString(address, ['city']) ?? getOptionalNullableString(container, ['city']),
    state: getOptionalNullableString(address, ['state']) ?? getOptionalNullableString(container, ['state']),
    postalCode: getOptionalNullableString(address, ['postal_code'])
      ?? getOptionalNullableString(container, ['postalCode', 'postal_code']),
    country: getOptionalNullableString(address, ['country']) ?? getOptionalNullableString(container, ['country']),
    primaryColor: getOptionalNullableString(container, ['primary_color', 'primaryColor']),
    accentColor: getOptionalNullableString(container, ['accent_color', 'accentColor'])
  };
}

export async function requestBillingPortalSession(
  payload: BillingPortalPayload
): Promise<SubscriptionEndpointResult> {
  return postSubscriptionEndpoint(getSubscriptionBillingPortalEndpoint(), {
    referenceId: payload.practiceId,
    returnUrl: payload.returnUrl
  });
}

export async function getCurrentSubscription(
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<CurrentSubscription | null> {
  const response = await apiClient.get('/api/subscriptions/current', {
    signal: config?.signal
  });
  const payload = response.data as Record<string, unknown>;
  const container = (() => {
    if (isRecord(payload) && 'subscription' in payload) {
      return payload.subscription;
    }
    if (isRecord(payload) && 'data' in payload && isRecord(payload.data) && 'subscription' in payload.data) {
      return payload.data.subscription;
    }
    return null;
  })();

  if (!isRecord(container)) {
    return null;
  }

  const plan = isRecord(container.plan)
    ? {
      id: toNullableString(container.plan.id),
      name: toNullableString(container.plan.name),
      displayName: toNullableString(container.plan.displayName ?? container.plan.display_name),
      isActive: typeof container.plan.isActive === 'boolean'
        ? container.plan.isActive
        : typeof container.plan.is_active === 'boolean'
          ? container.plan.is_active
          : null
    }
    : null;

  return {
    id: toNullableString(container.id),
    status: toNullableString(container.status),
    plan,
    cancelAtPeriodEnd: typeof container.cancelAtPeriodEnd === 'boolean'
      ? container.cancelAtPeriodEnd
      : typeof container.cancel_at_period_end === 'boolean'
        ? container.cancel_at_period_end
        : null,
    currentPeriodEnd: toNullableString(container.currentPeriodEnd ?? container.current_period_end)
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
  config?: Pick<AxiosRequestConfig, 'signal'>
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
  config?: Pick<AxiosRequestConfig, 'signal'>
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Guard against concurrent 401s - only handle once
      if (!isHandling401) {
        // Create the handler promise immediately and assign it
        const handle401 = async () => {
          try {
            try {
              await clearToken();
            } catch (err) {
              console.error('Failed to clear token on 401:', err);
            }
            if (typeof window !== 'undefined') {
              try {
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
              } catch (eventErr) {
                console.error('Error dispatching auth:unauthorized event:', eventErr);
                // Don't rethrow - let the original 401 error be the main error
              }
            }
          } finally {
            // Reset guard after handling completes, regardless of errors
            isHandling401 = null;
          }
        };

        // Assign the promise immediately before any async work
        isHandling401 = handle401();
      }
      // Wait for the handling to complete (or already in progress)
      await isHandling401;
    }
    return Promise.reject(error);
  }
);
