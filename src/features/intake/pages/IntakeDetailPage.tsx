import { FunctionComponent } from 'preact';
import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import {
  CheckCircleIcon,
  UserIcon,
  ScaleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CreditCardIcon,
  MapPinIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { Icon } from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { UserCard } from '@/shared/ui/profile';
import { EditorShell, DetailHeader } from '@/shared/ui/layout';
import { Page } from '@/shared/ui/layout/Page';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import {
  getPracticeIntake,
  updateIntakeTriageStatus,
  type PracticeIntakeDetail,
} from '@/features/intake/api/intakesApi';
import {
  fetchConversationMessages,
  postConversationMessage,
  postSystemMessage,
  updateConversationMetadata,
} from '@/shared/lib/conversationApi';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import VirtualMessageList from '@/features/chat/components/VirtualMessageList';
import MessageComposer from '@/features/chat/components/MessageComposer';
import type { ChatMessageUI } from '../../../../worker/types';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { resolvePracticeServiceLabel } from '@/features/matters/utils/matterUtils';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { applyConsultationPatchToMetadata } from '@/shared/utils/consultationState';
import { DEFAULT_INTAKE_TEMPLATE } from '@/shared/constants/intakeTemplates';
import type { IntakeTemplate, IntakeFieldDefinition } from '@/shared/types/intake';
import EmbedCodeBlock from '@/features/intake/components/EmbedCodeBlock';

// ── Template helpers ──────────────────────────────────────────────────────────

function parseTemplatesFromPracticeDetails(details: unknown): IntakeTemplate[] {
  if (!details || typeof details !== 'object') return [];
  const meta = (details as Record<string, unknown>).metadata;
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).intakeTemplates;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p as IntakeTemplate[] : []; } catch { return []; }
  }
  return Array.isArray(raw) ? raw as IntakeTemplate[] : [];
}

function resolveTemplateSlug(intake: PracticeIntakeDetail): string | null {
  const meta = (intake.metadata ?? {}) as Record<string, unknown>;
  const direct = meta.intake_template_slug ?? meta.template_slug;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const cf = meta.custom_fields ?? meta.customFields;
  if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
    const slug = (cf as Record<string, unknown>)._intake_template_slug;
    if (typeof slug === 'string' && slug.trim()) return slug.trim();
  }
  return null;
}

function resolveActiveTemplate(
  intake: PracticeIntakeDetail,
  practiceDetails: unknown,
): IntakeTemplate | null {
  const slug = resolveTemplateSlug(intake);
  if (!slug) return null;
  const templates = parseTemplatesFromPracticeDetails(practiceDetails);
  return templates.find((t) => t.slug === slug) ?? null;
}

/** Get the value for a given intake field from conversation state. */
function resolveFieldValue(
  field: IntakeFieldDefinition,
  intakeState: Record<string, unknown> | null,
  intake?: PracticeIntakeDetail | null,
): string | null {
  // Helper to normalize boolean/string/null handling
  const normalize = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  };

  // Check the provided intakeState first (conversation-submitted answers)
  if (intakeState) {
    if (field.isStandard) {
      const v = intakeState[field.key];
      return normalize(v);
    }
    const cf = (intakeState as Record<string, unknown>).customFields;
    if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
      const v = (cf as Record<string, unknown>)[field.key];
      const nv = normalize(v);
      if (nv !== null) return nv;
    }
  }

  // Fallback: inspect intake.metadata (template-submitted answers or stored metadata)
  if (intake && typeof intake === 'object') {
    const meta = (intake.metadata ?? {}) as Record<string, unknown>;
    if (field.isStandard) {
      const v = meta[field.key] ?? meta[field.key as string];
      const nv = normalize(v);
      if (nv !== null) return nv;
    }
    const cf = meta.customFields ?? meta.custom_fields;
    if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
      const v = (cf as Record<string, unknown>)[field.key];
      const nv = normalize(v);
      if (nv !== null) return nv;
    }
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Stat cell for use inside CSS grids — no border treatment
type StatCellProps = { label: string; value?: string | null; icon?: typeof UserIcon };
const StatCell: FunctionComponent<StatCellProps> = ({ label, value, icon: IconComp }) => {
  const resolvedValue = value && value.trim().length > 0 ? value : null;
  return (
    <div className="flex items-start gap-2.5">
      {IconComp && (
        <div className="mt-0.5 flex-shrink-0 text-input-placeholder">
          <Icon icon={IconComp} className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder mb-0.5">{label}</p>
        <p className={`text-sm break-words ${resolvedValue ? 'text-input-text' : 'text-input-placeholder'}`}>
          {resolvedValue ?? 'Not provided'}
        </p>
      </div>
    </div>
  );
};

type SummaryRowProps = { label: string; value?: string | number | null; icon: typeof UserIcon };
const SummaryRow: FunctionComponent<SummaryRowProps> = ({ label, value, icon: IconComp }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 py-4 first:pt-0 last:pb-0">
      <div className="pt-1 text-input-text">
        <Icon icon={IconComp} className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <dt className="mt-1 text-sm font-medium leading-tight text-input-placeholder">{label}</dt>
        <dd className="break-words text-lg font-semibold leading-tight text-input-text">{value}</dd>
      </div>
    </div>
  );
};

function formatAmount(amount?: number, currency?: string) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount / 100);
  } catch {
    return `${amount / 100} ${currency || 'USD'}`;
  }
}

function urgencyLabel(u?: string | null) {
  if (u === 'emergency') return 'Emergency';
  if (u === 'time_sensitive') return 'Time Sensitive';
  if (u === 'routine') return 'Routine';
  return u ?? null;
}

function triageLabel(status?: string) {
  if (status === 'pending_review') return 'Pending Review';
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  if (status === 'rejected') return 'Rejected';
  if (status === 'spam') return 'Spam';
  return status ?? 'Unknown';
}

// ── Main component ────────────────────────────────────────────────────────────

type IntakeDetailPageProps = {
  practiceId: string | null;
  intakeId: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  onBack: () => void;
  onTriageComplete?: () => void;
};

export const IntakeDetailPage: FunctionComponent<IntakeDetailPageProps> = ({
  practiceId,
  intakeId,
  practiceName,
  practiceLogo,
  onBack,
  onTriageComplete,
}) => {
  const { route } = useLocation();
  const { showSuccess, showError } = useToastContext();
  const { session } = useSessionContext();

  const [intake, setIntake] = useState<PracticeIntakeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localTriageStatus, setLocalTriageStatus] = useState<string | null>(null);
  const [triageDialogAction, setTriageDialogAction] = useState<'accepted' | 'declined' | null>(null);
  const [triageReason, setTriageReason] = useState('');
  const [previewMessages, setPreviewMessages] = useState<ChatMessageUI[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Use canonical conversation flow state
  const {
    conversationMetadata,
    updateConversationMetadata: updateConversationMetadataPatch,
    intakeConversationState,
  } = useMessageHandling({
    practiceId: practiceId ?? undefined,
    conversationId: intake?.conversation_id,
  });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Restore initial previewMessages loading
  useEffect(() => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId) {
      setPreviewMessages([]);
      setPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreviewMessages([]);
    setPreviewLoading(true);
    fetchConversationMessages(conversationId, targetPracticeId, { limit: 100, signal: controller.signal })
      .then((messages) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        const mappedMessages = messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: new Date(message.created_at).getTime(),
          reply_to_message_id: message.reply_to_message_id ?? null,
          metadata: message.metadata ?? undefined,
          isUser: message.user_id === session?.user?.id,
          seq: message.seq,
        } satisfies ChatMessageUI));
        setPreviewMessages(mappedMessages);
      })
      .catch((err) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        console.warn('[IntakeDetailPage] Failed to load conversation preview', err);
        setPreviewMessages([]);
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) {
          setPreviewLoading(false);
        }
      });
    return () => controller.abort();
  }, [intake?.conversation_id, intake?.organization_id, session?.user?.id]);

  const [composerValue, setComposerValue] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [gatherDetailsSubmitting, setGatherDetailsSubmitting] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  const {
    details: practiceDetails,
    hasDetails: hasPracticeDetails,
    fetchDetails: fetchPracticeDetails,
  } = usePracticeDetails(practiceId, null, false);

  const activeTemplate = intake ? resolveActiveTemplate(intake, practiceDetails) : null;

  // Load intake detail
  useEffect(() => {
    if (!practiceId || !intakeId) return;
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);

    getPracticeIntake(practiceId, intakeId, { signal: controller.signal })
      .then((data) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setIntake(data);
        setLocalTriageStatus(data.triage_status ?? null);
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load intake');
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [practiceId, intakeId]);

  useEffect(() => {
    if (!practiceId || hasPracticeDetails) return;
    fetchPracticeDetails().catch((err) => {
      console.warn('[IntakeDetailPage] Failed to load practice services', err);
    });
  }, [fetchPracticeDetails, hasPracticeDetails, practiceId]);

  const closeTriageDialog = useCallback(() => {
    if (isSubmitting) return;
    setTriageDialogAction(null);
    setTriageReason('');
  }, [isSubmitting]);

  const openTriageDialog = useCallback((action: 'accepted' | 'declined') => {
    if (isSubmitting) return;
    setTriageDialogAction(action);
    setTriageReason('');
  }, [isSubmitting]);

  const runTriage = useCallback(async (action: 'accepted' | 'declined', reason?: string) => {
    if (isSubmitting || !intake) return;

    setIsSubmitting(true);
    try {
      const trimmedReason = typeof reason === 'string' && reason.trim().length > 0
        ? reason.trim()
        : undefined;
      let participantFailed = false;
      const result = await updateIntakeTriageStatus(intakeId, {
        status: action,
        reason: trimmedReason,
      });

      const responseConversationId =
        result?.conversation_id ?? result?.conversationId ?? intake.conversation_id;
      const targetPracticeId = intake.organization_id;

      // On accept: add practitioner as participant and post system message
      if (action === 'accepted' && session?.user?.id && responseConversationId && targetPracticeId) {
        try {
          await updateConversationMetadata(responseConversationId, targetPracticeId, {
            status: 'active',
            triageStatus: 'accepted',
            triage_status: 'accepted',
            intakeTriageStatus: 'accepted',
          });
        } catch (conversationErr) {
          console.warn('[IntakeDetailPage] Failed to mark conversation active', conversationErr);
        }

        try {
          const participantRes = await fetch(
            `/api/conversations/${encodeURIComponent(responseConversationId)}/participants?practiceId=${encodeURIComponent(targetPracticeId)}`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ participantUserIds: [session.user.id] }),
            }
          );
          if (!participantRes.ok) {
            participantFailed = true;
          }
        } catch (participantErr) {
          participantFailed = true;
          console.warn('[IntakeDetailPage] Failed to add participant', participantErr);
        }

        try {
          const userName = session.user.name?.trim() || session.user.email?.trim() || 'Someone';
          await postSystemMessage(responseConversationId, targetPracticeId, {
            clientId: 'system-lead-accepted',
            content: `${userName} has joined the conversation`,
            metadata: {
              systemMessageKey: 'lead_accepted',
              intakeUuid: intakeId,
              triageStatus: 'accepted',
              triage_status: 'accepted',
            },
          });
        } catch (msgErr) {
          console.warn('[IntakeDetailPage] Failed to post join message', msgErr);
        }

        if (trimmedReason) {
          try {
            await postConversationMessage(responseConversationId, targetPracticeId, {
              content: trimmedReason,
              metadata: {
                intakeUuid: intakeId,
                triageStatus: 'accepted',
                triage_status: 'accepted',
                triageReason: trimmedReason,
                triage_reason: trimmedReason,
                source: 'intake-triage',
              },
            });
          } catch (msgErr) {
            console.warn('[IntakeDetailPage] Failed to post intake triage note', msgErr);
          }
        }
      }

      if (action === 'declined' && responseConversationId && targetPracticeId) {
        try {
          await postSystemMessage(responseConversationId, targetPracticeId, {
            clientId: 'system-lead-declined',
            content: 'Your consultation request was reviewed and could not be accepted at this time.',
            metadata: {
              systemMessageKey: 'lead_declined',
              intakeUuid: intakeId,
              triageStatus: action,
              triage_status: action,
            },
          });
        } catch (msgErr) {
          console.warn('[IntakeDetailPage] Failed to post decline message', msgErr);
        }
      }

      if (isMountedRef.current) {
        setLocalTriageStatus(action);
        setIntake((prev) => prev ? { ...prev, triage_status: action, conversation_id: responseConversationId ?? prev.conversation_id } : prev);
        setTriageDialogAction(null);
        setTriageReason('');
        showSuccess(
          action === 'accepted' ? 'Consultation accepted' : 'Consultation declined',
          action === 'accepted'
            ? (participantFailed
              ? 'The conversation is now active, but you may need to join it manually.'
              : (trimmedReason
                ? 'The conversation is now active and your note was added.'
                : 'The conversation is now active.'))
            : 'Your response has been recorded.'
        );
        onTriageComplete?.();
      }
    } catch (err) {
      if (isMountedRef.current) {
        showError('Action failed', err instanceof Error ? err.message : 'Failed to update intake');
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  }, [intake, intakeId, isSubmitting, onTriageComplete, session?.user, showError, showSuccess]);

  const submitConversationReply = useCallback(async () => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    const content = composerValue.trim();
    if (!conversationId || !targetPracticeId || !content || composerSubmitting) return;

    setComposerSubmitting(true);
    try {
      const message = await postConversationMessage(conversationId, targetPracticeId, {
        content,
        metadata: {
          source: 'intake-detail',
          intakeUuid: intakeId,
          senderType: 'team_member',
        },
      });
      setComposerValue('');
      if (composerTextareaRef.current) {
        composerTextareaRef.current.value = '';
        composerTextareaRef.current.style.height = '32px';
      }
      if (message) {
        setPreviewMessages((current) => [
          ...current,
          {
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.created_at).getTime(),
            reply_to_message_id: message.reply_to_message_id ?? null,
            metadata: message.metadata ?? undefined,
            isUser: true,
            seq: message.seq,
          } satisfies ChatMessageUI,
        ]);
      }
    } catch (error) {
      showError('Message failed', error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      if (isMountedRef.current) setComposerSubmitting(false);
    }
  }, [composerSubmitting, composerValue, intake?.conversation_id, intake?.organization_id, intakeId, showError]);

  const startGatherDetailsFlow = useCallback(async () => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId || gatherDetailsSubmitting) return;

    const currentCase = intakeConversationState;
    const nextMetadata = applyConsultationPatchToMetadata(
      conversationMetadata,
      { case: { ...(currentCase ?? {}), enrichmentMode: true } },
      { mirrorLegacyFields: true }
    );

    // Use the first unanswered enrichment field from the active template
    // to build a targeted question instead of hardcoded prompts.
    const templateFields = (activeTemplate?.fields ?? DEFAULT_INTAKE_TEMPLATE.fields)
      .filter((f) => f.phase === 'enrichment');
    const nextMissingField = templateFields.find(
      (f) => !resolveFieldValue(f, intakeConversationState as unknown as Record<string, unknown> | null, intake)
    );
    const prompt = nextMissingField
      ? `I can gather a little more detail for the attorney. ${nextMissingField.previewQuestion ?? `Can you tell me about your ${nextMissingField.label.toLowerCase()}?`}`
      : 'To help the attorney, is there any additional detail about your situation you\'d like to share?';

    setGatherDetailsSubmitting(true);
    try {
      await updateConversationMetadataPatch(nextMetadata, conversationId);
      const message = await postSystemMessage(conversationId, targetPracticeId, {
        clientId: 'system-intake-gather-details',
        content: prompt,
        metadata: {
          source: 'ai',
          systemMessageKey: 'intake_gather_details',
          intakeUuid: intakeId,
          enrichmentMode: true,
        },
      });
      if (message) {
        setPreviewMessages((current) => [
          ...current,
          {
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.created_at).getTime(),
            reply_to_message_id: message.reply_to_message_id ?? null,
            metadata: message.metadata ?? undefined,
            isUser: false,
            seq: message.seq,
          } satisfies ChatMessageUI,
        ]);
      }
      showSuccess('Blawby is gathering details', 'A follow-up question was added to the conversation.');
    } catch (error) {
      showError('Could not start detail gathering', error instanceof Error ? error.message : 'Failed to update the intake conversation');
    } finally {
      if (isMountedRef.current) setGatherDetailsSubmitting(false);
    }
  }, [
    activeTemplate,
    conversationMetadata,
    gatherDetailsSubmitting,
    intake,
    intakeConversationState,
    intakeId,
    showError,
    showSuccess,
    updateConversationMetadataPatch,
  ]);

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Consultation Request" showBack onBack={onBack} />
        <div className="flex-1 min-h-0 p-6">
          <LoadingBlock className="rounded-2xl h-64" />
        </div>
      </div>
    );
  }

  if (loadError || !intake) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Consultation Request" showBack onBack={onBack} />
        <Page>
          <div className="glass-card p-6 text-sm text-rose-400">
            {loadError ?? 'Intake not found.'}
          </div>
        </Page>
      </div>
    );
  }

  const meta = (intake.metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.name === 'string' ? meta.name : null;
  const email = typeof meta.email === 'string' ? meta.email : null;
  const phone = typeof meta.phone === 'string' ? meta.phone : null;
  const description = typeof meta.description === 'string' ? meta.description : null;
  const practiceServiceUuid = typeof meta.practice_service_uuid === 'string' ? meta.practice_service_uuid : null;
  const onBehalfOf = typeof meta.on_behalf_of === 'string' ? (meta.on_behalf_of.trim() || null) : null;
  const opposingParty = typeof meta.opposing_party === 'string' ? (meta.opposing_party.trim() || null) : null;
  const services = Array.isArray(practiceDetails?.services) ? practiceDetails.services : [];
  const matchingService = services.find((service) => (
    service
      && typeof service === 'object'
      && service.id === practiceServiceUuid
      && typeof service.name === 'string'
  ));
  const matchingServiceName = typeof matchingService?.name === 'string' ? matchingService.name : undefined;
  const practiceServiceName = practiceServiceUuid
    ? resolvePracticeServiceLabel(practiceServiceUuid, matchingServiceName)
    : null;
  const address = meta.address && typeof meta.address === 'object' && !Array.isArray(meta.address)
    ? meta.address as Record<string, unknown>
    : null;
  const city = typeof address?.city === 'string' ? address.city : null;
  const state = typeof address?.state === 'string' ? address.state : null;
  const dateLabel = formatLongDate(intake.created_at);
  const caseStrength = typeof intake.case_strength === 'number' ? `${intake.case_strength}%` : null;
  const feeAmount = formatAmount(intake.amount, intake.currency);
  const householdSize = typeof intake.household_size === 'number' ? intake.household_size : (typeof meta.household_size === 'number' ? meta.household_size : null);
  const income = typeof intake.income === 'number' ? formatAmount(intake.income, intake.currency) : (typeof meta.income === 'number' ? formatAmount(meta.income, intake.currency) : null);
  const hasDocs = intake.has_documents === true || meta.has_documents === true ? 'Yes' : 'No';
  const effectiveTriageStatus = localTriageStatus ?? intake.triage_status;
  const isPendingReview = effectiveTriageStatus === 'pending_review' || !effectiveTriageStatus;
  const intakeTitle = resolveIntakeTitle(
    {
      ...meta,
      title: conversationMetadata?.title ?? meta.title,
      intake_title: conversationMetadata?.intake_title ?? meta.intake_title,
    },
    name ? `${name} intake` : 'Untitled intake'
  );
  const locationLabel = [city, state].filter(Boolean).join(', ') || null;
  const paymentLabel = feeAmount ? `${feeAmount} ${intake.stripe_charge_id ? 'paid' : 'consultation'}` : null;
  const canReplyInIntake = Boolean(intake.conversation_id && effectiveTriageStatus === 'accepted');
  const templateName = activeTemplate?.name
    ?? (() => {
      // Fall back to the stored name from custom_fields if template not found in practice data
      const cf = (meta.custom_fields ?? meta.customFields) as Record<string, unknown> | undefined;
      const storedName = cf?._intake_template_name;
      return typeof storedName === 'string' && storedName.trim() ? storedName.trim() : null;
    })();

  // Enrichment fields from the matched template (or fallback to defaults)
  const enrichmentFields: IntakeFieldDefinition[] = (
    activeTemplate?.fields ?? DEFAULT_INTAKE_TEMPLATE.fields
  ).filter((f) => f.phase === 'enrichment');

  // Cast intakeConversationState to a plain record for resolveFieldValue
  const intakeStateRecord = intakeConversationState as unknown as Record<string, unknown> | null;

  // hasMissingLegalDetails: true if any enrichment field is unanswered
  const unansweredEnrichmentFields = enrichmentFields.filter(
    (f) => !resolveFieldValue(f, intakeStateRecord, intake),
  );
  const hasMissingLegalDetails = unansweredEnrichmentFields.length > 0 && Boolean(intake.conversation_id);

  const statusChipClass = (status: string) => {
    if (status === 'accepted') return 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20';
    if (status === 'declined' || status === 'rejected') return 'bg-rose-500/10 text-rose-500 ring-rose-500/20';
    if (status === 'spam') return 'bg-gray-500/10 text-input-placeholder ring-gray-500/20';
    return 'bg-accent/10 text-accent ring-accent/20';
  };

  const conversationSection = intake.conversation_id ? (
    <section className="glass-card flex min-h-[620px] flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line-glass/10 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder">
          Conversation
        </h2>
        <p className="mt-2 text-sm text-input-placeholder">
          Continue the client thread from this intake.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-surface-overlay/20 touch-pan-y">
        {previewLoading && previewMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <LoadingBlock label="Loading conversation history..." />
          </div>
        ) : previewMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <p className="text-sm text-input-placeholder">No conversation history found for this intake.</p>
          </div>
        ) : (
          <VirtualMessageList
            messages={previewMessages}
            conversationTitle={intakeTitle}
            conversationContactName={name}
            viewerContext="practice"
            practiceConfig={{
              name: practiceDetails?.name ?? practiceName ?? 'Practice',
              profileImage: practiceDetails?.logo ?? practiceLogo ?? null,
              practiceId: intake.organization_id,
            }}
            practiceId={intake.organization_id}
          />
        )}
      </div>

      {canReplyInIntake ? (
        <div className="shrink-0 border-t border-line-glass/10 px-4 py-5">
          <MessageComposer
            inputValue={composerValue}
            setInputValue={setComposerValue}
            previewFiles={[]}
            uploadingFiles={[]}
            removePreviewFile={() => undefined}
            handleFileSelect={async () => undefined}
            handleCameraCapture={async () => undefined}
            cancelUpload={() => undefined}
            isRecording={false}
            handleMediaCapture={() => undefined}
            setIsRecording={() => undefined}
            onSubmit={() => void submitConversationReply()}
            onKeyDown={(event) => {
              if ((event as KeyboardEvent & { isComposing?: boolean }).isComposing || event.repeat) return;
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submitConversationReply();
              }
            }}
            textareaRef={composerTextareaRef}
            isReadyToUpload={false}
            isSessionReady={!composerSubmitting}
            isSocketReady={!composerSubmitting}
            disabled={composerSubmitting}
            hideAttachmentControls
            mentionCandidates={[]}
          />
        </div>
      ) : null}
    </section>
  ) : null;

  const intakeSidebar = (
    <aside className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">
      {isPendingReview && (
        <section className="glass-card p-5 sm:p-6">
          <div className="space-y-3">
            <Button
              id="intake-accept-btn"
              variant="primary"
              className="w-full"
              disabled={isSubmitting}
              onClick={() => openTriageDialog('accepted')}
            >
              {isSubmitting ? (
                <span className="inline-flex items-center">
                  <LoadingSpinner size="sm" className="mr-2" ariaLabel="Accepting consultation" />
                  Accepting...
                </span>
              ) : 'Approve consultation'}
            </Button>
            <Button
              id="intake-reject-btn"
              variant="secondary"
              className="w-full"
              disabled={isSubmitting}
              onClick={() => openTriageDialog('declined')}
            >
              Reject
            </Button>
          </div>
        </section>
      )}

      <section className="glass-card space-y-6 p-5 sm:p-6">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-input-placeholder">About</h3>
          <div className="space-y-4">
            {intake.payment_verified && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <Icon icon={CheckCircleIconSolid} className="h-4 w-4" />
                Payment method verified
              </div>
            )}
            <UserCard
              name={name}
              secondary={null}
              className="px-0 py-0"
              size="md"
            />
          </div>
        </div>

        {(email || phone || locationLabel) && (
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-input-placeholder">Contact Information</h3>
            <dl className="space-y-3 text-sm">
              {email && (
                <div className="flex flex-col">
                  <dt className="mb-0.5 text-xs text-input-placeholder">Email</dt>
                  <dd className="truncate font-medium text-input-text">{email}</dd>
                </div>
              )}
              {phone && (
                <div className="flex flex-col">
                  <dt className="mb-0.5 text-xs text-input-placeholder">Phone</dt>
                  <dd className="font-medium text-input-text">{phone}</dd>
                </div>
              )}
              {locationLabel && (
                <div className="flex flex-col">
                  <dt className="mb-0.5 text-xs text-input-placeholder">Location</dt>
                  <dd className="truncate font-medium capitalize text-input-text">{locationLabel}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </section>
    </aside>
  );

  return (
    <EditorShell
      title={intake.client_name ?? name ?? 'Intake Details'}
      subtitle={intake.practice_area ?? practiceServiceName ?? undefined}
      showBack
      onBack={onBack}
      actions={
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusChipClass(effectiveTriageStatus || 'pending_review')}`}>
            {triageLabel(effectiveTriageStatus || 'pending_review')}
        </span>
      }
      contentMaxWidth={null}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* Main header card */}
          <section className="glass-card overflow-hidden p-6 sm:p-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <header className="min-w-0">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-input-placeholder">
                Intake details
              </h2>
              <h1 className="break-words text-2xl font-bold leading-tight text-input-text sm:text-4xl">
                {intakeTitle}
              </h1>
              <p className="mt-3 text-sm text-input-placeholder">
                Posted {dateLabel}{practiceServiceName ? ` · ${practiceServiceName}` : ''}
              </p>

              {description ? (
                <div className="mt-8">
                  <p className={`whitespace-pre-wrap text-base leading-relaxed text-input-text ${descriptionExpanded ? '' : 'line-clamp-6'}`}>
                    {description}
                  </p>
                  {description.length > 350 ? (
                    <Button
                      variant="link"
                      size="sm"
                      type="button"
                      onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                      className="mt-3 px-0"
                    >
                      {descriptionExpanded ? 'Show less' : 'Read more'}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-8 text-sm text-input-placeholder">No description yet.</p>
              )}
            </header>

            <aside className="lg:border-l lg:border-line-glass/10 lg:pl-6">
              <dl className="divide-y divide-line-glass/10 text-sm">
                <SummaryRow label="Status" value={triageLabel(effectiveTriageStatus)} icon={CheckCircleIcon} />
                <SummaryRow label="Consultation" value={paymentLabel} icon={CreditCardIcon} />
                <SummaryRow label="Location" value={locationLabel} icon={MapPinIcon} />
                <SummaryRow label="Urgency" value={intake.urgency ? urgencyLabel(intake.urgency) : null} icon={ExclamationTriangleIcon} />
                <SummaryRow label="Court date" value={intake.court_date ? (formatLongDate(intake.court_date) ?? intake.court_date) : null} icon={ClockIcon} />
                <SummaryRow label="Documents" value={hasDocs} icon={ClipboardDocumentCheckIcon} />
                <SummaryRow label="AI case strength" value={caseStrength} icon={ScaleIcon} />
                <SummaryRow label="Household income" value={income} icon={CreditCardIcon} />
                <SummaryRow label="Household size" value={householdSize} icon={UserIcon} />
              </dl>
            </aside>
          </div>
        </section>

        <section className="glass-card p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-input-placeholder">
                Form details
              </h2>
              {templateName ? (
                <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
                  {templateName}
                </span>
              ) : null}
            </div>
            {activeTemplate && (practiceDetails as { slug?: string })?.slug ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => route(`/practice/${encodeURIComponent((practiceDetails as { slug?: string }).slug)}/intakes/${encodeURIComponent(activeTemplate.slug)}/edit`)}
                className="h-auto p-0 text-xs text-accent hover:text-accent-hover"
              >
                View form setup
              </Button>
            ) : null}
            {activeTemplate && (practiceDetails as { slug?: string })?.slug && (
              <div className="mt-4">
                <EmbedCodeBlock
                  practiceSlug={(practiceDetails as { slug?: string }).slug}
                  templateSlug={activeTemplate.slug}
                />
              </div>
            )}
          </div>
          {enrichmentFields.length > 0 ? (
            <dl className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {enrichmentFields.map((field) => (
                <StatCell
                  key={field.key}
                  label={field.label}
                  value={resolveFieldValue(field, intakeStateRecord, intake)}
                  icon={ClipboardDocumentCheckIcon}
                />
              ))}
            </dl>
          ) : (
            <dl className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <StatCell label="On behalf of" value={onBehalfOf} icon={UserIcon} />
              <StatCell label="Opposing party" value={opposingParty} icon={ScaleIcon} />
              <StatCell label="Desired outcome" value={intake.desired_outcome} icon={CheckCircleIcon} />
            </dl>
          )}
          {hasMissingLegalDetails ? (
            <div className="mt-6 flex flex-col gap-3 border-t border-line-glass/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-relaxed text-input-placeholder">
                Blawby can ask the client for the missing legal details and add them to this thread.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void startGatherDetailsFlow()}
                disabled={gatherDetailsSubmitting}
                className="shrink-0"
              >
                {gatherDetailsSubmitting ? 'Starting...' : 'Ask Blawby to gather details'}
              </Button>
            </div>
          ) : null}
        </section>

          {conversationSection}
        </div>

        {intakeSidebar}
      </div>

      <Dialog
        isOpen={triageDialogAction !== null}
        onClose={closeTriageDialog}
        title={triageDialogAction === 'accepted' ? 'Approve consultation' : 'Reject consultation'}
        description={
          triageDialogAction === 'accepted'
            ? "This will approve the lead and prepare for onboarding."
            : "This will mark the intake as rejected."
        }
        disableBackdropClick={isSubmitting}
      >
        <DialogBody className="space-y-4">
          <Textarea
            label="Internal note (optional)"
            value={triageReason}
            onChange={setTriageReason}
            rows={3}
            placeholder="Add reasoning for this triage decision…"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={closeTriageDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={triageDialogAction === 'accepted' ? 'primary' : 'danger'}
            disabled={isSubmitting}
            onClick={() => {
              if (triageDialogAction) void runTriage(triageDialogAction, triageReason);
            }}
          >
            {isSubmitting ? 'Updating...' : (triageDialogAction === 'accepted' ? 'Confirm approval' : 'Confirm')}
          </Button>
        </DialogFooter>
      </Dialog>
    </EditorShell>
  );
};

export default IntakeDetailPage;
