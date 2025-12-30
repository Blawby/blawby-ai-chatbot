import { parseEnvBool } from './safeStringUtils.js';

export class Logger {
  private static env?: { DEBUG?: string; NODE_ENV?: string };

  /**
   * Initialize Logger with environment variables (required for Cloudflare Workers)
   */
  static initialize(env: { DEBUG?: string; NODE_ENV?: string }): void {
    // Validate input parameter
    if (!env || typeof env !== 'object') {
      throw new Error('Logger.initialize: env parameter must be a non-null object');
    }

    // Check if already initialized (idempotent behavior)
    if (this.env !== undefined) {
      console.warn('[WARN] Logger.initialize: Logger has already been initialized, skipping re-initialization');
      return;
    }

    // Assign environment after validation
    this.env = env;
  }

  /**
   * Get the current environment from initialized Logger
   */
  static getEnvironment(): string {
    // Check if Logger has been initialized
    if (this.env === undefined) {
      throw new Error('Logger.getEnvironment: Logger has not been initialized. Call Logger.initialize() first.');
    }
    
    return this.env.NODE_ENV || 'production';
  }

  private static isDebugEnabled(): boolean {
    // Use injected environment variables (Cloudflare Workers don't have process.env)
    const debug = this.env?.DEBUG;
    const nodeEnv = this.env?.NODE_ENV;
    
    return parseEnvBool(debug) || nodeEnv === 'development';
  }

  static debug(message: string, data?: unknown): void {
    if (this.isDebugEnabled()) {
      console.log(`[DEBUG] ${message}`, data);
    }
  }

  static info(message: string, data?: unknown): void {
    console.log(`[INFO] ${message}`, data);
  }

  static warn(message: string, data?: unknown): void {
    console.warn(`[WARN] ${message}`, data);
  }

  static error(message: string, error?: unknown): void {
    console.error(`[ERROR] ${message}`, error);
  }

  /**
   * Safely logs practice configuration data by redacting sensitive information
   */
  static logPracticeConfig(practice: Record<string, unknown>, includeConfig: boolean = false): void {
    if (!practice) {
      this.warn('logPracticeConfig called with null/undefined practice');
      return;
    }

    const safePracticeData = {
      id: practice.id,
      slug: practice.slug,
      name: practice.name,
      createdAt: practice.createdAt,
      updatedAt: practice.updatedAt
    };

    if (includeConfig && this.isDebugEnabled()) {
      // Create a sanitized version of the config
      const sanitizedConfig = this.sanitizeConfig(practice.config);
      (safePracticeData as Record<string, unknown>).config = sanitizedConfig;
    }

    this.info('Practice data:', safePracticeData);
  }

  /**
   * Sanitizes configuration data to remove sensitive information
   */
  private static sanitizeConfig(config: unknown): Record<string, unknown> {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return {};

    const sanitized = { ...(config as Record<string, unknown>) };

    // Mask sensitive fields
    const sensitiveFields = [
      'apiToken', 'token', 'secret', 'password', 'key', 'credential',
      'email', 'ownerEmail', 'contactEmail',
      'apiUrl', 'url', 'endpoint', 'webhook',
      'privateKey', 'publicKey', 'certificate'
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        if (typeof sanitized[field] === 'string') {
          const value = sanitized[field] as string;
          if (value.includes('@')) {
            // Email-like field
            const [local, domain] = value.split('@');
            sanitized[field] = `${local.substring(0, 2)}***@${domain}`;
          } else if (value.startsWith('http')) {
            // URL-like field
            sanitized[field] = '***REDACTED_URL***';
          } else if (value.length > 8) {
            // Long string (likely token/secret)
            sanitized[field] = `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
          } else {
            sanitized[field] = '***REDACTED***';
          }
        } else {
          sanitized[field] = '***REDACTED***';
        }
      }
    }

    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeConfig(value as Record<string, unknown>);
      }
    }

    return sanitized;
  }
}
