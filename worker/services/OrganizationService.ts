import { Env } from '../types.js';
import { ValidationService } from './ValidationService.js';
import { ValidationError } from '../utils/validationErrors.js';
// import { getAuth } from '../auth/index.js'; // Unused import

export type OrganizationVoiceProvider = 'cloudflare' | 'elevenlabs' | 'custom';

export interface OrganizationVoiceConfig {
  enabled: boolean;
  provider: OrganizationVoiceProvider;
  voiceId?: string;
  displayName?: string;
  previewUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  domain?: string;
  metadata?: Record<string, unknown>;
  config: OrganizationConfig;
  createdAt: number;
  updatedAt: number;
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
  voice: OrganizationVoiceConfig;
  blawbyApi?: {
    enabled: boolean;
    apiKey?: string | null;  // Optional/nullable for migration to hash-at-rest
    apiKeyHash?: string;     // Lowercase hex SHA-256 hash (32 bytes -> 64 hex chars)
    organizationUlid?: string;       // Organization identifier for API calls
    apiUrl?: string;
  };
  testMode?: boolean;  // Organization-level testing flag for notifications and other features
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

export class OrganizationService {
  private organizationCache = new Map<string, { organization: Organization; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private env: Env) {}

  private getDefaultConfig(): OrganizationConfig {
    return buildDefaultOrganizationConfig(this.env);
  }

  /**
   * Resolves environment variable placeholders in organization configuration
   * This allows storing sensitive data like API keys as environment variable references
   * Supports generic ${VAR_NAME} pattern matching
   */
  private resolveEnvironmentVariables<T>(config: T): T {
    if (config === null || typeof config !== 'object') {
      return config;
    }

    if (Array.isArray(config)) {
      return config.map(item => this.resolveEnvironmentVariables(item)) as unknown as T;
    }

    const resolvedEntries = Object.entries(config as Record<string, unknown>).map(([key, value]) => {
      if (value && typeof value === 'object') {
        return [key, this.resolveEnvironmentVariables(value)];
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

  async getOrganization(organizationId: string): Promise<Organization | null> {
    console.log('OrganizationService.getOrganization called with organizationId:', organizationId);
    
    // Check cache first
    const cached = this.organizationCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached organization');
      return cached.organization;
    }

    try {
      // Query Better Auth organizations table - support both ID and slug lookups
      console.log('Querying database for organization...');
      const orgRow = await this.env.DB.prepare(
        'SELECT id, name, slug, domain, config, created_at FROM organizations WHERE id = ? OR slug = ?'
      ).bind(organizationId, organizationId).first();
      
      if (orgRow) {
        const rawConfig = orgRow.config ? JSON.parse(orgRow.config as string) : {};
        const resolvedConfig = this.resolveEnvironmentVariables(rawConfig);
        const normalizedConfig = this.validateAndNormalizeConfig(resolvedConfig as OrganizationConfig, false, organizationId);
        
        const organization: Organization = {
          id: orgRow.id as string,
          name: orgRow.name as string,
          slug: orgRow.slug as string,
          domain: orgRow.domain as string | undefined,
          config: normalizedConfig,
          createdAt: new Date(orgRow.created_at as string).getTime(),
          updatedAt: new Date(orgRow.updated_at as string).getTime(),
        };
        
        console.log('Found organization:', { id: organization.id, slug: organization.slug, name: organization.name });
        this.organizationCache.set(organizationId, { organization, timestamp: Date.now() });
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


  async listOrganizations(userId?: string): Promise<Organization[]> {
    try {
      if (userId) {
        // Get organizations where user is a member
        const orgRows = await this.env.DB.prepare(`
          SELECT o.id, o.name, o.slug, o.domain, o.config, o.created_at
          FROM organizations o
          INNER JOIN members m ON o.id = m.organization_id
          WHERE m.user_id = ?
          ORDER BY o.created_at DESC
        `).bind(userId).all();
        
        return orgRows.results.map(row => {
          const rawConfig = row.config ? JSON.parse(row.config as string) : {};
          const resolvedConfig = this.resolveEnvironmentVariables(rawConfig);
          const normalizedConfig = this.validateAndNormalizeConfig(resolvedConfig as OrganizationConfig, false, row.id as string);
          
          return {
            id: row.id as string,
            name: row.name as string,
            slug: row.slug as string,
            domain: row.domain as string | undefined,
            config: normalizedConfig,
            createdAt: new Date(row.created_at as string).getTime(),
            updatedAt: new Date(row.updated_at as string).getTime(),
          };
        });
      } else {
        // Get all organizations (for admin purposes)
        const orgRows = await this.env.DB.prepare(`
          SELECT id, name, slug, domain, config, created_at
          FROM organizations
          ORDER BY created_at DESC
        `).all();
        
        return orgRows.results.map(row => {
          const rawConfig = row.config ? JSON.parse(row.config as string) : {};
          const resolvedConfig = this.resolveEnvironmentVariables(rawConfig);
          const normalizedConfig = this.validateAndNormalizeConfig(resolvedConfig as OrganizationConfig, false, row.id as string);
          
          return {
            id: row.id as string,
            name: row.name as string,
            slug: row.slug as string,
            domain: row.domain as string | undefined,
            config: normalizedConfig,
            createdAt: new Date(row.created_at as string).getTime(),
            updatedAt: new Date(row.updated_at as string).getTime(),
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

  async createOrganization(organizationData: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<Organization> {
    const id = this.generateULID();
    const now = new Date().toISOString();
    
    // Validate and normalize the organization configuration
    const normalizedConfig = this.validateAndNormalizeConfig(organizationData.config, true, id);
    
    const organization: Organization = {
      ...organizationData,
      config: normalizedConfig,
      id,
      createdAt: new Date(now).getTime(),
      updatedAt: new Date(now).getTime()
    };

    console.log('OrganizationService.createOrganization: Attempting to insert organization:', { id: organization.id, slug: organization.slug, name: organization.name });
    
    try {
      const result = await this.env.DB.prepare(`
        INSERT INTO organizations (id, slug, name, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        organization.id,
        organization.slug,
        organization.name,
        JSON.stringify(organization.config),
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
    const { id: _ignoreId, createdAt: _ignoreCreatedAt, ...mutableUpdates } = updates;

    // Validate and normalize the organization configuration if it's being updated
    let normalizedConfig = existingOrganization.config;
    if (mutableUpdates.config) {
      normalizedConfig = this.validateAndNormalizeConfig(mutableUpdates.config, true, organizationId);
    }
    
    const updatedOrganization: Organization = {
      ...existingOrganization,
      ...mutableUpdates,
      config: normalizedConfig,
      updatedAt: new Date().getTime()
    };

    await this.env.DB.prepare(`
      UPDATE organizations 
      SET slug = ?, name = ?, config = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      updatedOrganization.slug,
      updatedOrganization.name,
      JSON.stringify(updatedOrganization.config),
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
      const result = await this.env.DB.prepare(`
        UPDATE organizations SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
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

  clearCache(organizationId?: string): void {
    if (organizationId) {
      this.organizationCache.delete(organizationId);
    } else {
      this.organizationCache.clear();
    }
  }
} 
