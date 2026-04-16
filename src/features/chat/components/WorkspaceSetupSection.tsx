import type { ComponentChildren, FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Page } from '@/shared/ui/layout/Page';
import { SegmentedToggle } from '@/shared/ui/input';
import { cn } from '@/shared/utils/cn';
import { CompletionRing } from '@/shared/ui/CompletionRing';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import { ContactForm } from '@/features/intake/components/ContactForm';
import ChatContainer from '@/features/chat/components/ChatContainer';
import { useTranslation } from '@/shared/i18n/hooks';
import { features } from '@/config/features';
import { initializeAccentColor, normalizeAccentColor } from '@/shared/utils/accentColors';
import { calculatePracticeSetupProgress } from '@/features/practice-setup/utils/progress';
import type { PracticeSetupStatus } from '@/features/practice-setup/utils/status';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { FileAttachment, ChatMessageUI } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/types/upload';
import type { SetupFieldsPayload, SetupServicePayload } from '@/shared/types/conversation';
import type {
  BasicsFormValues,
  ContactFormValues,
  OnboardingProgressSnapshot,
  SetupChatAdapter,
} from '@/features/practice-setup/types';
import { usePreSendEnrichment } from '@/features/practice-setup/hooks/usePreSendEnrichment';

type PreviewTab = 'home' | 'messages' | 'intake';

type WorkspaceSetupSectionProps = {
  workspace: 'public' | 'practice' | 'client';
  showSidebarPreview: boolean;
  completionScore: number;
  previewTab: PreviewTab;
  previewTabOptions: Array<{ id: PreviewTab; label: string }>;
  onPreviewTabChange: (tab: PreviewTab) => void;
  previewSrcs: { home: string; messages: string };
  previewReloadKey: number;
  onPreviewSubmit: () => void;
  setupStatus: PracticeSetupStatus;
  payoutsCompleteOverride: boolean;
  practice: Practice | null;
  details: PracticeDetails | null;
  setupConversationId?: string | null;
  setupFields: SetupFieldsPayload;
  applySetupFields: (payload: Partial<SetupFieldsPayload>, options?: { sendSystemAck?: boolean }) => Promise<void>;
  onStartStripeOnboarding: () => void | Promise<void>;
  isStripeSubmitting: boolean;
  onSaveBasics: (values: BasicsFormValues, options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  onSaveContact: (values: ContactFormValues, options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  onSaveServices: (services: Array<{ name: string; key?: string; service_key?: string }>) => Promise<void>;
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  onBasicsDraftChange: (values: BasicsFormValues | null) => void;
  onProgressChange: (snapshot: OnboardingProgressSnapshot | null) => void;
  chatAdapter: SetupChatAdapter | null;
  fallbackContent: ComponentChildren;
};

const EMPTY_SERVICES: Array<{ name: string; key?: string; service_key?: string }> = [];
const EMPTY_SETUP_FIELDS: SetupFieldsPayload = {};

const normalizeServiceRecords = (records: unknown): Array<{ name: string; key?: string; service_key?: string }> => {
  if (!Array.isArray(records)) return EMPTY_SERVICES;
  return records.map((service) => {
    const row = (service ?? {}) as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name : (typeof row.title === 'string' ? row.title : '');
    const service_key = typeof row.service_key === 'string' ? row.service_key : undefined;
    const key = typeof row.key === 'string'
      ? row.key
      : (typeof row.id === 'string' ? row.id : service_key);
    return { name, ...(key ? { key } : {}), ...(service_key ? { service_key } : {}) };
  });
};

const sameServices = (
  left: Array<{ name: string; key?: string; service_key?: string }> | undefined,
  right: Array<{ name: string; key?: string; service_key?: string }> | undefined
) => JSON.stringify((left ?? EMPTY_SERVICES).map((service) => ({
  name: service.name,
  key: service.key ?? service.service_key,
  service_key: service.service_key ?? service.key,
}))) === JSON.stringify((right ?? EMPTY_SERVICES).map((service) => ({
  name: service.name,
  key: service.key ?? service.service_key,
  service_key: service.service_key ?? service.key,
})));

export const WorkspaceSetupSection: FunctionComponent<WorkspaceSetupSectionProps> = ({
  workspace,
  showSidebarPreview,
  completionScore,
  previewTab,
  previewTabOptions,
  onPreviewTabChange,
  previewSrcs,
  previewReloadKey,
  onPreviewSubmit,
  setupStatus,
  payoutsCompleteOverride,
  practice,
  details,
  setupConversationId,
  setupFields,
  applySetupFields,
  onStartStripeOnboarding,
  isStripeSubmitting,
  onSaveBasics,
  onSaveContact,
  onSaveServices,
  logoUploading,
  logoUploadProgress,
  onLogoChange,
  onBasicsDraftChange,
  onProgressChange,
  chatAdapter,
  fallbackContent,
}) => {
  const { t } = useTranslation();
  const practiceId = practice?.id ?? '';
  const waitingForRealChat = chatAdapter === null;
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const saveExtractedRef = useRef<() => Promise<void>>(async () => {});
  const extracted = setupFields ?? EMPTY_SETUP_FIELDS;

  const notifyBasicsDraftChange = useCallback((fields: Partial<SetupFieldsPayload>) => {
    onBasicsDraftChange?.({
      name: fields.name ?? practice?.name ?? '',
      slug: fields.slug ?? practice?.slug ?? '',
      accentColor: normalizeAccentColor(fields.accentColor ?? practice?.accentColor ?? '#D4AF37'),
    });
  }, [onBasicsDraftChange, practice?.accentColor, practice?.name, practice?.slug]);

  useEffect(() => {
    if (extracted.accentColor) initializeAccentColor(extracted.accentColor);
  }, [extracted.accentColor]);

  const derivedProgress = useMemo(() => {
    const name = (extracted.name ?? practice?.name ?? '').trim();
    const description = (extracted.description ?? '').trim();
    const website = (extracted.website ?? details?.website ?? practice?.website ?? '').trim();
    const contactPhone = (extracted.businessPhone ?? details?.businessPhone ?? practice?.businessPhone ?? '').trim();
    const businessEmail = (extracted.businessEmail ?? details?.businessEmail ?? practice?.businessEmail ?? '').trim();
    const detailServices = normalizeServiceRecords(details?.services);
    const practiceServices = normalizeServiceRecords(practice?.services);
    const services = Array.isArray(extracted.services)
      ? extracted.services
      : (details?.services != null ? detailServices : practiceServices);
    const hasServices = setupStatus.servicesComplete || services.some((service) => service.name.trim().length > 0);
    const addressSource = extracted.address;
    const hasAddress = Boolean(
      (addressSource?.address ?? details?.address ?? practice?.address ?? '').trim() &&
      (addressSource?.city ?? details?.city ?? practice?.city ?? '').trim() &&
      (addressSource?.state ?? details?.state ?? practice?.state ?? '').trim()
    );
    const accentColor = normalizeAccentColor(extracted.accentColor ?? details?.accentColor ?? practice?.accentColor);
    const hasLogo = Boolean(practice?.logo);
    const hasPayouts = setupStatus.payoutsComplete || payoutsCompleteOverride;
    return calculatePracticeSetupProgress({
      name,
      description,
      website,
      contactPhone,
      businessEmail,
      accentColor,
      hasServices,
      hasAddress,
      hasLogo,
      hasPayouts,
    });
  }, [details, extracted, practice, payoutsCompleteOverride, setupStatus.payoutsComplete, setupStatus.servicesComplete]);

  const hasPending = useMemo(() => {
    const currentName = (practice?.name ?? '').trim();
    const currentSlug = (practice?.slug ?? '').trim();
    const currentAccent = normalizeAccentColor(details?.accentColor ?? practice?.accentColor ?? '');
    const currentWebsite = (details?.website ?? practice?.website ?? '').trim();
    const currentBusinessEmail = (details?.businessEmail ?? practice?.businessEmail ?? '').trim();
    const currentBusinessPhone = (details?.businessPhone ?? practice?.businessPhone ?? '').trim();
    const currentAddress = {
      address: (details?.address ?? practice?.address ?? '').trim(),
      apartment: (details?.apartment ?? practice?.apartment ?? '').trim(),
      city: (details?.city ?? practice?.city ?? '').trim(),
      state: (details?.state ?? practice?.state ?? '').trim(),
      postalCode: (details?.postalCode ?? practice?.postalCode ?? '').trim(),
      country: (details?.country ?? practice?.country ?? '').trim(),
    };
    const currentServices = normalizeServiceRecords(details?.services != null ? details.services : practice?.services);
    if (typeof extracted.name === 'string' && extracted.name.trim() !== currentName) return true;
    if (typeof extracted.slug === 'string' && extracted.slug.trim() !== currentSlug) return true;
    if (typeof extracted.accentColor === 'string') {
      const extractedAccent = normalizeAccentColor(extracted.accentColor);
      if (extractedAccent && extractedAccent !== currentAccent) return true;
    }
    if (typeof extracted.website === 'string' && extracted.website.trim() !== currentWebsite) return true;
    if (typeof extracted.businessEmail === 'string' && extracted.businessEmail.trim() !== currentBusinessEmail) return true;
    if (typeof extracted.businessPhone === 'string' && extracted.businessPhone.trim() !== currentBusinessPhone) return true;
    if (extracted.address) {
      const nextAddress = {
        address: (extracted.address.address ?? '').trim(),
        apartment: (extracted.address.apartment ?? '').trim(),
        city: (extracted.address.city ?? '').trim(),
        state: (extracted.address.state ?? '').trim(),
        postalCode: (extracted.address.postalCode ?? '').trim(),
        country: (extracted.address.country ?? '').trim(),
      };
      if (JSON.stringify(nextAddress) !== JSON.stringify(currentAddress)) return true;
    }
    if (Array.isArray(extracted.services) && !sameServices(extracted.services, currentServices)) return true;
    return false;
  }, [details, extracted, practice]);

  const saveExtracted = useCallback(async () => {
    if (!practice) return;
    setIsSaving(true);
    setSaveError(null);
    const priorAccent = normalizeAccentColor(details?.accentColor ?? practice?.accentColor) ?? '#D4AF37';
    const priorBasics = {
      name: practice.name ?? '',
      slug: practice.slug ?? '',
      accentColor: priorAccent,
    };
    const priorContact = {
      website: details?.website ?? practice?.website ?? '',
      businessEmail: details?.businessEmail ?? practice?.businessEmail ?? '',
      businessPhone: details?.businessPhone ?? practice?.businessPhone ?? '',
      address: {
        address: details?.address ?? practice?.address ?? '',
        apartment: details?.apartment ?? practice?.apartment ?? '',
        city: details?.city ?? practice?.city ?? '',
        state: details?.state ?? practice?.state ?? '',
        postalCode: details?.postalCode ?? practice?.postalCode ?? '',
        country: details?.country ?? practice?.country ?? '',
      },
    };
    let failingStep: string | null = null;
    try {
      const accentColor = normalizeAccentColor(extracted.accentColor ?? priorAccent) ?? priorAccent;
      failingStep = 'basics';
      await onSaveBasics({ name: extracted.name ?? practice.name ?? '', slug: extracted.slug ?? practice.slug ?? '', accentColor }, { suppressSuccessToast: true });
      const mergedAddress = {
        address: details?.address ?? practice?.address ?? '',
        apartment: details?.apartment ?? practice?.apartment ?? '',
        city: details?.city ?? practice?.city ?? '',
        state: details?.state ?? practice?.state ?? '',
        postalCode: details?.postalCode ?? practice?.postalCode ?? '',
        country: details?.country ?? practice?.country ?? '',
        ...(extracted.address ?? {}),
      };
      failingStep = 'contact';
      await onSaveContact({
        website: extracted.website ?? details?.website ?? practice?.website ?? '',
        businessEmail: extracted.businessEmail ?? details?.businessEmail ?? practice?.businessEmail ?? '',
        businessPhone: extracted.businessPhone ?? details?.businessPhone ?? practice?.businessPhone ?? '',
        address: mergedAddress,
      }, { suppressSuccessToast: true });
      if (Array.isArray(extracted.services)) {
        failingStep = 'services';
        await onSaveServices(extracted.services as SetupServicePayload[]);
      }
    } catch (error) {
      // Rollback in reverse commit order
      if (failingStep === 'services') {
        // Contact already succeeded — rollback contact
        await onSaveContact(priorContact, { suppressSuccessToast: true });
      }
      if (failingStep !== 'basics') {
        // Basics already succeeded — rollback basics
        await onSaveBasics(priorBasics, { suppressSuccessToast: true });
      }
      const baseMsg = error instanceof Error ? error.message : 'Failed to save';
      setSaveError(failingStep ? `Failed to save ${failingStep}: ${baseMsg}` : baseMsg);
    } finally {
      setIsSaving(false);
    }
  }, [details, extracted, onSaveBasics, onSaveContact, onSaveServices, practice]);

  saveExtractedRef.current = saveExtracted;
  const triggerSaveAll = useCallback(() => { void saveExtractedRef.current(); }, []);

  useEffect(() => {
    onProgressChange?.({
      fields: extracted,
      hasPendingSave: hasPending,
      completionScore: derivedProgress.completionScore,
      missingFields: derivedProgress.missingFields,
    });
  }, [derivedProgress.completionScore, derivedProgress.missingFields, extracted, hasPending, onProgressChange]);

  useEffect(() => {
    notifyBasicsDraftChange(extracted);
  }, [extracted, notifyBasicsDraftChange]);

  const { enrichMessage, isEnriching, statusText } = usePreSendEnrichment({
    mode: 'PRACTICE_ONBOARDING',
    practiceId,
    completionScore: derivedProgress.completionScore,
    onFieldsExtracted: applySetupFields,
  });

  const onboardingPracticeConfig = useMemo(() => ({
    name: practice?.name ?? 'Practice',
    profileImage: practice?.logo ?? null,
    practiceId: practiceId || (practice?.id ?? ''),
    slug: practice?.slug ?? undefined,
  }), [practice, practiceId]);

  const chatMessagesReady = waitingForRealChat ? false : (chatAdapter?.messagesReady ?? true);
  const firstRunPromptMessages = useMemo<ChatMessageUI[]>(() => [{
    id: 'onboarding-prompt',
    role: 'assistant',
    content: "Hi! I'm here to help you get your practice set up. What is the name of your law firm?",
    timestamp: Date.now(),
    seq: 0,
    metadata: {},
    isUser: false,
  }], []);
  const resolvedChatMessages = useMemo(() => {
    if (waitingForRealChat || !chatMessagesReady) return [];
    const messages = chatAdapter?.messages ?? [];
    return messages.length === 0 ? firstRunPromptMessages : messages;
  }, [chatAdapter?.messages, chatMessagesReady, firstRunPromptMessages, waitingForRealChat]);

  const emptyPreviewFiles = useMemo<FileAttachment[]>(() => [], []);
  const emptyUploadingFiles = useMemo<UploadingFile[]>(() => [], []);
  const handleComposerFileSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    onLogoChange(files);
  }, [onLogoChange]);
  const handleComposerCameraCapture = useCallback(async (file: File) => {
    await handleComposerFileSelect([file]);
  }, [handleComposerFileSelect]);
  const noopCancelUpload = useCallback((_fileId: string) => {}, []);
  const noopMediaCapture = useCallback((_blob: Blob, _type: 'audio' | 'video') => {}, []);

  if (workspace !== 'practice') return <>{fallbackContent}</>;

  const previewContent = previewTab === 'intake'
    ? (
      <div className="flex h-full w-full flex-col overflow-y-auto bg-transparent p-4">
        <ContactForm
          onSubmit={onPreviewSubmit}
          message={t('contact.matterMessage', { defaultValue: 'Tell us about your matter and we will follow up shortly.' })}
        />
      </div>
    )
    : (
      <iframe
        key={`${previewTab}-${previewReloadKey}`}
        title={t('preview.workspaceTitle', { defaultValue: 'Public workspace preview' })}
        src={previewTab === 'messages' ? previewSrcs.messages : previewSrcs.home}
        className="h-full w-full border-0"
        loading="lazy"
      />
    );

  return (
    <div className="flex min-h-0 w-full flex-col lg:h-full lg:flex-row lg:overflow-hidden">
      <div className="relative flex w-full flex-col bg-transparent lg:min-h-0 lg:flex-1 lg:basis-1/2 lg:overflow-hidden">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
          <Page className="w-full flex-1">
            <div className="flex h-full min-h-0 flex-col gap-6 text-input-text">
              <header className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-input-placeholder">
                  {setupStatus.needsSetup ? "Let's get started" : 'Practice setup'}
                </p>
                <h2 className="text-3xl font-bold tracking-tight">
                  {setupStatus.needsSetup ? 'Almost ready to go' : 'All set'}
                </h2>
                {statusText ? <p className="text-xs text-input-placeholder">{statusText}</p> : null}
              </header>

              <div className="min-h-[500px] lg:min-h-0 lg:flex-1">
                <ChatContainer
                  messages={resolvedChatMessages}
                  onSendMessage={(message, attachments, replyToMessageId) => {
                    if (waitingForRealChat) return;
                    if (chatAdapter?.sendMessage) {
                      void (async () => {
                        const trimmed = message.trim();
                        if (!trimmed) return;
                        try {
                          const { additionalContext } = await enrichMessage(trimmed);
                          await chatAdapter.sendMessage(message, attachments, replyToMessageId, additionalContext ? { additionalContext } : undefined);
                        } catch (err) {
                          console.error('[WorkspaceSetupSection] Failed to send message:', err);
                          setSaveError(err instanceof Error ? err.message : 'Failed to send message');
                        }
                      })();
                    }
                  }}
                  conversationMode="PRACTICE_ONBOARDING"
                  isPublicWorkspace={false}
                  practiceConfig={onboardingPracticeConfig}
                  layoutMode="desktop"
                  useFrame={false}
                  practiceId={practiceId || undefined}
                  composerDisabled={waitingForRealChat || isEnriching || !practiceId}
                  previewFiles={emptyPreviewFiles}
                  uploadingFiles={emptyUploadingFiles}
                  removePreviewFile={() => {}}
                  clearPreviewFiles={() => {}}
                  handleFileSelect={handleComposerFileSelect}
                  handleCameraCapture={handleComposerCameraCapture}
                  cancelUpload={noopCancelUpload}
                  handleMediaCapture={noopMediaCapture}
                  isRecording={isRecording}
                  setIsRecording={setIsRecording}
                  isReadyToUpload
                  isSessionReady={!waitingForRealChat}
                  isSocketReady={waitingForRealChat ? false : (chatAdapter?.isSocketReady ?? true)}
                  messagesReady={chatMessagesReady}
                  onToggleReaction={chatAdapter?.onToggleReaction && features.enableMessageReactions ? chatAdapter.onToggleReaction : undefined}
                  onRequestReactions={chatAdapter?.onRequestReactions && features.enableMessageReactions ? chatAdapter.onRequestReactions : undefined}
                  hasMoreMessages={chatAdapter?.hasMoreMessages}
                  isLoadingMoreMessages={chatAdapter?.isLoadingMoreMessages}
                  onLoadMoreMessages={chatAdapter?.onLoadMoreMessages}
                  onboardingActions={{
                    onSaveAll: hasPending ? triggerSaveAll : undefined,
                    onEditBasics: undefined,
                    onEditContact: undefined,
                    onLogoChange,
                    logoUploading,
                    logoUploadProgress,
                    logoUrl: practice?.logo ?? null,
                    practiceName: practice?.name ?? 'Practice',
                    isSaving,
                    saveError,
                  }}
                />
              </div>
            </div>
          </Page>
        </div>
      </div>
      <div className="relative flex w-full flex-col items-center gap-5 border-t border-line-glass/30 bg-transparent px-4 py-6 lg:min-h-0 lg:flex-1 lg:basis-1/2 lg:border-t-0 lg:border-l lg:border-l-line-glass/30">
        <div className="relative flex w-full flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-input-placeholder">
              {showSidebarPreview ? t('preview.publicPreview', { defaultValue: 'Public preview' }) : t('preview.setupProgress', { defaultValue: 'Setup progress' })}
            </div>
            {!showSidebarPreview ? <CompletionRing score={completionScore} size={46} strokeWidth={3} /> : null}
          </div>
          {showSidebarPreview ? (
            <SegmentedToggle<PreviewTab>
              className="w-full max-w-[360px]"
              value={previewTab}
              options={previewTabOptions.map((option) => ({ value: option.id, label: option.label }))}
              onChange={onPreviewTabChange}
              ariaLabel={t('preview.tabsLabel', { defaultValue: 'Public preview tabs' })}
            />
          ) : null}
          <div className={cn('relative aspect-[9/19.5] w-full max-w-[360px] overflow-hidden', showSidebarPreview ? 'glass-card shadow-glass' : 'glass-panel')}>
            {showSidebarPreview ? previewContent : (
              <InspectorPanel
                entityType="conversation"
                entityId={setupConversationId ?? practice?.id ?? 'practice-setup'}
                practiceId={practice?.id ?? ''}
                onClose={() => {}}
                conversationMode="PRACTICE_ONBOARDING"
                practiceName={practice?.name ?? undefined}
                practiceLogo={practice?.logo ?? undefined}
                practiceSlug={practice?.slug ?? undefined}
                practiceDetails={details}
                setupFields={setupFields}
                onSetupFieldsChange={(waitingForRealChat || !setupConversationId) ? undefined : applySetupFields}
                setupStatus={setupStatus}
                onStartStripeOnboarding={() => { void onStartStripeOnboarding(); }}
                isStripeSubmitting={isStripeSubmitting}
                businessOnboardingStatus={practice?.businessOnboardingStatus ?? null}
                showCloseButton={false}
              />
            )}
            {showSidebarPreview ? <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-line-glass/10" aria-hidden="true" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
};
