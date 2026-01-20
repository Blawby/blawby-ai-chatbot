import type { Env } from '../types.js';

export interface StatusUpdate {
  id: string;
  conversationId: string;
  practiceId: string;
  type: 'file_processing' | 'document_analysis' | 'background_task' | 'system_notification' | 'matter_update';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
  progress?: number; // 0-100
  data?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface StatusSubscription {
  conversationId: string;
  practiceId: string;
  lastSeen: number;
}

export class StatusService {
  private static readonly STATUS_PREFIX = 'status:';
  private static readonly CREATED_AT_PREFIX = 'created_at:';
  private static readonly SUBSCRIPTION_PREFIX = 'sub:';
  private static readonly STATUS_TTL = 24 * 60 * 60; // 24 hours
  private static readonly SUBSCRIPTION_TTL = 60 * 60; // 1 hour

  /**
   * Create or update a status entry
   */
  static async setStatus(
    env: Env,
    statusUpdate: Omit<StatusUpdate, 'createdAt' | 'updatedAt' | 'expiresAt'>,
    createdAt?: number
  ): Promise<void> {
    const now = Date.now();
    const key = `${StatusService.STATUS_PREFIX}${statusUpdate.id}`;
    
    // Use provided createdAt or current time for new entries
    const finalCreatedAt = createdAt ?? now;
    
    const status: StatusUpdate = {
      ...statusUpdate,
      createdAt: finalCreatedAt,
      updatedAt: now,
      expiresAt: now + (StatusService.STATUS_TTL * 1000)
    };

    await env.CHAT_SESSIONS.put(key, JSON.stringify(status), {
      expirationTtl: StatusService.STATUS_TTL
    });

    console.log(`Status updated: ${status.type} - ${status.status} for conversation ${status.conversationId}`);
  }

  /**
   * Get the createdAt timestamp for a status ID
   */
  static async getStatusCreatedAt(env: Env, statusId: string): Promise<number | null> {
    const status = await StatusService.getStatus(env, statusId);
    return status?.createdAt ?? null;
  }

  /**
   * Get a specific status by ID
   */
  static async getStatus(env: Env, statusId: string): Promise<StatusUpdate | null> {
    const key = `${StatusService.STATUS_PREFIX}${statusId}`;
    const result = await env.CHAT_SESSIONS.get(key);
    
    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result) as StatusUpdate;
    } catch (error) {
      console.error('Failed to parse status:', error);
      return null;
    }
  }

  /**
   * Get all status updates for a conversation
   */
  static async getConversationStatuses(env: Env, conversationId: string): Promise<StatusUpdate[]> {
    const prefix = `${StatusService.STATUS_PREFIX}`;
    const list = await env.CHAT_SESSIONS.list({ prefix });
    
    const _statuses: StatusUpdate[] = [];
    
    // Get all values in parallel for better performance
    const getPromises = list.keys.map(async (keyEntry) => {
      const value = await env.CHAT_SESSIONS.get(keyEntry.name);
      if (!value) return null;
      
      try {
        const status = JSON.parse(value) as StatusUpdate;
        if (status.conversationId === conversationId) {
          return status;
        }
      } catch (error) {
        console.error('Failed to parse status from list:', error);
      }
      return null;
    });
    
    const results = await Promise.all(getPromises);
    const validStatuses = results.filter((status): status is StatusUpdate => status !== null);

    // Sort by creation time, newest first
    return validStatuses.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get recent status updates for a conversation (since lastSeen timestamp)
   */
  static async getRecentStatuses(
    env: Env, 
    conversationId: string, 
    lastSeen: number
  ): Promise<StatusUpdate[]> {
    const allStatuses = await StatusService.getConversationStatuses(env, conversationId);
    return allStatuses.filter(status => status.updatedAt > lastSeen);
  }

  /**
   * Register a conversation subscription for real-time updates
   */
  static async subscribeConversation(
    env: Env,
    conversationId: string,
    practiceId: string
  ): Promise<void> {
    const subscription: StatusSubscription = {
      conversationId,
      practiceId,
      lastSeen: Date.now()
    };

    const key = `${StatusService.SUBSCRIPTION_PREFIX}${conversationId}`;
    await env.CHAT_SESSIONS.put(key, JSON.stringify(subscription), {
      expirationTtl: StatusService.SUBSCRIPTION_TTL
    });
  }

  /**
   * Update subscription last seen timestamp
   */
  static async updateSubscriptionLastSeen(
    env: Env,
    conversationId: string,
    lastSeen?: number
  ): Promise<void> {
    const key = `${StatusService.SUBSCRIPTION_PREFIX}${conversationId}`;
    const existing = await env.CHAT_SESSIONS.get(key);
    
    if (existing) {
      try {
        const subscription = JSON.parse(existing) as StatusSubscription;
        subscription.lastSeen = lastSeen ?? Date.now();
        
        await env.CHAT_SESSIONS.put(key, JSON.stringify(subscription), {
          expirationTtl: StatusService.SUBSCRIPTION_TTL
        });
      } catch (error) {
        console.error('Failed to update subscription:', error);
      }
    }
  }

  /**
   * Unsubscribe a conversation
   */
  static async unsubscribeConversation(env: Env, conversationId: string): Promise<void> {
    const key = `${StatusService.SUBSCRIPTION_PREFIX}${conversationId}`;
    await env.CHAT_SESSIONS.delete(key);
  }

  /**
   * Clean up expired status entries
   */
  static async cleanupExpiredStatuses(env: Env): Promise<number> {
    const prefix = `${StatusService.STATUS_PREFIX}`;
    const list = await env.CHAT_SESSIONS.list({ prefix });
    const now = Date.now();
    let cleaned = 0;

    // Process all keys in parallel for better performance
    const deletePromises = list.keys.map(async (keyEntry) => {
      const value = await env.CHAT_SESSIONS.get(keyEntry.name);
      if (!value) return false;
      
      try {
        const status = JSON.parse(value) as StatusUpdate;
        if (status.expiresAt < now) {
          await env.CHAT_SESSIONS.delete(keyEntry.name);
          return true;
        }
      } catch (_error) {
        // If we can't parse it, delete it
        await env.CHAT_SESSIONS.delete(keyEntry.name);
        return true;
      }
      return false;
    });
    
    const results = await Promise.all(deletePromises);
    cleaned = results.filter(Boolean).length;

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired status entries`);
    }

    return cleaned;
  }

  /**
   * Create a status update for file processing
   */
  static async createFileProcessingStatus(
    env: Env,
    conversationId: string,
    practiceId: string,
    fileName: string,
    status: StatusUpdate['status'] = 'pending',
    progress?: number
  ): Promise<string> {
    const statusId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    await StatusService.setStatus(env, {
      id: statusId,
      conversationId,
      practiceId,
      type: 'file_processing',
      status,
      message: `Processing ${fileName}...`,
      progress,
      data: { fileName }
    });

    return statusId;
  }

  /**
   * Create a status update for document analysis
   */
  static async createDocumentAnalysisStatus(
    env: Env,
    conversationId: string,
    practiceId: string,
    fileName: string,
    status: StatusUpdate['status'] = 'processing',
    priority: number = 10
  ): Promise<string> {
    // Validate inputs
    if (!conversationId || !practiceId || !fileName) {
      throw new Error('conversationId, practiceId, and fileName are required');
    }
    
    if (!['pending', 'processing', 'completed', 'failed'].includes(status)) {
      throw new Error('Invalid status value');
    }
    
    if (typeof priority !== 'number' || priority < 0) {
      throw new Error('Priority must be a non-negative number');
    }

    const statusId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const now = Date.now();
    
    const statusUpdate: Omit<StatusUpdate, 'createdAt' | 'updatedAt' | 'expiresAt'> = {
      id: statusId,
      conversationId,
      practiceId,
      type: 'document_analysis',
      status,
      message: `Analyzing ${fileName}...`,
      data: { fileName, priority }
    };
    
    await StatusService.setStatus(env, statusUpdate, now);

    return statusId;
  }

  /**
   * Create a system notification
   */
  static async createSystemNotification(
    env: Env,
    conversationId: string,
    practiceId: string,
    message: string,
    data?: Record<string, unknown>
  ): Promise<string> {
    const statusId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    await StatusService.setStatus(env, {
      id: statusId,
      conversationId,
      practiceId,
      type: 'system_notification',
      status: 'completed',
      message,
      data
    });

    return statusId;
  }
}
