import type { Env, Practice, PracticeOrWorkspace, ConversationConfig, SubscriptionLifecycleStatus } from '../types.js';
import { HttpError } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { Logger } from '../utils/logger.js';
import { warnIfNotMinorUnits } from '../utils/money.js';
import { edgeCache } from '../utils/edgeCache.js';
import { redactSensitiveFields } from '../utils/redactResponse.js';
import { policyTtlMs } from '../utils/cachePolicy.js';
import { validateWire } from '../utils/validateWire.js';
import { PracticeSchema, ConversationConfigPermissiveSchema } from '../types/wire/practice.js';
import {
  BackendIntakeConvertResponseSchema,
  BackendPracticeIntakeSettingsResponseSchema,
} from '../types/wire/intake.js';
import { canAssignTeamMemberToMatter, isTeamRole, type PracticeTeamResponse } from '../../src/shared/types/team.js';

/**
 * Service for fetching practice and subscription data from the remote API.
 *
 * Caching is delegated to `worker/utils/edgeCache.ts` (per-isolate Map +
 * in-flight dedup + LRU). Per-isolate scope is inherent — Cloudflare may
 * evict isolates at any time, so cold isolates refetch once. For
 * cross-isolate consistency, layer KV behind specific keys at call sites
 * (see `practiceDetailsCache.ts`).
 */
export class RemoteApiService {
  private static readonly DEFAULT_SEAT_COUNT = 1;

  /**
   * Get the base URL for the remote API
   */
  private static getRemoteApiUrl(env: Env): string {
    if (!env.BACKEND_API_URL) {
      throw new Error('BACKEND_API_URL is required');
    }
    return env.BACKEND_API_URL;
  }

  private static isLikelyUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  /**
   * Get authentication cookie from request headers
   */
  private static getAuthCookie(request?: Request): string | null {
    if (!request) return null;
    const cookieHeader = request.headers.get('Cookie');
    return cookieHeader && cookieHeader.trim() ? cookieHeader : null;
  }

  private static getAuthorizationHeader(request?: Request): string | null {
    if (!request) return null;
    const authHeader = request.headers.get('Authorization');
    return authHeader && authHeader.trim() ? authHeader.trim() : null;
  }


  /**
   * Fetch data from remote API with error handling
   */
  private static async fetchFromRemoteApi(
    env: Env,
    endpoint: string,
    request?: Request,
    options?: {
      method?: string;
      body?: string;
      forwardAuthCookie?: boolean;
    }
  ): Promise<Response> {
    const baseUrl = this.getRemoteApiUrl(env);
    const url = `${baseUrl}${endpoint}`;
    const shouldDebugIntakeEndpoint = endpoint.includes('/api/practice-client-intakes/');
    
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    // Forward session cookies when available unless explicitly disabled.
    if (options?.forwardAuthCookie !== false) {
      const cookie = this.getAuthCookie(request);
      if (cookie) {
        headers.set('Cookie', cookie);
      }
    }
    const method = options?.method || 'GET';
    const body = options?.body;

    if (shouldDebugIntakeEndpoint) {
      Logger.info('[RemoteApiService] Upstream request', {
        endpoint,
        method,
        forwardAuthCookie: options?.forwardAuthCookie !== false,
        hasCookieHeader: headers.has('Cookie'),
        hasAuthorizationHeader: Boolean(this.getAuthorizationHeader(request)),
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
        let parsedBody: unknown = null;
        let rawBody = '';
        try {
          rawBody = await response.text();
          if (rawBody.trim()) {
            parsedBody = JSON.parse(rawBody);
          }
        } catch {
          parsedBody = rawBody || null;
        }

        const parsedRecord = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
          ? parsedBody as Record<string, unknown>
          : null;
        const upstreamMessage =
          (parsedRecord && typeof parsedRecord.error === 'string' && parsedRecord.error.trim()) ||
          (parsedRecord && typeof parsedRecord.message === 'string' && parsedRecord.message.trim()) ||
          '';
        const message = upstreamMessage || `Remote API error: ${response.statusText}`;

        if (shouldDebugIntakeEndpoint) {
          let upstreamBodyPreview: string | null = null;
          if (rawBody) {
            try {
              const parsedPreview = JSON.parse(rawBody);
              upstreamBodyPreview = JSON.stringify(redactSensitiveFields(parsedPreview)).slice(0, 500);
            } catch {
              upstreamBodyPreview = '[non-json body omitted]';
            }
          }
          Logger.warn('[RemoteApiService] Upstream request failed', {
            endpoint,
            method,
            status: response.status,
            statusText: response.statusText,
            hasCookieHeader: headers.has('Cookie'),
            hasAuthorizationHeader: Boolean(this.getAuthorizationHeader(request)),
            upstreamMessage: upstreamMessage || null,
            upstreamBodyPreview,
          });
        }

        if (response.status === 404) {
          throw HttpErrors.notFound(message, { endpoint, upstream: parsedBody });
        }
        if (response.status === 401) {
          throw HttpErrors.unauthorized(message, { endpoint, upstream: parsedBody });
        }
        if (response.status === 400) {
          throw HttpErrors.badRequest(message, { endpoint, upstream: parsedBody });
        }
        if (response.status === 402) {
          throw HttpErrors.paymentRequired(message, { endpoint, upstream: parsedBody });
        }
        if (response.status === 403) {
          throw HttpErrors.forbidden(message, { endpoint, upstream: parsedBody });
        }
        if (response.status === 409) {
          throw HttpErrors.conflict(message, { endpoint, upstream: parsedBody });
        }
        if (response.status === 422) {
          throw HttpErrors.unprocessableEntity(message, { endpoint, upstream: parsedBody });
        }
        if (response.status === 429) {
          throw HttpErrors.tooManyRequests(message, { endpoint, upstream: parsedBody });
        }
        throw new HttpError(response.status, message, { endpoint, upstream: parsedBody });
      }

      return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw HttpErrors.gatewayTimeout('Request timeout: Remote API did not respond within 10 seconds');
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        throw error;
      }
      Logger.error('Failed to fetch from remote API', {
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
      throw HttpErrors.internalServerError('Failed to fetch data from remote API');
    }
  }

  /**
   * Get practice by ID or slug from remote API
   */
  static async getPractice(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<PracticeOrWorkspace | null> {
    const cacheKey = `practice:${practiceId}`;
    return edgeCache.get_or_fetch<PracticeOrWorkspace | null>(
      cacheKey,
      async () => {
        try {
          let response: Response;
          try {
            response = await this.fetchFromRemoteApi(env, `/api/practice/${practiceId}`, request);
          } catch (error) {
            if (error instanceof HttpError && error.status === 404) {
              try {
                response = await this.fetchFromRemoteApi(env, `/api/practice?slug=${encodeURIComponent(practiceId)}`, request);
              } catch (slugError) {
                if (slugError instanceof HttpError && slugError.status === 404) return null;
                throw slugError;
              }
            } else {
              throw error;
            }
          }

          const json = await response.json() as unknown;
          const candidate = (() => {
            if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
            const record = json as Record<string, unknown>;
            if (record.data && typeof record.data === 'object') return record.data;
            if (record.practice && typeof record.practice === 'object') return record.practice;
            if ('id' in record) return record;
            return null;
          })();
          if (!candidate) return null;
          // Validate the wire shape — strict in dev (catches drift), loose
          // in prod (logs + returns the raw value to avoid availability impact).
          return validateWire(PracticeSchema, candidate, 'getPractice', { strict: false });
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) {
            Logger.debug('Practice not found in remote API', { practiceId });
            return null;
          }
          Logger.error('Failed to fetch practice from remote API', {
            practiceId,
            error: error instanceof Error ? error.message : String(error),
            status: error instanceof HttpError ? error.status : undefined,
          });
          throw error;
        }
      },
      { ttlMs: policyTtlMs(cacheKey) },
    );
  }

  /**
   * Get practice details by ID from remote API
   */
  static async getPracticeDetailsById(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<Response> {
    return this.fetchFromRemoteApi(env, `/api/practice/${encodeURIComponent(practiceId)}/details`, request);
  }

  /**
   * Get conversation config from remote API
   * Extracts conversation config from practice.metadata.conversationConfig
   */
  static async getPracticeConfig(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<ConversationConfig | null> {
    const cacheKey = `practice:config:${practiceId}`;
    return edgeCache.get_or_fetch<ConversationConfig | null>(
      cacheKey,
      async () => {
        const practice = await this.getPractice(env, practiceId, request);
        if (!practice) return null;
        return this.extractConversationConfig(practice.metadata);
      },
      { ttlMs: policyTtlMs(cacheKey) },
    );
  }

  /**
   * Fetch public practice details by slug.
   */
  static async getPublicPracticeDetails(
    env: Env,
    slug: string,
    request?: Request
  ): Promise<Response> {
    return this.fetchFromRemoteApi(
      env,
      `/api/practice/details/${encodeURIComponent(slug)}`,
      request,
      // This is a public, unauthenticated endpoint. Never forward session cookies —
      // the backend may 500 if it sees an org-scoped cookie on a public slug lookup.
      { forwardAuthCookie: false }
    );
  }

  /**
   * Get practice members from remote API
   */
  static async getPracticeMembers(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<Array<{ user_id: string; email?: string | null; role?: string | null; name?: string | null; image?: string | null }>> {
    return this.getOrganizationMembers(env, practiceId, request);
  }

  static async getPracticeTeam(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<PracticeTeamResponse> {
    const practice = await this.getPracticeMembershipData(env, practiceId, request);
    const members = practice.members
      .filter((member): member is typeof practice.members[number] & {
        role: import('../../src/shared/types/team.js').TeamRole;
      } => (
        isTeamRole(member.role)
        && typeof member.user_id === 'string'
        && member.user_id.trim().length > 0
      ))
      .map((member) => ({
        userId: member.user_id,
        email: member.email ?? '',
        name: member.name ?? undefined,
        image: member.image ?? null,
        role: member.role,
        createdAt: member.created_at,
        canAssignToMatter: canAssignTeamMemberToMatter(member.role),
        canMentionInternally: true,
      }));

    return {
      members,
      summary: {
        seatsIncluded: this.normalizeSeats(practice.seats),
        seatsUsed: members.length,
      },
    };
  }

  private static normalizeSeats(seats?: number | null): number {
    const seatsValue = seats ?? 0;
    return Number.isFinite(seatsValue) && seatsValue > 0
      ? seatsValue
      : this.DEFAULT_SEAT_COUNT;
  }

  private static async getPracticeMembershipData(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<{
    seats: number | null;
    members: Array<{
      user_id: string;
      email?: string | null;
      role: string | null;
      name?: string | null;
      image?: string | null;
      created_at: number | null;
    }>;
  }> {
    type PracticePayload = {
      practice?: { seats?: number | null };
      data?: {
        seats?: number | null;
        practice?: { seats?: number | null };
      };
      seats?: number | null;
    };
    const [practiceResponse, members] = await Promise.all([
      this.fetchFromRemoteApi(env, `/api/practice/${practiceId}`, request),
      this.getOrganizationMembers(env, practiceId, request)
    ]);

    const practiceData = await practiceResponse.json() as PracticePayload;

    const practiceRecord =
      practiceData.practice ??
      practiceData.data?.practice ??
      practiceData.data ??
      practiceData;

    const seatsValue = typeof practiceRecord.seats === 'number'
      ? practiceRecord.seats
      : typeof practiceData.data?.seats === 'number'
        ? practiceData.data.seats
        : (typeof practiceData.seats === 'number' ? practiceData.seats : null);

    return {
      seats: seatsValue,
      members,
    };
  }

  private static async getOrganizationMembers(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<Array<{
    user_id: string;
    email?: string | null;
    role: string | null;
    name?: string | null;
    image?: string | null;
    created_at: number | null;
  }>> {
    type OrganizationMemberPayload = {
      id?: string;
      userId?: string;
      user_id?: string;
      role?: string | null;
      createdAt?: string | number | null;
      created_at?: string | number | null;
      user?: {
        id?: string;
        email?: string | null;
        name?: string | null;
        image?: string | null;
      };
    };

    const membersResponse = await this.fetchFromRemoteApi(
      env,
      `/api/auth/organization/list-members?organizationId=${encodeURIComponent(practiceId)}`,
      request
    );
    const membersData = await membersResponse.json() as {
      members?: OrganizationMemberPayload[];
    };
    const members = Array.isArray(membersData.members) ? membersData.members : [];

    return members
      .filter((member): member is OrganizationMemberPayload => (
        typeof member.userId === 'string'
        || typeof member.user_id === 'string'
        || typeof member.user?.id === 'string'
      ))
      .map((member) => ({
        user_id: (
          typeof member.userId === 'string'
            ? member.userId
            : typeof member.user_id === 'string'
              ? member.user_id
              : member.user?.id
        ) as string,
        email: typeof member.user?.email === 'string' ? member.user.email : undefined,
        role: typeof member.role === 'string' ? member.role : null,
        name: typeof member.user?.name === 'string' ? member.user.name : undefined,
        image: typeof member.user?.image === 'string' ? member.user.image : undefined,
        created_at: this.normalizeMembershipTimestamp(
          member.createdAt ??
          member.created_at
        ),
      }));
  }

  private static normalizeMembershipTimestamp(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        return numericValue;
      }
      const parsedDate = Date.parse(value);
      if (Number.isFinite(parsedDate)) {
        return parsedDate;
      }
    }
    return null;
  }

  /**
   * Get notification preferences for the authenticated user.
   */
  static async getNotificationPreferences(
    env: Env,
    request?: Request
  ): Promise<Record<string, unknown> | null> {
    if (!request) return null;
    const response = await this.fetchFromRemoteApi(env, '/api/preferences', request);
    const payload = await response.json() as { data?: { notifications?: Record<string, unknown> | null } };
    return payload.data?.notifications ?? null;
  }

  /**
   * Get notification preferences for practice members (admin endpoint).
   * Falls back to empty map if the endpoint is not yet available.
   */
  static async getPracticeMemberNotificationPreferences(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<Record<string, Record<string, unknown>>> {
    if (!request) return {};

    try {
      const response = await this.fetchFromRemoteApi(env, `/api/practice/${practiceId}/members/preferences`, request);
      const payload = await response.json() as {
        members?: Array<{ user_id?: string; notifications?: Record<string, unknown>; preferences?: { notifications?: Record<string, unknown> } }>;
        preferences?: Record<string, Record<string, unknown>>;
      };

      if (payload.preferences && typeof payload.preferences === 'object') {
        return payload.preferences;
      }

      if (Array.isArray(payload.members)) {
        return payload.members.reduce<Record<string, Record<string, unknown>>>((acc, member) => {
          if (!member.user_id) return acc;
          const notifications = member.notifications ?? member.preferences?.notifications;
          if (notifications && typeof notifications === 'object') {
            acc[member.user_id] = notifications;
          }
          return acc;
        }, {});
      }

      return {};
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return {};
      }
      throw error;
    }
  }

  /**
   * Extract conversation config from practice.metadata.conversationConfig
   * Returns null if not found
   */
  private static extractConversationConfig(metadata?: Record<string, unknown>): ConversationConfig | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const rawConfig = metadata.conversationConfig;
    if (!rawConfig || typeof rawConfig !== 'object') {
      return null;
    }

    try {
      return this.validateConversationConfig(rawConfig as Record<string, unknown>);
    } catch (error) {
      Logger.warn('Invalid conversation config received from remote API', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private static validateConversationConfig(config: Record<string, unknown>): ConversationConfig {
    // Tolerant Zod parse — schema's `.default()` + `.catch()` chains
    // preserve the original "fall back on missing/invalid" semantics
    // (defaults to '', '#000000', 'cloudflare' provider, etc.). The
    // strict ConversationConfigSchema is used elsewhere; this permissive
    // variant exists for upstream payloads of unknown quality.
    return ConversationConfigPermissiveSchema.parse(config) as ConversationConfig;
  }

  /**
   * Update conversation config in remote API
   * Updates practice.metadata.conversationConfig via PUT request
   */
  static async updatePracticeConfig(
    env: Env,
    practiceId: string,
    config: ConversationConfig,
    request?: Request
  ): Promise<boolean> {
    const practice = await this.getPractice(env, practiceId, request);
    if (!practice) {
      return false;
    }

    const updatedMetadata = {
      ...practice.metadata,
      conversationConfig: config
    };

    await this.fetchFromRemoteApi(
      env,
      `/api/practice/${practiceId}`,
      request,
      {
        method: 'PUT',
        body: JSON.stringify({ metadata: updatedMetadata })
      }
    );

    edgeCache.invalidate(`practice:config:${practiceId}`);
    edgeCache.invalidate(`practice:${practiceId}`);

    return true;
  }

  /**
   * Get subscription status for a practice from remote API
   */
  static async getSubscriptionStatus(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<SubscriptionLifecycleStatus> {
    const cacheKey = `subscription:status:${practiceId}`;
    return edgeCache.get_or_fetch<SubscriptionLifecycleStatus>(
      cacheKey,
      async () => {
        const practice = await this.getPractice(env, practiceId, request);
        if (!practice) return 'none';
        return practice.subscriptionStatus || 'none';
      },
      { ttlMs: policyTtlMs(cacheKey) },
    );
  }

  /**
   * Get practice metadata (kind and subscription status) for usage/quota purposes
   *
   * @throws {HttpError} If practice is not found or remote API is unavailable
   * @throws {Error} If practice data is invalid
   */
  static async getPracticeMetadata(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<{
    id: string;
    slug: string | null;
    kind: 'practice' | 'workspace';
    subscriptionStatus: SubscriptionLifecycleStatus;
  }> {
    const practice = await this.getPractice(env, practiceId, request);
    
    if (!practice) {
      // Throw error instead of returning defaults to prevent unauthorized access during API outages
      throw HttpErrors.notFound(`Practice not found: ${practiceId}`);
    }

    return {
      id: practice.id,
      slug: practice.slug || null,
      kind: practice.kind,
      subscriptionStatus: practice.subscriptionStatus || 'none',
    };
  }

  /**
   * Validate that a practice exists
   */
  static async validatePractice(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<boolean> {
    if (this.isLikelyUuid(practiceId)) {
      try {
        const response = await this.fetchFromRemoteApi(env, `/api/practice/${practiceId}`, request);
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;

        if (payload && typeof payload === 'object') {
          if ('practice' in payload || 'data' in payload) {
            return true;
          }
          if (typeof payload.id === 'string' || typeof payload.slug === 'string' || typeof payload.practice_id === 'string') {
            return true;
          }
        }

        const errorMessage =
          typeof payload?.error === 'string'
            ? payload.error
            : typeof payload?.message === 'string'
              ? payload.message
              : '';
        if (errorMessage.toLowerCase().includes('not a member')) {
          return true;
        }

        return false;
      } catch (error) {
        if (error instanceof HttpError) {
          if (error.status === 404) {
            return false;
          }
          if (error.status === 401 || error.status === 403) {
            // Public/widget flows may not have an authenticated backend session.
            // Treat authorization failures as "exists" so anonymous validations don't block.
            return true;
          }
        }
        throw error;
      }
    }

    try {
      await this.fetchFromRemoteApi(
        env,
        `/api/practice/details/${encodeURIComponent(practiceId)}`,
        request
      );
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create a client intake in the remote API.
   */
  static async createIntake(
    env: Env,
    payload: Record<string, unknown>,
    request?: Request
  ): Promise<Response> {
    const endpoint = '/api/practice-client-intakes/create';
    const payloadKeys = Object.keys(payload);
    Logger.info('[RemoteApiService] createIntake outbound payload', {
      endpoint,
      payloadKeys,
    });
    try {
      return await this.fetchFromRemoteApi(
        env,
        endpoint,
        request,
        {
          method: 'POST',
          body: JSON.stringify(payload),
          // Public slug-based intake create endpoint. Pass the resolved visitor
          // identity in the payload and avoid org-scoped session cookies.
          forwardAuthCookie: false,
        }
      );
    } catch (error) {
      const status = typeof (error as { status?: unknown })?.status === 'number'
        ? (error as { status: number }).status
        : null;
      const context = typeof (error as { context?: unknown })?.context === 'object'
        ? (error as { context: Record<string, unknown> }).context
        : null;
      const upstream = context && typeof context.upstream === 'object'
        ? redactSensitiveFields(context.upstream)
        : null;
      Logger.error('[RemoteApiService] createIntake failed', {
        endpoint,
        status,
        payloadKeys,
        upstream,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convert a paid intake into a matter in the remote API.
   */
  static async convertIntake(
    env: Env,
    intakeUuid: string,
    payload: {
      responsible_attorney_id?: string;
      billing_type?: string;
      description?: string;
    },
    request?: Request
  ): Promise<{
    matter_id: string;
    matter_status?: string;
    conversation_id?: string;
    invite_sent?: boolean;
  }> {
    const response = await this.fetchFromRemoteApi(
      env,
      `/api/practice-client-intakes/${encodeURIComponent(intakeUuid)}/convert`,
      request,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );

    const json = await response.json().catch(() => null);
    if (!json) {
      throw HttpErrors.badGateway('Invalid convert intake response from remote API');
    }
    const parsed = validateWire(
      BackendIntakeConvertResponseSchema,
      json,
      'convertIntake.response',
      { strict: false },
    );
    if (parsed.success !== true || !parsed.data?.matter_id) {
      throw HttpErrors.badGateway('Remote API convert response missing matter_id');
    }
    return {
      matter_id: parsed.data.matter_id,
      matter_status: parsed.data.matter_status,
      conversation_id: parsed.data.conversation_id,
      invite_sent: parsed.data.invite_sent,
    };
  }

  static async getPracticeClientIntakeStatus(
    env: Env,
    intakeUuid: string,
    request?: Request
  ): Promise<{
    uuid?: string;
    amount?: number;
    currency?: string;
    status?: string;
    metadata?: Record<string, unknown> | null;
    succeeded_at?: string | null;
    created_at?: string | null;
  } | null> {
    if (!intakeUuid) return null;
    try {
      const response = await this.fetchFromRemoteApi(
        env,
        `/api/practice-client-intakes/${encodeURIComponent(intakeUuid)}/status`,
        request
      );

      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!payload || typeof payload !== 'object') {
        return null;
      }
      if (payload.success === false) {
        return null;
      }
      const data = (payload.data && typeof payload.data === 'object')
        ? payload.data as Record<string, unknown>
        : payload;

      const amount = typeof data.amount === 'number' ? data.amount : undefined;
      warnIfNotMinorUnits(amount, 'remote.intakeStatus.amount');
      return {
        uuid: typeof data.uuid === 'string' ? data.uuid : undefined,
        amount,
        currency: typeof data.currency === 'string' ? data.currency : undefined,
        status: typeof data.status === 'string' ? data.status : undefined,
        metadata: typeof data.metadata === 'object' && data.metadata !== null
          ? data.metadata as Record<string, unknown>
          : null,
        succeeded_at: typeof data.succeeded_at === 'string'
          ? data.succeeded_at
          : typeof data.succeededAt === 'string'
            ? data.succeededAt
            : null,
        created_at: typeof data.created_at === 'string'
          ? data.created_at
          : typeof data.createdAt === 'string'
            ? data.createdAt
            : null
      };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 401)) {
        return null;
      }
      throw error;
    }
  }

  static async triggerPracticeClientIntakeInvite(
    env: Env,
    intakeUuid: string,
    request?: Request
  ): Promise<{ success: boolean; message?: string }> {
    if (!intakeUuid) {
      return { success: false };
    }

    try {
      const response = await this.fetchFromRemoteApi(
        env,
        `/api/practice-client-intakes/${encodeURIComponent(intakeUuid)}/invite`,
        request,
        {
          method: 'POST',
          body: JSON.stringify({})
        }
      );

      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        message?: string;
      } | null;

      if (payload && typeof payload === 'object') {
        return {
          success: payload.success !== false,
          message: typeof payload.message === 'string' ? payload.message : undefined
        };
      }

      return { success: true };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
        return { success: false };
      }
      throw error;
    }
  }

  static async getPracticeClientIntakeSettings(
    env: Env,
    practiceSlug: string,
    request?: Request
  ): Promise<{
    paymentLinkEnabled?: boolean;
    consultationFee?: number;
    organization?: {
      id?: string;
      slug?: string;
      name?: string;
      logo?: string;
    };
  } | null> {
    if (!practiceSlug) return null;
    try {
      const response = await this.fetchFromRemoteApi(
        env,
        `/api/practice-client-intakes/${encodeURIComponent(practiceSlug)}/intake`,
        request
      );
      const json = await response.json().catch(() => null);
      if (!json) return null;
      const parsed = validateWire(
        BackendPracticeIntakeSettingsResponseSchema,
        json,
        'getPracticeClientIntakeSettings.response',
        { strict: false },
      );
      if (parsed.success === false) return null;

      // Tolerate both nested ({data: {settings, organization}}) and flat shapes.
      const settings = parsed.data?.settings ?? parsed.settings;
      if (!settings) return null;
      const orgRecord = parsed.data?.organization ?? parsed.organization;

      const consultationFee = settings.consultationFee ?? settings.consultation_fee;
      warnIfNotMinorUnits(consultationFee, 'remote.intakeSettings.consultationFee');
      return {
        paymentLinkEnabled: settings.paymentLinkEnabled ?? settings.payment_link_enabled,
        consultationFee,
        organization: orgRecord
          ? {
              id: orgRecord.id,
              slug: orgRecord.slug,
              name: orgRecord.name,
              logo: orgRecord.logo,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 401)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Clear cache for a specific practice or all practices
   */
  static clearCache(practiceId?: string): void {
    if (practiceId) {
      edgeCache.invalidate(`practice:${practiceId}`);
      edgeCache.invalidate(`practice:config:${practiceId}`);
      edgeCache.invalidate(`subscription:status:${practiceId}`);
    } else {
      edgeCache.invalidate('practice:', /* prefix */ true);
      edgeCache.invalidate('subscription:', /* prefix */ true);
    }
  }
}
