import axios, { type AxiosRequestConfig } from 'axios';
import { getTokenAsync, clearToken } from './tokenStorage';
import {
  getSubscriptionBillingPortalEndpoint,
  getSubscriptionCancelEndpoint,
  getSubscriptionListEndpoint,
  getRemoteApiUrl
} from '../config/api';
import { isPlatformPractice } from '../utils/practice';

let cachedBaseUrl: string | null = null;
let isHandling401: Promise<void> | null = null;

function ensureApiBaseUrl(): string {
  // NEVER cache in development - always get fresh URL to support MSW
  // In dev mode, use window.location.origin ONLY if MSW is enabled
  // If MSW is disabled, use staging-api directly
  if (import.meta.env.DEV) {
    const enableMocks = import.meta.env.VITE_ENABLE_MSW === 'true';
    
    if (enableMocks) {
      // MSW enabled - use same origin for interception
      if (typeof window !== 'undefined' && window.location && window.location.origin) {
        const origin = window.location.origin;
        console.log('[ensureApiBaseUrl] DEV mode with MSW - using window.location.origin:', origin);
        return origin;
      }
      // Fallback if window isn't available (shouldn't happen in browser)
      console.warn('[ensureApiBaseUrl] window not available in DEV, using localhost fallback');
      return 'http://localhost:5173';
    } else {
      // MSW disabled - use staging-api directly
      console.log('[ensureApiBaseUrl] DEV mode without MSW - using staging-api');
      return getRemoteApiUrl();
    }
  }
  
  // In production, check env vars and cache
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  const explicit = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  cachedBaseUrl = explicit || getRemoteApiUrl();
  return cachedBaseUrl;
}

// Create axios instance without default baseURL
// We'll set it dynamically in the interceptor to support MSW in dev
export const apiClient = axios.create({
  // Don't set baseURL here - let interceptor handle it dynamically
});

apiClient.interceptors.request.use(
  async (config) => {
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
      config.headers = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(config.headers as any),
        Authorization: `Bearer ${token}`
      } as any;
      if (import.meta.env.DEV) {
        console.log('[apiClient] Added token to request:', config.url);
      }
    } else if (import.meta.env.DEV) {
      console.warn('[apiClient] No token available for request:', config.url, 'baseURL:', baseUrl);
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
  businessPhone?: string | null;
  businessEmail?: string | null;
  calendlyUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  
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
  calendlyUrl?: string;
}

export type UpdatePracticeRequest = Partial<CreatePracticeRequest>;

export interface ConnectedAccountRequest {
  practiceEmail: string;
  practiceUuid: string;
}

export interface ConnectedAccountResponse {
  practiceUuid: string;
  stripeAccountId: string;
  clientSecret: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface OnboardingStatus {
  practiceUuid: string;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  completed?: boolean;
}

export interface SubscriptionSyncResponse {
  synced: boolean;
  subscription?: unknown;
  updatedAt?: string | null;
}

export interface SubscriptionCreatePayload {
  planId: string; // UUID of the subscription plan (required)
  plan?: string; // Plan name as fallback (optional)
  successUrl?: string;
  cancelUrl?: string;
  disableRedirect?: boolean;
}

export interface SubscriptionCreateResponse {
  subscriptionId: string;
  checkoutUrl: string;
  message?: string;
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

export interface UserPreferences {
  theme: string;
  accentColor: string;
  fontSize: string;
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  notificationFrequency: string;
  autoSaveConversations: boolean;
  typingIndicators: boolean;
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

function extractApiData<T>(payload: unknown): T | null {
  const normalized = unwrapApiData(payload);

  if (isRecord(normalized) && 'success' in normalized) {
    if (!normalized.success) {
      const message =
        typeof normalized.error === 'string'
          ? normalized.error
          : 'Request failed';
      throw new Error(message);
    }
    return (normalized.data ?? null) as T | null;
  }

  return normalized as T;
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

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePracticePayload(payload: unknown): Practice {
  if (!isRecord(payload)) {
    throw new Error('Invalid practice payload');
  }

  const id = String(payload.id ?? payload.practice_id ?? '');
  const name = String(payload.name ?? 'Practice');
  const slug = toNullableString(payload.slug) ?? id;

  return {
    id,
    name,
    slug,
    logo: toNullableString(payload.logo),
    metadata: isRecord(payload.metadata) ? payload.metadata : undefined,
    businessPhone: toNullableString(payload.businessPhone ?? payload.business_phone),
    businessEmail: toNullableString(payload.businessEmail ?? payload.business_email),
    calendlyUrl: toNullableString(payload.calendlyUrl ?? payload.calendly_url),
    createdAt: toNullableString(payload.createdAt ?? payload.created_at),
    updatedAt: toNullableString(payload.updatedAt ?? payload.updated_at)
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
  const response = await apiClient.put(`/api/practice/${encodeURIComponent(practiceId)}`, payload, {
    signal: config?.signal
  });
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

export async function getOnboardingStatus(practiceId: string): Promise<OnboardingStatus> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const response = await apiClient.get(`/api/onboarding/practice/${encodeURIComponent(practiceId)}/status`);
  return normalizeOnboardingStatus(response.data);
}

export async function getOnboardingStatusPayload(
  practiceId: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<unknown> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const response = await apiClient.get(
    `/api/onboarding/practice/${encodeURIComponent(practiceId)}/status`,
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
    practice_uuid: payload.practiceUuid
  });

  return normalizeConnectedAccountResponse(response.data);
}

export async function syncSubscription(
  practiceId: string,
  options?: { headers?: Record<string, string> }
): Promise<SubscriptionSyncResponse> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const response = await apiClient.post(
    '/api/subscription/sync',
    { practiceId },
    {
      headers: options?.headers
    }
  );
  const data = isRecord(response.data) ? response.data : {};
  return {
    synced: Boolean('synced' in data ? data.synced : data.success ?? false),
    subscription: 'subscription' in data ? data.subscription : undefined,
    updatedAt: toNullableString(data.updatedAt ?? data.updated_at)
  };
}

export async function getUserPreferences(
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<UserPreferences | null> {
  const response = await apiClient.get('/api/user/preferences', {
    signal: config?.signal
  });
  return extractApiData<UserPreferences>(response.data);
}

export async function updateUserPreferences(
  preferences: Partial<UserPreferences>,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<UserPreferences | null> {
  const response = await apiClient.put('/api/user/preferences', preferences, {
    signal: config?.signal
  });
  return extractApiData<UserPreferences>(response.data);
}

export async function createSubscription(
  payload: SubscriptionCreatePayload
): Promise<SubscriptionCreateResponse> {
  try {
    const response = await apiClient.post('/api/subscriptions/create', payload);
    const data = isRecord(response.data) ? response.data : {};
    return {
      subscriptionId: (data.subscriptionId as string) || '',
      checkoutUrl: (data.checkoutUrl as string) || '',
      message: typeof data.message === 'string' ? data.message : undefined
    };
  } catch (error) {
    // Handle axios errors - extract error message from response
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: unknown; status?: number } };
      const errorData = axiosError.response?.data;
      const status = axiosError.response?.status;
      
      // Log full error for debugging
      if (import.meta.env.DEV) {
        console.error('[createSubscription] Error response:', {
          status,
          data: errorData,
          payload
        });
        // Also log the full error data as JSON for easier reading
        try {
          console.error('[createSubscription] Full error data:', JSON.stringify(errorData, null, 2));
        } catch {
          // Ignore JSON stringify errors
        }
      }
      
      // Try to extract error message from response
      let errorMessage = 'Failed to create subscription';
      if (isRecord(errorData)) {
        if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (typeof errorData.message === 'string') {
          errorMessage = errorData.message;
        }
      }
      
      // Include status code in error for debugging
      const fullMessage = status ? `${errorMessage} (${status})` : errorMessage;
      throw new Error(fullMessage);
    }
    
    // Re-throw if not an axios error
    throw error;
  }
}

export async function requestBillingPortalSession(
  payload: BillingPortalPayload
): Promise<SubscriptionEndpointResult> {
  return postSubscriptionEndpoint(getSubscriptionBillingPortalEndpoint(), {
    referenceId: payload.practiceId,
    returnUrl: payload.returnUrl
  });
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
  if (Array.isArray(data)) {
    return data;
  }
  if (data?.subscriptions && Array.isArray(data.subscriptions)) {
    return data.subscriptions;
  }
  if (data?.data && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
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
