import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import type { Organization } from './OrganizationService.js';

export interface NotificationRequest {
  type: 'lawyer_review' | 'matter_created' | 'payment_required' | 'matter_update';
  organizationConfig: Organization | null;
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

export interface ConversationMessageNotificationInput {
  organizationId: string;
  conversationId: string;
  senderName: string;
  messagePreview: string;
  recipientUserIds: string[];
}

export interface ConversationLifecycleNotificationInput {
  organizationId: string;
  conversationId: string;
  clientUserId: string;
  actorName: string;
  matterNumber?: string;
  reason?: string;
}

/**
 * Safely extracts owner email from organization configuration
 * @param organizationConfig - Organization configuration object
 * @returns Owner email string or undefined if not available
 */
function extractOwnerEmail(organizationConfig: Organization | null): string | undefined {
  if (!organizationConfig?.config?.ownerEmail) {
    return undefined;
  }
  
  const ownerEmail = organizationConfig.config.ownerEmail;
  if (typeof ownerEmail !== 'string' || ownerEmail.trim().length === 0) {
    return undefined;
  }
  
  return ownerEmail.trim();
}

export class NotificationService {
  constructor(private env: Env) {
    // Initialize Logger with environment variables for Cloudflare Workers compatibility
    Logger.initialize({
      DEBUG: env.DEBUG,
      NODE_ENV: env.NODE_ENV
    });
  }

  async sendLawyerReviewNotification(request: NotificationRequest): Promise<void> {
    const { organizationConfig, matterInfo } = request;
    
    try {
      const { EmailService } = await import('./EmailService.js');
      const emailService = new EmailService(this.env.RESEND_API_KEY);
      
      const ownerEmail = extractOwnerEmail(organizationConfig);
      if (!ownerEmail) {
        Logger.info('No owner email configured for organization - skipping lawyer review notification');
        return;
      }

      await emailService.send({
        from: 'noreply@blawby.com',
        to: ownerEmail,
        subject: `Urgent Legal Matter Review Required - ${matterInfo?.type || 'Unknown'}`,
        text: `A new urgent legal matter requires immediate review:

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
    const { organizationConfig, matterInfo, clientInfo } = request;
    
    try {
      const { EmailService } = await import('./EmailService.js');
      const emailService = new EmailService(this.env.RESEND_API_KEY);
      
      const ownerEmail = extractOwnerEmail(organizationConfig);
      if (!ownerEmail) {
        Logger.info('No owner email configured for organization - skipping matter creation notification');
        return;
      }

      await emailService.send({
        from: 'noreply@blawby.com',
        to: ownerEmail,
        subject: `New Legal Matter Created - ${matterInfo?.type || 'Unknown'}`,
        text: `A new legal matter has been created:

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

  async sendPaymentRequiredNotification(request: NotificationRequest): Promise<void> {
    const { organizationConfig, matterInfo, clientInfo } = request;
    
    try {
      const { EmailService } = await import('./EmailService.js');
      const emailService = new EmailService(this.env.RESEND_API_KEY);
      
      const ownerEmail = extractOwnerEmail(organizationConfig);
      if (!ownerEmail) {
        Logger.info('No owner email configured for organization - skipping payment notification');
        return;
      }

      await emailService.send({
        from: 'noreply@blawby.com',
        to: ownerEmail,
        subject: `Payment Required - ${matterInfo?.type || 'Unknown'} Matter`,
        text: `A payment is required for a new legal matter:

Client: ${clientInfo?.name || 'Unknown'}
Contact: ${clientInfo?.email || 'No email'}, ${clientInfo?.phone || 'No phone'}
Matter Type: ${matterInfo?.type || 'Unknown'}
Description: ${matterInfo?.description || 'No description provided'}

Payment link has been sent to the client. Please monitor payment status.`
      });

      Logger.info('Payment required notification sent successfully');
    } catch (error) {
      Logger.warn('Failed to send payment required notification:', error);
    }
  }

  async sendMatterUpdateNotification(request: NotificationRequest): Promise<void> {
    const { organizationConfig, update, matterInfo } = request;

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

      const { EmailService } = await import('./EmailService.js');
      const emailService = new EmailService(this.env.RESEND_API_KEY);

      const ownerEmail = extractOwnerEmail(organizationConfig);
      if (!ownerEmail) {
        Logger.info('No owner email configured for organization - skipping matter update notification');
        return;
      }

      const actionLabel = (update?.action || 'status_change').replace('_', ' ');
      const subjectMatter = matterInfo?.type || 'Matter';

      await emailService.send({
        from: 'noreply@blawby.com',
        to: ownerEmail,
        subject: `${subjectMatter}: ${actionLabel}`,
        text: `A matter was updated:

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

  async sendConversationMessageNotification(input: ConversationMessageNotificationInput): Promise<void> {
    const uniqueRecipientIds = Array.from(new Set(input.recipientUserIds));
    if (uniqueRecipientIds.length === 0) {
      Logger.info('No recipients provided for conversation message notification');
      return;
    }

    try {
      const contacts = await this.fetchUserContacts(input.organizationId, uniqueRecipientIds);
      const { EmailService } = await import('./EmailService.js');
      const emailService = this.env.RESEND_API_KEY ? new EmailService(this.env.RESEND_API_KEY) : null;

      const preview = input.messagePreview.length > 280
        ? `${input.messagePreview.slice(0, 277)}...`
        : input.messagePreview;

      for (const userId of uniqueRecipientIds) {
        const contact = contacts.get(userId);
        if (!contact) {
          continue;
        }

        if (emailService && contact.email) {
          try {
            await emailService.send({
              from: 'noreply@blawby.com',
              to: contact.email,
              subject: `New message from ${input.senderName}`,
              text: `${input.senderName} sent a new message:\n\n${preview}\n\nOpen the conversation to reply.`
            });
          } catch (error) {
            Logger.warn('Failed to send conversation message email notification', { error, userId });
          }
        }

        await this.pushInAppNotification({
          recipientUserId: userId,
          organizationId: input.organizationId,
          message: `${input.senderName} sent a new message`,
          conversationId: input.conversationId,
          kind: 'message',
          data: { preview }
        });
      }
    } catch (error) {
      Logger.warn('Failed to deliver conversation message notifications', error);
    }
  }

  async sendConversationAcceptedNotification(input: ConversationLifecycleNotificationInput): Promise<void> {
    await this.sendConversationLifecycleNotification({
      ...input,
      kind: 'accepted',
      emailSubject: input.matterNumber
        ? `Your matter ${input.matterNumber} was accepted`
        : 'Your matter was accepted',
      emailBody: `${input.actorName} accepted your matter. You can continue the conversation now.`
    });
  }

  async sendConversationRejectedNotification(input: ConversationLifecycleNotificationInput): Promise<void> {
    const reasonLine = input.reason ? `\nReason: ${input.reason}` : '';
    await this.sendConversationLifecycleNotification({
      ...input,
      kind: 'rejected',
      emailSubject: input.matterNumber
        ? `Your matter ${input.matterNumber} was not accepted`
        : 'Your matter was not accepted',
      emailBody: `${input.actorName} was unable to accept your matter.${reasonLine}`
    });
  }

  private async sendConversationLifecycleNotification(input: ConversationLifecycleNotificationInput & {
    kind: 'accepted' | 'rejected';
    emailSubject: string;
    emailBody: string;
  }): Promise<void> {
    try {
      const contacts = await this.fetchUserContacts(input.organizationId, [input.clientUserId]);
      const contact = contacts.get(input.clientUserId);
      const { EmailService } = await import('./EmailService.js');
      const emailService = this.env.RESEND_API_KEY ? new EmailService(this.env.RESEND_API_KEY) : null;

      if (emailService && contact?.email) {
        try {
          await emailService.send({
            from: 'noreply@blawby.com',
            to: contact.email,
            subject: input.emailSubject,
            text: `${input.emailBody}\n\nVisit Blawby to review the conversation.`
          });
        } catch (error) {
          Logger.warn('Failed to send conversation lifecycle email notification', { error, userId: input.clientUserId });
        }
      }

      await this.pushInAppNotification({
        recipientUserId: input.clientUserId,
        organizationId: input.organizationId,
        message: input.kind === 'accepted'
          ? `${input.actorName} accepted your matter`
          : `${input.actorName} was unable to accept your matter`,
        conversationId: input.conversationId,
        kind: input.kind,
        data: input.reason ? { reason: input.reason } : undefined
      });
    } catch (error) {
      Logger.warn('Failed to deliver conversation lifecycle notification', error);
    }
  }

  private async fetchUserContacts(
    organizationId: string,
    userIds: string[]
  ): Promise<Map<string, { email?: string | null; name?: string | null }>> {
    const contacts = new Map<string, { email?: string | null; name?: string | null }>();
    if (userIds.length === 0) {
      return contacts;
    }

    const uniqueIds = Array.from(new Set(userIds));
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const query = `
      SELECT members.user_id AS userId, accounts.email AS email, accounts.name AS name
      FROM members
      JOIN accounts ON accounts.id = members.user_id
      WHERE members.organization_id = ? AND members.user_id IN (${placeholders})
    `;

    try {
      const result = await this.env.DB.prepare(query).bind(organizationId, ...uniqueIds).all();
      const rows = (result.results ?? []) as Array<{ userId: string; email?: string | null; name?: string | null }>;
      for (const row of rows) {
        contacts.set(row.userId, { email: row.email ?? undefined, name: row.name ?? undefined });
      }
    } catch (error) {
      Logger.warn('Failed to fetch user contacts for notifications', error);
    }

    return contacts;
  }

  private async pushInAppNotification(input: {
    recipientUserId: string;
    organizationId: string;
    message: string;
    conversationId: string;
    kind: 'message' | 'accepted' | 'rejected';
    data?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const { StatusService } = await import('./StatusService.js');
      await StatusService.setStatus(this.env, {
        id: `conversation:${input.conversationId}:${input.kind}:${crypto.randomUUID()}`,
        sessionId: `user:${input.recipientUserId}`,
        organizationId: input.organizationId,
        type: 'system_notification',
        status: 'completed',
        message: input.message,
        data: {
          conversationId: input.conversationId,
          kind: input.kind,
          ...(input.data ?? {})
        }
      });
    } catch (error) {
      Logger.warn('Failed to push in-app conversation notification', error);
    }
  }
}
