import type { Env, Practice, PracticeOrWorkspace, ConversationConfig, SubscriptionLifecycleStatus } from '../types.js';
import { HttpError } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { Logger } from '../utils/logger.js';

/**
 * Service for fetching practice and subscription data from the remote API.
 * 
 * @note Cache Limitation: The static caches (practiceCache, configCache, subscriptionCache)
 * are per-V8-isolate and do not persist across different Cloudflare Worker isolates.
 * Each isolate starts with an empty cache, so these caches provide warm-up optimization
 * within a single isolate's lifetime only. For cross-isolate consistency, consider
 * migrating to Workers KV or Durable Objects in the future if needed.
 */
export class RemoteApiService {
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  /** Per-isolate cache for practice data - resets when isolate is evicted */
  private static practiceCache = new Map<string, { data: PracticeOrWorkspace; timestamp: number }>();
  /** Per-isolate cache for conversation config - resets when isolate is evicted */
  private static configCache = new Map<string, { data: ConversationConfig; timestamp: number }>();
  /** Per-isolate cache for subscription status - resets when isolate is evicted */
  private static subscriptionCache = new Map<string, { status: SubscriptionLifecycleStatus; timestamp: number }>();

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
    }
  ): Promise<Response> {
    const baseUrl = this.getRemoteApiUrl(env);
    const url = `${baseUrl}${endpoint}`;
    
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    // Forward session cookies when available
    const cookie = this.getAuthCookie(request);
    if (cookie) {
      headers.set('Cookie', cookie);
    }
    const method = options?.method || 'GET';
    const body = options?.body;

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
        if (response.status === 404) {
          throw HttpErrors.notFound(`Practice not found: ${endpoint}`);
        }
        if (response.status === 401) {
          throw HttpErrors.unauthorized('Authentication required');
        }
        throw HttpErrors.internalServerError(`Remote API error: ${response.statusText}`);
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
    // Check cache first
    const cached = this.practiceCache.get(practiceId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Try by ID first
      let response: Response;
      try {
        response = await this.fetchFromRemoteApi(env, `/api/practice/${practiceId}`, request);
      } catch (error) {
        // If 404, try by slug
        if (error instanceof HttpError && error.status === 404) {
          try {
            response = await this.fetchFromRemoteApi(env, `/api/practice?slug=${encodeURIComponent(practiceId)}`, request);
          } catch (slugError) {
            // If slug lookup also fails with 404, return null
            if (slugError instanceof HttpError && slugError.status === 404) {
              return null;
            }
            throw slugError;
          }
        } else {
          throw error;
        }
      }

      const data = await response.json() as { data?: Practice; practice?: Practice };
      const practice = data.data || data.practice;

      if (!practice) {
        return null;
      }

      // Cache the result
      this.practiceCache.set(practiceId, { data: practice, timestamp: Date.now() });
      
      return practice;
    } catch (error) {
      // Distinguish between 404 (not found) and other errors (API down, network failures)
      if (error instanceof HttpError && error.status === 404) {
        // Practice genuinely not found
        Logger.debug('Practice not found in remote API', { practiceId });
        return null;
      }
      
      // Re-throw connectivity/server errors (including 401) instead of swallowing them
      Logger.error('Failed to fetch practice from remote API', {
        practiceId,
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof HttpError ? error.status : undefined,
      });
      throw error;
    }
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
    // Check cache first
    const cached = this.configCache.get(practiceId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const practice = await this.getPractice(env, practiceId, request);
    if (!practice) {
      return null;
    }

    // Extract conversation config from practice.metadata.conversationConfig
    const conversationConfig = this.extractConversationConfig(practice.metadata);
    
    // Cache the config
    this.configCache.set(practiceId, { data: conversationConfig, timestamp: Date.now() });
    
    return conversationConfig;
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
      request
    );
  }

  /**
   * Get practice members from remote API
   */
  static async getPracticeMembers(
    env: Env,
    practiceId: string,
    request?: Request
  ): Promise<Array<{ user_id: string; email?: string | null; role?: string | null }>> {
    const response = await this.fetchFromRemoteApi(env, `/api/practice/${practiceId}/members`, request);
    const data = await response.json() as { members?: Array<{ user_id: string; email?: string | null; role?: string | null }> };

    if (!Array.isArray(data.members)) {
      return [];
    }

    return data.members;
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
    const requiredStringArray = (value: unknown): string[] => {
      if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new Error('Expected array of strings');
      }
      return value;
    };

    const requiredRecord = (value: unknown): Record<string, string[]> => {
      if (!value || typeof value !== 'object') {
        throw new Error('Expected record');
      }
      const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
        return [key, requiredStringArray(entryValue)];
      });
      return Object.fromEntries(entries);
    };

    const voiceValue = config.voice;
    if (voiceValue && typeof voiceValue !== 'object') {
      throw new Error('voice must be an object');
    }

    const voiceObj = voiceValue && typeof voiceValue === 'object' ? (voiceValue as Record<string, unknown>) : {};
    const voice: ConversationConfig['voice'] = {
      enabled: Boolean(voiceObj.enabled),
      provider: (typeof voiceObj.provider === 'string' && ['cloudflare', 'elevenlabs', 'custom'].includes(voiceObj.provider)
        ? voiceObj.provider
        : 'cloudflare') as ConversationConfig['voice']['provider'],
      voiceId: typeof voiceObj.voiceId === 'string' ? voiceObj.voiceId : undefined,
      displayName: typeof voiceObj.displayName === 'string' ? voiceObj.displayName : undefined,
      previewUrl: typeof voiceObj.previewUrl === 'string' ? voiceObj.previewUrl : undefined
    };

    return {
      ownerEmail: typeof config.ownerEmail === 'string' ? config.ownerEmail : undefined,
      availableServices: requiredStringArray(config.availableServices ?? []),
      serviceQuestions: requiredRecord(config.serviceQuestions ?? {}),
      domain: typeof config.domain === 'string' ? config.domain : '',
      description: typeof config.description === 'string' ? config.description : '',
      brandColor: typeof config.brandColor === 'string' ? config.brandColor : '#000000',
      accentColor: typeof config.accentColor === 'string' ? config.accentColor : '#000000',
      introMessage: typeof config.introMessage === 'string' ? config.introMessage : '',
      profileImage: typeof config.profileImage === 'string' ? config.profileImage : undefined,
      voice,
      blawbyApi: (() => {
        if (typeof config.blawbyApi !== 'object' || config.blawbyApi === null) {
          return undefined;
        }
        const apiObj = config.blawbyApi as Record<string, unknown>;
        const result: ConversationConfig['blawbyApi'] = {
          enabled: Boolean(apiObj.enabled),
        };
        if (typeof apiObj.apiKeyHash === 'string') {
          result.apiKeyHash = apiObj.apiKeyHash;
        }
        if (typeof apiObj.apiUrl === 'string') {
          result.apiUrl = apiObj.apiUrl;
        }
        return result;
      })(),
      testMode: typeof config.testMode === 'boolean' ? config.testMode : undefined,
      metadata: typeof config.metadata === 'object' && config.metadata !== null ? config.metadata as Record<string, unknown> : undefined,
      betterAuthOrgId: typeof config.betterAuthOrgId === 'string' ? config.betterAuthOrgId : undefined,
      tools: typeof config.tools === 'object' && config.tools !== null ? config.tools as ConversationConfig['tools'] : undefined,
      agentMember: typeof config.agentMember === 'object' && config.agentMember !== null ? config.agentMember as ConversationConfig['agentMember'] : undefined,
      isPublic: typeof config.isPublic === 'boolean' ? config.isPublic : undefined
    };
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

    this.configCache.delete(practiceId);
    this.practiceCache.delete(practiceId);

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
    // Check cache first
    const cached = this.subscriptionCache.get(practiceId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.status;
    }

    const practice = await this.getPractice(env, practiceId, request);
    if (!practice) {
      return 'none';
    }

    const status = practice.subscriptionStatus || 'none';
    
    // Cache the status
    this.subscriptionCache.set(practiceId, { status, timestamp: Date.now() });
    
    return status;
  }

  /**
   * Get practice metadata (tier, kind, subscription status) for usage/quota purposes
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
    tier: 'free' | 'plus' | 'business' | 'enterprise';
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
      tier: practice.subscriptionTier || 'free',
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

        if (payload && (payload.practice || payload.data)) {
          return true;
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
        if (error instanceof HttpError && error.status === 404) {
          return false;
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
        `/api/practice/client-intakes/${encodeURIComponent(intakeUuid)}/status`,
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

      return {
        uuid: typeof data.uuid === 'string' ? data.uuid : undefined,
        amount: typeof data.amount === 'number' ? data.amount : undefined,
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

  static async getPracticeClientIntakeSettings(
    env: Env,
    practiceSlug: string,
    request?: Request
  ): Promise<{
    paymentLinkEnabled?: boolean;
    prefillAmount?: number;
    organization?: {
      name?: string;
      logo?: string;
    };
  } | null> {
    if (!practiceSlug) return null;
    try {
      const response = await this.fetchFromRemoteApi(
        env,
        `/api/practice/client-intakes/${encodeURIComponent(practiceSlug)}/intake`,
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
      const settings = data.settings;
      if (!settings || typeof settings !== 'object') {
        return null;
      }
      const settingsRecord = settings as Record<string, unknown>;
      const orgRecord = data.organization && typeof data.organization === 'object'
        ? data.organization as Record<string, unknown>
        : null;
      return {
        paymentLinkEnabled: typeof settingsRecord.paymentLinkEnabled === 'boolean'
          ? settingsRecord.paymentLinkEnabled as boolean
          : typeof settingsRecord.payment_link_enabled === 'boolean'
            ? settingsRecord.payment_link_enabled as boolean
          : undefined,
        prefillAmount: typeof settingsRecord.prefillAmount === 'number'
          ? settingsRecord.prefillAmount as number
          : typeof settingsRecord.prefill_amount === 'number'
            ? settingsRecord.prefill_amount as number
          : undefined,
        organization: orgRecord
          ? {
              name: typeof orgRecord.name === 'string' ? orgRecord.name : undefined,
              logo: typeof orgRecord.logo === 'string' ? orgRecord.logo : undefined
            }
          : undefined
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
      this.practiceCache.delete(practiceId);
      this.configCache.delete(practiceId);
      this.subscriptionCache.delete(practiceId);
    } else {
      this.practiceCache.clear();
      this.configCache.clear();
      this.subscriptionCache.clear();
    }
  }
}
