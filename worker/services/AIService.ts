// Import OrganizationConfig helpers from OrganizationService instead of defining it here
import { OrganizationConfig, buildDefaultOrganizationConfig } from './OrganizationService.js';
import { RemoteApiService } from './RemoteApiService.js';
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
  
  async getOrganizationConfig(organizationId: string, request?: Request): Promise<OrganizationConfig> {
    Logger.debug('AIService.getOrganizationConfig called with organizationId:', organizationId);
    const cached = this.organizationConfigCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      Logger.debug('Returning cached organization config');
      return cached.config;
    }

    try {
      // Fetch organization config from remote API
      const config = await RemoteApiService.getOrganizationConfig(this.env, organizationId, request);
      
      if (config) {
        Logger.debug('Fetched organization config from remote API');
        this.organizationConfigCache.set(organizationId, { config, timestamp: Date.now() });
        return config;
      } else {
        Logger.info('No organization found in remote API');
      }
    } catch (error) {
      Logger.warn('Failed to fetch organization config from remote API:', error);
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
