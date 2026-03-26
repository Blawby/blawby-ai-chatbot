import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import type { PracticeOrWorkspace } from '../types.js';
import { BackendEventService } from './BackendEventService.js';

export interface NotificationRequest {
  type: 'lawyer_review' | 'matter_created' | 'matter_update';
  practiceConfig?: PracticeOrWorkspace | null;
  practice?: PracticeOrWorkspace | null; // Alias for practiceConfig for backward compatibility
  matterInfo?: {
    type: string;
    urgency?: string;
    complexity?: string;
    description?: string;
  };
  clientInfo?: {
    name: string;
    email?: string;
    phone?: string;
  };
  update?: {
    action: 'accept' | 'reject' | 'status_change';
    fromStatus?: string | null;
    toStatus?: string | null;
    actorId?: string | null;
  };
}

/**
 * Safely extracts owner email from practice configuration
 * @param practiceConfig - Practice configuration object
 * @returns Owner email string or undefined if not available
 */
function extractOwnerEmail(practiceConfig: PracticeOrWorkspace | null): string | undefined {
  if (!practiceConfig?.conversationConfig?.ownerEmail) {
    return undefined;
  }
  
  const ownerEmail = practiceConfig.conversationConfig.ownerEmail;
  if (typeof ownerEmail !== 'string' || ownerEmail.trim().length === 0) {
    return undefined;
  }
  
  return ownerEmail.trim();
}

export class NotificationService {
  private eventService: BackendEventService;

  constructor(private env: Env) {
    // Initialize Logger with environment variables for Cloudflare Workers compatibility
    Logger.initialize({
      DEBUG: env.DEBUG,
      NODE_ENV: env.NODE_ENV
    });

    this.eventService = new BackendEventService(env);
  }

  async sendLawyerReviewNotification(request: NotificationRequest): Promise<void> {
    const { practiceConfig, practice, matterInfo } = request;
    const effectivePractice = practiceConfig ?? practice ?? null;
    
    try {
      const ownerEmail = extractOwnerEmail(effectivePractice);
      if (!ownerEmail) {
        Logger.info('No owner email configured for practice - skipping lawyer review notification');
        return;
      }
      await this.eventService.emitEvent({
        event_type: 'matter.review_required',
        practice_id: effectivePractice?.id,
        contact_email: ownerEmail,
        sla_metadata: {
          matterType: matterInfo?.type || 'Unknown',
          urgency: matterInfo?.urgency || 'Standard',
          complexity: matterInfo?.complexity || 'Standard',
          description: matterInfo?.description || 'No description provided'
        }
      });

      Logger.info('Lawyer review notification event emitted successfully');
    } catch (error) {
      Logger.warn('Failed to emit lawyer review notification event:', error);
    }
  }

  async sendMatterCreatedNotification(request: NotificationRequest): Promise<void> {
    const { practiceConfig, practice, matterInfo, clientInfo } = request;
    const effectivePractice = practiceConfig ?? practice ?? null;
    
    try {
      const ownerEmail = extractOwnerEmail(effectivePractice);
      if (!ownerEmail) {
        Logger.info('No owner email configured for practice - skipping matter creation notification');
        return;
      }
      await this.eventService.emitEvent({
        event_type: 'matter.created',
        practice_id: effectivePractice?.id,
        contact_email: ownerEmail,
        contact_identifier: clientInfo?.name || 'Unknown',
        message_preview: matterInfo?.description || 'No description provided',
        sla_metadata: {
          clientEmail: clientInfo?.email,
          clientPhone: clientInfo?.phone,
          matterType: matterInfo?.type || 'Unknown',
          urgency: matterInfo?.urgency || 'Standard'
        }
      });

      Logger.info('Matter creation notification event emitted successfully');
    } catch (error) {
      Logger.warn('Failed to emit matter creation notification event:', error);
    }
  }

  async sendMatterUpdateNotification(request: NotificationRequest): Promise<void> {
    const { practiceConfig, practice, update, matterInfo } = request;
    const effectivePractice = practiceConfig ?? practice ?? null;

    try {
      // Validate update payload in an action-aware manner
      if (!update || !update.action) {
        Logger.info('Skipping matter update notification: missing action in update payload');
        return;
      }
      const action = update.action;
      let valid = false;
      switch (action) {
        case 'status_change':
          valid = Boolean(update.fromStatus || update.toStatus);
          break;
        case 'accept':
        case 'reject':
          valid = Boolean(update.toStatus);
          break;
        default:
          // Require at least one meaningful field if unknown action
          valid = Boolean(update.fromStatus || update.toStatus || update.actorId);
      }
      if (!valid) {
        Logger.info('Skipping matter update notification: insufficient details for action', { action, update });
        return;
      }

      const ownerEmail = extractOwnerEmail(effectivePractice);
      if (!ownerEmail) {
        Logger.info('No owner email configured for practice - skipping matter update notification');
        return;
      }

      const actionLabel = (update?.action || 'status_change').replace('_', ' ');
      const subjectMatter = matterInfo?.type || 'Matter';

      await this.eventService.emitEvent({
        event_type: 'matter.updated',
        practice_id: effectivePractice?.id,
        contact_email: ownerEmail,
        sla_metadata: {
          action: actionLabel,
          fromStatus: update?.fromStatus,
          toStatus: update?.toStatus,
          actorId: update?.actorId,
          matterType: subjectMatter
        }
      });

      Logger.info('Matter update notification event emitted successfully');
    } catch (error) {
      Logger.warn('Failed to emit matter update notification event:', error);
    }
  }
}
