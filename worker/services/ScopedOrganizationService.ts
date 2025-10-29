import type { Env } from '../types.js';
import { OrganizationService } from './OrganizationService.js';
import { SessionService } from './SessionService.js';
import { ActivityService } from './ActivityService.js';
import { StatusService } from './StatusService.js';

/**
 * Scoped organization service that automatically filters all operations
 * by the provided organization ID, reducing the need to pass organizationId
 * to every method call.
 */
export class ScopedOrganizationService {
  constructor(
    private organizationId: string,
    private env: Env
  ) {}

  /**
   * Get the organization ID for this scoped service
   */
  getOrganizationId(): string {
    return this.organizationId;
  }

  /**
   * Get the environment object
   */
  getEnv(): Env {
    return this.env;
  }

  /**
   * Get organization details
   */
  async getOrganization() {
    const orgService = new OrganizationService(this.env);
    return orgService.getOrganization(this.organizationId);
  }

  /**
   * Get organization configuration
   */
  async getOrganizationConfig() {
    const orgService = new OrganizationService(this.env);
    return orgService.getOrganizationConfig(this.organizationId);
  }

  /**
   * Create a scoped session service
   */
  createSessionService() {
    return new ScopedSessionService(this.organizationId, this.env);
  }

  /**
   * Create a scoped activity service
   */
  createActivityService() {
    return new ScopedActivityService(this.organizationId, this.env);
  }

  /**
   * Create a scoped status service
   */
  createStatusService() {
    return new ScopedStatusService(this.organizationId, this.env);
  }

  /**
   * Execute a database query with automatic organization filtering
   */
  async queryWithOrganization<T = unknown>(
    query: string,
    params: unknown[] = []
  ): Promise<T[]> {
    // Automatically add organization_id filter to WHERE clauses
    const hasWhere = query.toLowerCase().includes('where');
    const organizationFilter = hasWhere 
      ? ` AND organization_id = ?`
      : ` WHERE organization_id = ?`;
    
    const modifiedQuery = query + organizationFilter;
    const modifiedParams = [...params, this.organizationId];
    
    const result = await this.env.DB.prepare(modifiedQuery)
      .bind(...modifiedParams)
      .all();
    
    return result.results as T[];
  }

  /**
   * Execute a single database query with automatic organization filtering
   */
  async queryOneWithOrganization<T = unknown>(
    query: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const hasWhere = query.toLowerCase().includes('where');
    const organizationFilter = hasWhere 
      ? ` AND organization_id = ?`
      : ` WHERE organization_id = ?`;
    
    const modifiedQuery = query + organizationFilter;
    const modifiedParams = [...params, this.organizationId];
    
    const result = await this.env.DB.prepare(modifiedQuery)
      .bind(...modifiedParams)
      .first();
    
    return result as T | null;
  }
}

/**
 * Scoped session service that automatically uses the organization ID
 */
export class ScopedSessionService {
  constructor(
    private organizationId: string,
    private env: Env
  ) {}

  /**
   * Get the organization ID for this scoped service
   */
  getOrganizationId(): string {
    return this.organizationId;
  }

  /**
   * Resolve session with automatic organization ID
   */
  async resolveSession(options: {
    request?: Request;
    sessionId?: string;
    sessionToken?: string | null;
    retentionHorizonDays?: number;
    createIfMissing?: boolean;
  }) {
    return SessionService.resolveSession(this.env, {
      ...options,
      organizationId: this.organizationId
    });
  }

  /**
   * Get session by ID with organization validation
   */
  async getSessionById(sessionId: string) {
    const session = await SessionService.getSessionById(this.env, sessionId);
    
    // Validate organization access
    if (session && session.organizationId !== this.organizationId) {
      throw new Error('Session does not belong to the specified organization');
    }
    
    return session;
  }

  /**
   * Create session with automatic organization ID
   */
  async createSession(options: {
    sessionId?: string;
    sessionToken?: string;
    retentionHorizonDays?: number;
  }) {
    return SessionService.createSession(this.env, {
      ...options,
      organizationId: this.organizationId
    });
  }
}

/**
 * Scoped activity service that automatically uses the organization ID
 */
export class ScopedActivityService {
  constructor(
    private organizationId: string,
    private env: Env
  ) {}

  /**
   * Create activity with automatic organization ID
   */
  async createActivity(activityData: {
    type: 'matter_event' | 'session_event';
    eventType: string;
    title: string;
    description: string;
    eventDate: string;
    actorType?: 'user' | 'lawyer' | 'system';
    actorId?: string;
    matterId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const activityService = new ActivityService(this.env);
    // Note: uid is auto-generated by ActivityService.createEvent, so we don't include it here
    return activityService.createEvent({
      type: activityData.type,
      eventType: activityData.eventType,
      title: activityData.title,
      description: activityData.description,
      eventDate: activityData.eventDate,
      actorType: activityData.actorType,
      actorId: activityData.actorId,
      metadata: {
        ...activityData.metadata,
        ...(activityData.matterId ? { matterId: activityData.matterId } : {}),
        ...(activityData.sessionId ? { sessionId: activityData.sessionId } : {})
      }
    }, this.organizationId);
  }

  /**
   * Get activities with automatic organization filtering
   */
  async getActivities(options: {
    limit?: number;
    cursor?: string;
    since?: string;
    until?: string;
    type?: string[];
    actorType?: 'user' | 'lawyer' | 'system';
    matterId?: string;
    sessionId?: string;
  } = {}) {
    const activityService = new ActivityService(this.env);
    return activityService.queryActivity({
      ...options,
      organizationId: this.organizationId
    });
  }
}

/**
 * Scoped status service that automatically uses the organization ID
 */
export class ScopedStatusService {
  constructor(
    private organizationId: string,
    private env: Env
  ) {}

  /**
   * Create status with automatic organization ID
   */
  async createStatus(statusData: {
    id: string;
    sessionId: string;
    organizationId: string;
    type: 'file_processing' | 'document_analysis' | 'background_task' | 'system_notification' | 'matter_update';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    message: string;
    progress?: number;
    data?: Record<string, unknown>;
  }) {
    return StatusService.setStatus(this.env, statusData);
  }

  /**
   * Get statuses with automatic organization filtering
   */
  async getStatuses(options: {
    limit?: number;
    offset?: number;
    type?: string;
    sessionId?: string;
    matterId?: string;
  } = {}) {
    if (options.sessionId) {
      return StatusService.getSessionStatuses(this.env, options.sessionId);
    }
    // If no sessionId, return empty array (StatusService.getSessionStatuses requires sessionId)
    return [];
  }
}
