/**
 * PracticeSetup — conversational onboarding
 *
 * Replaces the static Firm basics / Contact / Services form sections with a
 * single AI chat. The assistant collects all fields in one natural conversation,
 * extracts structured data via tool calls, and saves through the same
 * onSaveBasics / onSaveContact callbacks the parent already uses — so
 * WorkspacePage needs zero changes.
 *
 * Edit actions request conversational corrections in-thread (no modals).
 *
 * Drop-in replacement: same props interface as the original PracticeSetup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Address } from '@/shared/types/address';
import { initializeAccentColor, normalizeAccentColor } from '@/shared/utils/accentColors';
import ChatContainer from '@/features/chat/components/ChatContainer';
import type { ChatMessageUI } from '../../../../worker/types';
import type { PracticeSetupStatus } from '../utils/status';
import { calculatePracticeSetupProgress } from '../utils/progress';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';

// ── Re-exported types (unchanged from original so WorkspacePage compiles) ──────

export interface BasicsFormValues {
  name: string;
  slug: string;
  introMessage: string;
  accentColor: string;
}

export interface ContactFormValues {
  website: string;
  businessEmail: string;
  businessPhone: string;
  address?: Address;
}

// ── Chat types ─────────────────────────────────────────────────────────────────

interface ExtractedFields {
  name?: string;
  slug?: string;
  description?: string;
  introMessage?: string;
  accentColor?: string;
  website?: string;
  contactPhone?: string;
  businessEmail?: string;
  address?: {
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  services?: Array<{ name: string; description?: string; key?: string }>;
  completionScore?: number;
  missingFields?: string[];
}

export interface OnboardingProgressSnapshot {
  fields: Partial<ExtractedFields>;
  hasPendingSave: boolean;
  completionScore: number;
  missingFields: string[];
}

export interface OnboardingSaveActionsSnapshot {
  canSave: boolean;
  isSaving: boolean;
  saveError: string | null;
  onSaveAll?: () => void;
}

interface PracticeSetupChatAdapter {
  messages: ChatMessageUI[];
  sendMessage: (
    message: string,
    attachments?: FileAttachment[],
    replyToMessageId?: string | null,
    options?: { additionalContext?: string }
  ) => void | Promise<void>;
  messagesReady?: boolean;
  isSocketReady?: boolean;
  hasMoreMessages?: boolean;
  isLoadingMoreMessages?: boolean;
  onLoadMoreMessages?: () => void | Promise<void>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRequestReactions?: (messageId: string) => void | Promise<void>;
}

const readErrorMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const payload = await res.json() as { error?: string; message?: string };
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    // ignore parse failures
  }
  return fallback;
};

// ── URL detection ──────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s]+|(?:www\.)[^\s]+\.[a-z]{2,}/i;
const EMPTY_SERVICES: Array<{ name: string; description?: string; key?: string }> = [];

// ── Props ──────────────────────────────────────────────────────────────────────

interface PracticeSetupProps {
  status: PracticeSetupStatus;
  payoutsCompleteOverride?: boolean;
  practice: Practice | null;
  details: PracticeDetails | null;
  onSaveBasics: (values: BasicsFormValues, options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  onSaveContact: (values: ContactFormValues, options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  onBasicsDraftChange?: (values: BasicsFormValues) => void;
  onSaveServices?: (services: Array<{ name: string; description?: string; key?: string }>) => Promise<void>;
  onProgressChange?: (snapshot: OnboardingProgressSnapshot) => void;
  onSaveActionsChange?: (snapshot: OnboardingSaveActionsSnapshot) => void;
  chatAdapter?: PracticeSetupChatAdapter | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const PracticeSetup = ({
  status,
  payoutsCompleteOverride = false,
  practice,
  details,
  onSaveBasics,
  onSaveContact,
  logoUploading,
  logoUploadProgress,
  onLogoChange,
  onBasicsDraftChange,
  onSaveServices,
  onProgressChange,
  onSaveActionsChange,
  chatAdapter,
}: PracticeSetupProps) => {
  // ── Chat state ───────────────────────────────────────────────────────────────
  const practiceId = practice?.id ?? '';
  const waitingForRealChat = chatAdapter === null;

  const [isLoading, setIsLoading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedFields>({});
  const [pendingSave, setPendingSave] = useState<ExtractedFields | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scanStatusText, setScanStatusText] = useState<string | null>(null);
  const saveExtractedRef = useRef<() => Promise<void>>(async () => {});

  const toSavableFields = useCallback((fields: ExtractedFields | null | undefined): ExtractedFields | null => {
    if (!fields) return null;
    const rest = { ...fields };
    delete rest.completionScore;
    delete rest.missingFields;
    return rest;
  }, []);

  // Notify parent of draft changes (for preview reload trigger)
  useEffect(() => {
    if (!extracted.name && !extracted.introMessage) return;
    onBasicsDraftChange?.({
      name:         extracted.name ?? practice?.name ?? '',
      slug:         practice?.slug ?? '',
      introMessage: extracted.introMessage ?? '',
      accentColor:  normalizeAccentColor(extracted.accentColor) ?? '#D4AF37',
    });
  }, [extracted, onBasicsDraftChange, practice?.name, practice?.slug]);

  // Live accent color preview
  useEffect(() => {
    if (extracted.accentColor) initializeAccentColor(extracted.accentColor);
  }, [extracted.accentColor]);

  // ── Website extraction ────────────────────────────────────────────────────────

  const extractWebsite = useCallback(async (url: string): Promise<ExtractedFields> => {
    setScanStatusText(`Scanning ${url.replace(/^https?:\/\//, '')} for practice details…`);
    try {
      const res = await fetch('/api/ai/extract-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ practiceId, url }),
      });
      setScanStatusText(null);
      if (!res.ok) {
        const message = await readErrorMessage(res, 'I could not scan that website. You can continue by answering a few quick questions.');
        setScanStatusText(message);
        return {};
      }
      const data = await res.json() as { fields?: ExtractedFields };
      return data.fields ?? {};
    } catch (err) {
      setScanStatusText(null);
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setScanStatusText('I could not scan that website right now. You can continue by answering a few quick questions.');
      }
      return {};
    }
  }, [practiceId]);

  // ── Save extracted fields ─────────────────────────────────────────────────────

  const saveExtracted = useCallback(async () => {
    if (!pendingSave || !practice) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const currentIntro = details?.introMessage ?? practice?.introMessage ?? '';
      const currentAccent = normalizeAccentColor(details?.accentColor ?? practice?.accentColor) ?? '#D4AF37';
      const accentColor = normalizeAccentColor(pendingSave.accentColor ?? currentAccent) ?? currentAccent;
      await onSaveBasics({
        name:         pendingSave.name ?? practice.name ?? '',
        slug:         practice.slug ?? '',
        introMessage: pendingSave.introMessage ?? currentIntro,
        accentColor,
      }, { suppressSuccessToast: true });
      const mergedAddress = {
        address: details?.address ?? practice?.address ?? '',
        apartment: details?.apartment ?? practice?.apartment ?? '',
        city: details?.city ?? practice?.city ?? '',
        state: details?.state ?? practice?.state ?? '',
        postalCode: details?.postalCode ?? practice?.postalCode ?? '',
        country: details?.country ?? practice?.country ?? '',
        ...(pendingSave.address ?? {}),
      };
      await onSaveContact({
        website:       pendingSave.website ?? details?.website ?? practice?.website ?? '',
        businessEmail: pendingSave.businessEmail ?? details?.businessEmail ?? practice?.businessEmail ?? '',
        businessPhone: pendingSave.contactPhone ?? details?.businessPhone ?? practice?.businessPhone ?? '',
        address: mergedAddress,
      }, { suppressSuccessToast: true });
      if (onSaveServices && Array.isArray(pendingSave.services)) {
        await onSaveServices(pendingSave.services);
      }
      setPendingSave(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [details, onSaveBasics, onSaveContact, onSaveServices, pendingSave, practice]);
  saveExtractedRef.current = saveExtracted;
  const triggerSaveAll = useCallback(() => {
    void saveExtractedRef.current();
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────────
  const derivedProgress = useMemo(() => {
    const name = (extracted.name ?? practice?.name ?? '').trim();
    const description = (extracted.description ?? details?.description ?? practice?.description ?? '').trim();
    const introMessage = (extracted.introMessage ?? details?.introMessage ?? practice?.introMessage ?? '').trim();
    const website = (extracted.website ?? details?.website ?? practice?.website ?? '').trim();
    const contactPhone = (extracted.contactPhone ?? details?.businessPhone ?? practice?.businessPhone ?? '').trim();
    const businessEmail = (extracted.businessEmail ?? details?.businessEmail ?? practice?.businessEmail ?? '').trim();
    const normalizeServiceRecords = (records: unknown): Array<{ name: string; description?: string; key?: string }> => {
      if (!Array.isArray(records)) return EMPTY_SERVICES;
      return records.map((service) => {
        const row = (service ?? {}) as Record<string, unknown>;
        const name = typeof row.name === 'string'
          ? row.name
          : (typeof row.title === 'string' ? row.title : '');
        const key = typeof row.key === 'string'
          ? row.key
          : (typeof row.id === 'string' ? row.id : undefined);
        const description = typeof row.description === 'string' ? row.description : undefined;
        return { name, key, description };
      });
    };
    const detailServices = normalizeServiceRecords(details?.services);
    const practiceServices = normalizeServiceRecords(practice?.services);
    const services = Array.isArray(extracted.services)
      ? extracted.services
      : (detailServices.length > 0 ? detailServices : practiceServices);
    const hasServices = status.servicesComplete || services.some((service) => service.name.trim().length > 0);
    const addressSource = extracted.address;
    const hasAddress = Boolean(
      (addressSource?.address ?? details?.address ?? practice?.address ?? '').trim() &&
      (addressSource?.city ?? details?.city ?? practice?.city ?? '').trim() &&
      (addressSource?.state ?? details?.state ?? practice?.state ?? '').trim()
    );
    const accentColor = normalizeAccentColor(extracted.accentColor ?? details?.accentColor ?? practice?.accentColor);
    const hasLogo = Boolean(practice?.logo);
    const hasPayouts = status.payoutsComplete || payoutsCompleteOverride;

    const derived = calculatePracticeSetupProgress({
      name,
      description,
      website,
      contactPhone,
      businessEmail,
      introMessage,
      accentColor,
      hasServices,
      hasAddress,
      hasLogo,
      hasPayouts,
    });

    return {
      completionScore: derived.completionScore,
      missingFields: derived.missingFields,
    };
  }, [details, extracted, practice, payoutsCompleteOverride, status.payoutsComplete, status.servicesComplete]);

  const completionScore = derivedProgress.completionScore;
  const missingFields   = derivedProgress.missingFields;
  const hasPending = Boolean(pendingSave && Object.keys(pendingSave).length > 0);

  useEffect(() => {
    onProgressChange?.({
      fields: extracted,
      hasPendingSave: hasPending,
      completionScore,
      missingFields,
    });
  }, [completionScore, extracted, hasPending, missingFields, onProgressChange]);

  useEffect(() => {
    onSaveActionsChange?.({
      canSave: hasPending,
      isSaving,
      saveError,
      onSaveAll: hasPending ? triggerSaveAll : undefined,
    });
  }, [hasPending, isSaving, onSaveActionsChange, saveError, triggerSaveAll]);

  const onboardingPracticeConfig = useMemo(() => ({
    name: practice?.name ?? 'Practice',
    profileImage: practice?.logo ?? null,
    practiceId: practiceId || (practice?.id ?? ''),
    description: details?.description ?? practice?.description ?? '',
    slug: practice?.slug ?? undefined,
  }), [details?.description, practice, practiceId]);

  const chatMessagesReady = waitingForRealChat ? false : (chatAdapter?.messagesReady ?? true);
  const openingFallbackMessage = useMemo<ChatMessageUI>(() => {
    const topMissing = missingFields[0] ?? null;
    const topMissingPrompt: Record<string, string> = {
      name: "What's the correct practice name?",
      description: 'What short business description should clients see?',
      services: 'What services should clients be able to request?',
      website: "What's your website URL?",
      contactPhone: "What's the best phone number for clients?",
      businessEmail: "What's the best client-facing email?",
      address: 'What office address should we show?',
      introMessage: 'What intro message should clients see first?',
      accentColor: 'What accent color should we use for your public page?',
      logo: 'Would you like to upload or change your logo?',
      payouts: 'Do you want to enable payments with Blawby now?',
    };

    let content = "Let's get your practice set up. To start, what's the name of your practice?";
    if (completionScore >= 80) {
      content = 'Welcome back! Your profile looks great. Anything you want to update?';
    } else if (topMissing && topMissingPrompt[topMissing]) {
      content = `Welcome back. ${topMissingPrompt[topMissing]}`;
    }

    return {
      id: 'opening',
      role: 'assistant',
      timestamp: Date.now(),
      seq: 1,
      isUser: false,
      content,
    };
  }, [completionScore, missingFields]);

  const fallbackUiMessages = useMemo<ChatMessageUI[]>(() => [openingFallbackMessage], [openingFallbackMessage]);
  const resolvedChatMessages = useMemo(() => {
    if (waitingForRealChat || !chatMessagesReady) return [];
    const serverMessages = chatAdapter?.messages ?? [];
    return serverMessages.length > 0 ? serverMessages : fallbackUiMessages;
  }, [chatAdapter?.messages, chatMessagesReady, fallbackUiMessages, waitingForRealChat]);

  useEffect(() => {
    if (!chatAdapter?.messages || chatAdapter.messages.length === 0) return;
    const onboardingFieldPayloads = chatAdapter.messages
      .map((message) => {
        const payload = message.metadata?.onboardingFields;
        return payload && typeof payload === 'object' ? payload as Partial<ExtractedFields> : null;
      })
      .filter((payload): payload is Partial<ExtractedFields> => Boolean(payload));
    if (onboardingFieldPayloads.length === 0) return;
    const merged = onboardingFieldPayloads.reduce<Partial<ExtractedFields>>((acc, payload) => ({ ...acc, ...payload }), {});
    setExtracted((prev) => ({ ...prev, ...merged }));
    setPendingSave((prev) => ({ ...(prev ?? {}), ...(toSavableFields(merged as ExtractedFields) ?? {}) }));
  }, [chatAdapter?.messages, toSavableFields]);

  // Resolved display values (extracted takes priority over saved)
  const emptyPreviewFiles = useMemo<FileAttachment[]>(() => [], []);
  const emptyUploadingFiles = useMemo<UploadingFile[]>(() => [], []);
  const [isRecording, setIsRecording] = useState(false);
  const handleComposerFileSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    onLogoChange(files);
  }, [onLogoChange]);
  const handleComposerCameraCapture = useCallback(async (file: File) => {
    await handleComposerFileSelect([file]);
  }, [handleComposerFileSelect]);
  const noopCancelUpload = useCallback((_fileId: string) => {}, []);
  const noopMediaCapture = useCallback((_blob: Blob, _type: 'audio' | 'video') => {}, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 text-input-text">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-input-placeholder">
          {status.needsSetup ? "Let's get started" : 'Practice setup'}
        </p>
        <h2 className="text-3xl font-bold tracking-tight">
          {status.needsSetup ? 'Almost ready to go' : 'All set'}
        </h2>
        {scanStatusText ? (
          <p className="text-xs text-input-placeholder">{scanStatusText}</p>
        ) : null}
      </header>

      {/* ── Chat panel ───────────────────────────────────────────────────────── */}
      <div className="min-h-[500px] lg:min-h-0 lg:flex-1">
        <ChatContainer
          messages={resolvedChatMessages}
          onSendMessage={(message, attachments, replyToMessageId) => {
            if (waitingForRealChat) return;
            if (chatAdapter?.sendMessage) {
              void (async () => {
                const trimmed = message.trim();
                if (!trimmed) return;
                const urlMatch = trimmed.match(URL_RE);
                const completionScore = derivedProgress.completionScore;
                const needsRichData = completionScore < 40;
                const looksLikeBusinessName = trimmed.length > 5 && (trimmed.includes(' ') || trimmed.includes('.'));
                let additionalContext: string | undefined;

                if (urlMatch || (needsRichData && looksLikeBusinessName)) {
                  setIsLoading(true);
                  const query = urlMatch
                    ? `site:${urlMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]}`
                    : trimmed;
                  setScanStatusText(`Looking up ${query}…`);
                  try {
                    const res = await fetch(`/api/tools/search?q=${encodeURIComponent(query)}`, {
                      credentials: 'include',
                    });
                    if (res.ok) {
                      const data = await res.json() as { contextBlock?: string };
                      if (data.contextBlock) {
                        additionalContext = data.contextBlock;
                      }
                    }

                    if (urlMatch) {
                      const raw = urlMatch[0];
                      const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
                      const websiteFields = await extractWebsite(normalized);
                      if (Object.keys(websiteFields).length > 0) {
                        setExtracted(prev => ({ ...prev, ...websiteFields }));
                        setPendingSave(prev => ({ ...(prev ?? {}), ...(toSavableFields(websiteFields) ?? {}) }));
                      }
                    }
                  } catch (e) {
                    console.error('[PracticeSetup] Search failed:', e);
                  } finally {
                    setIsLoading(false);
                    setScanStatusText(null);
                  }
                }
                await chatAdapter.sendMessage(message, attachments, replyToMessageId, { additionalContext });
              })();
              return;
            }
          }}
          isPublicWorkspace={false}
          practiceConfig={onboardingPracticeConfig}
          layoutMode="desktop"
          useFrame={false}
          practiceId={practiceId || undefined}
          composerDisabled={waitingForRealChat || isLoading || !practiceId}
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
          isReadyToUpload={true}
          isSessionReady={!waitingForRealChat}
          isSocketReady={waitingForRealChat ? false : (chatAdapter?.isSocketReady ?? true)}
          messagesReady={chatMessagesReady}
          onToggleReaction={chatAdapter?.onToggleReaction}
          onRequestReactions={chatAdapter?.onRequestReactions}
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
  );
};
