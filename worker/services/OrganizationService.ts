import { Env, Practice, Workspace, PracticeOrWorkspace, ConversationConfig, SubscriptionLifecycleStatus } from '../types.js';
import { ValidationService } from './ValidationService.js';
import { ValidationError } from '../utils/validationErrors.js';
import { getConfiguredDomain } from '../utils/domain.js';
import { RemoteApiService } from './RemoteApiService.js';
import { Logger } from '../utils/logger.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError } from '../types.js';

// Helper functions for simplified quota
const _getQuotaLimit = (tier?: string): number => {
  switch (tier) {
    case 'free': return 100;
    case 'plus': return 500;
    case 'business': return 1000;
    case 'enterprise': return -1; // unlimited
    default: return 100;
  }
};

const DEFAULT_AVAILABLE_SERVICES = [
  'Family Law',
  'Employment Law',
  'Business Law',
  'Intellectual Property',
  'Personal Injury',
  'Criminal Law',
  'Civil Law',
  'Tenant Rights Law',
  'Probate and Estate Planning',
  'Special Education and IEP Advocacy',
  'Small Business and Nonprofits',
  'Contract Review',
  'General Consultation'
] as const;

export function buildDefaultConversationConfig(_env: Env): ConversationConfig {
  // Default conversation configuration
  return {
    consultationFee: 0,
    requiresPayment: false,
    ownerEmail: undefined,
    availableServices: [...DEFAULT_AVAILABLE_SERVICES],
    serviceQuestions: {},
    domain: getConfiguredDomain(_env),
    description: '',
    brandColor: '#3B82F6',
    accentColor: '#1E40AF',
    introMessage: '',
    voice: {
      enabled: false,
      provider: 'cloudflare'
    }
  };
}

// Onboarding parsing functions removed - onboarding is now handled by remote API

export class PracticeService {
  private practiceCache = new Map<string, { data: PracticeOrWorkspace; timestamp: number }>();

  /**
   * Validate user exists in remote API before creating member records
   */
  private async validateUserExists(userId: string, request?: Request): Promise<void> {
    try {
      // Prepare headers with authentication
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Use incoming request headers for authentication if available
      if (request?.headers) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }
        // Forward other relevant headers if needed
        const userAgent = request.headers.get('User-Agent');
        if (userAgent) {
          headers['User-Agent'] = userAgent;
        }
      }

      // Fallback to service-to-service token if no auth headers provided
      if (!headers['Authorization'] && this.env.BLAWBY_API_TOKEN) {
        headers['Authorization'] = `Bearer ${this.env.BLAWBY_API_TOKEN}`;
      }

      // Since there's no direct user validation endpoint, we'll use a proxy approach
      // by attempting to fetch user-specific data that should exist if user is valid
      // Note: This is a temporary solution - ideally there should be a dedicated user validation endpoint
      const response = await fetch(`${this.env.REMOTE_API_URL}/api/users/${userId}/validate`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000), // 5 second timeout for validation
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw HttpErrors.notFound(`User not found: ${userId}`);
        }
        throw HttpErrors.serviceUnavailable('Failed to validate user existence');
      }
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      // If remote validation fails, log but allow operation to proceed
      // (this maintains availability while still attempting validation)
      Logger.warn('User validation failed, proceeding with member creation', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate invitedBy user exists before creating invitation records
   * Note: Invitations are handled by remote API, but this method is available
   * for any local invitation handling that might be added
   */
  async validateInvitedByUser(invitedByUserId: string, request?: Request): Promise<void> {
    return this.validateUserExists(invitedByUserId, request);
  }

  private configCache = new Map<string, { config: ConversationConfig; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private env: Env) {}

  private getDefaultConfig(): ConversationConfig {
    return buildDefaultConversationConfig(this.env);
  }

  private createSafeSlug(userId: string): string {
    const fallbackBase = 'user';
    const rawId = typeof userId === 'string' ? userId : '';
    let slug = rawId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    slug = slug.replace(/-+/g, '-').replace(/^-+|-+$/g, '');

    if (!slug) {
      slug = fallbackBase;
    }

    const prefix = slug.slice(0, 16) || fallbackBase;
    const suffix = Date.now().toString(36).slice(-6);
    const combined = `${prefix}-${suffix}`.replace(/-+/g, '-');
    const normalized = combined.replace(/^-+/, '').slice(0, 32);

    return normalized.length > 0 ? normalized : `${fallbackBase}-${suffix}`;
  }

  /**
   * Build workspace conversation config with hardcoded defaults (no storage needed)
   */
  private buildWorkspaceConversationConfig(): ConversationConfig {
    const defaultConfig = this.getDefaultConfig();

    return {
      ...defaultConfig,
      consultationFee: 0,
      requiresPayment: false,
      availableServices: ['General Consultation'],
      serviceQuestions: {
        'General Consultation': [
          'What type of legal issue are you facing?',
          'When did this issue occur?',
          'Have you consulted with other attorneys about this matter?'
        ]
      },
      domain: getConfiguredDomain(this.env),
      description: 'Personal legal consultation workspace',
      brandColor: '#3B82F6',
      accentColor: '#1E40AF',
      introMessage: 'Hello! I\'m here to help you with your legal questions. What can I assist you with today?',
      voice: {
        enabled: false,
        provider: 'cloudflare'
      },
      ownerEmail: defaultConfig.ownerEmail,
      blawbyApi: defaultConfig.blawbyApi,
    };
  }

  /**
   * Create workspace for user (returns hardcoded workspace object, no DB storage)
   */
  async createWorkspaceForUser(userId: string, userName: string): Promise<Workspace> {
    const safeName = typeof userName === 'string' && userName.trim().length > 0 ? userName.trim() : 'New User';
    const workspaceName = `${safeName}'s Workspace`;
    const conversationConfig = this.buildWorkspaceConversationConfig();
    const slug = this.createSafeSlug(userId);
    const now = Date.now();

    // Generate workspace ULID
    const workspaceId = this.generateULID();

    // Return hardcoded workspace object (no DB storage)
    const workspace: Workspace = {
      id: workspaceId,
      name: workspaceName,
      slug,
      domain: conversationConfig.domain,
      metadata: {},
      conversationConfig,
      betterAuthOrgId: userId,
      stripeCustomerId: null,
      subscriptionTier: 'free',
      seats: 1,
      kind: 'workspace',
      subscriptionStatus: 'none',
      subscriptionPeriodEnd: null,
      createdAt: now,
      updatedAt: now,
      businessOnboardingCompletedAt: null,
      businessOnboardingSkipped: false,
      businessOnboardingData: null,
    };

    this.clearCache(workspace.id);
    return workspace;
  }

  /**
   * Ensure workspace exists for user (returns workspace object, no DB lookup)
   * Workspaces are ephemeral - always return a new workspace object
   */
  async ensureWorkspace(userId: string, userName: string): Promise<Workspace> {
    // Workspaces are ephemeral - always return a workspace object
    // In the future, we could check remote API for workspace practice, but for now
    // we always return a new workspace object with hardcoded defaults
    return this.createWorkspaceForUser(userId, userName);
  }


  /**
   * Resolves environment variable placeholders in organization configuration
   * This allows storing sensitive data like API keys as environment variable references
   * Supports generic ${VAR_NAME} pattern matching
   * 
   * SECURITY: Excludes 'metadata' field from resolution to prevent untrusted user input
   * from resolving environment variables. Metadata can be set by organization owners
   * and should not be processed for environment variable substitution.
   */
  private resolveEnvironmentVariables<T>(config: T, excludeKeys: Set<string> = new Set(['metadata'])): T {
    if (config === null || typeof config !== 'object') {
      return config;
    }

    if (Array.isArray(config)) {
      return config.map(item => this.resolveEnvironmentVariables(item, excludeKeys)) as unknown as T;
    }

    const resolvedEntries = Object.entries(config as Record<string, unknown>).map(([key, value]) => {
      // Skip excluded keys (like metadata) - return as-is without processing
      if (excludeKeys.has(key)) {
        return [key, value];
      }
      
      if (value && typeof value === 'object') {
        return [key, this.resolveEnvironmentVariables(value, excludeKeys)];
      }
      if (typeof value === 'string') {
        return [key, this.resolveStringVariables(value)];
      }
      return [key, value];
    });

    return Object.fromEntries(resolvedEntries) as T;
  }

  /**
   * Safely decodes organization config from database as plain JSON
   * Organization configs are stored as plain JSON text in the database
   */
  private decodeOrganizationConfig(configString: string): unknown {
    try {
      return JSON.parse(configString);
    } catch (jsonError) {
      console.error('Failed to parse organization config as JSON:', { 
        configString: configString.substring(0, 100) + '...', 
        error: jsonError 
      });
      // Return a safe default config if JSON parsing fails
      return buildDefaultConversationConfig(this.env);
    }
  }

  /**
   * Resolves environment variable placeholders in string values
   * Uses regex to find and replace ${VAR_NAME} patterns with actual env values
   * Also handles direct environment variable names
   */
  private resolveStringVariables(value: string): string {
    // Handle ${VAR_NAME} pattern
    const envVarRegex = /\$\{([^}]+)\}/g;
    let result = value.replace(envVarRegex, (match, varName) => {
      const envValue = this.getEnvValue(varName);
      console.log(`🔍 Resolving ${varName}: ${envValue !== undefined ? 'FOUND' : 'NOT FOUND'}`);
      return envValue !== undefined ? envValue : match;
    });
    
    // Handle direct environment variable names (without ${} wrapper)
    // Only replace if the value looks like an environment variable name
    if (result.match(/^[A-Z_]+$/)) {
      const envValue = this.getEnvValue(result);
      console.log(`🔍 Resolving direct ${result}: ${envValue !== undefined ? 'FOUND' : 'NOT FOUND'}`);
      if (envValue !== undefined) {
        return envValue;
      }
    }
    
    return result;
  }

  private getEnvValue(key: string): string | undefined {
    return (this.env as unknown as Record<string, unknown>)[key] as string | undefined;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   * Compares two strings in a way that doesn't reveal information about the strings
   * Always processes both strings fully to avoid timing leaks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    // Use the longer string length to ensure we always process the same amount
    const maxLength = Math.max(a.length, b.length);
    let result = 0;
    
    // Process both strings to the maximum length
    for (let i = 0; i < maxLength; i++) {
      const aChar = i < a.length ? a.charCodeAt(i) : 0;
      const bChar = i < b.length ? b.charCodeAt(i) : 0;
      result |= aChar ^ bChar;
    }
    
    // Also compare lengths in constant time
    result |= a.length ^ b.length;
    
    return result === 0;
  }

  /**
   * Normalizes fields that should be arrays but might be objects
   * @param config The conversation configuration to normalize
   * @returns Normalized conversation configuration with array fields
   */
  private normalizeConfigArrays(config: unknown): ConversationConfig {
    const base = (config ?? {}) as Record<string, unknown>;
    const normalized: Partial<ConversationConfig> & { voice?: unknown } = { ...base };

    // Normalize availableServices
    if (normalized.availableServices && !Array.isArray(normalized.availableServices)) {
      normalized.availableServices = Object.values(normalized.availableServices);
    }

    normalized.voice = this.normalizeVoiceConfig(normalized.voice);

    return normalized as ConversationConfig;
  }

  private isValidVoiceProvider(value: unknown): value is ConversationConfig['voice']['provider'] {
    return value === 'cloudflare' || value === 'elevenlabs' || value === 'custom';
  }

  private normalizeVoiceConfig(rawVoice: unknown): ConversationConfig['voice'] {
    const baseConfig: ConversationConfig['voice'] = {
      enabled: false,
      provider: 'cloudflare'
    };

    if (!rawVoice || typeof rawVoice !== 'object') {
      return baseConfig;
    }

    const voiceRecord = rawVoice as Record<string, unknown>;

    const provider = this.isValidVoiceProvider(voiceRecord.provider) ? voiceRecord.provider : 'cloudflare';

    const normalizedVoice: ConversationConfig['voice'] = {
      enabled: Boolean(voiceRecord.enabled),
      provider
    };

    if (typeof voiceRecord.voiceId === 'string' && voiceRecord.voiceId.trim().length > 0) {
      normalizedVoice.voiceId = voiceRecord.voiceId.trim();
    }

    if (typeof voiceRecord.displayName === 'string' && voiceRecord.displayName.trim().length > 0) {
      normalizedVoice.displayName = voiceRecord.displayName.trim();
    }

    if (typeof voiceRecord.previewUrl === 'string' && voiceRecord.previewUrl.trim().length > 0) {
      normalizedVoice.previewUrl = voiceRecord.previewUrl.trim();
    }

    return normalizedVoice;
  }

  private normalizeSubscriptionStatus(status: unknown): SubscriptionLifecycleStatus {
    if (typeof status !== 'string' || status.trim().length === 0) {
      return 'none';
    }

    const normalized = status.trim().toLowerCase();
    switch (normalized) {
      case 'none':
        return 'none';
      case 'active':
      case 'trialing':
      case 'paused':
      case 'past_due':
      case 'canceled':
      case 'incomplete':
      case 'incomplete_expired':
      case 'unpaid':
        return normalized;
      default:
        return 'none';
    }
  }

  async getPractice(practiceId: string, request?: Request): Promise<PracticeOrWorkspace | null> {
    console.log('PracticeService.getPractice called with practiceId:', practiceId);
    
    // Check cache first
    const cached = this.practiceCache.get(practiceId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached practice');
      return cached.data;
    }

    try {
      // Fetch from remote API
      const practiceData = await RemoteApiService.getOrganization(this.env, practiceId, request);
      
      if (!practiceData) {
        console.log('No practice found in remote API');
        return null;
      }

      // Extract conversation config from practice.metadata.conversationConfig
      const conversationConfig = this.extractConversationConfig(practiceData.metadata);
      const normalizedConfig = this.validateAndNormalizeConfig(conversationConfig, false, practiceId);

      // Build Practice object from remote API data
      // Note: practiceData from RemoteApiService may not have all Practice fields
      const practiceWithExtras = practiceData as Practice & {
        subscriptionPeriodEnd?: number | null;
        businessOnboardingCompletedAt?: number | null;
        businessOnboardingSkipped?: boolean;
        businessOnboardingData?: Record<string, unknown> | null;
      };
      
      const practice: Practice = {
        id: practiceData.id,
        name: practiceData.name,
        slug: practiceData.slug || practiceData.id,
        domain: practiceData.domain,
        metadata: practiceData.metadata,
        conversationConfig: normalizedConfig,
        betterAuthOrgId: practiceData.id,
        stripeCustomerId: practiceData.stripeCustomerId ?? null,
        subscriptionTier: practiceData.subscriptionTier ?? 'free',
        seats: practiceData.seats ?? 1,
        kind: 'practice',
        subscriptionStatus: practiceData.subscriptionStatus || 'none',
        subscriptionPeriodEnd: practiceWithExtras.subscriptionPeriodEnd ?? null,
        createdAt: practiceData.createdAt,
        updatedAt: practiceData.updatedAt,
        businessOnboardingCompletedAt: practiceWithExtras.businessOnboardingCompletedAt ?? null,
        businessOnboardingSkipped: practiceWithExtras.businessOnboardingSkipped ?? false,
        businessOnboardingData: practiceWithExtras.businessOnboardingData ?? null,
      };
      
      console.log('Found practice:', { id: practice.id, slug: practice.slug, name: practice.name });
      this.practiceCache.set(practiceId, { data: practice, timestamp: Date.now() });
      return practice;
    } catch (error) {
      console.error('Failed to fetch practice:', error);
      return null;
    }
  }

  /**
   * Extract conversation config from practice.metadata.conversationConfig
   * Returns default config if not found
   */
  private extractConversationConfig(metadata?: Record<string, unknown>): ConversationConfig {
    if (!metadata || typeof metadata !== 'object') {
      return this.getDefaultConfig();
    }

    const conversationConfig = metadata.conversationConfig;
    if (!conversationConfig || typeof conversationConfig !== 'object') {
      return this.getDefaultConfig();
    }

    // Merge with defaults to ensure all required fields are present
    const defaultConfig = this.getDefaultConfig();
    return {
      ...defaultConfig,
      ...(conversationConfig as ConversationConfig),
      // Ensure voice config is properly structured
      voice: {
        ...defaultConfig.voice,
        ...((conversationConfig as Record<string, unknown>).voice as ConversationConfig['voice'] | undefined),
      },
    };
  }

  async getConversationConfig(practiceId: string, request?: Request): Promise<ConversationConfig | null> {
    const practice = await this.getPractice(practiceId, request);
    return practice?.conversationConfig || null;
  }

  async getConfig(practiceId: string): Promise<ConversationConfig> {
    const cached = this.configCache.get(practiceId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.config;
    }

    const config = await this.getConversationConfig(practiceId);
    const finalConfig = config ?? this.getDefaultConfig();
    this.configCache.set(practiceId, { config: finalConfig, timestamp: Date.now() });
    return finalConfig;
  }


  /**
   * Batch process remote API calls to avoid overwhelming the remote API
   * Processes items in chunks to limit concurrent requests
   * @param batchSize Number of concurrent requests per batch (default: 10)
   */
  private async batchFetchMetadata(
    organizationIds: string[],
    batchSize: number = 10
  ): Promise<Array<Awaited<ReturnType<typeof RemoteApiService.getOrganizationMetadata>> | null>> {
    const results: Array<Awaited<ReturnType<typeof RemoteApiService.getOrganizationMetadata>> | null> = [];
    
    // Process in batches to avoid overwhelming the remote API
    for (let i = 0; i < organizationIds.length; i += batchSize) {
      const batch = organizationIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (orgId) => {
        try {
          return await RemoteApiService.getOrganizationMetadata(this.env, orgId);
        } catch (error) {
          console.warn(`Failed to fetch subscription metadata for org ${orgId}`, error);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  async listPractices(_userId?: string, _options?: { limit?: number; offset?: number }, _request?: Request): Promise<Practice[]> {
    // Practices are now managed by remote API
    // This method is kept for backward compatibility but returns empty array
    // Callers should use remote API directly to list practices
    Logger.warn('listPractices is deprecated - use remote API to list practices');
    return [];
  }


  /**
   * Validates and normalizes organization configuration to ensure all required properties are present
   * @param strictValidation - if true, applies strict validation including placeholder email checks
   * @param organizationId - organization ID for logging context
   */
  private validateAndNormalizeConfig(config: ConversationConfig | null | undefined, strictValidation: boolean = false, _practiceId?: string): ConversationConfig {
    const defaultConfig = this.getDefaultConfig();
    const sourceConfig = (config ?? {}) as ConversationConfig;

    // Validate ownerEmail if provided
    let ownerEmail = sourceConfig.ownerEmail ?? defaultConfig.ownerEmail;
    if (ownerEmail && strictValidation) {
      // Check for placeholder emails and reject them
      const placeholderEmails = ['default@example.com', 'test@example.com', 'admin@example.com', 'owner@example.com'];
      if (placeholderEmails.includes(ownerEmail.toLowerCase())) {
        throw new ValidationError(`Invalid ownerEmail: placeholder email '${ownerEmail}' is not allowed. Please provide a real email address.`);
      }
      
      // Validate email format
      if (!ValidationService.validateEmail(ownerEmail)) {
        throw new ValidationError(`Invalid ownerEmail format: '${ownerEmail}' is not a valid email address.`);
      }
    }

    const merged: ConversationConfig = {
      ...defaultConfig,
      ...sourceConfig,
      ownerEmail
    };

    return this.normalizeConfigArrays(merged);
  }

  // createOrganization, updateOrganization, deleteOrganization removed
  // Organizations are now managed by remote API


  /**
   * Hash a token for secure storage and comparison
   * Uses SHA-256 for consistent hashing across the application
   * Returns lowercase hex string (32 bytes -> 64 hex chars)
   */
  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validate that an API key hash is a proper lowercase hex SHA-256 hash
   * @param hash The hash to validate
   * @returns true if valid, false otherwise
   */
  private isValidApiKeyHash(hash: string): boolean {
    // Must be exactly 64 characters (32 bytes * 2 hex chars per byte)
    // Must be lowercase hex characters only
    return /^[a-f0-9]{64}$/.test(hash);
  }

  /**
   * Validate an API key against the organization's stored hash or plaintext key
   * Prefers apiKeyHash for authentication when available
   * @param organizationId The organization ID
   * @param providedKey The API key to validate
   * @returns true if valid, false otherwise
   */
  async validateApiKey(practiceId: string, providedKey: string): Promise<boolean> {
    try {
      const practice = await this.getPractice(practiceId);
      if (!practice?.conversationConfig.blawbyApi?.enabled) {
        return false;
      }

      const { apiKey, apiKeyHash } = practice.conversationConfig.blawbyApi;

      // Prefer hash-based validation when available
      if (apiKeyHash && this.isValidApiKeyHash(apiKeyHash)) {
        const providedKeyHash = await this.hashToken(providedKey);
        return this.constantTimeCompare(providedKeyHash, apiKeyHash);
      }

      // Fallback to plaintext comparison if no hash available
      if (apiKey) {
        return this.constantTimeCompare(providedKey, apiKey);
      }

      return false;
    } catch (error) {
      console.error(`❌ Error validating API key for practice ${practiceId}:`, error);
      return false;
    }
  }

  /**
   * Generate and store a hash for an existing API key
   * This method updates the practice's conversation config in remote API
   */
  async generateApiKeyHash(practiceId: string): Promise<boolean> {
    try {
      const practice = await this.getPractice(practiceId);
      if (!practice || !practice.conversationConfig.blawbyApi?.apiKey) {
        console.log(`❌ Practice not found or no API key configured: ${practiceId}`);
        return false;
      }

      // Generate hash for the existing API key (apiKey is guaranteed to be string here due to check above)
      const apiKeyHash = await this.hashToken(practice.conversationConfig.blawbyApi.apiKey!);
      
      // Validate the generated hash
      if (!this.isValidApiKeyHash(apiKeyHash)) {
        console.error(`❌ Generated invalid API key hash for practice: ${practiceId}`);
        return false;
      }
      
      // Update the conversation config to include the hash
      const updatedConfig: ConversationConfig = {
        ...practice.conversationConfig,
        blawbyApi: {
          ...practice.conversationConfig.blawbyApi,
          apiKeyHash,
          // Optionally set apiKey to null after migration (uncomment when ready)
          // apiKey: null
        }
      };

      // Update the practice's conversation config in remote API
      const success = await RemoteApiService.updateOrganizationConfig(this.env, practiceId, updatedConfig);
      
      if (success) {
        // Clear the cache for this practice
        this.clearCache(practiceId);
        console.log(`✅ API key hash generated and stored for practice: ${practiceId}`);
        return true;
      }

      console.error(`❌ Failed to update practice conversation config for practice ${practiceId}`);
      return false;
    } catch (error) {
      console.error(`❌ Error generating API key hash for ${practiceId}:`, error);
      return false;
    }
  }

  /**
   * Generate a secure random token
   */
  private generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private generateULID(): string {
    // Simple ULID generation - in production, use a proper ULID library
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp.toString(36)}${random}`;
  }

  // Business onboarding methods removed - onboarding is now handled by remote API
  // migrateQuotaToOrganizationConfig removed - organizations table no longer exists

  clearCache(practiceId?: string): void {
    if (practiceId) {
      this.practiceCache.delete(practiceId);
      this.configCache.delete(practiceId);
    } else {
      this.practiceCache.clear();
      this.configCache.clear();
    }
  }
}
