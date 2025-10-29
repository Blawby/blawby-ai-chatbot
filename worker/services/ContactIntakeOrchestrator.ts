import { ConversationContextManager, type ConversationContext, type CaseDraft as ContextCaseDraft } from '../middleware/conversationContextManager.js';
import { PDFGenerationService } from './PDFGenerationService.js';
import { NotificationService } from './NotificationService.js';
import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import type { Organization } from './OrganizationService.js';

interface MatterSubmissionInput {
  matterType: string;
  description: string;
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  opposingParty?: string;
  urgency?: string;
}

interface OrchestrationOptions {
  env: Env;
  organizationConfig?: Organization | null;
  sessionId?: string;
  organizationId?: string;
  correlationId?: string;
  matter: MatterSubmissionInput;
}

interface OrchestrationResult {
  pdf?: {
    filename: string;
    size: number;
    generatedAt: string;
    matterType: string;
    storageKey?: string;
    downloadUrl?: string;
  };
  context?: ConversationContext;
  notifications?: {
    matterCreatedSent: boolean;
    paymentSent: boolean;
  };
}

function buildFallbackCaseDraft(
  matter: MatterSubmissionInput,
  context: ConversationContext | null
): ContextCaseDraft {
  const now = new Date().toISOString();

  const baseDraft = context?.caseDraft;

  const normalizedUrgency = (() => {
    const allowed = ['low', 'normal', 'high', 'urgent'] as const;
    const raw = (matter.urgency || baseDraft?.urgency || '').toString().toLowerCase();
    return (allowed as readonly string[]).includes(raw) ? (raw as typeof allowed[number]) : 'normal';
  })();

  return {
    matter_type: matter.matterType || baseDraft?.matter_type || 'General Consultation',
    key_facts: baseDraft?.key_facts && baseDraft.key_facts.length > 0
      ? baseDraft.key_facts
      : matter.description
        ? [matter.description]
        : ['Client is seeking legal assistance.'],
    timeline: baseDraft?.timeline,
    parties: baseDraft?.parties ?? [],
    documents: baseDraft?.documents ?? [],
    evidence: baseDraft?.evidence ?? [],
    jurisdiction: baseDraft?.jurisdiction || 'Unknown',
    urgency: normalizedUrgency,
    status: 'ready',
    created_at: baseDraft?.created_at || now,
    updated_at: now
  };
}

function buildStorageKey(organizationId: string | undefined, sessionId: string | undefined, filename: string): string {
  const safeOrganization = organizationId ? organizationId.replace(/[^a-zA-Z0-9-_]/g, '') : 'public';
  const safeSession = sessionId ? sessionId.replace(/[^a-zA-Z0-9-_]/g, '') : 'anonymous';
  return `case-submissions/${safeOrganization}/${safeSession}/${filename}`;
}

export class ContactIntakeOrchestrator {
  static async finalizeSubmission(options: OrchestrationOptions): Promise<OrchestrationResult> {
    const { env, organizationConfig, sessionId, organizationId, matter, correlationId } = options;

    let context: ConversationContext | null = null;
    if (sessionId && organizationId) {
      try {
        context = await ConversationContextManager.load(sessionId, organizationId, env);
      } catch (error) {
        Logger.warn('[ContactIntakeOrchestrator] Failed to load conversation context', {
          sessionId,
          organizationId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Ensure contact info is captured in context for downstream features
    if (context) {
      context.contactInfo = {
        ...context.contactInfo,
        name: matter.name,
        email: matter.email || context.contactInfo?.email,
        phone: matter.phone || context.contactInfo?.phone,
        location: matter.location || context.contactInfo?.location
      };
      context.conversationPhase = 'completed';
      context.userIntent = 'intake';
    }

    const caseDraft = buildFallbackCaseDraft(matter, context);

    if (context) {
      context.caseDraft = {
        ...caseDraft
      };
      context.lastUpdated = Date.now();
    }

    const organizationMeta = organizationConfig?.config ?? {} as Record<string, unknown>;
    const organizationName = ((organizationMeta.description as string) || organizationConfig?.name || 'Legal Services') as string;
    const brandColor = (organizationMeta.brandColor as string) || '#334e68';

    let pdfResult: OrchestrationResult['pdf'];

    try {
      const pdfResponse = await PDFGenerationService.generateCaseSummaryPDF({
        caseDraft: {
          ...caseDraft,
          jurisdiction: caseDraft.jurisdiction || 'Unknown',
          urgency: caseDraft.urgency || 'normal'
        },
        clientName: matter.name,
        clientEmail: matter.email,
        organizationName,
        organizationBrandColor: brandColor
      }, env);

      if (pdfResponse.success && pdfResponse.pdfBuffer) {
        // Adapt ContextCaseDraft to PDFGenerationService.CaseDraft format
        const pdfCaseDraft = {
          ...caseDraft,
          jurisdiction: caseDraft.jurisdiction || 'Unknown',
          urgency: caseDraft.urgency || 'normal'
        };
        const filename = PDFGenerationService.generateFilename(pdfCaseDraft, matter.name);
        const generatedAt = new Date().toISOString();
        const size = pdfResponse.pdfBuffer.byteLength;

        let storageKey: string | undefined;

        if (env.FILES_BUCKET) {
          try {
            storageKey = buildStorageKey(organizationId, sessionId, filename);
            await env.FILES_BUCKET.put(storageKey, pdfResponse.pdfBuffer, {
              httpMetadata: {
                contentType: 'application/pdf'
              }
            });

          } catch (storageError) {
            Logger.warn('[ContactIntakeOrchestrator] Failed to persist PDF to R2', {
              sessionId,
              organizationId,
              error: storageError instanceof Error ? storageError.message : String(storageError)
            });
          }
        }

        pdfResult = {
          filename,
          size,
          generatedAt,
          matterType: caseDraft.matter_type,
          storageKey
        };

        if (context) {
          context.generatedPDF = pdfResult;
        }
      }
    } catch (error) {
      Logger.warn('[ContactIntakeOrchestrator] PDF generation failed', {
        sessionId,
        organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const notifications = {
      matterCreatedSent: false,
      paymentSent: false
    };

    if (organizationConfig) {
      try {
        const notificationService = new NotificationService(env);

        await notificationService.sendMatterCreatedNotification({
          type: 'matter_created',
          organizationConfig,
          matterInfo: {
            type: matter.matterType,
            urgency: matter.urgency,
            description: matter.description
          },
          clientInfo: {
            name: matter.name,
            email: matter.email,
            phone: matter.phone
          }
        });
        notifications.matterCreatedSent = true;

        if (organizationConfig.config?.requiresPayment) {
          await notificationService.sendPaymentRequiredNotification({
            type: 'payment_required',
            organizationConfig,
            matterInfo: {
              type: matter.matterType,
              description: matter.description
            },
            clientInfo: {
              name: matter.name,
              email: matter.email,
              phone: matter.phone
            }
          });
          notifications.paymentSent = true;
        }
      } catch (error) {
        Logger.warn('[ContactIntakeOrchestrator] Notification dispatch failed', {
          sessionId,
          organizationId,
          correlationId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (context && sessionId && organizationId) {
      try {
        await ConversationContextManager.save(context, env);
      } catch (error) {
        Logger.warn('[ContactIntakeOrchestrator] Failed to persist updated context', {
          sessionId,
          organizationId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      pdf: pdfResult,
      context: context || undefined,
      notifications
    };
  }
}
