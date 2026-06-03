import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  Copy,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
} from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Avatar } from '@/shared/ui/profile';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { MessageRowSkeleton, SkeletonLoader } from '@/shared/ui/layout';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/input';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';
import { generateEngagement } from '@/config/urls';
import { cn } from '@/shared/utils/cn';
import {
  fetchConversationMessages,
  postConversationMessage,
  postSystemMessage,
  updateConversationMetadata,
} from '@/shared/lib/conversationApi';
import type { ConversationMessage } from '@/shared/types/conversation';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { applyConsultationPatchToMetadata } from '@/shared/utils/consultationState';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { resolvePracticeServiceLabel } from '@/features/matters/utils/matterUtils';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import {
  updateIntakeTriageStatus,
  type PracticeIntakeDetail,
} from '@/features/intake/api/intakesApi';
import { useIntakeDetail } from '@/features/intake/hooks/useIntakeDetail';
import { useIntakeFiles } from '@/features/intake/hooks/useIntakeFiles';
import { IntakeFilesPanel } from '@/features/intake/components/IntakeFilesPanel';
import { STANDARD_FIELD_DEFINITIONS } from '@/shared/constants/intakeTemplates';
import type { IntakeTemplate, IntakeFieldDefinition, IntakeEnrichedData } from '@/shared/types/intake';
import VirtualMessageList from '@/features/chat/components/VirtualMessageList';
import MessageComposer from '@/features/chat/components/MessageComposer';
import type { ChatMessageUI, FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';

import { Pill } from '@/design-system/primitives';
import { IntakeStickyHeader } from '../components/IntakeStickyHeader';
import { IntakeAIVerdict } from '../components/IntakeAIVerdict';
import { IntakeScorecard } from '../components/IntakeScorecard';
import { IntakePreflightChecks } from '../components/IntakePreflightChecks';
import { IntakeAcceptancePreview } from '../components/IntakeAcceptancePreview';
import { IntakePaymentSummary } from '../components/IntakePaymentSummary';
import type { AIAnswerCardSource } from '@/design-system/patterns';

// ── Helpers ──────────────────────────────────────────────────────────────────


type EngagementLetterTemplate = {
  id: string;
  name: string;
  practiceArea: string;
  feeType: 'hourly' | 'flat' | 'contingency' | 'pro_bono';
  hourlyRateCents: number | null;
  flatFeeCents: number | null;
  contingencyPct: number | null;
  retainerCents: number | null;
  scopeTemplate: string;
  body: string;
};

function parseEnrichedData(meta: Record<string, unknown>): IntakeEnrichedData | null {
  const cf = (meta.customFields ?? meta.custom_fields) as Record<string, unknown> | undefined;
  if (!cf || typeof cf !== 'object') return null;
  const raw = cf._enriched_data;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const conflictNames = Array.isArray(parsed.conflict_check_names)
      ? parsed.conflict_check_names
      : parsed.conflict_check_names == null
        ? []
        : [parsed.conflict_check_names];
    return {
      practice_area: typeof parsed.practice_area === 'string' ? parsed.practice_area : null,
      sub_type: typeof parsed.sub_type === 'string' ? parsed.sub_type : null,
      matter_stage: parsed.matter_stage === 'pre_litigation' || parsed.matter_stage === 'active_litigation' || parsed.matter_stage === 'post_judgment' || parsed.matter_stage === 'transactional'
        ? parsed.matter_stage
        : null,
      client_role: parsed.client_role === 'petitioner' || parsed.client_role === 'respondent' || parsed.client_role === 'plaintiff' || parsed.client_role === 'defendant' || parsed.client_role === 'buyer' || parsed.client_role === 'seller' || parsed.client_role === 'other'
        ? parsed.client_role
        : null,
      complexity: parsed.complexity === 'simple' || parsed.complexity === 'moderate' || parsed.complexity === 'complex'
        ? parsed.complexity
        : null,
      conflict_check_names: conflictNames.filter((name): name is string => typeof name === 'string'),
      sol_risk: typeof parsed.sol_risk === 'boolean' ? parsed.sol_risk : null,
      sol_risk_notes: typeof parsed.sol_risk_notes === 'string' ? parsed.sol_risk_notes : null,
      emergency_relief_needed: typeof parsed.emergency_relief_needed === 'boolean' ? parsed.emergency_relief_needed : null,
      multi_state: typeof parsed.multi_state === 'boolean' ? parsed.multi_state : null,
      multi_state_notes: typeof parsed.multi_state_notes === 'string' ? parsed.multi_state_notes : null,
      legal_aid_eligible: typeof parsed.legal_aid_eligible === 'boolean' ? parsed.legal_aid_eligible : null,
      estimated_value_band: parsed.estimated_value_band === 'low' || parsed.estimated_value_band === 'medium' || parsed.estimated_value_band === 'high'
        ? parsed.estimated_value_band
        : null,
      ai_matter_description: typeof parsed.ai_matter_description === 'string' ? parsed.ai_matter_description : null,
      ai_scope_suggestion: typeof parsed.ai_scope_suggestion === 'string' ? parsed.ai_scope_suggestion : null,
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
    };
  } catch {
    return null;
  }
}

function parseEngagementTemplates(practiceDetails: unknown): EngagementLetterTemplate[] {
  if (!practiceDetails || typeof practiceDetails !== 'object') return [];
  const meta = (practiceDetails as Record<string, unknown>).metadata;
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).engagementLetterTemplates;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p as EngagementLetterTemplate[] : []; } catch { return []; }
  }
  return Array.isArray(raw) ? raw as EngagementLetterTemplate[] : [];
}

function resolveActiveTemplate(
  _intake: PracticeIntakeDetail,
  _practiceDetails: unknown,
): IntakeTemplate | null {
  // Template data is no longer stored in practice metadata.
  // The intake detail view shows field values from the intake submission itself,
  // not by re-resolving the template. Return null — callers fall back to
  // STANDARD_FIELD_DEFINITIONS for display.
  return null;
}

function resolveFieldValue(
  field: IntakeFieldDefinition,
  intakeState: Record<string, unknown> | null,
  intake?: PracticeIntakeDetail | null,
): string | null {
  const normalize = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  };

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

  if (intake && typeof intake === 'object') {
    const meta = (intake.metadata ?? {}) as Record<string, unknown>;
    if (field.isStandard) {
      const v = meta[field.key];
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

function triageLabel(status?: string | null): string {
  switch (status) {
    case 'accepted': return 'Accepted';
    case 'declined': return 'Declined';
    case 'rejected': return 'Rejected';
    case 'spam': return 'Spam';
    case 'pending_review':
    default: return 'Pending Review';
  }
}

function triagePillTone(status?: string | null): 'live' | 'warn' | 'urgent' | 'gold' | 'dim' {
  switch (status) {
    case 'accepted': return 'live';
    case 'declined':
    case 'rejected': return 'urgent';
    case 'spam': return 'dim';
    case 'pending_review':
    default: return 'warn';
  }
}

function scopeShortLabel(
  enrichedData: IntakeEnrichedData | null,
  fallbackTitle: string,
): string {
  if (enrichedData?.ai_scope_suggestion) {
    // Truncate to first sentence / clause for the H2 line.
    const trimmed = enrichedData.ai_scope_suggestion.split(/[.:;]/)[0]?.trim();
    if (trimmed && trimmed.length > 0 && trimmed.length < 80) return trimmed.toLowerCase();
  }
  if (enrichedData?.sub_type) return enrichedData.sub_type.replace(/_/g, ' ');
  return fallbackTitle;
}

// ── Sub-components (kept) ────────────────────────────────────────────────────

const SectionLabel: FunctionComponent<{ children: ComponentChildren; className?: string }> = ({ children, className }) => (
  <h2 className={cn('font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dim-2', className)}>
    {children}
  </h2>
);

const Card: FunctionComponent<{ children: ComponentChildren; className?: string }> = ({ children, className }) => (
  <section
    className={cn(
      'rounded-r-md border border-card-border bg-card p-4 sm:p-6',
      className,
    )}
  >
    {children}
  </section>
);

// ── Skeleton ─────────────────────────────────────────────────────────────────

const DetailSkeleton: FunctionComponent<{ onBack: () => void }> = ({ onBack }) => (
  <div className="flex h-full flex-col min-h-0">
    <header className="sticky top-0 z-10 border-b border-line-subtle bg-paper/95 px-4 py-4 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-dim-2 hover:text-ink"
      >
        ← Back
      </button>
      <div className="mt-2 space-y-2">
        <SkeletonLoader variant="text" width="w-32" height="h-3" />
        <SkeletonLoader variant="title" width="w-2/3" height="h-7" />
        <SkeletonLoader variant="text" width="w-48" height="h-3" />
      </div>
    </header>
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="grid h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-r-md border border-card-border bg-card p-6 space-y-3">
            <SkeletonLoader variant="text" width="w-32" height="h-3" />
            <SkeletonLoader variant="title" width="w-3/4" height="h-7" />
            <div className="space-y-2 pt-3">
              <SkeletonLoader variant="text" width="w-full" height="h-3" />
              <SkeletonLoader variant="text" width="w-11/12" height="h-3" />
            </div>
          </div>
          <div className="rounded-r-md border border-card-border bg-card p-6 space-y-4">
            <SkeletonLoader variant="text" width="w-32" height="h-3" />
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonLoader variant="text" width="w-20" height="h-3" />
                  <SkeletonLoader variant="text" width={i % 2 === 0 ? 'w-32' : 'w-40'} height="h-3.5" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-r-md border border-card-border bg-card p-6 space-y-3">
            <SkeletonLoader variant="text" width="w-32" height="h-3" />
            <MessageRowSkeleton lineWidths={['w-40', 'w-56']} />
            <MessageRowSkeleton lineWidths={['w-64', 'w-44']} />
          </div>
        </div>
        <aside className="hidden xl:block space-y-4 border-l border-line-subtle bg-paper-2 p-6">
          <SkeletonLoader variant="button" width="w-full" />
          <SkeletonLoader variant="button" width="w-full" />
          <div className="rounded-r-md border border-card-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <SkeletonLoader variant="avatar" />
              <div className="flex-1 space-y-1.5">
                <SkeletonLoader variant="text" width="w-32" height="h-3.5" />
                <SkeletonLoader variant="text" width="w-24" height="h-3" />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────

type IntakeDetailPageProps = {
  practiceId: string | null;
  intakeId: string;
  conversationsBasePath?: string | null;
  engagementsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  onBack: () => void;
  onTriageComplete?: () => void;
};

export const IntakeDetailPage: FunctionComponent<IntakeDetailPageProps> = ({
  practiceId,
  intakeId,
  engagementsBasePath,
  practiceName,
  practiceLogo,
  onBack,
  onTriageComplete,
}) => {
  const { showSuccess, showError } = useToastContext();
  const { session } = useSessionContext();
  const { navigate } = useNavigation();

  const {
    data: intakeData,
    isLoading,
    error: loadError,
    refetch: refetchIntake,
  } = useIntakeDetail(practiceId, intakeId);
  const intake: PracticeIntakeDetail | null = intakeData ?? null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localTriageStatus, setLocalTriageStatus] = useState<string | null>(null);
  const [triageDialogAction, setTriageDialogAction] = useState<'accepted' | 'declined' | null>(null);
  const [triageReason, setTriageReason] = useState('');
  const [previewMessages, setPreviewMessages] = useState<ChatMessageUI[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCursor, setPreviewCursor] = useState<string | null>(null);
  const [hasMorePreview, setHasMorePreview] = useState(false);
  const [isLoadingMorePreview, setIsLoadingMorePreview] = useState(false);

  const PREVIEW_PAGE_SIZE = 50;
  const mapMessage = useCallback((m: ConversationMessage): ChatMessageUI => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at).getTime(),
    reply_to_message_id: m.reply_to_message_id ?? null,
    metadata: m.metadata ?? undefined,
    isUser: m.user_id === session?.user?.id,
    seq: m.seq,
  } satisfies ChatMessageUI), [session?.user?.id]);

  const {
    conversationMetadata,
    updateConversationMetadata: updateConversationMetadataPatch,
    intakeConversationState,
  } = useMessageHandling({
    practiceId: practiceId ?? undefined,
    conversationId: intake?.conversation_id == null ? undefined : intake.conversation_id,
  });

  const isMountedRef = useRef(true);
  const isLoadingMorePreviewRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Load the most-recent page of messages when an intake conversation exists.
  // Older pages are fetched on-demand via loadOlderMessages (scroll-up trigger).
  useEffect(() => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId) {
      setPreviewMessages([]);
      setPreviewLoading(false);
      setPreviewCursor(null);
      setHasMorePreview(false);
      return;
    }
    const controller = new AbortController();
    setPreviewMessages([]);
    setPreviewLoading(true);
    setPreviewCursor(null);
    setHasMorePreview(false);
    fetchConversationMessages(conversationId, targetPracticeId, {
      limit: PREVIEW_PAGE_SIZE,
      signal: controller.signal,
    })
      .then((page) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        setPreviewMessages(page.messages.map(mapMessage));
        setPreviewCursor(page.cursor);
        setHasMorePreview(page.hasMore);
      })
      .catch((err) => {
        if (!isMountedRef.current || controller.signal.aborted) return;
        console.warn('[IntakeDetailPage] Failed to load conversation preview', err);
        setPreviewMessages([]);
      })
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) setPreviewLoading(false);
      });
    return () => controller.abort();
  }, [intake?.conversation_id, intake?.organization_id, mapMessage]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId) return;
    if (!previewCursor || !hasMorePreview || isLoadingMorePreviewRef.current) return;

    isLoadingMorePreviewRef.current = true;
    setIsLoadingMorePreview(true);
    try {
      const page = await fetchConversationMessages(conversationId, targetPracticeId, {
        limit: PREVIEW_PAGE_SIZE,
        cursor: previewCursor,
      });
      if (!isMountedRef.current) return;
      // Older messages are returned by the API; prepend them. De-dupe by id
      // in case the cursor boundary overlaps.
      setPreviewMessages((current) => {
        const existing = new Set(current.map((m) => m.id));
        const olderMapped = page.messages.map(mapMessage).filter((m) => !existing.has(m.id));
        return [...olderMapped, ...current];
      });
      setPreviewCursor(page.cursor);
      setHasMorePreview(page.hasMore);
    } catch (err) {
      console.warn('[IntakeDetailPage] Failed to load older messages', err);
    } finally {
      if (isMountedRef.current) {
        isLoadingMorePreviewRef.current = false;
        setIsLoadingMorePreview(false);
      }
    }
  }, [intake?.conversation_id, intake?.organization_id, previewCursor, hasMorePreview, mapMessage]);

  const [composerValue, setComposerValue] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [gatherDetailsSubmitting, setGatherDetailsSubmitting] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateTemplateId, setGenerateTemplateId] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generatedBody, setGeneratedBody] = useState<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Composer file state for the staff reply. Kept in page state so the
  // composer's preview and uploading lists can drive the submission payload.
  const [composerPreviewFiles, setComposerPreviewFiles] = useState<FileAttachment[]>([]);
  const [composerUploadingFiles, setComposerUploadingFiles] = useState<UploadingFile[]>([]);

  // Lift intake-files state to the page so the chip count and the panel
  // share a single fetch. Composer uploads call uploadFile from the same
  // hook so the panel and chip update in real time without a refetch.
  const {
    files: intakeFiles,
    uploadFile: panelUploadFile,
  } = useIntakeFiles(intake?.uuid ?? null);

  const composerUploadId = useRef(0);
  const handleComposerFileSelect = useCallback(async (selected: File[]): Promise<FileAttachment[]> => {
    if (!intake?.uuid || selected.length === 0) return [];
    const uploaded: FileAttachment[] = [];
    for (const file of selected) {
      const id = `composer-upload-${composerUploadId.current++}`;
      setComposerUploadingFiles((prev) => [...prev, { id, file, status: 'uploading', progress: 0 }]);
      try {
        const result = await panelUploadFile(file);
        const attachment: FileAttachment = {
          id: result.id,
          name: result.fileName,
          size: result.fileSize,
          type: result.mimeType ?? file.type ?? 'application/octet-stream',
          url: result.publicUrl ?? '',
          storageKey: result.storageKey ?? undefined,
          uploadId: result.uploadId,
          source: 'intake',
        };
        setComposerPreviewFiles((prev) => [...prev, attachment]);
        uploaded.push(attachment);
      } catch (error) {
        showError('Upload failed', error instanceof Error ? error.message : 'Failed to upload file.');
      } finally {
        setComposerUploadingFiles((prev) => prev.filter((entry) => entry.id !== id));
      }
    }
    return uploaded;
  }, [intake?.uuid, panelUploadFile, showError]);

  const handleComposerCameraCapture = useCallback(async (file: File): Promise<void> => {
    await handleComposerFileSelect([file]);
  }, [handleComposerFileSelect]);

  const removeComposerPreviewFile = useCallback((index: number) => {
    setComposerPreviewFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const cancelComposerUpload = useCallback((id: string) => {
    setComposerUploadingFiles((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const {
    details: practiceDetails,
    hasDetails: hasPracticeDetails,
    fetchDetails: fetchPracticeDetails,
  } = usePracticeDetails(practiceId, null, false);

  const activeTemplate = intake ? resolveActiveTemplate(intake, practiceDetails) : null;

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
      const trimmedReason = typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : undefined;
      let participantFailed = false;
      const result = await updateIntakeTriageStatus(intakeId, { status: action, reason: trimmedReason });

      const responseConversationId = result?.conversation_id ?? result?.conversationId ?? intake.conversation_id;
      const targetPracticeId = intake.organization_id;

      if (action === 'accepted' && session?.user?.id && responseConversationId && targetPracticeId) {
        try {
          await updateConversationMetadata(responseConversationId, targetPracticeId, {
            status: 'active',
            triageStatus: 'accepted',
            triage_status: 'accepted',
            intakeTriageStatus: 'accepted',
            mode: 'CONVERSATION',
          });
        } catch (e) {
          console.warn('[IntakeDetailPage] Failed to mark conversation active', e);
        }

        try {
          await apiClient.post(
            `/api/conversations/${encodeURIComponent(responseConversationId)}/participants`,
            { participantUserIds: [session.user.id] },
            { params: { practiceId: targetPracticeId } },
          );
        } catch (e) {
          participantFailed = true;
          if (!isHttpError(e)) console.warn('[IntakeDetailPage] Failed to add participant', e);
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
        } catch (e) {
          console.warn('[IntakeDetailPage] Failed to post join message', e);
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
          } catch (e) {
            console.warn('[IntakeDetailPage] Failed to post intake triage note', e);
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
        } catch (e) {
          console.warn('[IntakeDetailPage] Failed to post decline message', e);
        }
        if (trimmedReason) {
          try {
            await postConversationMessage(responseConversationId, targetPracticeId, {
              content: trimmedReason,
              metadata: {
                intakeUuid: intakeId,
                triageStatus: action,
                triage_status: action,
                triageReason: trimmedReason,
                triage_reason: trimmedReason,
                source: 'intake-triage',
              },
            });
          } catch (e) {
            console.warn('[IntakeDetailPage] Failed to post intake triage note (decline)', e);
          }
        }
      }

      if (isMountedRef.current) {
        setLocalTriageStatus(action);
        void refetchIntake();
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
            : 'Your response has been recorded.',
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
  }, [intake, intakeId, isSubmitting, onTriageComplete, session?.user, showError, showSuccess, refetchIntake]);

  const submitConversationReply = useCallback(async () => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    const content = composerValue.trim();
    const attachments = composerPreviewFiles;
    if (!conversationId || !targetPracticeId || composerSubmitting) return;
    if (!content && attachments.length === 0) return;

    setComposerSubmitting(true);
    try {
      const message = await postConversationMessage(conversationId, targetPracticeId, {
        content,
        metadata: {
          source: 'intake-detail',
          intakeUuid: intakeId,
          senderType: 'team_member',
          // Include both `attachments` (worker route validates this key for
          // attachment-only sends) and `files` (legacy metadata key the
          // message rendering layer reads).
          ...(attachments.length > 0 ? { files: attachments, attachments } : {}),
        },
      });
      setComposerValue('');
      setComposerPreviewFiles([]);
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
            files: attachments.length > 0 ? attachments : undefined,
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
  }, [composerPreviewFiles, composerSubmitting, composerValue, intake?.conversation_id, intake?.organization_id, intakeId, showError]);

  const startGatherDetailsFlow = useCallback(async () => {
    const conversationId = intake?.conversation_id;
    const targetPracticeId = intake?.organization_id;
    if (!conversationId || !targetPracticeId || gatherDetailsSubmitting) return;

    const currentCase = intakeConversationState;
    const nextMetadata = applyConsultationPatchToMetadata(
      conversationMetadata,
      { case: { ...(currentCase ?? {}), enrichmentMode: true } },
      { mirrorLegacyFields: true },
    );

    const templateFields = (activeTemplate?.fields ?? STANDARD_FIELD_DEFINITIONS)
      .filter((f) => f.phase === 'enrichment');
    const intakeStateRecord = intakeConversationState as unknown as Record<string, unknown> | null;
    const nextMissingField = templateFields.find(
      (f) => !resolveFieldValue(f, intakeStateRecord, intake),
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

  const handleGenerateEngagement = useCallback(async (template: EngagementLetterTemplate) => {
    if (!intake || generateLoading) return;
    const metaRecord = (intake.metadata ?? {}) as Record<string, unknown>;
    const enriched = parseEnrichedData(metaRecord);
    setGenerateLoading(true);
    setGeneratedBody(null);
    try {
      const result = await apiClient.post<{ contractBody: string }>(generateEngagement, {
        enrichedData: enriched,
        template,
        intakeFields: {
          clientName: typeof metaRecord.name === 'string' ? metaRecord.name : '',
          clientEmail: typeof metaRecord.email === 'string' ? metaRecord.email : '',
          opposingParty: typeof metaRecord.opposing_party === 'string' ? metaRecord.opposing_party : null,
          description: typeof metaRecord.description === 'string' ? metaRecord.description : null,
          courtDate: intake.court_date ?? null,
          jurisdiction: typeof (intakeConversationState as unknown as Record<string, unknown>)?.state === 'string'
            ? (intakeConversationState as unknown as Record<string, unknown>).state as string
            : null,
          practiceName: typeof (practiceDetails as Record<string, unknown> | null)?.name === 'string'
            ? (practiceDetails as Record<string, unknown>).name as string
            : practiceName,
        },
      });
      // Validate response shape before using
      if (result?.data && typeof result.data === 'object' && typeof result.data.contractBody === 'string') {
        setGeneratedBody(result.data.contractBody);
      } else {
        console.warn('[IntakeDetailPage] Unexpected generate-engagement response shape', result);
        showError('Generation failed', 'Unexpected response format from server');
      }
    } catch (error) {
      showError('Generation failed', error instanceof Error ? error.message : 'Failed to generate engagement letter');
    } finally {
      if (isMountedRef.current) setGenerateLoading(false);
    }
  }, [generateLoading, intake, intakeConversationState, practiceDetails, practiceName, showError]);

  // Scroll composer textarea into view when reply CTA fires.
  const focusComposer = useCallback(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ── Hooks that must run on EVERY render (before any early return). ──────────
  //
  // React's rules-of-hooks forbid conditional hook calls; we hoist these
  // callbacks/memos to the top of the render path so the order is stable
  // even when intake is still loading or errored.

  const handleAcceptWithCounter = useCallback(() => {
    if (isSubmitting) return;
    setTriageDialogAction('accepted');
    setTriageReason('');
  }, [isSubmitting]);

  const handleAcceptAtCurrent = useCallback(() => {
    if (isSubmitting) return;
    setTriageDialogAction('accepted');
    setTriageReason('');
  }, [isSubmitting]);

  // Practice coverage states (used by preflight checks). Defensive read
  // because PracticeDetails.serviceStates is typed as `string[] | null`.
  const coverageStates: string[] = useMemo(() => {
    const detailRecord = practiceDetails as Record<string, unknown> | null;
    const raw = detailRecord?.serviceStates;
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  }, [practiceDetails]);

  // Practice service labels for area-fit matching. Read off practiceDetails
  // directly (not via the local `services` const, which is re-created each
  // render and would invalidate this memo on every paint).
  const practiceServiceLabels: string[] = useMemo(() => {
    const raw = (practiceDetails as Record<string, unknown> | null)?.services;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object')
      .map((s) => typeof s.name === 'string' ? s.name : '')
      .filter((label): label is string => label.length > 0);
  }, [practiceDetails]);

  if (isLoading) return <DetailSkeleton onBack={onBack} />;

  if (loadError || !intake) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <IntakeStickyHeader
          receivedRelative="just now"
          clientName="Intake"
          scopeLabel={null}
          onBack={onBack}
        />
        <div className="p-6 text-sm text-error">
          {loadError ?? 'Intake not found.'}
        </div>
      </div>
    );
  }

  const meta = (intake.metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.name === 'string' ? meta.name : null;
  const email = typeof meta.email === 'string' ? meta.email : null;
  const phone = typeof meta.phone === 'string' ? meta.phone : null;
  const description = typeof meta.description === 'string' ? meta.description : null;
  const practiceServiceUuid = typeof meta.practice_service_uuid === 'string' ? meta.practice_service_uuid : null;
  const services = Array.isArray(practiceDetails?.services) ? practiceDetails.services : [];
  const matchingService = services.find((s) => s && typeof s === 'object' && s.id === practiceServiceUuid && typeof s.name === 'string');
  const matchingServiceName = typeof matchingService?.name === 'string' ? matchingService.name : undefined;
  const practiceServiceName = practiceServiceUuid ? resolvePracticeServiceLabel(practiceServiceUuid, matchingServiceName) : null;

  const documentCount = intakeFiles.length;
  const hasDocs = documentCount > 0 || intake.has_documents === true || meta.has_documents === true;

  const effectiveTriageStatus = localTriageStatus ?? intake.triage_status ?? 'pending_review';
  const isPending = effectiveTriageStatus === 'pending_review' || !effectiveTriageStatus;
  const intakeTitle = resolveIntakeTitle(
    {
      ...meta,
      title: conversationMetadata?.title ?? meta.title,
      intake_title: conversationMetadata?.intake_title ?? meta.intake_title,
    },
    name ? `${name} intake` : 'Untitled intake',
  );
  const canReplyInIntake = Boolean(intake.conversation_id && effectiveTriageStatus === 'accepted');
  const engagementCreatePath = `${engagementsBasePath ?? '/practice/engagements'}?create=1&intakeId=${encodeURIComponent(intake.uuid)}`;
  const enrichmentFields: IntakeFieldDefinition[] = (
    activeTemplate?.fields ?? STANDARD_FIELD_DEFINITIONS
  ).filter((f) => f.phase === 'enrichment');
  const intakeStateRecord = intakeConversationState as unknown as Record<string, unknown> | null;
  const unansweredEnrichment = enrichmentFields.filter((f) => !resolveFieldValue(f, intakeStateRecord, intake));
  const showGatherDetails = unansweredEnrichment.length > 0 && Boolean(intake.conversation_id);

  const enrichedData = parseEnrichedData(meta as Record<string, unknown>);
  const engagementTemplates = parseEngagementTemplates(practiceDetails);
  const activeGenerateTemplate = generateTemplateId
    ? (engagementTemplates.find((t) => t.id === generateTemplateId) ?? engagementTemplates[0])
    : engagementTemplates[0];

  // ── Header derivation ──────────────────────────────────────────────────────

  const receivedRelative = formatRelativeTime(intake.created_at) || 'just now';
  const headerScope = scopeShortLabel(enrichedData, intakeTitle);
  const headerClient = name ?? 'Anonymous lead';
  const headerPracticeArea = enrichedData?.practice_area
    ? enrichedData.practice_area.split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : practiceServiceName ?? null;
  const addressMeta = (meta.address && typeof meta.address === 'object' && !Array.isArray(meta.address))
    ? meta.address as Record<string, unknown>
    : null;
  const stateFromAddress = typeof addressMeta?.state === 'string' ? addressMeta.state.trim() : null;
  const cityFromAddress = typeof addressMeta?.city === 'string' ? addressMeta.city.trim() : null;
  const stateFromMetaTop = typeof meta.state === 'string' ? (meta.state as string).trim() : null;
  const stateFromConvoState = typeof intakeStateRecord?.state === 'string' ? (intakeStateRecord.state as string).trim() : null;
  const intakeJurisdictionState = stateFromAddress || stateFromMetaTop || stateFromConvoState || null;
  const jurisdictionLabel = intakeJurisdictionState
    ? cityFromAddress
      ? `${intakeJurisdictionState} · ${cityFromAddress}`
      : intakeJurisdictionState
    : null;
  // TODO(backend): expose intake source (widget origin / referral) via the
  // intake row. For now we fall back to a generic practice label.
  const sourceLabel = `via ${practiceName?.trim() || 'public intake form'}`;
  // TODO(backend): expose a real response-window from practice settings;
  // surface "urgent" when the intake is flagged as time-sensitive.
  const responseWindow = intake.urgency === 'emergency'
    ? '< 3h response window'
    : intake.urgency === 'time_sensitive'
      ? '24h response window'
      : null;

  const stampParts: string[] = [];
  const intakeAgeMin = (() => {
    const created = new Date(intake.created_at).getTime();
    if (!Number.isFinite(created)) return null;
    const diff = Date.now() - created;
    if (diff < 0) return null;
    const mins = Math.round(diff / 60000);
    return mins;
  })();
  if (intakeAgeMin != null && intakeAgeMin < 60 * 24) {
    stampParts.push(`conversation captured ${intakeAgeMin === 0 ? '<1' : intakeAgeMin} min ago`);
  }
  if (intake.amount != null && intake.stripe_charge_id) {
    const fee = (() => {
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: intake.currency || 'USD', maximumFractionDigits: 0 }).format(intake.amount / 100);
      } catch {
        return `$${(intake.amount / 100).toFixed(0)}`;
      }
    })();
    stampParts.push(`client paid ${fee} consult fee`);
  }
  const stampText = stampParts.length > 0 ? stampParts.join(' · ') : null;

  // Note: `handleAcceptWithCounter` / `handleAcceptAtCurrent` are hoisted
  // above the early-return so the hook order is stable.

  // ── Status pill (header) ───────────────────────────────────────────────────

  const statusPill = (
    <Pill tone={triagePillTone(effectiveTriageStatus)} dot>
      {triageLabel(effectiveTriageStatus)}
    </Pill>
  );

  // Compact header action cluster — uses existing handlers.
  const headerActions = isPending ? (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => openTriageDialog('declined')}
        disabled={isSubmitting}
      >
        Decline
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={focusComposer}
        disabled={!canReplyInIntake && !intake.conversation_id}
      >
        Ask in chat
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => openTriageDialog('accepted')}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center">
            <LoadingSpinner size="sm" className="mr-2" ariaLabel="Accepting consultation" />
            Accepting…
          </span>
        ) : 'Accept & invite'}
      </Button>
    </>
  ) : effectiveTriageStatus === 'accepted' ? (
    <Button
      variant="primary"
      size="sm"
      icon={FileText}
      onClick={() => navigate(engagementCreatePath)}
    >
      Create engagement
    </Button>
  ) : null;

  // ── AI verdict sources ──────────────────────────────────────────────────────

  const verdictSources: AIAnswerCardSource[] = [];
  // Always include the intake itself as a live source.
  verdictSources.push({ table: 'intake', count: 1 });
  if (enrichedData?.conflict_check_names?.length) {
    verdictSources.push({ table: 'conflict_check', count: enrichedData.conflict_check_names.length });
  }
  if (intakeFiles.length > 0) {
    verdictSources.push({ table: 'intake_files', count: intakeFiles.length });
  }
  // TODO(backend): surface counts from contact_forms / matters citations once
  // a per-intake source aggregation endpoint exists.

  // ── Counter-offer derivation ────────────────────────────────────────────────

  // TODO(backend): real per-intake AI suggested fee — today we approximate by
  // bumping the current intake amount ~33% (e.g. $3,000 → $4,000) so the
  // surface renders deterministic copy.
  const counterCents = intake.amount != null
    ? Math.round((intake.amount * 4) / 3)
    : null;

  // ── Description card (preserved, simplified header) ─────────────────────────

  const intakeStoryCard = description ? (
    <Card>
      <div className="space-y-1">
        <SectionLabel>Client&apos;s own words</SectionLabel>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{description}</p>
      </div>
    </Card>
  ) : null;

  // Note: `coverageStates` / `practiceServiceLabels` are hoisted above the
  // early-return so the hook order is stable. They're used here for the
  // preflight checks panel.

  // ── Conversation card ──────────────────────────────────────────────────────

  const conversationMessageCount = previewMessages.length;
  const conversationStamp = intake.conversation_id
    ? `${conversationMessageCount} message${conversationMessageCount === 1 ? '' : 's'} · auto-transcribed`
    : '';

  const conversationCard = intake.conversation_id ? (
    <Card className="flex min-h-[420px] flex-col p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line-subtle p-4 sm:px-6 sm:py-5">
        <div>
          <SectionLabel>Intake conversation</SectionLabel>
          <p className="mt-1 text-xs text-dim-2">Continue the client thread from this intake.</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          {conversationStamp}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-card/20 touch-pan-y">
        {previewLoading && previewMessages.length === 0 ? (
          <div className="space-y-3 px-4 py-4">
            <MessageRowSkeleton lineWidths={['w-40', 'w-56']} />
            <MessageRowSkeleton lineWidths={['w-64', 'w-44', 'w-52']} />
            <MessageRowSkeleton lineWidths={['w-36', 'w-48']} />
          </div>
        ) : previewMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <Icon icon={MessageSquare} className="mb-2 h-6 w-6 text-dim-2" />
            <p className="text-sm text-dim-2">No conversation history yet.</p>
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
            hasMoreMessages={hasMorePreview}
            isLoadingMoreMessages={isLoadingMorePreview}
            onLoadMoreMessages={loadOlderMessages}
            compactLayout={false}
            bottomInsetPx={0}
            hideMessageActions={false}
            showSkeleton={false}
          />
        )}
      </div>
      {canReplyInIntake ? (
        <div className="border-t border-line-subtle px-4 py-4">
          <MessageComposer
            inputValue={composerValue}
            setInputValue={setComposerValue}
            previewFiles={composerPreviewFiles}
            uploadingFiles={composerUploadingFiles}
            removePreviewFile={removeComposerPreviewFile}
            handleFileSelect={handleComposerFileSelect}
            handleCameraCapture={handleComposerCameraCapture}
            cancelUpload={cancelComposerUpload}
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
            isReadyToUpload={Boolean(intake.uuid)}
            isSessionReady={!composerSubmitting}
            isSocketReady={!composerSubmitting}
            disabled={composerSubmitting}
            hideAttachmentControls={false}
            mentionCandidates={[]}
          />
        </div>
      ) : null}
    </Card>
  ) : null;

  // ── Right column sidebar cards ──────────────────────────────────────────────

  const contactCard = (email || phone) ? (
    <Card>
      <SectionLabel className="mb-3">Contact</SectionLabel>
      <dl className="space-y-3 text-sm">
        {email ? (
          <div className="flex items-start gap-3">
            <Icon icon={Mail} className="mt-0.5 h-4 w-4 shrink-0 text-dim-2" />
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-dim-2">Email</dt>
              <dd className="truncate">
                <a href={`mailto:${email}`} className="text-ink hover:text-accent">{email}</a>
              </dd>
            </div>
          </div>
        ) : null}
        {phone ? (
          <div className="flex items-start gap-3">
            <Icon icon={Phone} className="mt-0.5 h-4 w-4 shrink-0 text-dim-2" />
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-dim-2">Phone</dt>
              <dd>
                <a href={`tel:${phone}`} className="text-ink hover:text-accent">{phone}</a>
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
    </Card>
  ) : null;

  const aboutCard = (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar
          name={name ?? ''}
          size="md"
          className="bg-paper-2/40 text-ink ring-1 ring-line-subtle"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name ?? 'Unnamed lead'}</p>
          {intake.payment_verified ? (
            <p className="mt-0.5 text-xs text-success">Payment verified</p>
          ) : null}
        </div>
      </div>
    </Card>
  );

  const engagementActionCard = effectiveTriageStatus === 'accepted' ? (
    <Card className="flex flex-col gap-2 p-4">
      <Button
        variant="primary"
        className="w-full"
        icon={FileText}
        onClick={() => navigate(engagementCreatePath)}
      >
        Create engagement
      </Button>
      {engagementTemplates.length > 0 ? (
        <Button
          variant="secondary"
          className="w-full"
          icon={Sparkles}
          onClick={() => {
            setGenerateTemplateId(engagementTemplates[0]?.id ?? null);
            setGeneratedBody(null);
            setGenerateDialogOpen(true);
          }}
        >
          Generate Engagement Letter
        </Button>
      ) : null}
    </Card>
  ) : null;

  // Gather-details (blawby) card — kept (no longer in middle, in right column).
  const gatherDetailsCard = showGatherDetails ? (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-accent/10 p-2 text-accent">
          <Icon icon={Sparkles} className="h-4 w-4" />
        </div>
        <p className="text-xs leading-relaxed text-ink/90">
          Blawby can ask the client for missing legal details and add them to this thread.
        </p>
      </div>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => void startGatherDetailsFlow()}
        disabled={gatherDetailsSubmitting}
        className="w-full"
      >
        {gatherDetailsSubmitting ? 'Starting…' : 'Use Blawby to gather details'}
      </Button>
    </Card>
  ) : null;

  // Notes card — derived from intake.triage_reason (if any).
  const notesCard = (intake.triage_reason && intake.triage_reason.trim().length > 0) ? (
    <Card className="p-4">
      <SectionLabel className="mb-2">Notes</SectionLabel>
      <p className="text-xs leading-relaxed text-ink/90 whitespace-pre-wrap">
        {intake.triage_reason}
      </p>
    </Card>
  ) : null;

  // Mobile reflow strategy:
  // - Sticky header: scope/practice/jurisdiction collapse vertically (handled
  //   by IntakeStickyHeader); status pill + actions row stays accessible
  // - Body grid: single-col below xl, 1fr+320px aside from xl+
  // - Right aside: hidden below xl; key cards (contact, payment, gather,
  //   notes) are re-rendered inline at the bottom of main col on mobile
  // - Card padding: p-4 on mobile, p-6 from sm+ (set in Card sub-component)
  // - Scorecard: 2-col grid below sm, 4-col from sm+
  return (
    <div className="flex h-full flex-col min-h-0 bg-paper">
      <IntakeStickyHeader
        receivedRelative={`${receivedRelative}`}
        clientName={headerClient}
        scopeLabel={headerScope}
        practiceArea={headerPracticeArea}
        jurisdiction={jurisdictionLabel}
        source={sourceLabel}
        responseWindow={responseWindow}
        statusBadge={statusPill}
        actions={headerActions}
        stamp={stampText}
        onBack={onBack}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column — chat-first ordered: verdict → scorecard → preflight → preview → conversation → docs → story */}
          <div className="flex flex-col gap-5 p-4 sm:p-6">
            {/* A. AI verdict (centerpiece). */}
            <IntakeAIVerdict
              enrichedData={enrichedData}
              caseStrength={intake.case_strength ?? null}
              urgency={intake.urgency}
              practiceArea={enrichedData?.practice_area ?? null}
              currentOfferCents={intake.amount ?? null}
              counterOfferCents={counterCents}
              currency={intake.currency || 'USD'}
              sources={verdictSources}
              groundingTime={receivedRelative}
              onAcceptWithCounter={isPending ? handleAcceptWithCounter : undefined}
              onAcceptAtCurrent={isPending ? handleAcceptAtCurrent : undefined}
              onAskFollowUp={intake.conversation_id ? focusComposer : undefined}
              onDecline={isPending ? () => openTriageDialog('declined') : undefined}
              isBusy={isSubmitting}
            />

            {/* B. 4-cell scorecard. */}
            <IntakeScorecard
              enrichedData={enrichedData}
              caseStrength={intake.case_strength ?? null}
              urgency={intake.urgency}
              // TODO(backend): expose a real enrichment duration so this stamp
              // reflects actual compute time. For now anchor to the intake
              // creation timestamp.
              computedStamp={`computed at submission · ${receivedRelative}`}
            />

            {/* C. Pre-flight checks. */}
            <IntakePreflightChecks
              enrichedData={enrichedData}
              intakeState={intakeJurisdictionState}
              coverageStates={coverageStates}
              practiceServiceLabels={practiceServiceLabels}
            />

            {/* D. Acceptance preview — informational, only when pending. */}
            {isPending ? (
              <IntakeAcceptancePreview
                practiceArea={enrichedData?.practice_area ?? null}
                retainerCents={intake.amount ?? null}
                currency={intake.currency || 'USD'}
              />
            ) : null}

            {/* E. Conversation transcript. */}
            {conversationCard}

            {/* F. Files panel. */}
            <IntakeFilesPanel
              intakeUuid={intake.uuid}
              canUpload
              canDelete
              files={intakeFiles}
            />

            {/* G. Client's own words. */}
            {intakeStoryCard}

            {/* Mobile-only: contact + payment + gather-details surface inline. */}
            <div className="space-y-4 xl:hidden">
              {contactCard}
              <IntakePaymentSummary
                amountCents={intake.amount ?? null}
                currency={intake.currency || 'USD'}
                stripeChargeId={intake.stripe_charge_id ?? null}
                paid={Boolean(intake.stripe_charge_id) || intake.payment_verified === true}
              />
              {gatherDetailsCard}
              {notesCard}
            </div>
          </div>

          {/* Right column (desktop). */}
          <aside className="hidden xl:flex flex-col gap-4 border-l border-line-subtle bg-paper-2 p-6">
            {engagementActionCard}
            <IntakePaymentSummary
              amountCents={intake.amount ?? null}
              currency={intake.currency || 'USD'}
              stripeChargeId={intake.stripe_charge_id ?? null}
              paid={Boolean(intake.stripe_charge_id) || intake.payment_verified === true}
            />
            {aboutCard}
            {contactCard}
            {gatherDetailsCard}
            {notesCard}
            <Card className="p-4 text-xs text-dim-2">
              <SectionLabel className="mb-2">Documents</SectionLabel>
              <p>
                {documentCount > 0
                  ? `${documentCount} document${documentCount === 1 ? '' : 's'} shared`
                  : hasDocs ? 'Documents on file' : 'No documents shared'}
              </p>
            </Card>
          </aside>
        </div>
      </div>

      <Dialog
        isOpen={triageDialogAction !== null}
        onClose={closeTriageDialog}
        title={triageDialogAction === 'accepted' ? 'Accept' : 'Decline'}
        description={
          triageDialogAction === 'accepted'
            ? 'This will approve the lead and prepare for onboarding.'
            : 'This will mark the intake as declined.'
        }
        disableBackdropClick={isSubmitting}
      >
        <DialogBody className="space-y-4">
          <Textarea
            label="Message to client (optional)"
            value={triageReason}
            onChange={setTriageReason}
            rows={3}
            placeholder="Add a message for the client about this decision (they will see this)"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={closeTriageDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting}
            className="btn-primary btn-md"
            onClick={() => {
              if (triageDialogAction) void runTriage(triageDialogAction, triageReason);
            }}
          >
            {isSubmitting ? 'Updating…' : (triageDialogAction === 'accepted' ? 'Confirm approval' : 'Confirm decline')}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        isOpen={generateDialogOpen}
        onClose={() => { setGenerateDialogOpen(false); setGeneratedBody(null); }}
        title="Generate Engagement Letter"
        description="AI will draft an engagement letter based on this intake."
      >
        <DialogBody className="space-y-4">
          {engagementTemplates.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-dim-2">Select Template</p>
              <div className="flex flex-col gap-1">
                {engagementTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      generateTemplateId === t.id
                        ? 'border-accent bg-accent/10 text-accent-ink'
                        : 'border-card-border bg-card text-ink hover:bg-card/40',
                    )}
                    onClick={() => setGenerateTemplateId(t.id)}
                  >
                    <span className="flex-1 font-medium">{t.name}</span>
                    {t.practiceArea ? <span className="text-xs text-dim-2">{t.practiceArea}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {generatedBody ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-dim-2">Generated Letter</p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Copy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generatedBody);
                      showSuccess('Copied', 'Letter copied to clipboard');
                    } catch (_error) {
                      showError('Copy failed', 'Unable to copy to clipboard. Try copying manually.');
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
              <Textarea value={generatedBody} onChange={setGeneratedBody} rows={12} label="" />
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => { setGenerateDialogOpen(false); setGeneratedBody(null); }}
          >
            {generatedBody ? 'Close' : 'Cancel'}
          </Button>
          {!generatedBody ? (
            <Button
              variant="primary"
              disabled={generateLoading || !activeGenerateTemplate}
              onClick={() => { if (activeGenerateTemplate) void handleGenerateEngagement(activeGenerateTemplate); }}
            >
              {generateLoading ? 'Generating…' : 'Generate'}
            </Button>
          ) : null}
        </DialogFooter>
      </Dialog>
    </div>
  );
};

export default IntakeDetailPage;
