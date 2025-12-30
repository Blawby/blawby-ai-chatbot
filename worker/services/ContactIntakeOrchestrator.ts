// REMOVED: ConversationContextManager import - AI middleware removed
// Define types locally
export interface ConversationContext {
  sessionId?: string;
  practiceId?: string;
  establishedMatters?: unknown[];
  userIntent?: string;
  caseDraft?: ContextCaseDraft;
  [key: string]: unknown;
}

export interface ContextCaseDraft {
  matter_type?: string;
  key_facts?: string[];
  timeline?: unknown;
  parties?: unknown[];
  documents?: unknown[];
  evidence?: unknown[];
  jurisdiction?: string;
  urgency?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  // Legacy camelCase fields (kept for backward compatibility)
  matterType?: string;
  description?: string;
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  opposingParty?: string;
  [key: string]: unknown;
}
import { PDFGenerationService } from './PDFGenerationService.js';
import { NotificationService } from './NotificationService.js';
import { Logger } from '../utils/logger.js';
import type { Env } from '../types.js';
import type { PracticeOrWorkspace } from '../types.js';

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
  practiceConfig?: PracticeOrWorkspace | null;
  sessionId?: string;
  practiceId?: string;
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

function buildStorageKey(practiceId: string | undefined, sessionId: string | undefined, filename: string): string {
  const safePractice = practiceId ? practiceId.replace(/[^a-zA-Z0-9-_]/g, '') : 'public';
  const safeSession = sessionId ? sessionId.replace(/[^a-zA-Z0-9-_]/g, '') : 'anonymous';
  return `case-submissions/${safePractice}/${safeSession}/${filename}`;
}

export class ContactIntakeOrchestrator {
  static async finalizeSubmission(options: OrchestrationOptions): Promise<OrchestrationResult> {
    const { env, practiceConfig, sessionId, practiceId, matter, correlationId } = options;

    // REMOVED: ConversationContextManager - using simple context object instead
    let context: ConversationContext | null = null;
    if (sessionId && practiceId) {
      // Create a simple context object (no AI conversation context needed)
      context = {
        sessionId,
        practiceId,
        establishedMatters: [],
        userIntent: 'intake'
      };
    }

    // Ensure contact info is captured in context for downstream features
    if (context) {
      const existingContactInfo = (context.contactInfo && typeof context.contactInfo === 'object') 
        ? context.contactInfo as Record<string, unknown>
        : {};
      context.contactInfo = {
        ...existingContactInfo,
        name: matter.name,
        email: matter.email || (existingContactInfo.email as string | undefined),
        phone: matter.phone || (existingContactInfo.phone as string | undefined),
        location: matter.location || (existingContactInfo.location as string | undefined)
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

    // Safely extract practice metadata with runtime validation
    const practiceMeta: Record<string, unknown> = (practiceConfig?.conversationConfig && typeof practiceConfig.conversationConfig === 'object' && practiceConfig.conversationConfig !== null)
      ? (practiceConfig.conversationConfig as unknown as Record<string, unknown>)
      : {};

    // Safely extract practice name: check config fields first, then practiceConfig.name, then fallback
    let practiceName = 'Legal Services';
    if (practiceMeta.name && typeof practiceMeta.name === 'string' && practiceMeta.name.trim().length > 0) {
      practiceName = practiceMeta.name.trim();
    } else if (practiceMeta.description && typeof practiceMeta.description === 'string' && practiceMeta.description.trim().length > 0) {
      practiceName = practiceMeta.description.trim();
    } else if (practiceConfig?.name && typeof practiceConfig.name === 'string' && practiceConfig.name.trim().length > 0) {
      practiceName = practiceConfig.name.trim();
    }

    // Safely extract brand color with validation (must be non-empty string, optionally validate hex format)
    let brandColor = '#334e68';
    if (practiceMeta.brandColor && typeof practiceMeta.brandColor === 'string') {
      const colorValue = practiceMeta.brandColor.trim();
      if (colorValue.length > 0) {
        // Accept if it matches hex color format (e.g., #334e68) or is any non-empty string
        brandColor = colorValue;
      }
    }

    let pdfResult: OrchestrationResult['pdf'];

    try {
      // Ensure all required CaseDraft fields are provided for PDF generation
      const now = new Date().toISOString();
      
      // Normalize parties array - must be array of objects with role property
      const normalizedParties = Array.isArray(caseDraft.parties) 
        ? caseDraft.parties.map((p: unknown) => {
            if (typeof p === 'object' && p !== null && 'role' in p) {
              return p as { role: string; name?: string; relationship?: string };
            }
            // If it's a string or invalid format, convert to object
            return { role: typeof p === 'string' ? p : 'Unknown' };
          })
        : [];

      const pdfCaseDraft = {
        matter_type: caseDraft.matter_type || 'General Consultation',
        key_facts: Array.isArray(caseDraft.key_facts) ? caseDraft.key_facts : [],
        timeline: typeof caseDraft.timeline === 'string' ? caseDraft.timeline : undefined,
        parties: normalizedParties,
        documents: Array.isArray(caseDraft.documents)
          ? caseDraft.documents.filter((d): d is string => typeof d === 'string')
          : [],
        evidence: Array.isArray(caseDraft.evidence)
          ? caseDraft.evidence.filter((e): e is string => typeof e === 'string')
          : [],
        jurisdiction: caseDraft.jurisdiction || 'Unknown',
        urgency: caseDraft.urgency || 'normal',
        created_at: typeof caseDraft.created_at === 'string' ? caseDraft.created_at : now,
        updated_at: now,
        status: ((caseDraft.status === 'draft' || caseDraft.status === 'ready') ? caseDraft.status : 'ready') as 'draft' | 'ready'
      };

      const pdfResponse = await PDFGenerationService.generateCaseSummaryPDF({
        caseDraft: pdfCaseDraft,
        clientName: matter.name,
        clientEmail: matter.email,
        practiceName,
        practiceBrandColor: brandColor
      }, env);

      if (pdfResponse.success && pdfResponse.pdfBuffer) {
        const filename = PDFGenerationService.generateFilename(pdfCaseDraft, matter.name);
        const generatedAt = new Date().toISOString();
        const size = pdfResponse.pdfBuffer.byteLength;

        let storageKey: string | undefined;

        if (env.FILES_BUCKET) {
          try {
            storageKey = buildStorageKey(practiceId, sessionId, filename);
            await env.FILES_BUCKET.put(storageKey, pdfResponse.pdfBuffer, {
              httpMetadata: {
                contentType: 'application/pdf'
              }
            });

          } catch (storageError) {
            Logger.warn('[ContactIntakeOrchestrator] Failed to persist PDF to R2', {
              sessionId,
              practiceId,
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
        practiceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const notifications = {
      matterCreatedSent: false,
      paymentSent: false
    };

    if (practiceConfig) {
      try {
        const notificationService = new NotificationService(env);

        await notificationService.sendMatterCreatedNotification({
          type: 'matter_created',
          practiceConfig,
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
      } catch (error) {
        Logger.warn('[ContactIntakeOrchestrator] Notification dispatch failed', {
          sessionId,
          practiceId,
          correlationId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // REMOVED: ConversationContextManager.save - context is not persisted (no AI conversation tracking needed)

    return {
      pdf: pdfResult,
      context: context || undefined,
      notifications
    };
  }
}
