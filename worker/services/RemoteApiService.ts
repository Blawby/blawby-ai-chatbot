import type { Env, Organization, OrganizationConfig, SubscriptionLifecycleStatus, OrganizationKind } from '../types.js';
import { HttpError } from '../types.js';
import { Logger } from '../utils/logger.js';
import { HttpErrors } from '../errorHandler.js';

/**
 * Service for fetching organization and subscription data from the remote API
 * (staging-api.blawby.com)
 * 
 * @note Cache Limitation: The static caches (orgCache, configCache, subscriptionCache)
 * are per-V8-isolate and do not persist across different Cloudflare Worker isolates.
 * Each isolate starts with an empty cache, so these caches provide warm-up optimization
 * within a single isolate's lifetime only. For cross-isolate consistency, consider
 * migrating to Workers KV or Durable Objects in the future if needed.
 */
export class RemoteApiService {
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  /** Per-isolate cache for organization data - resets when isolate is evicted */
  private static orgCache = new Map<string, { data: Organization; timestamp: number }>();
  /** Per-isolate cache for organization config - resets when isolate is evicted */
  private static configCache = new Map<string, { data: OrganizationConfig; timestamp: number }>();
  /** Per-isolate cache for subscription status - resets when isolate is evicted */
  private static subscriptionCache = new Map<string, { status: SubscriptionLifecycleStatus; timestamp: number }>();

  /**
   * Get the base URL for the remote API
   */
  private static getRemoteApiUrl(env: Env): string {
    if (!env.REMOTE_API_URL) {
      Logger.warn('REMOTE_API_URL not configured, falling back to staging endpoint');
    }
    return env.REMOTE_API_URL || 'https://staging-api.blawby.com';
  }

  /**
   * Get authentication token from request headers
   */
  private static getAuthToken(request?: Request): string | null {
    if (!request) return null;
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  /**
   * Fetch data from remote API with error handling
   */
  private static async fetchFromRemoteApi(
    env: Env,
    endpoint: string,
    request?: Request
  ): Promise<Response> {
    const baseUrl = this.getRemoteApiUrl(env);
    const url = `${baseUrl}${endpoint}`;
    
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    // Add auth token if available
    const token = this.getAuthToken(request);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw HttpErrors.notFound(`Organization not found: ${endpoint}`);
        }
        if (response.status === 401) {
          throw HttpErrors.unauthorized('Authentication required');
        }
        throw HttpErrors.internalServerError(`Remote API error: ${response.statusText}`);
      }

      return response;
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
   * Get organization by ID or slug from remote API
   */
  static async getOrganization(
    env: Env,
    organizationId: string,
    request?: Request
  ): Promise<Organization | null> {
    // Check cache first
    const cached = this.orgCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Try by ID first
      let response: Response;
      try {
        response = await this.fetchFromRemoteApi(env, `/api/organizations/${organizationId}`, request);
      } catch (error) {
        // If 404, try by slug
        if (error instanceof HttpError && error.status === 404) {
          try {
            response = await this.fetchFromRemoteApi(env, `/api/organizations?slug=${encodeURIComponent(organizationId)}`, request);
          } catch (slugError) {
            // If slug lookup also fails, return null
            if (slugError instanceof HttpError && slugError.status === 404) {
              return null;
            }
            throw slugError;
          }
        } else {
          throw error;
        }
      }

      const data = await response.json() as { data?: Organization; organization?: Organization };
      const organization = data.data || data.organization;

      if (!organization) {
        return null;
      }

      // Cache the result
      this.orgCache.set(organizationId, { data: organization, timestamp: Date.now() });
      
      return organization;
    } catch (error) {
      // Distinguish between 404 (not found) and other errors (API down, network failures)
      if (error instanceof HttpError && error.status === 404) {
        // Organization genuinely not found
        Logger.debug('Organization not found in remote API', { organizationId });
        return null;
      }
      
      // Re-throw connectivity/server errors instead of swallowing them
      Logger.error('Failed to fetch organization from remote API', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
        status: error instanceof HttpError ? error.status : undefined,
      });
      throw error;
    }
  }

  /**
   * Get organization config from remote API
   */
  static async getOrganizationConfig(
    env: Env,
    organizationId: string,
    request?: Request
  ): Promise<OrganizationConfig | null> {
    // Check cache first
    const cached = this.configCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const organization = await this.getOrganization(env, organizationId, request);
    if (!organization) {
      return null;
    }

    // Cache the config
    this.configCache.set(organizationId, { data: organization.config, timestamp: Date.now() });
    
    return organization.config;
  }

  /**
   * Get subscription status for an organization from remote API
   */
  static async getSubscriptionStatus(
    env: Env,
    organizationId: string,
    request?: Request
  ): Promise<SubscriptionLifecycleStatus> {
    // Check cache first
    const cached = this.subscriptionCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.status;
    }

    const organization = await this.getOrganization(env, organizationId, request);
    if (!organization) {
      return 'none';
    }

    const status = organization.subscriptionStatus || 'none';
    
    // Cache the status
    this.subscriptionCache.set(organizationId, { status, timestamp: Date.now() });
    
    return status;
  }

  /**
   * Get organization metadata (tier, kind, subscription status) for usage/quota purposes
   * 
   * @throws {HttpError} If organization is not found or remote API is unavailable
   * @throws {Error} If organization data is invalid
   */
  static async getOrganizationMetadata(
    env: Env,
    organizationId: string,
    request?: Request
  ): Promise<{
    id: string;
    slug: string | null;
    tier: 'free' | 'plus' | 'business' | 'enterprise';
    kind: OrganizationKind;
    subscriptionStatus: SubscriptionLifecycleStatus;
  }> {
    const organization = await this.getOrganization(env, organizationId, request);
    
    if (!organization) {
      // Throw error instead of returning defaults to prevent unauthorized access during API outages
      throw HttpErrors.notFound(`Organization not found: ${organizationId}`);
    }

    return {
      id: organization.id,
      slug: organization.slug || null,
      tier: organization.subscriptionTier || 'free',
      kind: organization.kind,
      subscriptionStatus: organization.subscriptionStatus || 'none',
    };
  }

  /**
   * Validate that an organization exists
   */
  static async validateOrganization(
    env: Env,
    organizationId: string,
    request?: Request
  ): Promise<boolean> {
    const org = await this.getOrganization(env, organizationId, request);
    return org !== null;
  }

  /**
   * Clear cache for a specific organization or all organizations
   */
  static clearCache(organizationId?: string): void {
    if (organizationId) {
      this.orgCache.delete(organizationId);
      this.configCache.delete(organizationId);
      this.subscriptionCache.delete(organizationId);
    } else {
      this.orgCache.clear();
      this.configCache.clear();
      this.subscriptionCache.clear();
    }
  }
}
