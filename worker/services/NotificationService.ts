import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import type { PracticeOrWorkspace } from '../types.js';
import { OneSignalService } from './OneSignalService.js';

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
  private oneSignal: OneSignalService | null;

  constructor(private env: Env) {
    // Initialize Logger with environment variables for Cloudflare Workers compatibility
    Logger.initialize({
      DEBUG: env.DEBUG,
      NODE_ENV: env.NODE_ENV
    });

    this.oneSignal = OneSignalService.isConfigured(env) ? new OneSignalService(env) : null;
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
      if (!this.oneSignal) {
        Logger.info('OneSignal not configured - skipping lawyer review notification');
        return;
      }

      await this.oneSignal.sendEmail(ownerEmail, {
        title: `Urgent Legal Matter Review Required - ${matterInfo?.type || 'Unknown'}`,
        body: `A new urgent legal matter requires immediate review:

Matter Type: ${matterInfo?.type || 'Unknown'}
Urgency: ${matterInfo?.urgency || 'Standard'}
Complexity: ${matterInfo?.complexity || 'Standard'}
Description: ${matterInfo?.description || 'No description provided'}

Please review this matter as soon as possible.`
      });

      Logger.info('Lawyer review notification sent successfully');
    } catch (error) {
      Logger.warn('Failed to send lawyer review notification:', error);
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
      if (!this.oneSignal) {
        Logger.info('OneSignal not configured - skipping matter creation notification');
        return;
      }

      await this.oneSignal.sendEmail(ownerEmail, {
        title: `New Legal Matter Created - ${matterInfo?.type || 'Unknown'}`,
        body: `A new legal matter has been created:

Client: ${clientInfo?.name || 'Unknown'}
Contact: ${clientInfo?.email || 'No email'}, ${clientInfo?.phone || 'No phone'}
Matter Type: ${matterInfo?.type || 'Unknown'}
Description: ${matterInfo?.description || 'No description provided'}
Urgency: ${matterInfo?.urgency || 'Standard'}

Please review and take appropriate action.`
      });

      Logger.info('Matter creation notification sent successfully');
    } catch (error) {
      Logger.warn('Failed to send matter creation notification:', error);
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
      if (!this.oneSignal) {
        Logger.info('OneSignal not configured - skipping matter update notification');
        return;
      }

      const actionLabel = (update?.action || 'status_change').replace('_', ' ');
      const subjectMatter = matterInfo?.type || 'Matter';

      await this.oneSignal.sendEmail(ownerEmail, {
        title: `${subjectMatter}: ${actionLabel}`,
        body: `A matter was updated:

Action: ${actionLabel}
From: ${update?.fromStatus || 'n/a'}
To: ${update?.toStatus || 'n/a'}
Actor: ${update?.actorId || 'system'}
`
      });

      Logger.info('Matter update notification sent successfully');
    } catch (error) {
      Logger.warn('Failed to send matter update notification:', error);
    }
  }
}
