import axios, { type AxiosRequestConfig } from 'axios';
import { getTokenAsync, clearToken } from './tokenStorage';

let cachedBaseUrl: string | null = null;
let isHandling401: Promise<void> | null = null;

function ensureApiBaseUrl(): string {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  const explicit = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (!explicit) {
    throw new Error('API base URL not configured. Please set VITE_API_BASE_URL or VITE_API_URL.');
  }
  cachedBaseUrl = explicit;
  return cachedBaseUrl;
}

export const apiClient = axios.create();

apiClient.interceptors.request.use(
  async (config) => {
    config.baseURL = config.baseURL ?? ensureApiBaseUrl();
    const token = await getTokenAsync();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
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
  consultationFee?: number | null;
  paymentUrl?: string | null;
  calendlyUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreatePracticeRequest {
  name: string;
  slug: string;
  logo?: string;
  metadata?: PracticeMetadata;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: number;
  paymentUrl?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

  const id = String(payload.id ?? payload.practice_id ?? payload.organization_id ?? '');
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
    consultationFee: toNullableNumber(payload.consultationFee ?? payload.consultation_fee),
    paymentUrl: toNullableString(payload.paymentUrl ?? payload.payment_url),
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
  if (!isRecord(payload)) {
    throw new Error('Invalid onboarding status payload');
  }

  return {
    practiceUuid: String(payload.practice_uuid ?? payload.practiceUuid ?? ''),
    stripeAccountId: toNullableString(payload.stripe_account_id ?? payload.stripeAccountId),
    chargesEnabled: Boolean(payload.charges_enabled ?? payload.chargesEnabled),
    payoutsEnabled: Boolean(payload.payouts_enabled ?? payload.payoutsEnabled),
    detailsSubmitted: Boolean(payload.details_submitted ?? payload.detailsSubmitted),
    completed: 'completed' in payload ? Boolean(payload.completed) : undefined
  };
}

export async function listPractices(config?: Pick<AxiosRequestConfig, 'signal'>): Promise<Practice[]> {
  const response = await apiClient.get('/api/practice/list', {
    signal: config?.signal
  });
  return unwrapPracticeListResponse(response.data);
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

export async function getOnboardingStatus(organizationId: string): Promise<OnboardingStatus> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  const response = await apiClient.get(`/api/onboarding/organization/${encodeURIComponent(organizationId)}/status`);
  return normalizeOnboardingStatus(response.data);
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

export async function completeOnboarding(organizationId: string): Promise<void> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  await apiClient.post('/api/onboarding/complete', { organizationId });
}

export async function syncSubscription(
  organizationId: string,
  options?: { headers?: Record<string, string> }
): Promise<SubscriptionSyncResponse> {
  if (!organizationId) {
    throw new Error('organizationId is required');
  }
  const response = await apiClient.post(
    '/api/subscription/sync',
    { organizationId },
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
