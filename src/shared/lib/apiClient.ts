import axios, { type AxiosRequestConfig } from 'axios';
import {
  getSubscriptionBillingPortalEndpoint,
  getSubscriptionCancelEndpoint,
  getSubscriptionListEndpoint,
  getConversationLinkEndpoint
} from '@/config/api';
import type { Conversation } from '@/shared/types/conversation';
import type { Address } from '@/shared/types/address';
import { getWorkerApiUrl } from '@/config/urls';
import {
  toMajorUnits,
  toMinorUnitsValue,
  assertMajorUnits,
  assertMinorUnits,
  type MajorAmount
} from '@/shared/utils/money';

let cachedBaseUrl: string | null = null;
let isHandling401: Promise<void> | null = null;
// In-flight deduplicator: prevents concurrent duplicate requests for the same slug.
const publicPracticeDetailsInFlight = new Map<string, Promise<PublicPracticeDetails | null>>();
// Persistent result cache: once a slug resolves, reuse the result for the entire session.
// This is the primary fix for the "Too Many Requests" issue — previously every caller
// (usePracticeConfig, usePracticeDetails, AwaitingInvitePage, forms.ts) would fire
// independent HTTP requests because the in-flight map was cleared after each request.
const publicPracticeDetailsCache = new Map<string, PublicPracticeDetails | null>();
const ABSOLUTE_URL_PATTERN = /^(https?:)?\/\//i;

/**
 * Clear the public practice details cache for a specific slug (or all slugs).
 * Call this on logout or when practice data is known to have changed.
 */
export const clearPublicPracticeDetailsCache = (slug?: string) => {
  if (slug) {
    publicPracticeDetailsCache.delete(slug.trim());
    publicPracticeDetailsInFlight.delete(slug.trim());
  } else {
    publicPracticeDetailsCache.clear();
    publicPracticeDetailsInFlight.clear();
  }
};

const normalizePublicFileUrl = (value?: string | null): string | null => {
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

// Create axios instance without default baseURL
// We'll set it dynamically in the interceptor to avoid stale base URLs.
export const apiClient = axios.create({
  // Don't set baseURL here - let interceptor handle it dynamically
});

apiClient.interceptors.request.use(
  (config) => {
    // Always get fresh baseURL in development.
    // Force override any cached baseURL to avoid stale endpoints.
    const baseUrl = ensureApiBaseUrl();
    // Always set baseURL fresh - don't rely on existing value
    if (config.baseURL !== baseUrl) {
      config.baseURL = baseUrl;
      if (import.meta.env.DEV) {
        console.log('[apiClient] Updated baseURL to:', baseUrl, 'for request:', config.url);
      }
    }

    // Use session cookies for auth; include credentials for cross-origin requests when allowed.
    config.withCredentials = true;

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
  introMessage?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;

  // Subscription and practice management properties
  kind?: 'personal' | 'business' | 'practice';
  subscriptionStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
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
  consultationFee?: MajorAmount;
  paymentUrl?: string;
  calendlyUrl?: string;
}

export interface PracticeDetailsUpdate {
  businessPhone?: string | null;
  businessEmail?: string | null;
  consultationFee?: MajorAmount | null;
  paymentLinkEnabled?: boolean | null;
  paymentLinkPrefillAmount?: MajorAmount | null;
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
  description?: string | null;
  isPublic?: boolean | null;
  services?: Array<Record<string, unknown>> | null;
}

export interface UpdatePracticeRequest extends Partial<CreatePracticeRequest>, PracticeDetailsUpdate {}

export interface PracticeDetails {
  id?: string;
  businessPhone?: string | null;
  businessEmail?: string | null;
  consultationFee?: MajorAmount | null;
  paymentLinkEnabled?: boolean | null;
  paymentLinkPrefillAmount?: MajorAmount | null;
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

  const response = await apiClient.patch(
    `${getConversationLinkEndpoint(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    payload
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
  config?: Pick<AxiosRequestConfig, 'signal'>
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

export async function listMatterConversations(
  practiceId: string,
  matterId: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<Conversation[]> {
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
    consultationFee: (() => {
      const rawFee = record.consultationFee ?? record.consultation_fee;
      if (typeof rawFee !== 'number') return null;
      assertMinorUnits(rawFee, 'practice.consultationFee');
      return toMajorUnits(Number(rawFee));
    })(),
    paymentUrl: toNullableString(record.paymentUrl ?? record.payment_url),
    calendlyUrl: toNullableString(record.calendlyUrl ?? record.calendly_url),
    createdAt: toNullableString(record.createdAt ?? record.created_at),
    updatedAt: toNullableString(record.updatedAt ?? record.updated_at),
    billingIncrementMinutes: (() => {
      const value = record.billingIncrementMinutes ?? record.billing_increment_minutes;
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
  if (scope === 'platform') {
    return [];
  }
  return practices;
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
): Promise<{ inviteUrl?: string; invitationId?: string } | null> {
  const response = await apiClient.post(
    `/api/practice/${encodeURIComponent(practiceId)}/invitations`,
    payload
  );
  const data = unwrapApiData(response.data);
  if (!isRecord(data)) {
    return null;
  }
  const inviteUrl = toNullableString(
    data.inviteUrl ??
    data.invite_url ??
    data.url ??
    (isRecord(data.invitation) ? (data.invitation as Record<string, unknown>).inviteUrl ?? (data.invitation as Record<string, unknown>).invite_url : null)
  );
  const invitationId = toNullableString(
    data.invitationId ??
    data.invitation_id ??
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

export async function triggerIntakeInvitation(intakeUuid: string): Promise<{ message?: string } | null> {
  if (!intakeUuid) {
    throw new Error('intakeUuid is required');
  }
  const response = await apiClient.post(
    `/api/practice/client-intakes/${encodeURIComponent(intakeUuid)}/invite`,
    {}
  );
  const data = unwrapApiData(response.data);
  if (!isRecord(data)) {
    return null;
  }
  const message = toNullableString(data.message);
  return message ? { message } : null;
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
    client_id?: string;
    signal?: AbortSignal;
  }
): Promise<UserDetailListResponse> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }
  const { signal, ...queryParams } = params ?? {};
  const response = await apiClient.get(
    `/api/user-details/${encodeURIComponent(practiceId)}`,
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
  userDetailId: string
): Promise<UserDetailRecord | null> {
  if (!practiceId || !userDetailId) {
    throw new Error('practiceId and userDetailId are required');
  }
  const response = await apiClient.get(
    `/api/user-details/${encodeURIComponent(practiceId)}`,
    { params: { client_id: userDetailId } }
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

export type CreateUserDetailPayload = {
  name: string;
  email: string;
  phone?: string;
  status?: UserDetailStatus;
  currency?: string;
  address?: Partial<Address>;
  event_name?: string;
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
): Promise<UserDetailRecord | null> {
  if (!practiceId) {
    throw new Error('practiceId is required');
  }

  const normalizedEmail = payload.email?.trim() || '';
  const normalizedName = payload.name?.trim() || '';

  if (!normalizedName || !normalizedEmail) {
    throw new Error('Name and email are required');
  }

  // Use Better Auth organization invitation instead of direct user-details creation.
  const { getClient } = await import('@/shared/lib/authClient');
  const authClient = getClient();

  try {
    if (import.meta.env.DEV) {
      console.info('[apiClient] inviteMember', {
        organizationId: practiceId,
        email: normalizedEmail,
        role: 'member'
      });
    }
    await authClient.organization.inviteMember({
      email: normalizedEmail,
      role: 'member',
      organizationId: practiceId,
    });
    return null;
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
    `/api/user-details/${encodeURIComponent(practiceId)}/update/${encodeURIComponent(userDetailId)}`,
    { ...rest, ...normalized }
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
    `/api/user-details/${encodeURIComponent(practiceId)}/delete/${encodeURIComponent(userDetailId)}`
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
    `/api/user-details/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos`
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
    `/api/user-details/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos`,
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
    `/api/user-details/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos/update/${encodeURIComponent(memoId)}`,
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
    `/api/user-details/${encodeURIComponent(practiceId)}/${encodeURIComponent(userDetailId)}/memos/delete/${encodeURIComponent(memoId)}`
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

export async function getPracticeDetailsBySlug(
  slug: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<PracticeDetails | null> {
  if (!slug) {
    throw new Error('practice slug is required');
  }
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    throw new Error('practice slug is required');
  }
  try {
    const response = await apiClient.get(
      `/api/practice/details/${encodeURIComponent(normalizedSlug)}`,
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
  name?: string | null;
  logo?: string | null;
}

export async function getPublicPracticeDetails(
  slug: string,
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<PublicPracticeDetails | null> {
  if (!slug) {
    throw new Error('practice slug is required');
  }
  const normalizedSlug = slug.trim();

  // 1. Return from persistent cache if already resolved (primary dedup across all callers).
  if (publicPracticeDetailsCache.has(normalizedSlug)) {
    return publicPracticeDetailsCache.get(normalizedSlug) ?? null;
  }

  // 2. Return in-flight promise if a request is already underway (concurrent dedup).
  const existing = publicPracticeDetailsInFlight.get(normalizedSlug);
  if (existing) {
    return existing;
  }

  const requestPromise = (async () => {
    try {
      const apiUrl = `${getWorkerApiUrl()}/api/practice/details/${encodeURIComponent(normalizedSlug)}`;
      if (import.meta.env.DEV) {
        console.log('[getPublicPracticeDetails] Making request to:', apiUrl);
      }

      const response = await axios.get(
        apiUrl,
        {
          signal: config?.signal,
          withCredentials: true
        }
      );
      const details = normalizePracticeDetailsResponse(response.data);
      const displayDetails = extractPublicPracticeDisplayDetails(response.data);
      const practiceId = extractPublicPracticeId(response.data);
      if (!details) {
        // Cache null so we don't keep retrying a practice that returned no details.
        publicPracticeDetailsCache.set(normalizedSlug, null);
        return null;
      }
      const result: PublicPracticeDetails = {
        practiceId: practiceId ?? undefined,
        slug: normalizedSlug,
        details,
        name: displayDetails.name,
        logo: displayDetails.logo
      };
      publicPracticeDetailsCache.set(normalizedSlug, result);
      return result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          // Cache null for 404 — the practice doesn't exist, no point retrying.
          publicPracticeDetailsCache.set(normalizedSlug, null);
          return null;
        }
      }
      // Do NOT cache transient errors (rate limit, network failure) so callers can retry.
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
  const normalized = normalizePracticeDetailsPayload(payload);

  if ('name' in payload && payload.name !== undefined) normalized.name = payload.name;
  if ('slug' in payload && payload.slug !== undefined) normalized.slug = payload.slug;
  if ('logo' in payload && payload.logo !== undefined) normalized.logo = payload.logo;
  if ('metadata' in payload && payload.metadata !== undefined) normalized.metadata = payload.metadata;

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
    const name = toNullableString(candidate.name ?? candidate.practiceName ?? candidate.practice_name);
    const rawLogo = toNullableString(candidate.logo ?? candidate.practiceLogo ?? candidate.practice_logo);
    const logo = normalizePublicFileUrl(rawLogo);
    if (name || logo) {
      return { name, logo };
    }
  }

  return {};
}

function extractPublicPracticeId(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const extractFromRecord = (value: Record<string, unknown>): string | null => {
    const direct = toNullableString(
      value.practiceId ??
      value.practice_id ??
      value.organizationId ??
      value.organization_id ??
      value.id
    );
    return direct ?? null;
  };

  const candidates: Record<string, unknown>[] = [];
  const pushCandidate = (value: unknown) => {
    if (isRecord(value)) {
      candidates.push(value);
    }
  };

  pushCandidate(payload);
  pushCandidate(payload.organization);
  pushCandidate(payload.practice);

  if ('details' in payload && isRecord(payload.details)) {
    pushCandidate(payload.details);
    pushCandidate(payload.details.data);
    pushCandidate(payload.details.organization);
    pushCandidate(payload.details.practice);
  }

  if ('data' in payload && isRecord(payload.data)) {
    pushCandidate(payload.data);
    pushCandidate(payload.data.details);
    pushCandidate(payload.data.organization);
    pushCandidate(payload.data.practice);
  }

  for (const candidate of candidates) {
    const id = extractFromRecord(candidate);
    if (id) {
      return id;
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
  if ('paymentLinkPrefillAmount' in payload && payload.paymentLinkPrefillAmount !== undefined) {
    if (payload.paymentLinkPrefillAmount === null) {
      normalized.payment_link_prefill_amount = null;
    } else if (typeof payload.paymentLinkPrefillAmount === 'number') {
      assertMajorUnits(payload.paymentLinkPrefillAmount, 'practice.paymentLinkPrefillAmount');
      normalized.payment_link_prefill_amount = toMinorUnitsValue(payload.paymentLinkPrefillAmount);
    }
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
  const introMessage = normalizeTextOrUndefined(payload.introMessage);
  if (introMessage !== undefined) normalized.intro_message = introMessage;
  const description = normalizeTextOrUndefined(payload.description);
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
          const rawId = toNullableString(service.id);
          const id = rawId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)
            ? rawId
            : null;
          const name = toNullableString(service.name ?? service.title);
          if (!name) {
            return null;
          }
          const description = toNullableString(service.description);
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
  if (!isRecord(payload)) {
    return null;
  }
  const hasMappedDetailKey = (value: Record<string, unknown>): boolean => ([
    'overview',
    'description',
    'intro_message',
    'introMessage',
    'business_phone',
    'businessPhone',
    'business_email',
    'businessEmail',
    'consultation_fee',
    'consultationFee',
    'payment_link_enabled',
    'paymentLinkEnabled',
    'payment_link_prefill_amount',
    'paymentLinkPrefillAmount',
    'billing_increment_minutes',
    'billingIncrementMinutes',
    'payment_url',
    'paymentUrl',
    'calendly_url',
    'calendlyUrl',
    'website',
    'is_public',
    'isPublic',
    'services',
    'address'
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
    id: getOptionalNullableString(container, ['id', 'uuid', 'practice_id', 'practiceId', 'organization_id', 'organizationId']),
    businessPhone: getOptionalNullableString(container, ['business_phone', 'businessPhone']),
    businessEmail: getOptionalNullableString(container, ['business_email', 'businessEmail']),
    consultationFee: (() => {
      if ('consultation_fee' in container || 'consultationFee' in container) {
        const value = container.consultation_fee ?? container.consultationFee;
        if (typeof value === 'number') {
          assertMinorUnits(value, 'practice.details.consultationFee');
          return toMajorUnits(value);
        }
        return null;
      }
      return undefined;
    })(),
    paymentLinkEnabled: (() => {
      if ('payment_link_enabled' in container || 'paymentLinkEnabled' in container) {
        const value = container.payment_link_enabled ?? container.paymentLinkEnabled;
        return typeof value === 'boolean' ? value : null;
      }
      return undefined;
    })(),
    paymentLinkPrefillAmount: (() => {
      if ('payment_link_prefill_amount' in container || 'paymentLinkPrefillAmount' in container) {
        const value = container.payment_link_prefill_amount ?? container.paymentLinkPrefillAmount;
        if (typeof value === 'number') {
          assertMinorUnits(value, 'practice.details.paymentLinkPrefillAmount');
          return toMajorUnits(value);
        }
        return null;
      }
      return undefined;
    })(),
    paymentUrl: getOptionalNullableString(container, ['payment_url', 'paymentUrl']),
    calendlyUrl: getOptionalNullableString(container, ['calendly_url', 'calendlyUrl']),
    billingIncrementMinutes: getOptionalNullableNumber(container, ['billing_increment_minutes', 'billingIncrementMinutes']),
    website: getOptionalNullableString(container, ['website']),
    introMessage: getOptionalNullableString(container, ['intro_message', 'introMessage']),
    description: getOptionalNullableString(container, ['overview', 'description']),
    isPublic: 'is_public' in container || 'isPublic' in container
      ? Boolean(container.is_public ?? container.isPublic)
      : undefined,
    services: 'services' in container
      ? (Array.isArray(container.services) ? (container.services as Array<Record<string, unknown>>) : null)
      : undefined,
    address: getOptionalNullableString(address, ['line1', 'address']) ?? getOptionalNullableString(container, ['address']),
    apartment: getOptionalNullableString(address, ['line2', 'apartment']) ?? getOptionalNullableString(container, ['apartment']),
    city: getOptionalNullableString(address, ['city']) ?? getOptionalNullableString(container, ['city']),
    state: getOptionalNullableString(address, ['state']) ?? getOptionalNullableString(container, ['state']),
    postalCode: getOptionalNullableString(address, ['postal_code', 'postalCode'])
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
    customerType: payload.customerType,
    returnUrl: payload.returnUrl
  });
}

export async function getCurrentSubscription(
  config?: Pick<AxiosRequestConfig, 'signal'>
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

  const plan = isRecord(container.plan)
    ? {
      id: toNullableString(container.plan.id),
      name: toNullableString(container.plan.name),
      displayName: toNullableString(container.plan.display_name),
      description: toNullableString(container.plan.description),
      stripeProductId: toNullableString(container.plan.stripe_product_id),
      stripeMonthlyPriceId: toNullableString(container.plan.stripe_monthly_price_id),
      stripeYearlyPriceId: toNullableString(container.plan.stripe_yearly_price_id),
      monthlyPrice: toNullableString(container.plan.monthly_price),
      yearlyPrice: toNullableString(container.plan.yearly_price),
      currency: toNullableString(container.plan.currency),
      features: Array.isArray(container.plan.features)
        ? container.plan.features.filter((feature): feature is string => typeof feature === 'string')
        : null,
      isActive: typeof container.plan.is_active === 'boolean' ? container.plan.is_active : null
    }
    : null;

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
