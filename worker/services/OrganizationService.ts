import { Env } from '../types.js';
import { ValidationService } from './ValidationService.js';
import { ValidationError } from '../utils/validationErrors.js';
import { getConfiguredDomain } from '../utils/domain.js';
import { RemoteApiService } from './RemoteApiService.js';
import { Logger } from '../utils/logger.js';
import { HttpErrors } from '../errorHandler.js';
import { HttpError } from '../types.js';

export type OrganizationVoiceProvider = 'cloudflare' | 'elevenlabs' | 'custom';

export interface OrganizationVoiceConfig {
  enabled: boolean;
  provider: OrganizationVoiceProvider;
  voiceId?: string;
  displayName?: string;
  previewUrl?: string;
}

export type OrganizationKind = 'personal' | 'business';

export type SubscriptionLifecycleStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  domain?: string;
  metadata?: Record<string, unknown>;
  config: OrganizationConfig;
  betterAuthOrgId?: string;
  stripeCustomerId?: string | null;
  subscriptionTier?: 'free' | 'plus' | 'business' | 'enterprise' | null;
  seats?: number;
  kind: OrganizationKind;
  subscriptionStatus: SubscriptionLifecycleStatus;
  subscriptionPeriodEnd?: number | null;
  createdAt: number;
  updatedAt: number;
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingSkipped?: boolean;
  businessOnboardingData?: Record<string, unknown> | null;
}

export interface OrganizationConfig {
  aiProvider?: string;
  aiModel?: string;
  aiModelFallback?: string[];
  consultationFee?: number;
  requiresPayment?: boolean;
  ownerEmail?: string;
  availableServices?: string[];
  serviceQuestions?: Record<string, string[]>;
  jurisdiction?: {
    type: 'state' | 'national';
    description: string;
    supportedStates: string[];
    supportedCountries: string[];
    primaryState?: string;
  };
  domain?: string;
  description?: string;
  paymentLink?: string;
  brandColor?: string;
  accentColor?: string;
  introMessage?: string;
  profileImage?: string;
  name?: string;  // Optional organization name for use in PDFs and other contexts
  voice: OrganizationVoiceConfig;
  blawbyApi?: {
    enabled: boolean;
    apiKey?: string | null;  // Optional/nullable for migration to hash-at-rest
    apiKeyHash?: string;     // Lowercase hex SHA-256 hash (32 bytes -> 64 hex chars)
    organizationUlid?: string;       // Organization identifier for API calls
    apiUrl?: string;
  };
  testMode?: boolean;  // Organization-level testing flag for notifications and other features
  metadata?: Record<string, unknown>; // Additional metadata for organization configuration
  betterAuthOrgId?: string; // Canonical org id to use with Better Auth endpoints
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      quotaMetric?: 'messages' | 'files' | null;
      requiredRole?: 'owner' | 'admin' | 'attorney' | 'paralegal' | null;
      allowAnonymous?: boolean;
    }
  };
  agentMember?: {
    enabled: boolean;
    userId?: string;
    autoInvoke?: boolean;
    tagRequired?: boolean;
  };
  isPublic?: boolean;
}

const LEGACY_AI_PROVIDER = 'workers-ai';
const DEFAULT_GPT_MODEL = '@cf/openai/gpt-oss-20b';


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

function normalizeProvider(input?: string | null): string {
  if (!input) {
    return LEGACY_AI_PROVIDER;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : LEGACY_AI_PROVIDER;
}

function sanitizeModel(model?: string | null, _organizationId?: string): string | undefined {
  if (!model) {
    return undefined;
  }
  const trimmed = model.trim();
  if (!trimmed.length) {
    return undefined;
  }

  return trimmed;
}

function sanitizeFallbackList(value: unknown): string[] {
  if (!value) {
    return [];
  }

  const values = Array.isArray(value)
    ? value.filter(item => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return Array.from(new Set(values.map(v => v.trim()).filter(v => v.length > 0)));
}

function buildFallbackList(baseModel: string, preferred?: string[], useDefaults: boolean = true): string[] {
  const normalized = sanitizeFallbackList(preferred);
  
  // If preferred was explicitly provided but is empty, return empty array
  if (preferred !== undefined && normalized.length === 0) {
    return [];
  }
  
  // If normalized is empty and defaults are allowed, return DEFAULT_GPT_MODEL filtered against baseModel
  if (!normalized.length && useDefaults) {
    return [DEFAULT_GPT_MODEL].filter(model => model !== baseModel);
  }
  
  // If normalized is empty and defaults are disabled, return empty array
  if (!normalized.length && !useDefaults) {
    return [];
  }

  const unique = new Set<string>();
  normalized.forEach(model => {
    if (model !== baseModel) {
      unique.add(model);
    }
  });

  if (!unique.size && baseModel !== DEFAULT_GPT_MODEL && useDefaults) {
    unique.add(DEFAULT_GPT_MODEL);
  }

  return Array.from(unique);
}

export function buildDefaultOrganizationConfig(env: Env): OrganizationConfig {
  const defaultProvider = normalizeProvider(env.AI_PROVIDER_DEFAULT);
  const defaultModel = sanitizeModel(env.AI_MODEL_DEFAULT) ?? DEFAULT_GPT_MODEL;
  const fallbackFromEnv = sanitizeFallbackList(env.AI_MODEL_FALLBACK);
  const fallbackList = buildFallbackList(defaultModel, fallbackFromEnv);

  return {
    aiProvider: defaultProvider,
    aiModel: defaultModel,
    aiModelFallback: fallbackList,
    consultationFee: 0,
    requiresPayment: false,
    ownerEmail: undefined,
    availableServices: [...DEFAULT_AVAILABLE_SERVICES],
    jurisdiction: {
      type: 'national',
      description: 'Available nationwide',
      supportedStates: ['all'],
      supportedCountries: ['US']
    },
    voice: {
      enabled: false,
      provider: 'cloudflare'
    }
  };
}

const parseOnboardingCompletedAt = (value: unknown): number | null | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value === null) {
    return null;
  }
  return undefined;
};

const parseOnboardingSkipped = (value: unknown): boolean => {
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === '1' || trimmed === 'true';
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return false;
};

const parseOnboardingData = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

export class OrganizationService {
  private orgCache = new Map<string, { data: Organization; timestamp: number }>();

  /**
   * Validate user exists in remote API before creating member records
   */
  private async validateUserExists(userId: string, request?: Request): Promise<void> {
    try {
      // Since there's no direct user validation endpoint, we'll use a proxy approach
      // by attempting to fetch user-specific data that should exist if user is valid
      // Note: This is a temporary solution - ideally there should be a dedicated user validation endpoint
      const response = await fetch(`${this.env.REMOTE_API_URL}/api/users/${userId}/validate`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
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

  private configCache = new Map<string, { config: OrganizationConfig; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private env: Env) {}

  private getDefaultConfig(): OrganizationConfig {
    return buildDefaultOrganizationConfig(this.env);
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

  private buildPersonalOrganizationConfig(userName: string): OrganizationConfig {
    const defaultConfig = this.getDefaultConfig();
    const _safeName = typeof userName === 'string' && userName.trim().length > 0 ? userName.trim() : 'New User';

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
      description: 'Personal legal consultation organization',
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

  async createPersonalOrganizationForUser(userId: string, userName: string): Promise<Organization> {
    const safeName = typeof userName === 'string' && userName.trim().length > 0 ? userName.trim() : 'New User';
    const organizationName = `${safeName}'s Organization`;
    const config = this.buildPersonalOrganizationConfig(safeName);
    const slug = this.createSafeSlug(userId);

    const organization = await this.createOrganization({
      name: organizationName,
      slug,
      domain: config.domain ?? null,
      config,
      stripeCustomerId: null,
      subscriptionTier: 'free',
      seats: 1,
      kind: 'personal',
    });

    // Eagerly persist betterAuthOrgId mapping to config (canonical to our organization id)
    try {
      await this.env.DB.prepare(
        `UPDATE organizations SET config = json_set(COALESCE(config, '{}'), '$.betterAuthOrgId', ?) WHERE id = ?`
      ).bind(organization.id, organization.id).run();
      // Clear cache to ensure subsequent reads include updated config
      this.clearCache(organization.id);
    } catch (e) {
      console.warn('⚠️ Failed to persist betterAuthOrgId after org creation', { id: organization.id, error: String(e) });
    }

    try {
      // Validate user exists before creating member record
      await this.validateUserExists(userId);
      
      await this.env.DB.prepare(
        `INSERT INTO members (id, organization_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)
         ON CONFLICT(organization_id, user_id) DO NOTHING`
      ).bind(
        globalThis.crypto.randomUUID(),
        organization.id,
        userId,
        Math.floor(Date.now() / 1000)
      ).run();
    } catch (error) {
      const deleted = await this.deleteOrganization(organization.id);
      if (!deleted) {
        console.error('❌ Failed to roll back personal organization after member insert failure', {
          organizationId: organization.id,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }

    this.clearCache(organization.id);
    return organization;
  }

  async ensurePersonalOrganization(userId: string, userName: string): Promise<Organization> {
    const personalMembership = await this.env.DB.prepare(
      `SELECT o.id
         FROM organizations o
         INNER JOIN members m ON o.id = m.organization_id
        WHERE m.user_id = ? AND o.is_personal = 1
        ORDER BY o.created_at ASC
        LIMIT 1`
    ).bind(userId).first<{ id: string }>();

    if (personalMembership?.id) {
      const existing = await this.getOrganization(personalMembership.id);
      if (existing) {
        // Ensure betterAuthOrgId is present in config
        if (!existing.config?.betterAuthOrgId) {
          try {
            await this.env.DB.prepare(
              `UPDATE organizations SET config = json_set(COALESCE(config, '{}'), '$.betterAuthOrgId', ?) WHERE id = ?`
            ).bind(existing.id, existing.id).run();
            this.clearCache(existing.id);
          } catch (e) {
            console.warn('⚠️ Failed to persist betterAuthOrgId in ensurePersonalOrganization', { id: existing.id, error: String(e) });
          }
        }
        // Ensure membership row exists with owner role (idempotent)
        try {
          const membership = await this.env.DB.prepare(
            `SELECT role FROM members WHERE organization_id = ? AND user_id = ?`
          ).bind(existing.id, userId).first<{ role: string }>();
          if (!membership) {
            // Validate user exists before creating member record
            await this.validateUserExists(userId);
            
            await this.env.DB.prepare(
              `INSERT INTO members (id, organization_id, user_id, role, created_at)
               VALUES (?, ?, ?, 'owner', ?)
               ON CONFLICT(organization_id, user_id) DO NOTHING`
            ).bind(
              globalThis.crypto.randomUUID(),
              existing.id,
              userId,
              Math.floor(Date.now() / 1000)
            ).run();
          }
        } catch (e) {
          console.error('❌ Failed to ensure owner membership for personal org:', {
            organizationId: existing.id,
            userId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return existing;
      }
    }

    return this.createPersonalOrganizationForUser(userId, userName);
  }

  /**
   * Ensure the given user has owner membership for the organization.
   * Used to recover from data drift where the membership row might not exist.
   * - If the user already has a membership with role 'owner', nothing is done.
   * - If the user has a membership with a different role, it is upgraded to owner.
   * - If no membership exists and there are no other owners, a new owner membership is created.
   * - If another owner exists, we leave memberships untouched (and caller will enforce access).
   */
  async ensureOwnerMembership(organizationId: string, userId: string): Promise<void> {
    try {
      const existingMembership = await this.env.DB.prepare(
        `SELECT role FROM members WHERE organization_id = ? AND user_id = ? LIMIT 1`
      ).bind(organizationId, userId).first<{ role: string }>();

      if (existingMembership?.role === 'owner') {
        return;
      }

      if (existingMembership && existingMembership.role !== 'owner') {
        await this.env.DB.prepare(
          `UPDATE members SET role = 'owner' WHERE organization_id = ? AND user_id = ?`
        ).bind(organizationId, userId).run();
        this.clearCache(organizationId);
        return;
      }

      const ownerCountRow = await this.env.DB.prepare(
        `SELECT COUNT(*) as ownerCount FROM members WHERE organization_id = ? AND role = 'owner'`
      ).bind(organizationId).first<{ ownerCount: number }>();

      const ownerCount = Number(ownerCountRow?.ownerCount ?? 0);
      if (ownerCount > 0) {
        return;
      }

      // Validate user exists before creating member record
      await this.validateUserExists(userId);
      
      await this.env.DB.prepare(
        `INSERT INTO members (id, organization_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)`
      ).bind(
        crypto.randomUUID(),
        organizationId,
        userId,
        Math.floor(Date.now() / 1000)
      ).run();
      this.clearCache(organizationId);
    } catch (error) {
      console.error('[OrganizationService.ensureOwnerMembership] Failed to ensure owner membership:', {
        organizationId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Swallow errors: callers will still enforce permissions via requireOrgOwner
    }
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
      return buildDefaultOrganizationConfig(this.env);
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
   * @param config The organization configuration to normalize
   * @returns Normalized organization configuration with array fields
   */
  private normalizeConfigArrays(config: unknown): OrganizationConfig {
    const base = (config ?? {}) as Record<string, unknown>;
    const normalized: Partial<OrganizationConfig> & { voice?: unknown } = { ...base };

    // Normalize availableServices
    if (normalized.availableServices && !Array.isArray(normalized.availableServices)) {
      normalized.availableServices = Object.values(normalized.availableServices);
    }

    // Normalize jurisdiction fields if they exist
    if (normalized.jurisdiction) {
      if (normalized.jurisdiction.supportedStates && !Array.isArray(normalized.jurisdiction.supportedStates)) {
        normalized.jurisdiction.supportedStates = Object.values(normalized.jurisdiction.supportedStates);
      }
      if (normalized.jurisdiction.supportedCountries && !Array.isArray(normalized.jurisdiction.supportedCountries)) {
        normalized.jurisdiction.supportedCountries = Object.values(normalized.jurisdiction.supportedCountries);
      }
    }

    if (normalized.aiModelFallback !== undefined) {
      normalized.aiModelFallback = sanitizeFallbackList(normalized.aiModelFallback);
    }

    normalized.voice = this.normalizeVoiceConfig(normalized.voice);

    return normalized as OrganizationConfig;
  }

  private isValidVoiceProvider(value: unknown): value is OrganizationVoiceProvider {
    return value === 'cloudflare' || value === 'elevenlabs' || value === 'custom';
  }

  private normalizeVoiceConfig(rawVoice: unknown): OrganizationVoiceConfig {
    const baseConfig: OrganizationVoiceConfig = {
      enabled: false,
      provider: 'cloudflare'
    };

    if (!rawVoice || typeof rawVoice !== 'object') {
      return baseConfig;
    }

    const voiceRecord = rawVoice as Record<string, unknown>;

    const provider = this.isValidVoiceProvider(voiceRecord.provider) ? voiceRecord.provider : 'cloudflare';

    const normalizedVoice: OrganizationVoiceConfig = {
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

  private deriveKind(isPersonalValue: unknown): OrganizationKind {
    return isPersonalValue ? 'personal' : 'business';
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

  async getOrganization(organizationId: string): Promise<Organization | null> {
    console.log('OrganizationService.getOrganization called with organizationId:', organizationId);
    
    // Check cache first
    const cached = this.orgCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached organization');
      return cached.data;
    }

    try {
      // Query Better Auth organizations table - support both ID and slug lookups
      console.log('Querying database for organization...');
      const orgRow = await this.env.DB.prepare(
        `SELECT 
           o.id,
           o.name,
           o.slug,
           o.domain,
           o.config,
           o.stripe_customer_id,
           o.subscription_tier,
           o.seats,
           o.is_personal,
           o.created_at,
           o.updated_at,
           o.business_onboarding_completed_at,
           o.business_onboarding_skipped,
           o.business_onboarding_data
         FROM organizations o
        WHERE o.id = ? OR o.slug = ?`
      ).bind(organizationId, organizationId).first();
      
      if (orgRow) {
        const rawConfig = orgRow.config ? JSON.parse(orgRow.config as string) : {};
        const resolvedConfig = this.resolveEnvironmentVariables(rawConfig);
        const normalizedConfig = this.validateAndNormalizeConfig(resolvedConfig as OrganizationConfig, false, organizationId);
        if (!normalizedConfig.betterAuthOrgId) {
          normalizedConfig.betterAuthOrgId = orgRow.id as string;
          try {
            await this.env.DB.prepare(
              `UPDATE organizations SET config = json_set(COALESCE(config, '{}'), '$.betterAuthOrgId', ?) WHERE id = ?`
            ).bind(orgRow.id as string, orgRow.id as string).run();
          } catch (e) {
            console.warn('⚠️ Failed to persist betterAuthOrgId into organization config', { id: orgRow.id, error: String(e) });
          }
        }
        
        // Parse updated_at defensively
        let updatedAt: number;
        if (orgRow.updated_at && !isNaN(new Date(orgRow.updated_at as string).getTime())) {
          updatedAt = new Date(orgRow.updated_at as string).getTime();
        } else {
          // Fall back to created_at or current time if updated_at is invalid
          updatedAt = orgRow.created_at ? new Date(orgRow.created_at as string).getTime() : Date.now();
        }

        // Fetch subscription metadata from remote API
        let subscriptionMetadata;
        try {
          subscriptionMetadata = await RemoteApiService.getOrganizationMetadata(this.env, orgRow.id as string);
        } catch (error) {
          console.warn('Failed to fetch subscription metadata from remote API, using defaults', error);
          subscriptionMetadata = null;
        }

        const organization: Organization = {
          id: orgRow.id as string,
          name: orgRow.name as string,
          slug: orgRow.slug as string,
          domain: orgRow.domain as string | undefined,
          config: normalizedConfig,
          betterAuthOrgId: normalizedConfig.betterAuthOrgId ?? (orgRow.id as string),
          stripeCustomerId: (orgRow as Record<string, unknown>).stripe_customer_id as string | null | undefined,
          subscriptionTier: subscriptionMetadata?.tier || (orgRow as Record<string, unknown>).subscription_tier as 'free' | 'plus' | 'business' | 'enterprise' | null | undefined || 'free',
          seats: (() => {
            const rawSeats = (orgRow as Record<string, unknown>).seats;
            const numSeats = Number(rawSeats ?? 1);
            return isNaN(numSeats) ? 1 : numSeats;
          })(),
          kind: subscriptionMetadata?.kind || this.deriveKind((orgRow as Record<string, unknown>).is_personal),
          subscriptionStatus: subscriptionMetadata?.subscriptionStatus || 'none',
          subscriptionPeriodEnd: null, // Period end is now managed by remote API
          createdAt: new Date(orgRow.created_at as string).getTime(),
          updatedAt: updatedAt,
          businessOnboardingCompletedAt: parseOnboardingCompletedAt(
            (orgRow as Record<string, unknown>).business_onboarding_completed_at
          ),
          businessOnboardingSkipped: parseOnboardingSkipped(
            (orgRow as Record<string, unknown>).business_onboarding_skipped
          ),
          businessOnboardingData: parseOnboardingData(
            (orgRow as Record<string, unknown>).business_onboarding_data
          ),
        };
        
        console.log('Found organization:', { id: organization.id, slug: organization.slug, name: organization.name });
        this.orgCache.set(organizationId, { data: organization, timestamp: Date.now() });
        return organization;
      } else {
        console.log('No organization found in database');
        return null;
      }
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      return null;
    }
  }

  async getOrganizationConfig(organizationId: string): Promise<OrganizationConfig | null> {
    const organization = await this.getOrganization(organizationId);
    return organization?.config || null;
  }

  async getConfig(organizationId: string): Promise<OrganizationConfig> {
    const cached = this.configCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.config;
    }

    const config = await this.getOrganizationConfig(organizationId);
    const finalConfig = config ?? this.getDefaultConfig();
    this.configCache.set(organizationId, { config: finalConfig, timestamp: Date.now() });
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

  async listOrganizations(userId?: string, options?: { limit?: number; offset?: number }): Promise<Organization[]> {
    try {
      const limit = options?.limit ?? 100; // Default limit of 100 for both admin and user queries
      const offset = options?.offset ?? 0;
      const maxLimit = 500; // Maximum limit to prevent abuse
      const effectiveLimit = limit ? Math.min(limit, maxLimit) : undefined;

      if (userId) {
        // Get organizations where user is a member
        const query = effectiveLimit
          ? `
            SELECT 
              o.id,
              o.name,
              o.slug,
              o.domain,
              o.config,
              o.stripe_customer_id,
              o.subscription_tier,
              o.seats,
              o.is_personal,
              o.created_at,
              o.updated_at,
              o.business_onboarding_completed_at,
              o.business_onboarding_skipped,
              o.business_onboarding_data
            FROM organizations o
            INNER JOIN members m ON o.id = m.organization_id
            WHERE m.user_id = ?
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
          `
          : `
            SELECT 
              o.id,
              o.name,
              o.slug,
              o.domain,
              o.config,
              o.stripe_customer_id,
              o.subscription_tier,
              o.seats,
              o.is_personal,
              o.created_at,
              o.updated_at,
              o.business_onboarding_completed_at,
              o.business_onboarding_skipped,
              o.business_onboarding_data
            FROM organizations o
            INNER JOIN members m ON o.id = m.organization_id
            WHERE m.user_id = ?
            ORDER BY o.created_at DESC
          `;
        
        const orgRows = effectiveLimit
          ? await this.env.DB.prepare(query).bind(userId, effectiveLimit, offset).all()
          : await this.env.DB.prepare(query).bind(userId).all();
        
        // Fetch subscription metadata in batches to avoid overwhelming remote API
        const organizationIds = orgRows.results.map(row => row.id as string);
        const orgMetadataList = await this.batchFetchMetadata(organizationIds);
        
        return orgRows.results.map((row, index) => {
          const rawConfig = row.config ? JSON.parse(row.config as string) : {};
          const resolvedConfig = this.resolveEnvironmentVariables(rawConfig);
          const normalizedConfig = this.validateAndNormalizeConfig(resolvedConfig as OrganizationConfig, false, row.id as string);
          const rawRow = row as Record<string, unknown>;
          const metadata = orgMetadataList[index];
          
          return {
            id: row.id as string,
            name: row.name as string,
            slug: row.slug as string,
            domain: row.domain as string | undefined,
            config: normalizedConfig,
            betterAuthOrgId: normalizedConfig.betterAuthOrgId ?? (row.id as string),
            stripeCustomerId: row.stripe_customer_id as string | undefined,
            subscriptionTier: metadata?.tier || row.subscription_tier as 'free' | 'plus' | 'business' | 'enterprise' | null | undefined || 'free',
            seats: Number(row.seats ?? 1) || 1,
            kind: metadata?.kind || this.deriveKind(row.is_personal),
            subscriptionStatus: metadata?.subscriptionStatus || 'none',
            createdAt: new Date(row.created_at as string).getTime(),
            updatedAt: row.updated_at && !isNaN(new Date(row.updated_at as string).getTime())
              ? new Date(row.updated_at as string).getTime()
              : new Date(row.created_at as string).getTime(),
            businessOnboardingCompletedAt: parseOnboardingCompletedAt(rawRow.business_onboarding_completed_at),
            businessOnboardingSkipped: parseOnboardingSkipped(rawRow.business_onboarding_skipped),
            businessOnboardingData: parseOnboardingData(rawRow.business_onboarding_data),
          };
        });
      } else {
        // Get all organizations (for admin purposes) - WITH PAGINATION
        if (!effectiveLimit) {
          throw new Error('Limit is required for admin organization list to prevent unbounded queries');
        }

        const orgRows = await this.env.DB.prepare(`
          SELECT 
            o.id,
            o.name,
            o.slug,
            o.domain,
            o.config,
            o.stripe_customer_id,
            o.subscription_tier,
            o.seats,
            o.is_personal,
            o.created_at,
            o.updated_at,
            o.business_onboarding_completed_at,
            o.business_onboarding_skipped,
            o.business_onboarding_data
          FROM organizations o
          ORDER BY o.created_at DESC
          LIMIT ? OFFSET ?
        `).bind(effectiveLimit, offset).all();
        
        // Fetch subscription metadata in batches to avoid overwhelming remote API
        const organizationIds = orgRows.results.map(row => row.id as string);
        const orgMetadataList = await this.batchFetchMetadata(organizationIds);
        
        return orgRows.results.map((row, index) => {
          const rawConfig = row.config ? JSON.parse(row.config as string) : {};
          const resolvedConfig = this.resolveEnvironmentVariables(rawConfig);
          const normalizedConfig = this.validateAndNormalizeConfig(resolvedConfig as OrganizationConfig, false, row.id as string);
          const rawRow = row as Record<string, unknown>;
          const metadata = orgMetadataList[index];
          
          return {
            id: row.id as string,
            name: row.name as string,
            slug: row.slug as string,
            domain: row.domain as string | undefined,
            config: normalizedConfig,
            betterAuthOrgId: normalizedConfig.betterAuthOrgId ?? (row.id as string),
            stripeCustomerId: row.stripe_customer_id as string | undefined,
            subscriptionTier: metadata?.tier || row.subscription_tier as 'free' | 'plus' | 'business' | 'enterprise' | null | undefined || 'free',
            seats: Number(row.seats ?? 1) || 1,
            kind: metadata?.kind || this.deriveKind(row.is_personal),
            subscriptionStatus: metadata?.subscriptionStatus || 'none',
            createdAt: new Date(row.created_at as string).getTime(),
            updatedAt: row.updated_at && !isNaN(new Date(row.updated_at as string).getTime())
              ? new Date(row.updated_at as string).getTime()
              : new Date(row.created_at as string).getTime(),
            businessOnboardingCompletedAt: parseOnboardingCompletedAt(rawRow.business_onboarding_completed_at),
            businessOnboardingSkipped: parseOnboardingSkipped(rawRow.business_onboarding_skipped),
            businessOnboardingData: parseOnboardingData(rawRow.business_onboarding_data),
          };
        });
      }
    } catch (error) {
      console.error('Failed to list organizations:', error);
      return [];
    }
  }


  /**
   * Validates and normalizes organization configuration to ensure all required properties are present
   * @param strictValidation - if true, applies strict validation including placeholder email checks
   * @param organizationId - organization ID for logging context
   */
  private validateAndNormalizeConfig(config: OrganizationConfig | null | undefined, strictValidation: boolean = false, organizationId?: string): OrganizationConfig {
    const defaultConfig = this.getDefaultConfig();
    const sourceConfig = (config ?? {}) as OrganizationConfig;

    const aiProvider = normalizeProvider(sourceConfig.aiProvider ?? defaultConfig.aiProvider);
    const aiModel = sanitizeModel(sourceConfig.aiModel, organizationId) ?? defaultConfig.aiModel ?? DEFAULT_GPT_MODEL;
    const providedFallback = sourceConfig.aiModelFallback !== undefined
      ? sanitizeFallbackList(sourceConfig.aiModelFallback)
      : undefined;
    const fallbackList = buildFallbackList(aiModel, providedFallback ?? defaultConfig.aiModelFallback ?? []);

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

    const merged: OrganizationConfig = {
      ...defaultConfig,
      ...sourceConfig,
      aiProvider,
      aiModel,
      aiModelFallback: fallbackList,
      ownerEmail,
      jurisdiction: {
        ...defaultConfig.jurisdiction,
        ...(sourceConfig.jurisdiction || {})
      }
    };

    return this.normalizeConfigArrays(merged);
  }

  async createOrganization(
    organizationData: Omit<Organization, 'id' | 'createdAt' | 'updatedAt' | 'kind' | 'subscriptionStatus'> & {
      kind?: OrganizationKind;
      subscriptionStatus?: SubscriptionLifecycleStatus;
    }
  ): Promise<Organization> {
    const id = this.generateULID();
    const now = new Date().toISOString();
    
    // Validate and normalize the organization configuration
    const normalizedConfig = this.validateAndNormalizeConfig(organizationData.config, true, id);
    
    const defaultSeats = Number(organizationData.seats ?? 1) || 1;

    const resolvedKind: OrganizationKind = organizationData.kind ?? 'business';
    const isPersonal = resolvedKind === 'personal';

    const organization: Organization = {
      ...organizationData,
      stripeCustomerId: organizationData.stripeCustomerId ?? null,
      subscriptionTier: organizationData.subscriptionTier ?? 'free',
      seats: defaultSeats,
      kind: resolvedKind,
      subscriptionStatus: this.normalizeSubscriptionStatus(organizationData.subscriptionStatus),
      config: normalizedConfig,
      id,
      createdAt: new Date(now).getTime(),
      updatedAt: new Date(now).getTime()
    };

    console.log('OrganizationService.createOrganization: Attempting to insert organization:', { id: organization.id, slug: organization.slug, name: organization.name });
    
    try {
      const result = await this.env.DB.prepare(`
        INSERT INTO organizations (id, slug, name, domain, config, stripe_customer_id, subscription_tier, seats, is_personal, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        organization.id,
        organization.slug,
        organization.name,
        organization.domain ?? null,
        JSON.stringify(organization.config),
        organization.stripeCustomerId ?? null,
        organization.subscriptionTier ?? 'free',
        organization.seats ?? 1,
        isPersonal ? 1 : 0,
        organization.createdAt,
        organization.updatedAt
      ).run();
      
      console.log('OrganizationService.createOrganization: Insert result:', { success: result.success });
      
      // Verify the organization was actually created by querying the database
      const verifyOrganization = await this.env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(organization.id).first();
      if (!verifyOrganization) {
        throw new Error('Organization creation failed - organization not found in database after insert');
      }
    } catch (error) {
      console.error('OrganizationService.createOrganization: Database insert failed:', error);
      throw error;
    }

    this.clearCache(organization.id);
    console.log('OrganizationService.createOrganization: Organization created successfully:', { id: organization.id, slug: organization.slug });
    return organization;
  }

  async updateOrganization(organizationId: string, updates: Partial<Organization>): Promise<Organization | null> {
    const existingOrganization = await this.getOrganization(organizationId);
    if (!existingOrganization) {
      return null;
    }

    // Extract only mutable fields from updates, excluding immutable fields
    const { id: _ignoreId, createdAt: _ignoreCreatedAt, /* isPersonal: _ignoreIsPersonal */ ...mutableUpdates } = updates;

    // Validate and normalize the organization configuration if it's being updated
    let normalizedConfig = existingOrganization.config;
    if (mutableUpdates.config) {
      normalizedConfig = this.validateAndNormalizeConfig(mutableUpdates.config, true, organizationId);
    }
    
    // Prefer `kind` if provided; otherwise maintain existing.
    const resolvedKind: OrganizationKind = (mutableUpdates.kind ?? existingOrganization.kind);
    const isPersonal = resolvedKind === 'personal';

    const updatedOrganization: Organization = {
      ...existingOrganization,
      ...mutableUpdates,
      config: normalizedConfig,
      kind: resolvedKind,
      updatedAt: new Date().getTime()
    };

    updatedOrganization.stripeCustomerId = updatedOrganization.stripeCustomerId ?? null;
    updatedOrganization.subscriptionTier = updatedOrganization.subscriptionTier ?? existingOrganization.subscriptionTier ?? 'free';
    updatedOrganization.seats = Number(updatedOrganization.seats ?? existingOrganization.seats ?? 1) || 1;
    updatedOrganization.subscriptionStatus = this.normalizeSubscriptionStatus(updatedOrganization.subscriptionStatus ?? existingOrganization.subscriptionStatus);

    await this.env.DB.prepare(`
      UPDATE organizations 
      SET slug = ?, name = ?, domain = ?, config = ?, stripe_customer_id = ?, subscription_tier = ?, seats = ?, is_personal = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      updatedOrganization.slug,
      updatedOrganization.name,
      updatedOrganization.domain,
      JSON.stringify(updatedOrganization.config),
      updatedOrganization.stripeCustomerId ?? null,
      updatedOrganization.subscriptionTier ?? 'free',
      updatedOrganization.seats ?? 1,
      isPersonal ? 1 : 0,
      updatedOrganization.updatedAt,
      organizationId
    ).run();

    this.clearCache(organizationId);
    return updatedOrganization;
  }

  async deleteOrganization(organizationId: string): Promise<boolean> {
    console.log('OrganizationService.deleteOrganization called with organizationId:', organizationId);
    
    // First check if the organization exists
    const existingOrganization = await this.getOrganization(organizationId);
    if (!existingOrganization) {
      console.log('❌ Organization not found for deletion:', organizationId);
      return false;
    }
    
    console.log('✅ Organization found for deletion:', { id: existingOrganization.id, slug: existingOrganization.slug, name: existingOrganization.name });
    
    try {
      const result = await this.env.DB.prepare('DELETE FROM organizations WHERE id = ?').bind(organizationId).run();
      console.log('Delete result:', { success: result.success });
      
      this.clearCache(organizationId);
      
      // Check if the operation was successful
      // In D1 local development, changes might be undefined but success is true
      if (result.success) {
        // Double-check by trying to get the organization again
        const verifyDeleted = await this.env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(organizationId).first();
        if (!verifyDeleted) {
          console.log('✅ Organization deleted successfully (verified by query)');
          return true;
        } else {
          console.log('❌ Delete operation reported success but organization still exists');
          return false;
        }
      } else {
        console.log('❌ Delete operation failed:', { success: result.success });
        return false;
      }
    } catch (error) {
      console.error('❌ Database error during organization deletion:', error);
      return false;
    }
  }


  async validateOrganizationAccess(organizationId: string, apiToken: string): Promise<boolean> {
    try {
      // First, retrieve the organization to verify it exists
      const organization = await this.getOrganization(organizationId);
      if (!organization) {
        console.log(`❌ Organization not found: ${organizationId}`);
        return false;
      }

      // Hash the provided API token for comparison
      const hashedToken = await this.hashToken(apiToken);

      // Check the secure organization_api_tokens table
      const tokenResult = await this.env.DB.prepare(`
        SELECT id, token_hash FROM organization_api_tokens 
        WHERE organization_id = ? AND token_hash = ? AND active = 1
      `).bind(organizationId, hashedToken).first();

      if (tokenResult) {
        // Update last_used_at timestamp
        await this.env.DB.prepare(`
          UPDATE organization_api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(tokenResult.id).run();
        
        console.log(`✅ API token validated from secure database for organization: ${organizationId}`);
        return true;
      }

      console.log(`❌ Invalid API token for organization: ${organizationId}`);
      return false;
    } catch (error) {
      console.error(`❌ Error validating organization access for ${organizationId}:`, error);
      return false;
    }
  }

  /**
   * Create a new API token for a organization
   */
  async createApiToken(organizationId: string, tokenName: string, permissions: string[] = [], createdBy?: string): Promise<{ token: string; tokenId: string }> {
    // Generate a secure random token
    const token = this.generateSecureToken();
    const tokenHash = await this.hashToken(token);
    const tokenId = this.generateULID();

    await this.env.DB.prepare(`
      INSERT INTO organization_api_tokens (id, organization_id, token_name, token_hash, permissions, created_by, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tokenId,
      organizationId,
      tokenName,
      tokenHash,
      JSON.stringify(permissions),
      createdBy || 'system',
      1
    ).run();

    return { token, tokenId };
  }

  /**
   * Revoke an API token
   */
  async revokeApiToken(tokenId: string): Promise<{ success: boolean; alreadyRevoked?: boolean }> {
    // Try to revoke the token directly
    const result = await this.env.DB.prepare(`
      UPDATE organization_api_tokens SET active = 0 WHERE id = ? AND active = 1
    `).bind(tokenId).run();
    
    // Check if rows were actually updated using meta.changes
    if (result.meta?.changes && result.meta.changes > 0) {
      // Token was successfully revoked
      return { success: true };
    }
    
    // No rows updated - check if token exists
    const token = await this.env.DB.prepare(`
      SELECT id FROM organization_api_tokens WHERE id = ?
    `).bind(tokenId).first();
    
    if (!token) {
      // Token doesn't exist
      return { success: false };
    }
    
    // Token exists but is already inactive
    return { success: true, alreadyRevoked: true };
  }

  /**
   * List active API tokens for a organization
   */
  async listApiTokens(organizationId: string): Promise<Array<{
    id: string;
    tokenName: string;
    permissions: string[];
    createdAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
    active: boolean;
  }>> {
    const tokens = await this.env.DB.prepare(`
      SELECT id, token_name, permissions, created_at, last_used_at, expires_at, active
      FROM organization_api_tokens 
      WHERE organization_id = ? AND active = 1
      ORDER BY created_at DESC
    `).bind(organizationId).all();

    return tokens.results.map(row => ({
      id: row.id as string,
      tokenName: row.token_name as string,
      permissions: JSON.parse(row.permissions as string || '[]'),
      createdAt: row.created_at as string,
      lastUsedAt: row.last_used_at as string || undefined,
      expiresAt: row.expires_at as string || undefined,
      active: Boolean(row.active)
    }));
  }

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
  async validateApiKey(organizationId: string, providedKey: string): Promise<boolean> {
    try {
      const organization = await this.getOrganization(organizationId);
      if (!organization?.config.blawbyApi?.enabled) {
        return false;
      }

      const { apiKey, apiKeyHash } = organization.config.blawbyApi;

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
      console.error(`❌ Error validating API key for organization ${organizationId}:`, error);
      return false;
    }
  }

  /**
   * Generate and store a hash for an existing API key
   * This method can be used to migrate organizations from plaintext to hashed API keys
   */
  async generateApiKeyHash(organizationId: string): Promise<boolean> {
    try {
      const organization = await this.getOrganization(organizationId);
      if (!organization || !organization.config.blawbyApi?.apiKey) {
        console.log(`❌ Organization not found or no API key configured: ${organizationId}`);
        return false;
      }

      // Generate hash for the existing API key (apiKey is guaranteed to be string here due to check above)
      const apiKeyHash = await this.hashToken(organization.config.blawbyApi.apiKey!);
      
      // Validate the generated hash
      if (!this.isValidApiKeyHash(apiKeyHash)) {
        console.error(`❌ Generated invalid API key hash for organization: ${organizationId}`);
        return false;
      }
      
      // Update the organization config to include the hash and optionally nullify the plaintext key
      const updatedConfig = {
        ...organization.config,
        blawbyApi: {
          ...organization.config.blawbyApi,
          apiKeyHash,
          // Optionally set apiKey to null after migration (uncomment when ready)
          // apiKey: null
        }
      };

      // Update the organization in the database
      // Note: updated_at is automatically handled by database trigger
      const result = await this.env.DB.prepare(`
        UPDATE organizations SET config = ? WHERE id = ?
      `).bind(JSON.stringify(updatedConfig), organizationId).run();

      // Check if rows were actually updated using meta.changes
      if (result.meta?.changes && result.meta.changes > 0) {
        // Clear the cache for this organization
        this.clearCache(organizationId);
        console.log(`✅ API key hash generated and stored for organization: ${organizationId}`);
        return true;
      }

      // Log detailed error information for debugging
      console.error(`❌ Failed to update organization config for organization ${organizationId}:`, {
        organizationId,
        result,
        updatePayload: {
          config: updatedConfig,
          timestamp: new Date().toISOString()
        }
      });
      return false;
    } catch (error) {
      console.error(`❌ Error generating API key hash for ${organizationId}:`, error);
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

  async markBusinessOnboardingComplete(organizationId: string): Promise<boolean> {
    // Get the normalized organization to check kind (not deprecated is_personal)
    const organization = await this.getOrganization(organizationId);
    if (!organization) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    // Guard: ensure organization is of kind 'business' before completing onboarding
    if (organization.kind !== 'business') {
      throw new Error(`Cannot complete business onboarding for a ${organization.kind} organization`);
    }

    // Load onboarding data and config for field mapping
    const row = await this.env.DB.prepare(
      `SELECT config, business_onboarding_data as data, name
         FROM organizations
        WHERE id = ?
        LIMIT 1`
    ).bind(organizationId).first<{ config: string | null; data: string | null; name: string }>();

    if (!row) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    // Parse current config JSON safely
    let configObj: Record<string, unknown> = {};
    try {
      if (row.config) {
        configObj = JSON.parse(row.config) as Record<string, unknown>;
      }
    } catch { /* keep default empty object */ }

    // Parse saved onboarding data safely
    let onboardingData: Record<string, unknown> = {};
    try {
      if (row.data) {
        onboardingData = JSON.parse(row.data) as Record<string, unknown>;
      }
    } catch { /* ignore corrupt onboarding data */ }

    // Validation helpers
    const sanitize = (value: unknown, maxLen: number): string => {
      if (typeof value !== 'string') return '';
      // Remove control characters except common whitespace, then trim
      // eslint-disable-next-line no-control-regex
      const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
      if (cleaned.length === 0) return '';
      return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
    };

    // Extract and validate mapped fields
    const firmName = sanitize(onboardingData?.['firmName'], 255);
    const overview = sanitize(onboardingData?.['overview'], 2000);

    // Prepare updated values, preserving existing ones when onboarding fields are missing
    const nextName = firmName || row.name;
    const nextConfig = {
      ...configObj,
      // Map overview into description inside config
      ...(overview ? { description: overview } : {}),
    } as Record<string, unknown>;

    // Perform atomic update: set completion flags and map fields
    const result = await this.env.DB.prepare(
      `UPDATE organizations 
         SET name = ?,
             config = ?,
             business_onboarding_completed_at = strftime('%s','now'),
             business_onboarding_data = NULL,
             business_onboarding_skipped = 0,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(nextName, JSON.stringify(nextConfig), organizationId).run();

    const changes = (result as unknown as { meta?: { changes?: number } ; changes?: number })?.meta?.changes ?? (result as unknown as { changes?: number })?.changes ?? 0;
    if (changes > 0) {
      this.clearCache(organizationId);
      return true;
    }

    // Organization exists but no update occurred - likely already completed with same values
    return false;
  }

  async markBusinessOnboardingSkipped(organizationId: string): Promise<boolean> {
    const result = await this.env.DB.prepare(
      `UPDATE organizations 
         SET business_onboarding_skipped = 1,
             business_onboarding_data = NULL,
             business_onboarding_completed_at = NULL,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(organizationId).run();
    const changes = (result as unknown as { meta?: { changes?: number } ; changes?: number })?.meta?.changes ?? (result as unknown as { changes?: number })?.changes ?? 0;
    if (changes > 0) {
      this.clearCache(organizationId);
      return true;
    }
    return false;
  }

  async saveBusinessOnboardingProgress(organizationId: string, data: Record<string, unknown>): Promise<void> {
    const result = await this.env.DB.prepare(
      `UPDATE organizations 
         SET business_onboarding_data = ?,
             business_onboarding_completed_at = NULL,
             business_onboarding_skipped = 0,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(JSON.stringify(data), organizationId).run();
    const changes = (result as unknown as { meta?: { changes?: number } ; changes?: number })?.meta?.changes ?? (result as unknown as { changes?: number })?.changes ?? 0;
    if (changes === 0) {
      throw new Error(`No organization updated when saving onboarding progress (organizationId=${organizationId})`);
    }
    this.clearCache(organizationId);
  }

  async getBusinessOnboardingStatus(organizationId: string): Promise<{
    status: 'completed' | 'skipped' | 'pending' | 'not_required';
    completed: boolean;
    skipped: boolean;
    completedAt: number | null;
    lastSavedAt: number | null;
    hasDraft: boolean;
    data: Record<string, unknown> | null;
  }> {
    const row = await this.env.DB.prepare(
      `SELECT business_onboarding_completed_at as completedAt,
              business_onboarding_skipped as skipped,
              business_onboarding_data as data,
              updated_at as updatedAt,
              is_personal as isPersonal
         FROM organizations
        WHERE id = ?
        LIMIT 1`
    ).bind(organizationId).first<{ completedAt: number | null | string; skipped: number | null | string; data: string | null; updatedAt: string | number | null; isPersonal: number | null | boolean | string }>();

    const completedAt = parseOnboardingCompletedAt(row?.completedAt ?? undefined) ?? null;
    const skipped = parseOnboardingSkipped(row?.skipped ?? undefined);
    const data = parseOnboardingData(row?.data ?? null);
    const lastSavedAt = (() => {
      const value = row?.updatedAt;
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        // If numeric-like, try Number first (seconds or ms)
        const maybeNum = Number(value);
        if (Number.isFinite(maybeNum)) {
          return maybeNum;
        }
        // Fallback to Date parsing for full datetime strings
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
      }
      return null;
    })();

    const isPersonal = (() => {
      const value = row?.isPersonal;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value === 1;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === '1' || normalized === 'true';
      }
      return false;
    })();

    const status: 'completed' | 'skipped' | 'pending' | 'not_required' = (() => {
      if (isPersonal) {
        return 'not_required';
      }
      if (typeof completedAt === 'number') {
        return 'completed';
      }
      if (skipped) {
        return 'skipped';
      }
      return 'pending';
    })();

    return {
      status,
      completed: status === 'completed',
      skipped,
      completedAt,
      lastSavedAt,
      hasDraft: data != null && Object.keys(data).length > 0,
      data,
    };

  }

  clearCache(organizationId?: string): void {
    if (organizationId) {
      this.orgCache.delete(organizationId);
      this.configCache.delete(organizationId);
    } else {
      this.orgCache.clear();
      this.configCache.clear();
    }
  }
}
