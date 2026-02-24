/**
 * PracticeSetup — conversational onboarding
 *
 * Replaces the static Firm basics / Contact / Services form sections with a
 * single AI chat. The assistant collects all fields in one natural conversation,
 * extracts structured data via tool calls, and saves through the same
 * onSaveBasics / onSaveContact callbacks the parent already uses — so
 * WorkspacePage needs zero changes.
 *
 * Each section still has an "Edit" button that opens a compact modal with the
 * original form fields for manual corrections after the AI has populated them.
 *
 * Drop-in replacement: same props interface as the original PracticeSetup.
 */

import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { Input, URLInput, EmailInput, PhoneInput } from '@/shared/ui/input';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import type { Address } from '@/shared/types/address';
import { PracticeProfileTextFields } from '@/shared/ui/practice/PracticeProfileTextFields';
import { initializeAccentColor, normalizeAccentColor } from '@/shared/utils/accentColors';
import Modal from '@/shared/components/Modal';
import { FormGrid } from '@/shared/ui/layout';
import { FormActions } from '@/shared/ui/form';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import ChatContainer from '@/features/chat/components/ChatContainer';
import type { ChatMessageUI } from '../../../../worker/types';
import type { PracticeSetupStatus } from '../utils/status';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import type { FileAttachment } from '../../../../worker/types';
import type { UploadingFile } from '@/shared/hooks/useFileUpload';
import type { MessageReaction } from '../../../../worker/types';

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

interface PracticeSetupChatAdapter {
  messages: ChatMessageUI[];
  sendMessage: (message: string, attachments?: FileAttachment[], replyToMessageId?: string | null) => void | Promise<void>;
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
  practice: Practice | null;
  details: PracticeDetails | null;
  onSaveBasics: (values: BasicsFormValues) => Promise<void>;
  onSaveContact: (values: ContactFormValues) => Promise<void>;
  servicesSlot?: ComponentChildren;
  payoutsSlot?: ComponentChildren;
  logoUploading: boolean;
  logoUploadProgress: number | null;
  onLogoChange: (files: FileList | File[]) => void;
  onBasicsDraftChange?: (values: BasicsFormValues) => void;
  onSaveServices?: (services: Array<{ name: string; description?: string; key?: string }>) => Promise<void>;
  onProgressChange?: (snapshot: OnboardingProgressSnapshot) => void;
  chatAdapter?: PracticeSetupChatAdapter | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const PracticeSetup = ({
  status,
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
  chatAdapter,
}: PracticeSetupProps) => {
  // ── Chat state ───────────────────────────────────────────────────────────────
  const practiceId = practice?.id ?? '';
  const waitingForRealChat = chatAdapter === null;

  const openingFallbackMessage = useMemo<ChatMessageUI>(() => ({
    id: 'opening',
    role: 'assistant',
    timestamp: Date.now(),
    seq: 1,
    isUser: false,
    content: status.needsSetup
      ? "Let's get your practice set up.\n\nIf you have a website, paste the URL first and I'll scan it to pre-fill your profile. If not, tell me your practice name."
      : `Welcome back! Your profile looks good. Want to update anything, or shall I walk you through what's still missing?`,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // intentionally stable — only computed once

  const [isLoading, setIsLoading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedFields>({});
  const [pendingSave, setPendingSave] = useState<ExtractedFields | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scanStatusText, setScanStatusText] = useState<string | null>(null);

  // Edit modals
  const [basicsModalOpen, setBasicsModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [basicsDraft, setBasicsDraft] = useState<BasicsFormValues>({
    name: '', slug: '', introMessage: '', accentColor: '#D4AF37',
  });
  const [contactDraft, setContactDraft] = useState<ContactFormValues>({
    website: '', businessEmail: '', businessPhone: '', address: undefined,
  });
  const [isModalSaving, setIsModalSaving] = useState(false);

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
      });
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
      });
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

  // ── Modal open handlers ───────────────────────────────────────────────────────

  const openBasicsModal = useCallback(() => {
    setBasicsDraft({
      name:         extracted.name ?? practice?.name ?? '',
      slug:         practice?.slug ?? '',
      introMessage: extracted.introMessage ?? details?.introMessage ?? practice?.introMessage ?? '',
      accentColor:  normalizeAccentColor(extracted.accentColor ?? details?.accentColor ?? practice?.accentColor) ?? '#D4AF37',
    });
    setBasicsModalOpen(true);
  }, [details, extracted, practice]);

  const openContactModal = useCallback(() => {
    setContactDraft({
      website:       extracted.website ?? details?.website ?? practice?.website ?? '',
      businessEmail: extracted.businessEmail ?? details?.businessEmail ?? practice?.businessEmail ?? '',
      businessPhone: extracted.contactPhone ?? details?.businessPhone ?? practice?.businessPhone ?? '',
      address: {
        address:    (extracted.address?.address ?? details?.address ?? practice?.address ?? '') as string,
        city:       (extracted.address?.city ?? details?.city ?? practice?.city ?? '') as string,
        state:      (extracted.address?.state ?? details?.state ?? practice?.state ?? '') as string,
        postalCode: (extracted.address?.postalCode ?? details?.postalCode ?? practice?.postalCode ?? '') as string,
        country:    (extracted.address?.country ?? details?.country ?? practice?.country ?? '') as string,
      },
    });
    setContactModalOpen(true);
  }, [details, extracted, practice]);

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
    const hasPayouts = status.payoutsComplete;

    const weightedChecks: Array<[string, boolean, number]> = [
      ['name', Boolean(name), 10],
      ['description', Boolean(description), 15],
      ['services', hasServices, 20],
      ['website', Boolean(website), 5],
      ['contactPhone', Boolean(contactPhone), 10],
      ['businessEmail', Boolean(businessEmail), 10],
      ['address', hasAddress, 15],
      ['introMessage', Boolean(introMessage), 15],
      ['accentColor', Boolean(accentColor), 5],
      ['logo', hasLogo, 5],
      ['payouts', hasPayouts, 5],
    ];
    const totalWeight = weightedChecks.reduce((sum, [, , weight]) => sum + weight, 0);
    const earnedWeight = weightedChecks.reduce((sum, [, done, weight]) => sum + (done ? weight : 0), 0);
    const fallbackScore = Math.round((earnedWeight / totalWeight) * 100);
    const fallbackMissingFields = weightedChecks
      .filter(([, done]) => !done)
      .map(([field]) => field);

    return {
      completionScore: typeof extracted.completionScore === 'number' ? extracted.completionScore : fallbackScore,
      missingFields: Array.isArray(extracted.missingFields) ? extracted.missingFields : fallbackMissingFields,
    };
  }, [details, extracted, practice, status.payoutsComplete, status.servicesComplete]);

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

  const onboardingPracticeConfig = useMemo(() => ({
    name: practice?.name ?? 'Practice',
    profileImage: practice?.logo ?? null,
    practiceId: practiceId || (practice?.id ?? ''),
    description: details?.description ?? practice?.description ?? '',
    slug: practice?.slug ?? undefined,
  }), [details?.description, practice, practiceId]);

  const fallbackUiMessages = useMemo<ChatMessageUI[]>(() => [openingFallbackMessage], [openingFallbackMessage]);
  const resolvedChatMessages = useMemo(() => {
    if (!chatAdapter?.messages) return fallbackUiMessages;
    return chatAdapter.messages.length > 0 ? chatAdapter.messages : fallbackUiMessages;
  }, [chatAdapter?.messages, fallbackUiMessages]);

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

  const glassCardClass = 'glass-card p-4 sm:p-5';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 text-input-text">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-input-placeholder">
          {status.needsSetup ? "Let's get started" : 'Practice setup'}
        </p>
        <h2 className="text-3xl font-bold tracking-tight">
          {status.needsSetup ? 'Almost ready to go' : 'All set'}
        </h2>
      </header>

      {/* ── Chat panel ───────────────────────────────────────────────────────── */}
      <section className={glassCardClass}>
        <div className="h-[500px] min-h-0">
          <ChatContainer
            messages={resolvedChatMessages}
            onSendMessage={(message, attachments, replyToMessageId) => {
              if (waitingForRealChat) return;
              if (chatAdapter?.sendMessage) {
                void (async () => {
                  const trimmed = message.trim();
                  if (!trimmed) return;
                  const urlMatch = trimmed.match(URL_RE);
                  if (urlMatch) {
                    setIsLoading(true);
                    const raw = urlMatch[0];
                    const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
                    try {
                      const websiteFields = await extractWebsite(normalized);
                      if (Object.keys(websiteFields).length > 0) {
                        setExtracted(prev => ({ ...prev, ...websiteFields }));
                        setPendingSave(prev => ({ ...(prev ?? {}), ...(toSavableFields(websiteFields) ?? {}) }));
                      }
                    } finally {
                      setIsLoading(false);
                    }
                  }
                  await chatAdapter.sendMessage(message, attachments, replyToMessageId);
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
            messagesReady={waitingForRealChat ? false : (chatAdapter?.messagesReady ?? true)}
            onToggleReaction={chatAdapter?.onToggleReaction}
            onRequestReactions={chatAdapter?.onRequestReactions}
            hasMoreMessages={chatAdapter?.hasMoreMessages}
            isLoadingMoreMessages={chatAdapter?.isLoadingMoreMessages}
            onLoadMoreMessages={chatAdapter?.onLoadMoreMessages}
            onboardingActions={{
              onSaveAll: hasPending ? () => { void saveExtracted(); } : undefined,
              onEditBasics: openBasicsModal,
              onEditContact: openContactModal,
              onLogoChange,
              logoUploading,
              logoUploadProgress,
              logoUrl: practice?.logo ?? null,
              practiceName: practice?.name ?? 'Practice',
              isSaving,
              saveError,
            }}
            headerContent={
              <div className="flex items-center justify-between mb-2 gap-3 px-4 pt-3">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-accent-500" />
                  <div>
                    <div className="text-sm font-semibold">Setup assistant</div>
                    {scanStatusText ? (
                      <div className="text-[10px] text-input-placeholder">{scanStatusText}</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-input-text">Profile completion</div>
                  <div className="text-[10px] text-input-placeholder">{completionScore}% complete</div>
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* ── Edit basics modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={basicsModalOpen}
        onClose={() => setBasicsModalOpen(false)}
        title="Edit basics"
        contentClassName="glass-panel"
        headerClassName="glass-panel"
      >
        <div className="space-y-4">
          <FormGrid>
            <div>
              <FormLabel htmlFor="edit-name">Practice name</FormLabel>
              <Input
                id="edit-name"
                value={basicsDraft.name}
                onChange={v => setBasicsDraft(p => ({ ...p, name: v }))}
                placeholder="Smith & Associates"
              />
            </div>
            <div>
              <FormLabel htmlFor="edit-slug">Public slug</FormLabel>
              <Input
                id="edit-slug"
                value={basicsDraft.slug}
                onChange={v => setBasicsDraft(p => ({ ...p, slug: v }))}
                placeholder="smith-associates"
              />
            </div>
          </FormGrid>
          <PracticeProfileTextFields
            introMessage={basicsDraft.introMessage}
            onIntroChange={v => setBasicsDraft(p => ({ ...p, introMessage: v }))}
            introRows={3}
            introLabel="Intro message"
            introPlaceholder="Welcome to our firm. How can we help?"
            disabled={isModalSaving}
          />
          <div className="space-y-1.5">
            <FormLabel htmlFor="edit-accent">Accent color</FormLabel>
            <div className="flex items-center gap-2">
              <div
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full"
                style={{ backgroundColor: normalizeAccentColor(basicsDraft.accentColor) ?? '#D4AF37' }}
              >
                <input
                  type="color"
                  value={normalizeAccentColor(basicsDraft.accentColor) ?? '#D4AF37'}
                  onChange={e => setBasicsDraft(p => ({
                    ...p, accentColor: normalizeAccentColor((e.target as HTMLInputElement).value) ?? '#D4AF37',
                  }))}
                  className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                />
              </div>
              <Input
                id="edit-accent"
                value={basicsDraft.accentColor}
                onChange={v => setBasicsDraft(p => ({ ...p, accentColor: normalizeAccentColor(v) ?? v }))}
                placeholder="#3B82F6"
                aria-label="Accent color hex"
              />
            </div>
          </div>
          <FormActions
            className="justify-end"
            onCancel={() => setBasicsModalOpen(false)}
            onSubmit={async () => {
              setIsModalSaving(true);
              try {
                await onSaveBasics(basicsDraft);
                setExtracted(prev => ({
                  ...prev,
                  name: basicsDraft.name,
                  introMessage: basicsDraft.introMessage,
                  accentColor: basicsDraft.accentColor,
                }));
                setBasicsModalOpen(false);
              } finally {
                setIsModalSaving(false);
              }
            }}
            submitType="button"
            submitText="Save"
            submitDisabled={isModalSaving}
            cancelDisabled={isModalSaving}
          />
        </div>
      </Modal>

      {/* ── Edit contact modal ────────────────────────────────────────────────── */}
      <Modal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        title="Edit contact"
        contentClassName="glass-panel"
        headerClassName="glass-panel"
      >
        <div className="space-y-4">
          <FormGrid>
            <URLInput
              label="Website"
              value={contactDraft.website}
              onChange={v => setContactDraft(p => ({ ...p, website: v }))}
              placeholder="https://example.com"
            />
            <EmailInput
              label="Business email"
              value={contactDraft.businessEmail}
              onChange={v => setContactDraft(p => ({ ...p, businessEmail: v }))}
              placeholder="you@firm.com"
            />
            <PhoneInput
              label="Phone"
              value={contactDraft.businessPhone}
              onChange={v => setContactDraft(p => ({ ...p, businessPhone: v }))}
              placeholder="(555) 123-4567"
              showCountryCode={false}
            />
          </FormGrid>
          <AddressExperienceForm
            initialValues={{ address: contactDraft.address }}
            fields={['address']}
            required={[]}
            onValuesChange={values => {
              if (values.address !== undefined) {
                setContactDraft(p => ({ ...p, address: values.address as Address }));
              }
            }}
            showSubmitButton={false}
            variant="plain"
            disabled={isModalSaving}
          />
          <FormActions
            className="justify-end"
            onCancel={() => setContactModalOpen(false)}
            onSubmit={async () => {
              setIsModalSaving(true);
              try {
                await onSaveContact(contactDraft);
                setExtracted(prev => ({
                  ...prev,
                  website:       contactDraft.website,
                  businessEmail: contactDraft.businessEmail,
                  contactPhone:  contactDraft.businessPhone,
                  address: contactDraft.address ? {
                    address:    contactDraft.address.address,
                    city:       contactDraft.address.city,
                    state:      contactDraft.address.state,
                    postalCode: contactDraft.address.postalCode,
                    country:    contactDraft.address.country,
                  } : undefined,
                }));
                setContactModalOpen(false);
              } finally {
                setIsModalSaving(false);
              }
            }}
            submitType="button"
            submitText="Save"
            submitDisabled={isModalSaving}
            cancelDisabled={isModalSaving}
          />
        </div>
      </Modal>
    </div>
  );
};
