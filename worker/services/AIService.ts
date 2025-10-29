// Import OrganizationConfig helpers from OrganizationService instead of defining it here
import { OrganizationConfig, buildDefaultOrganizationConfig } from './OrganizationService.js';
import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import type { Ai } from '@cloudflare/workers-types';

// Optimized AI Service with caching and timeouts
export class AIService {
  private organizationConfigCache = new Map<string, { config: OrganizationConfig; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private ai: Ai, private env: Env) {
    // Initialize Logger with environment variables for Cloudflare Workers compatibility
    Logger.initialize({
      DEBUG: env.DEBUG,
      NODE_ENV: env.NODE_ENV
    });
  }
  
  async runLLM(
    messages: Array<Record<string, unknown>>,
    model: string = '@cf/openai/gpt-oss-20b'
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      // Type assertion to handle dynamic model strings - matches pattern used in analyze.ts
      const runModel = this.ai.run.bind(this.ai) as (model: string, payload: Record<string, unknown>) => Promise<unknown>;
      const result = await runModel(model, {
        messages,
        max_tokens: 500,
        temperature: 0.1, // Reduced from 0.4 to 0.1 for more factual responses
      });
      clearTimeout(timeout);
      return result;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }
  
  async getOrganizationConfig(organizationId: string): Promise<OrganizationConfig> {
    Logger.debug('AIService.getOrganizationConfig called with organizationId:', organizationId);
    const cached = this.organizationConfigCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      Logger.debug('Returning cached organization config');
      return cached.config;
    }

    try {
      // Use OrganizationService to get full organization object
      const { OrganizationService } = await import('./OrganizationService.js');
      const organizationService = new OrganizationService(this.env);
      const organization = await organizationService.getOrganization(organizationId);
      
      if (organization) {
        Logger.logOrganizationConfig(organization as unknown as Record<string, unknown>, true); // Include sanitized config in debug mode
        this.organizationConfigCache.set(organizationId, { config: organization.config, timestamp: Date.now() });
        return organization.config;
      } else {
        Logger.info('No organization found in database');
        Logger.debug('Available organizations:');
        const allOrganizations = await organizationService.listOrganizations();
        Logger.debug('All organizations:', allOrganizations.map(t => ({ id: t.id, slug: t.slug })));
      }
    } catch (error) {
      Logger.warn('Failed to fetch organization config:', error);
    }
    Logger.info('Returning default organization config');
    return buildDefaultOrganizationConfig(this.env);
  }

  // Clear cache for a specific organization or all organizations
  clearCache(organizationId?: string): void {
    if (organizationId) {
      this.organizationConfigCache.delete(organizationId);
    } else {
      this.organizationConfigCache.clear();
    }
  }

  // Agent handles all conversation logic - no manual validation needed
} 
