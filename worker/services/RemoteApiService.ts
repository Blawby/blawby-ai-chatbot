import type { Env, Organization, OrganizationConfig, SubscriptionLifecycleStatus, OrganizationKind, HttpError } from '../types.js';
import { Logger } from '../utils/logger.js';
import { HttpErrors } from '../errorHandler.js';

/**
 * Service for fetching organization and subscription data from the remote API
 * (staging-api.blawby.com)
 */
export class RemoteApiService {
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static orgCache = new Map<string, { data: Organization; timestamp: number }>();
  private static configCache = new Map<string, { data: OrganizationConfig; timestamp: number }>();
  private static subscriptionCache = new Map<string, { status: SubscriptionLifecycleStatus; timestamp: number }>();

  /**
   * Get the base URL for the remote API
   */
  private static getRemoteApiUrl(env: Env): string {
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
      let response = await this.fetchFromRemoteApi(env, `/api/organizations/${organizationId}`, request);
      
      // If 404, try by slug
      if (response.status === 404) {
        response = await this.fetchFromRemoteApi(env, `/api/organizations?slug=${encodeURIComponent(organizationId)}`, request);
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
      Logger.warn('Failed to fetch organization from remote API', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
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
      // Return default metadata if organization not found
      return {
        id: organizationId,
        slug: null,
        tier: 'free',
        kind: 'personal',
        subscriptionStatus: 'none',
      };
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

