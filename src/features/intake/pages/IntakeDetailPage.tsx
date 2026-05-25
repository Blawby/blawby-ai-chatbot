import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Scale,
  Sparkles,
} from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Avatar } from '@/shared/ui/profile';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
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
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { resolvePracticeServiceLabel } from '@/features/matters/utils/matterUtils';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import {
  updateIntakeTriageStatus,
  type PracticeIntakeDetail,
} from '@/features/intake/api/intakesApi';
import { useIntakeDetail } from '@/features/intake/hooks/useIntakeDetail';
import { useIntakeFiles } from '@/features/intake/hooks/useIntakeFiles';
import { IntakeFilesPanel } from '@/features/intake/components/IntakeFilesPanel';
import { DEFAULT_INTAKE_TEMPLATE } from '@/shared/constants/intakeTemplates';
import type { IntakeTemplate, IntakeFieldDefinition, IntakeEnrichedData } from '@/shared/types/intake';
import VirtualMessageList from '@/features/chat/components/VirtualMessageList';
import MessageComposer from '@/features/chat/components/MessageComposer';
import type { ChatMessageUI, FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatAmountCents(cents: number | null | undefined, currency = 'USD'): string | null {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency}${(cents / 100).toFixed(2)}`;
  }
}

function urgencyLabel(u?: string | null): string | null {
  if (u === 'emergency') return 'Emergency';
  if (u === 'time_sensitive') return 'Time Sensitive';
  if (u === 'routine') return 'Routine';
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

function triageBadgeClass(status?: string | null): string {
  switch (status) {
    case 'accepted':
      return 'bg-success/10 text-success ring-success/20';
    case 'declined':
    case 'rejected':
      return 'bg-error/10 text-error ring-error/20';
    case 'spam':
      return 'bg-surface-utility/40 text-input-placeholder ring-line-subtle/30';
    case 'pending_review':
    default:
      return 'bg-warning/10 text-warning ring-warning/20';
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

const SectionLabel: FunctionComponent<{ children: ComponentChildren; className?: string }> = ({ children, className }) => (
  <h2 className={cn('text-[10px] font-semibold uppercase tracking-[1px] text-input-placeholder', className)}>
    {children}
  </h2>
);

const Card: FunctionComponent<{ children: ComponentChildren; className?: string }> = ({ children, className }) => (
  <section
    className={cn(
      'rounded-xl border border-card-border bg-surface-card p-4 sm:p-6',
      className,
    )}
  >
    {children}
  </section>
);

type DetailFieldProps = { label: string; value: ComponentChildren; emptyText?: string };
const DetailField: FunctionComponent<DetailFieldProps> = ({ label, value, emptyText = 'Not provided' }) => {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-input-placeholder">{label}</dt>
      <dd className={cn('text-sm break-words', isEmpty ? 'text-input-placeholder' : 'text-input-text')}>
        {isEmpty ? emptyText : value}
      </dd>
    </div>
  );
};

type InfoChipProps = { icon: typeof CheckCircle2; label: string; tone?: 'default' | 'warning' | 'success' | 'error' };
const InfoChip: FunctionComponent<InfoChipProps> = ({ icon: IconComp, label, tone = 'default' }) => {
  const toneClass = {
    default: 'text-input-placeholder',
    warning: 'text-warning',
    success: 'text-success',
    error: 'text-error',
  }[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', toneClass)}>
      <Icon icon={IconComp} className="h-3.5 w-3.5" />
      <span>{label}</span>
    </span>
  );
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

const DetailSkeleton: FunctionComponent<{ onBack: () => void }> = ({ onBack }) => (
  <div className="flex h-full flex-col min-h-0">
    <DetailHeader title="Intake Details" showBack onBack={onBack} />
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="grid h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-card-border bg-surface-card p-6 space-y-3">
            <SkeletonLoader variant="text" width="w-32" height="h-3" />
            <SkeletonLoader variant="title" width="w-3/4" height="h-7" />
            <SkeletonLoader variant="text" width="w-48" height="h-3" />
            <div className="space-y-2 pt-3">
              <SkeletonLoader variant="text" width="w-full" height="h-3" />
              <SkeletonLoader variant="text" width="w-11/12" height="h-3" />
              <SkeletonLoader variant="text" width="w-5/6" height="h-3" />
            </div>
          </div>
          <div className="rounded-xl border border-card-border bg-surface-card p-6 space-y-4">
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
          <div className="rounded-xl border border-card-border bg-surface-card p-6 space-y-3">
            <SkeletonLoader variant="text" width="w-32" height="h-3" />
            <MessageRowSkeleton lineWidths={['w-40', 'w-56']} />
            <MessageRowSkeleton lineWidths={['w-64', 'w-44']} />
          </div>
        </div>
        <aside className="hidden xl:block space-y-4 border-l border-line-subtle bg-surface-panel p-6">
          <SkeletonLoader variant="button" width="w-full" />
          <SkeletonLoader variant="button" width="w-full" />
          <div className="rounded-xl border border-card-border bg-surface-card p-4 space-y-3">
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

    const templateFields = (activeTemplate?.fields ?? DEFAULT_INTAKE_TEMPLATE.fields)
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

  if (isLoading) return <DetailSkeleton onBack={onBack} />;

  if (loadError || !intake) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <DetailHeader title="Intake Details" showBack onBack={onBack} />
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
  const opposingParty = typeof meta.opposing_party === 'string' ? (meta.opposing_party.trim() || null) : null;
  const onBehalfOf = typeof meta.on_behalf_of === 'string' ? (meta.on_behalf_of.trim() || null) : null;
  const practiceServiceUuid = typeof meta.practice_service_uuid === 'string' ? meta.practice_service_uuid : null;
  const services = Array.isArray(practiceDetails?.services) ? practiceDetails.services : [];
  const matchingService = services.find((s) => s && typeof s === 'object' && s.id === practiceServiceUuid && typeof s.name === 'string');
  const matchingServiceName = typeof matchingService?.name === 'string' ? matchingService.name : undefined;
  const practiceServiceName = practiceServiceUuid ? resolvePracticeServiceLabel(practiceServiceUuid, matchingServiceName) : null;

  const dateLabel = formatLongDate(intake.created_at);
  const caseStrength = typeof intake.case_strength === 'number' ? `${intake.case_strength}%` : null;
  const feeAmount = formatAmountCents(intake.amount, intake.currency);
  const householdSize = typeof intake.household_size === 'number'
    ? intake.household_size
    : (typeof meta.household_size === 'number' ? meta.household_size : null);
  const income = typeof intake.income === 'number'
    ? formatAmountCents(intake.income, intake.currency)
    : (typeof meta.income === 'number' ? formatAmountCents(meta.income, intake.currency) : null);
  const documentCount = intakeFiles.length;
  const hasDocs = documentCount > 0 || intake.has_documents === true || meta.has_documents === true;
  const documentsLabel = documentCount > 0
    ? `${documentCount} document${documentCount === 1 ? '' : 's'} shared`
    : hasDocs ? 'Documents shared' : 'No documents';
  const courtDate = intake.court_date ? (formatLongDate(intake.court_date) ?? intake.court_date) : null;
  const urgencyLbl = urgencyLabel(intake.urgency);
  const desiredOutcome = intake.desired_outcome ?? null;

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
    activeTemplate?.fields ?? DEFAULT_INTAKE_TEMPLATE.fields
  ).filter((f) => f.phase === 'enrichment');
  const intakeStateRecord = intakeConversationState as unknown as Record<string, unknown> | null;
  const unansweredEnrichment = enrichmentFields.filter((f) => !resolveFieldValue(f, intakeStateRecord, intake));
  const showGatherDetails = unansweredEnrichment.length > 0 && Boolean(intake.conversation_id);

  const enrichedData = parseEnrichedData(meta as Record<string, unknown>);
  const engagementTemplates = parseEngagementTemplates(practiceDetails);
  const activeGenerateTemplate = generateTemplateId
    ? (engagementTemplates.find((t) => t.id === generateTemplateId) ?? engagementTemplates[0])
    : engagementTemplates[0];

  const customFields = (() => {
    const cf = (meta.customFields ?? meta.custom_fields) as Record<string, unknown> | undefined;
    if (!cf || typeof cf !== 'object') return [] as Array<{ key: string; value: string }>;
    return Object.entries(cf)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => ({
        key,
        value: value === null || value === undefined ? '' : (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)),
      }))
      .filter((entry) => entry.value.trim().length > 0);
  })();

  const statusBadge = (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ring-1 ring-inset',
          triageBadgeClass(effectiveTriageStatus),
        )}
      >
        {triageLabel(effectiveTriageStatus)}
      </span>
      {effectiveTriageStatus === 'accepted' ? (
        <Button
          variant="primary"
          size="sm"
          icon={FileText}
          onClick={() => navigate(engagementCreatePath)}
        >
          Create engagement
        </Button>
      ) : null}
    </div>
  );

  const intakeDetailsCard = (
    <Card>
      <div className="space-y-2">
        <SectionLabel>Intake Details</SectionLabel>
        <h3 className="text-lg font-bold leading-tight text-input-text sm:text-xl">{intakeTitle}</h3>
        <p className="text-xs text-input-placeholder">
          Posted {dateLabel}{practiceServiceName ? ` · ${practiceServiceName}` : ''}
        </p>
      </div>
      {description ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-input-text/90">{description}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <InfoChip
          icon={CheckCircle2}
          label={triageLabel(effectiveTriageStatus)}
          tone={effectiveTriageStatus === 'accepted' ? 'success' : effectiveTriageStatus === 'declined' || effectiveTriageStatus === 'rejected' ? 'error' : 'warning'}
        />
        {feeAmount ? <InfoChip icon={CreditCard} label={`${feeAmount}${intake.stripe_charge_id ? ' paid' : ' consultation'}`} /> : null}
        {courtDate ? <InfoChip icon={Clock} label={courtDate} /> : null}
        {caseStrength ? <InfoChip icon={Scale} label={`Case strength ${caseStrength}`} /> : null}
        <InfoChip icon={ClipboardList} label={documentsLabel} />
        {urgencyLbl ? (
          <InfoChip
            icon={AlertTriangle}
            label={urgencyLbl}
            tone={intake.urgency === 'emergency' ? 'error' : intake.urgency === 'time_sensitive' ? 'warning' : 'default'}
          />
        ) : null}
      </div>
    </Card>
  );

  const formDetailsCard = (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <Icon icon={ClipboardList} className="h-4 w-4 text-input-placeholder" />
        <h3 className="text-sm font-semibold text-input-text">Form Details</h3>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <DetailField label="Case Type" value={intakeTitle} />
        <DetailField label="Urgency" value={urgencyLbl} />
        <DetailField label="Court Date" value={courtDate} />
        <DetailField label="Has Documents" value={hasDocs ? 'Yes' : 'No'} />
        <DetailField label="Desired Outcome" value={desiredOutcome} />
        <DetailField label="Opposing Party" value={opposingParty} />
        <DetailField label="On Behalf Of" value={onBehalfOf} />
        <DetailField label="Income" value={income} />
        <DetailField label="Household Size" value={householdSize === null ? null : String(householdSize)} />
        {customFields.map((cf) => (
          <DetailField key={cf.key} label={cf.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} value={cf.value} />
        ))}
      </dl>
    </Card>
  );

  const enrichedDataCard = enrichedData ? (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Icon icon={Sparkles} className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-input-text">AI Analysis</h3>
        {enrichedData.confidence < 0.5 ? (
          <span className="ml-auto text-[10px] text-input-placeholder">Low confidence</span>
        ) : null}
      </div>
      {enrichedData.ai_matter_description ? (
        <p className="mb-4 text-sm leading-relaxed text-input-text/90">{enrichedData.ai_matter_description}</p>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {enrichedData.practice_area ? (
          <DetailField
            label="Practice Area"
            value={enrichedData.sub_type ? `${enrichedData.practice_area} · ${enrichedData.sub_type}` : enrichedData.practice_area}
          />
        ) : null}
        {enrichedData.matter_stage ? (
          <DetailField label="Stage" value={enrichedData.matter_stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} />
        ) : null}
        {enrichedData.client_role ? (
          <DetailField label="Client Role" value={enrichedData.client_role.charAt(0).toUpperCase() + enrichedData.client_role.slice(1)} />
        ) : null}
        {enrichedData.complexity ? (
          <DetailField label="Complexity" value={enrichedData.complexity.charAt(0).toUpperCase() + enrichedData.complexity.slice(1)} />
        ) : null}
        {enrichedData.estimated_value_band ? (
          <DetailField label="Estimated Value" value={enrichedData.estimated_value_band.charAt(0).toUpperCase() + enrichedData.estimated_value_band.slice(1)} />
        ) : null}
      </dl>
      {enrichedData.conflict_check_names.length > 0 ? (
        <div className="mt-4 space-y-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Conflict Check</dt>
          <dd className="text-sm text-input-text">{enrichedData.conflict_check_names.join(', ')}</dd>
        </div>
      ) : null}
      {enrichedData.ai_scope_suggestion ? (
        <div className="mt-4 space-y-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Suggested Scope</dt>
          <dd className="text-sm text-input-text/90">{enrichedData.ai_scope_suggestion}</dd>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {enrichedData.sol_risk ? <InfoChip icon={AlertTriangle} label="SOL Risk" tone="warning" /> : null}
        {enrichedData.emergency_relief_needed ? <InfoChip icon={AlertTriangle} label="Emergency Relief" tone="error" /> : null}
        {enrichedData.legal_aid_eligible ? <InfoChip icon={CheckCircle2} label="Legal Aid Eligible" tone="success" /> : null}
        {enrichedData.multi_state ? <InfoChip icon={Scale} label="Multi-State" /> : null}
      </div>
      {enrichedData.sol_risk_notes ? (
        <p className="mt-2 text-xs text-warning">{enrichedData.sol_risk_notes}</p>
      ) : null}
      {enrichedData.multi_state_notes ? (
        <p className="mt-2 text-xs text-input-placeholder">{enrichedData.multi_state_notes}</p>
      ) : null}
    </Card>
  ) : null;

  const blawbyCard = showGatherDetails ? (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-accent/10 p-2 text-accent">
            <Icon icon={Sparkles} className="h-4 w-4" />
          </div>
          <p className="text-sm leading-relaxed text-input-text/90">
            Blawby can ask the client for the missing legal details and add them to this thread.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void startGatherDetailsFlow()}
          disabled={gatherDetailsSubmitting}
          className="shrink-0"
        >
          {gatherDetailsSubmitting ? 'Starting…' : 'Use Blawby to gather details'}
        </Button>
      </div>
    </Card>
  ) : null;

  const conversationCard = intake.conversation_id ? (
    <Card className="flex min-h-[420px] flex-col p-0 overflow-hidden">
      <div className="border-b border-line-subtle p-4 sm:px-6 sm:py-5">
        <SectionLabel>Conversation</SectionLabel>
        <p className="mt-1 text-xs text-input-placeholder">Continue the client thread from this intake.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-surface-overlay/20 touch-pan-y">
        {previewLoading && previewMessages.length === 0 ? (
          <div className="space-y-3 px-4 py-4">
            <MessageRowSkeleton lineWidths={['w-40', 'w-56']} />
            <MessageRowSkeleton lineWidths={['w-64', 'w-44', 'w-52']} />
            <MessageRowSkeleton lineWidths={['w-36', 'w-48']} />
          </div>
        ) : previewMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <Icon icon={MessageSquare} className="mb-2 h-6 w-6 text-input-placeholder" />
            <p className="text-sm text-input-placeholder">No conversation history yet.</p>
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

  const contactCard = (email || phone) ? (
    <Card>
      <SectionLabel className="mb-3">Contact Information</SectionLabel>
      <dl className="space-y-3 text-sm">
        {email ? (
          <div className="flex items-start gap-3">
            <Icon icon={Mail} className="mt-0.5 h-4 w-4 shrink-0 text-input-placeholder" />
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-input-placeholder">Email</dt>
              <dd className="truncate">
                <a href={`mailto:${email}`} className="text-input-text hover:text-accent">{email}</a>
              </dd>
            </div>
          </div>
        ) : null}
        {phone ? (
          <div className="flex items-start gap-3">
            <Icon icon={Phone} className="mt-0.5 h-4 w-4 shrink-0 text-input-placeholder" />
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-input-placeholder">Phone</dt>
              <dd>
                <a href={`tel:${phone}`} className="text-input-text hover:text-accent">{phone}</a>
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
    </Card>
  ) : null;

  const triageActions = (
    <>
      <Button
        variant="primary"
        className="btn-primary btn-md w-full !bg-accent-500 text-[rgb(var(--accent-foreground))]"
        disabled={isSubmitting}
        onClick={() => openTriageDialog('accepted')}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center">
            <LoadingSpinner size="sm" className="mr-2" ariaLabel="Accepting consultation" />
            Accepting…
          </span>
        ) : 'Accept'}
      </Button>
      <Button
        variant="secondary"
        className="btn-secondary btn-md w-full"
        disabled={isSubmitting}
        onClick={() => openTriageDialog('declined')}
      >
        Reject
      </Button>
    </>
  );

  const aboutCard = (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar
          name={name ?? ''}
          size="md"
          className="bg-surface-utility/40 text-input-text ring-1 ring-line-subtle"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-input-text">{name ?? 'Unnamed lead'}</p>
          {intake.payment_verified ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-success">
              <Icon icon={CheckCircle2} className="h-3 w-3" />
              Payment verified
            </p>
          ) : null}
        </div>
      </div>
      {(email || phone) ? (
        <dl className="mt-4 space-y-2 text-sm">
          {email ? (
            <div>
              <dt className="text-xs text-input-placeholder">Email</dt>
              <dd className="truncate">
                <a href={`mailto:${email}`} className="text-input-text hover:text-accent">{email}</a>
              </dd>
            </div>
          ) : null}
          {phone ? (
            <div>
              <dt className="text-xs text-input-placeholder">Phone</dt>
              <dd>
                <a href={`tel:${phone}`} className="text-input-text hover:text-accent">{phone}</a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
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

  return (
    <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
      <DetailHeader
        title={name ?? intakeTitle}
        showBack
        onBack={onBack}
        actions={statusBadge}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px]">
          {/* Main content */}
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            {/* Mobile-only triage actions at top */}
            {isPending ? (
              <div className="flex flex-col gap-3 xl:hidden">
                {triageActions}
              </div>
            ) : null}

            {intakeDetailsCard}
            {formDetailsCard}
            {enrichedDataCard}
            <IntakeFilesPanel
              intakeUuid={intake.uuid}
              canUpload
              canDelete
              files={intakeFiles}
            />
            {/* Mobile-only contact info */}
            <div className="xl:hidden">{contactCard}</div>
            {blawbyCard}
            {conversationCard}
          </div>

          {/* Desktop right panel */}
          <aside className="hidden xl:flex flex-col gap-4 border-l border-line-subtle bg-surface-panel p-6">
            {isPending ? <div className="flex flex-col gap-3">{triageActions}</div> : null}
            {engagementActionCard}
            {aboutCard}
          </aside>
        </div>
      </div>

      <Dialog
        isOpen={triageDialogAction !== null}
        onClose={closeTriageDialog}
        title={triageDialogAction === 'accepted' ? 'Accept' : 'Reject'}
        description={
          triageDialogAction === 'accepted'
            ? 'This will approve the lead and prepare for onboarding.'
            : 'This will mark the intake as rejected.'
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
            {isSubmitting ? 'Updating…' : (triageDialogAction === 'accepted' ? 'Confirm approval' : 'Confirm rejection')}
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
              <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Select Template</p>
              <div className="flex flex-col gap-1">
                {engagementTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      generateTemplateId === t.id
                        ? 'border-accent bg-accent/10 text-[rgb(var(--accent-foreground))]'
                        : 'border-card-border bg-surface-card text-input-text hover:bg-surface-overlay/40',
                    )}
                    onClick={() => setGenerateTemplateId(t.id)}
                  >
                    <span className="flex-1 font-medium">{t.name}</span>
                    {t.practiceArea ? <span className="text-xs text-input-placeholder">{t.practiceArea}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {generatedBody ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Generated Letter</p>
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
