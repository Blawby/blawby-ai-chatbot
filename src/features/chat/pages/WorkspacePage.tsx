import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import axios from 'axios';
import { useNavigation } from '@/shared/utils/navigation';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import WorkspaceNav, { type WorkspaceNavTab } from '@/features/chat/views/WorkspaceNav';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { SplitView } from '@/shared/ui/layout/SplitView';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { Page } from '@/shared/ui/layout/Page';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { useConversations } from '@/shared/hooks/useConversations';
import { fetchLatestConversationMessage } from '@/shared/lib/conversationApi';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { PracticeSetup, type BasicsFormValues, type ContactFormValues } from '@/features/practice-setup/components/PracticeSetup';
import { resolvePracticeSetupStatus } from '@/features/practice-setup/utils/status';
import { ContactForm } from '@/features/intake/components/ContactForm';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { ServicesEditor } from '@/features/services/components/ServicesEditor';
import { SERVICE_CATALOG } from '@/features/services/data/serviceCatalog';
import type { Service } from '@/features/services/types';
import { resolveServiceDetails as resolveServiceEditorDetails } from '@/features/services/utils/serviceNormalization';
import { getServiceDetailsForSave } from '@/features/services/utils';
import { StripeOnboardingStep } from '@/features/onboarding/steps/StripeOnboardingStep';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { createConnectedAccount, getOnboardingStatusPayload } from '@/shared/lib/apiClient';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import type { ChatMessageUI } from '../../../../worker/types';
import type { ConversationMode } from '@/shared/types/conversation';
import type { LayoutMode } from '@/app/MainApp';

type WorkspaceView = 'home' | 'list' | 'conversation' | 'matters' | 'clients';
type PreviewTab = 'home' | 'messages' | 'intake';

interface WorkspacePageProps {
  view: WorkspaceView;
  practiceId: string;
  practiceSlug: string | null;
  practiceName?: string | null;
  practiceLogo?: string | null;
  messages: ChatMessageUI[];
  layoutMode: LayoutMode;
  showClientTabs?: boolean;
  showPracticeTabs?: boolean;
  workspace?: 'public' | 'practice' | 'client';
  onStartNewConversation: (mode: ConversationMode) => Promise<string | null>;
  chatView: ComponentChildren;
  mattersView?: ComponentChildren;
  clientsView?: ComponentChildren;
  header?: ComponentChildren;
  headerClassName?: string;
}

const filterWorkspaceMessages = (messages: ChatMessageUI[]) => {
  const base = messages.filter(
    (message) =>
      message.metadata?.systemMessageKey !== 'ask_question_help'
  );
  const hasNonSystemMessages = base.some((message) => message.role !== 'system');
  return hasNonSystemMessages ? base.filter((message) => message.metadata?.systemMessageKey !== 'intro') : base;
};

const WorkspacePage: FunctionComponent<WorkspacePageProps> = ({
  view,
  practiceId,
  practiceSlug,
  practiceName,
  practiceLogo,
  messages,
  layoutMode,
  showClientTabs = false,
  showPracticeTabs = false,
  workspace = 'public',
  onStartNewConversation,
  chatView,
  mattersView,
  clientsView,
  header,
  headerClassName,
}) => {
  const { navigate } = useNavigation();
  const [previewTab, setPreviewTab] = useState<PreviewTab>('home');
  const [, setDraftBasics] = useState<BasicsFormValues | null>(null);
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const isPracticeWorkspace = workspace === 'practice';
  const isClientFacingWorkspace = workspace === 'public' || workspace === 'client';

  const workspaceBasePath = useMemo(() => {
    if (workspace === 'practice') {
      return practiceSlug ? `/practice/${encodeURIComponent(practiceSlug)}` : '/practice';
    }
    if (workspace === 'client') {
      return practiceSlug ? `/client/${encodeURIComponent(practiceSlug)}` : '/client';
    }
    return practiceSlug ? `/public/${encodeURIComponent(practiceSlug)}` : '/public';
  }, [workspace, practiceSlug]);
  const conversationsPath = `${workspaceBasePath}/conversations`;
  const previewBaseUrl = useMemo(() => {
    const path = practiceSlug ? `/public/${encodeURIComponent(practiceSlug)}` : '/public';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }, [practiceSlug]);
  const previewTabOptions: Array<{ id: PreviewTab; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'messages', label: 'Messages' },
    { id: 'intake', label: 'Intake form' }
  ];
  const previewUrls = useMemo(() => {
    const trimmed = previewBaseUrl.endsWith('/')
      ? previewBaseUrl.slice(0, -1)
      : previewBaseUrl;
    return {
      home: trimmed,
      messages: `${trimmed}/conversations`
    };
  }, [previewBaseUrl]);

  const isPracticeOnly = useMemo(() => ['clients'].includes(view), [view]);
  const isSharedGuarded = useMemo(() => ['matters'].includes(view), [view]);
  const allowed = useMemo(() => {
    if (isPracticeOnly) return showPracticeTabs;
    if (isSharedGuarded) return showClientTabs || showPracticeTabs;
    return true;
  }, [isPracticeOnly, isSharedGuarded, showClientTabs, showPracticeTabs]);

  useEffect(() => {
    if (!allowed) {
      navigate(workspaceBasePath, true);
    }
  }, [allowed, workspaceBasePath, navigate]);

  const shouldListConversations = isPracticeWorkspace ? true : view !== 'conversation';
  const {
    conversations,
    isLoading: isConversationsLoading,
    error: conversationsError,
    refresh: refreshConversations
  } = useConversations({
    practiceId,
    scope: 'practice',
    list: shouldListConversations,
    enabled: shouldListConversations && Boolean(practiceId)
  });

  const [conversationPreviews, setConversationPreviews] = useState<Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }>>({});
  const fetchedPreviewIds = useRef<Set<string>>(new Set());
  const previewFailureCounts = useRef<Record<string, number>>({});
  const MAX_PREVIEW_ATTEMPTS = 2;

  useEffect(() => {
    fetchedPreviewIds.current = new Set();
    previewFailureCounts.current = {};
    setConversationPreviews({});
  }, [practiceId]);

  useEffect(() => {
    if (view === 'conversation' || conversations.length === 0 || !practiceId) {
      return;
    }
    let isMounted = true;
    const loadPreviews = async () => {
      const updates: Record<string, { content: string; role: string; createdAt: string }> = {};
      const toFetch = conversations.slice(0, 10).filter(
        (conversation) => !fetchedPreviewIds.current.has(conversation.id)
      );
      await Promise.all(toFetch.map(async (conversation) => {
        const message = await fetchLatestConversationMessage(
          conversation.id,
          practiceId
        ).catch(() => null);
        if (message?.content) {
          fetchedPreviewIds.current.add(conversation.id);
          updates[conversation.id] = {
            content: message.content,
            role: message.role,
            createdAt: message.created_at
          };
          return;
        }
        const currentFailures = previewFailureCounts.current[conversation.id] ?? 0;
        const nextFailures = currentFailures + 1;
        previewFailureCounts.current[conversation.id] = nextFailures;
        if (nextFailures >= MAX_PREVIEW_ATTEMPTS) {
          fetchedPreviewIds.current.add(conversation.id);
        }
      }));
      if (isMounted && Object.keys(updates).length > 0) {
        setConversationPreviews((prev) => ({ ...prev, ...updates }));
      }
    };
    void loadPreviews();
    return () => {
      isMounted = false;
    };
  }, [practiceId, conversations, view]);

  const recentMessage = useMemo(() => {
    const fallbackPracticeName = typeof practiceName === 'string'
      ? practiceName.trim()
      : '';
    if (conversations.length > 0) {
      const sorted = [...conversations].sort((a, b) => {
        const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
        const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
        return bTime - aTime;
      });
      const top = sorted.find((conversation) => {
        const preview = conversationPreviews[conversation.id];
        return typeof preview?.content === 'string' && preview.content.trim().length > 0;
      });
      if (top) {
        const preview = conversationPreviews[top.id];
        const previewText = typeof preview?.content === 'string' ? preview.content.trim() : '';
        const clipped = previewText
          ? (previewText.length > 90 ? `${previewText.slice(0, 90)}…` : previewText)
          : 'Open to view messages.';
        const title = typeof top.user_info?.title === 'string' ? top.user_info?.title.trim() : '';
        const timestampLabel = preview?.createdAt
          ? formatRelativeTime(preview.createdAt)
          : (top.last_message_at ? formatRelativeTime(top.last_message_at) : '');
        return {
          preview: clipped,
          timestampLabel,
          senderLabel: title || fallbackPracticeName,
          avatarSrc: practiceLogo ?? null,
          conversationId: top.id
        };
      }
    }
    if (filteredMessages.length === 0) {
      return null;
    }
    const candidate = [...filteredMessages]
      .reverse()
      .find((message) => message.role !== 'system' && typeof message.content === 'string' && message.content.trim().length > 0);
    if (!candidate) {
      return null;
    }
    const trimmedContent = candidate.content.trim();
    const preview = trimmedContent.length > 90
      ? `${trimmedContent.slice(0, 90)}…`
      : trimmedContent;
    const timestampLabel = candidate.timestamp
      ? formatRelativeTime(new Date(candidate.timestamp).toISOString())
      : '';
    return {
      preview,
      timestampLabel,
      senderLabel: fallbackPracticeName,
      avatarSrc: practiceLogo ?? null,
      conversationId: null
    };
  }, [practiceLogo, practiceName, conversationPreviews, conversations, filteredMessages]);

  const { currentPractice, updatePractice } = usePracticeManagement();
  const { session } = useSessionContext();
  const { details: setupDetails, updateDetails: updateSetupDetails } = usePracticeDetails(currentPractice?.id ?? null);
  const setupStatus = resolvePracticeSetupStatus(currentPractice, setupDetails ?? null);
  const { showSuccess, showError } = useToastContext();
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [justSavedServices, setJustSavedServices] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  const forcePreviewReload = useCallback(() => {
    setPreviewReloadKey(prev => prev + 1);
  }, []);

  const handleSaveBasics = async (values: BasicsFormValues) => {
    if (!currentPractice) {
      const error = new Error('No active practice selected');
      showError('Select a practice first', 'Choose a practice before editing basics.');
      throw error;
    }
    const trimmedName = values.name.trim();
    const trimmedSlug = values.slug.trim();
    const trimmedIntro = values.introMessage.trim();
    const normalizedAccentColor = normalizeAccentColor(values.accentColor);
    if (!normalizedAccentColor) {
      const error = new Error('Accent color must be a valid hex value (for example #3B82F6).');
      showError('Invalid accent color', error.message);
      throw error;
    }
    const practiceUpdates: Record<string, string> = {};

    if (trimmedName && trimmedName !== (currentPractice.name ?? '')) {
      practiceUpdates.name = trimmedName;
    }
    if (trimmedSlug && trimmedSlug !== (currentPractice.slug ?? '')) {
      practiceUpdates.slug = trimmedSlug;
    }
    const introSource = setupDetails?.introMessage ?? currentPractice?.introMessage ?? '';
    const introChanged = trimmedIntro !== introSource;
    const accentSource = normalizeAccentColor(setupDetails?.accentColor ?? currentPractice?.accentColor);
    const accentChanged = normalizedAccentColor !== accentSource;

    try {
      if (Object.keys(practiceUpdates).length > 0) {
        await updatePractice(currentPractice.id, practiceUpdates);
      }
      if (introChanged || accentChanged) {
        await updateSetupDetails({
          ...(introChanged ? { introMessage: trimmedIntro.length > 0 ? trimmedIntro : null } : {}),
          ...(accentChanged ? { accentColor: normalizedAccentColor } : {})
        });
      }
      if (Object.keys(practiceUpdates).length > 0 || introChanged || accentChanged) {
        showSuccess('Basics updated', 'Your public profile reflects the newest info.');
        forcePreviewReload();
      } else {
        showSuccess('Up to date', 'Your firm basics already match these details.');
      }
    } catch (error) {
      showError('Basics update failed', error instanceof Error ? error.message : 'Unable to save basics.');
      throw error;
    }
  };

  const handleSaveContact = async (values: ContactFormValues) => {
    if (!currentPractice) {
      const error = new Error('No active practice selected');
      showError('Select a practice first', 'Choose a practice before editing contact info.');
      throw error;
    }
    const normalize = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const address = values.address ?? {
      address: '',
      apartment: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    };
    try {
      await updateSetupDetails({
        website: normalize(values.website),
        businessEmail: normalize(values.businessEmail),
        businessPhone: normalize(values.businessPhone),
        address: normalize(address.address ?? ''),
        apartment: normalize(address.apartment ?? ''),
        city: normalize(address.city ?? ''),
        state: normalize(address.state ?? ''),
        postalCode: normalize(address.postalCode ?? ''),
        country: normalize(address.country ?? '')
      });
      showSuccess('Contact info updated', 'Clients and receipts will use your latest details.');
      forcePreviewReload();
    } catch (error) {
      showError('Contact update failed', error instanceof Error ? error.message : 'Unable to save contact info.');
      throw error;
    }
  };

  const handleLogoChange = async (files: FileList | File[]) => {
    if (!currentPractice) return;
    const nextFiles = Array.from(files || []);
    if (nextFiles.length === 0) return;
    setLogoUploading(true);
    setLogoUploadProgress(0);
    try {
      const uploaded = await uploadPracticeLogo(nextFiles[0], currentPractice.id, (progress) => {
        setLogoUploadProgress(progress);
      });
      await updatePractice(currentPractice.id, { logo: uploaded });
      forcePreviewReload();
    } catch (error) {
      showError('Logo upload failed', error instanceof Error ? error.message : 'Unable to upload logo.');
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(null);
    }
  };

  const initialServiceDetails = useMemo(
    () => resolveServiceEditorDetails(setupDetails ?? undefined, currentPractice ?? undefined),
    [setupDetails, currentPractice]
  );
  const [servicesDraft, setServicesDraft] = useState<Service[]>(initialServiceDetails);
  useEffect(() => {
    if (justSavedServices) {
      const draftKey = JSON.stringify(getServiceDetailsForSave(servicesDraft));
      const initialKey = JSON.stringify(getServiceDetailsForSave(initialServiceDetails));
      if (draftKey === initialKey) {
        setJustSavedServices(false);
      }
      return;
    }
    setServicesDraft(initialServiceDetails);
  }, [initialServiceDetails, justSavedServices, servicesDraft]);
  const servicesSaveKeyRef = useRef('');
  const servicesToastAtRef = useRef(0);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [servicesSaving, setServicesSaving] = useState(false);
  const servicesToastCooldownMs = 4000;

  const saveServices = useCallback(async (nextServices: Service[]) => {
    if (!currentPractice) return;
    const details = getServiceDetailsForSave(nextServices);
    const apiServices = details
      .map(({ id, title, description }) => ({
        id: id.trim(),
        name: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {})
      }))
      .filter((service) => service.id && service.name);
    const payloadKey = JSON.stringify(apiServices);
    if (payloadKey === servicesSaveKeyRef.current) {
      return;
    }
    setServicesSaving(true);
    try {
      await updateSetupDetails({ services: apiServices });
      servicesSaveKeyRef.current = payloadKey;
      setServicesError(null);
      const now = Date.now();
      if (now - servicesToastAtRef.current > servicesToastCooldownMs) {
        showSuccess('Services updated', 'Clients will now see these intake options.');
        servicesToastAtRef.current = now;
        forcePreviewReload();
        setJustSavedServices(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update services';
      setServicesError(message);
      showError('Services update failed', message);
    } finally {
      setServicesSaving(false);
    }
  }, [currentPractice, forcePreviewReload, showError, showSuccess, updateSetupDetails]);

  const handleServicesEditorChange = useCallback((nextServices: Service[]) => {
    setServicesDraft(nextServices);
    void saveServices(nextServices);
  }, [saveServices]);

  const organizationId = currentPractice?.id ?? null;
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [isStripeSubmitting, setIsStripeSubmitting] = useState(false);

  const refreshStripeStatus = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!organizationId) {
      setStripeStatus(null);
      return;
    }
    setIsStripeLoading(true);
    try {
      const payload = await getOnboardingStatusPayload(organizationId, { signal: options?.signal });
      const status = extractStripeStatusFromPayload(payload);
      setStripeStatus(status ?? null);
    } catch (error) {
      if (axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError')) return;
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setStripeStatus(null);
        return;
      }
      console.warn('[WorkspacePage] Failed to load payout status:', error);
      showError('Payouts', 'Unable to load payout account status.');
    } finally {
      setIsStripeLoading(false);
    }
  }, [organizationId, showError]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshStripeStatus({ signal: controller.signal });
    return () => controller.abort();
  }, [refreshStripeStatus]);

  const handleStartStripeOnboarding = useCallback(async () => {
    if (!organizationId) {
      showError('Payouts', 'Missing active practice.');
      return;
    }
    const email = currentPractice?.businessEmail || session?.user?.email || '';
    if (!email) {
      showError('Payouts', 'Add a business email before submitting details.');
      return;
    }
    if (typeof window === 'undefined') {
      showError('Payouts', 'Unable to start Stripe onboarding in this environment.');
      return;
    }
    const baseUrl = window.location.origin + window.location.pathname;
    const returnUrl = new URL(baseUrl);
    returnUrl.searchParams.set('stripe', 'return');
    const refreshUrl = new URL(baseUrl);
    refreshUrl.searchParams.set('stripe', 'refresh');
    setIsStripeSubmitting(true);
    try {
      const connectedAccount = await createConnectedAccount({
        practiceEmail: email,
        practiceUuid: organizationId,
        returnUrl: returnUrl.toString(),
        refreshUrl: refreshUrl.toString()
      });
      if (connectedAccount.onboardingUrl) {
        const validated = getValidatedStripeOnboardingUrl(connectedAccount.onboardingUrl);
        if (validated) {
          window.open(validated, '_blank');
          return;
        }
        showError('Payouts', 'Received an invalid Stripe onboarding link. Please try again.');
        return;
      }
      showError('Payouts', 'Stripe onboarding link was not provided. Please try again.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Stripe onboarding';
      showError('Payouts', message);
    } finally {
      setIsStripeSubmitting(false);
    }

  }, [organizationId, currentPractice?.businessEmail, session?.user?.email, showError]);

  const handleIntakePreviewSubmit = useCallback(async () => {
    showSuccess('Intake preview submitted', 'This submission is for preview only.');
    forcePreviewReload();
  }, [showSuccess, forcePreviewReload]);

  const servicesSlot = (
    <div className="space-y-4 text-input-text">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-input-placeholder">Services & intake</p>
        <p className="text-xl font-semibold">What can clients request?</p>
      </div>
      <ServicesEditor
        services={servicesDraft}
        onChange={handleServicesEditorChange}
        catalog={SERVICE_CATALOG}
      />
      {servicesError ? (
        <p className="text-sm text-red-600 dark:text-red-300">{servicesError}</p>
      ) : (
        <p className="text-xs text-input-placeholder">
          {servicesSaving ? 'Saving changes…' : 'Updates apply automatically to your public intake form.'}
        </p>
      )}
    </div>
  );

  const payoutDetailsSubmitted = stripeStatus?.details_submitted === true;
  const payoutsSlot = (
    <div className="space-y-4 text-input-text">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-input-placeholder">Payouts</p>
        <p className="text-xl font-semibold">Connect Stripe to accept payments</p>
        <p className="text-sm text-input-placeholder">
          Verification takes about 5 minutes and unlocks consultation fees.
        </p>
      </div>
      <div className="glass-panel p-4">
        {payoutDetailsSubmitted ? (
          <p className="text-sm text-input-text">
            Your Stripe account is connected. Clients can pay consultation fees before intake.
          </p>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartStripeOnboarding}
              disabled={isStripeSubmitting || isStripeLoading}
            >
              {isStripeSubmitting ? 'Preparing Stripe…' : 'Start Stripe onboarding'}
            </Button>
            <p className="mt-2 text-xs text-input-placeholder">
              We’ll open Stripe’s secure verification flow in a new tab.
            </p>
          </>
        )}
        {stripeStatus && !payoutDetailsSubmitted && (
          <div className="mt-4 glass-panel p-3">
            <StripeOnboardingStep
              status={stripeStatus}
              loading={isStripeLoading}
              showIntro={false}
              showInfoCard={false}
            />
          </div>
        )}
      </div>
    </div>
  );

  if (!allowed) {
    return null;
  }

  const handleStartConversation = async (mode: ConversationMode) => {
    try {
      const conversationId = await onStartNewConversation(mode);
      if (conversationId) {
        navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
        return;
      }
    } catch (error) {
      console.error('[WorkspacePage] Failed to start conversation:', error);
    }
    navigate(conversationsPath);
  };

  const handleOpenRecentMessage = () => {
    if (recentMessage?.conversationId) {
      navigate(`${conversationsPath}/${encodeURIComponent(recentMessage.conversationId)}`);
      return;
    }
    navigate(conversationsPath);
  };

  const renderContent = () => {
    if (workspace === 'practice' && view === 'home') {
      const renderPreviewContent = () => {
        if (previewTab === 'intake') {
          return (
            <div className="flex h-full w-full flex-col overflow-y-auto bg-transparent p-4">
              <ContactForm
                onSubmit={handleIntakePreviewSubmit}
                message="Tell us about your matter and we will follow up shortly."
              />
            </div>
          );
        }

        return (
          <iframe
            key={`${previewTab}-${previewReloadKey}`}
            title="Public workspace preview"
            src={previewTab === 'messages' ? previewUrls.messages : previewUrls.home}
            className="h-full w-full border-0"
            loading="lazy"
          />
        );
      };

      return (
        <div className="flex min-h-0 w-full flex-col lg:h-full lg:flex-row lg:overflow-hidden">
          {/* Left column */}
          <div className="relative flex w-full flex-col bg-transparent lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
              <Page className="mx-auto w-full max-w-3xl flex-1">
                <PracticeSetup
                  status={setupStatus}
                  practice={currentPractice}
                  details={setupDetails ?? null}
                  onSaveBasics={handleSaveBasics}
                  onSaveContact={handleSaveContact}
                  servicesSlot={servicesSlot}
                  payoutsSlot={payoutsSlot}
                  logoUploading={logoUploading}
                  logoUploadProgress={logoUploadProgress}
                  onLogoChange={handleLogoChange}
                  onBasicsDraftChange={setDraftBasics}
                />
              </Page>
            </div>
          </div>

          {/* Right: Public Preview */}
          <div className="relative flex w-full flex-col items-center gap-5 border-t border-line-glass/30 bg-transparent px-4 py-6 lg:w-[420px] lg:shrink-0 lg:border-t-0 lg:border-l lg:border-l-line-glass/30">
            <div className="relative flex w-full flex-col items-center gap-5">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-input-placeholder">
              Public preview
            </div>
            <div className="inline-flex gap-1 rounded-full glass-panel p-1 text-xs font-semibold text-input-placeholder shadow-sm">
              {previewTabOptions.map((option) => {
                const isActive = previewTab === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPreviewTab(option.id)}
                    className={cn(
                      'rounded-full px-3 py-1 transition backdrop-blur-xl',
                      isActive
                        ? 'bg-white/[0.12] text-white border border-accent-500/50 shadow-lg shadow-accent-500/10'
                        : 'text-input-placeholder hover:text-input-text hover:bg-white/[0.08] border border-transparent'
                    )}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="relative aspect-[9/19.5] w-full max-w-[360px] overflow-hidden glass-card shadow-glass">
              {renderPreviewContent()}
              <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/10" aria-hidden="true" />
            </div>
            <p className="max-w-xs text-center text-xs text-input-placeholder">
              This live preview matches exactly what clients see on your public link.
            </p>
            </div>
          </div>
        </div>
      );
    }

    switch (view) {
      case 'home':
        return (
          <WorkspaceHomeView
            practiceName={practiceName}
            practiceLogo={practiceLogo}
            onSendMessage={() => handleStartConversation('ASK_QUESTION')}
            onRequestConsultation={() => handleStartConversation('REQUEST_CONSULTATION')}
            recentMessage={recentMessage}
            onOpenRecentMessage={handleOpenRecentMessage}
            consultationTitle={undefined}
            consultationDescription={undefined}
            consultationCta={undefined}
          />
        );
      case 'list':
        return (
          <ConversationListView
            conversations={conversations}
            previews={conversationPreviews}
            practiceName={practiceName}
            practiceLogo={practiceLogo}
            isLoading={isConversationsLoading}
            error={conversationsError}
            onClose={() => navigate(workspaceBasePath)}
            onSelectConversation={(conversationId) => {
              navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
            }}
            onSendMessage={() => handleStartConversation('ASK_QUESTION')}
            showSendMessageButton={isClientFacingWorkspace}
          />
        );
      case 'matters':
        return mattersView ?? (
          <div className="flex flex-1 flex-col glass-card">
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-input-text">Matters</h2>
              <p className="mt-2 text-sm text-input-placeholder">
                Your active matters will appear here once a practice connects them to your account.
              </p>
            </div>
            <div className="mx-6 mb-6 glass-panel p-5">
              <div className="text-sm font-semibold text-input-text">No matters yet</div>
              <div className="mt-2 text-sm text-input-placeholder">
                Start a conversation to open a new matter with the practice.
              </div>
            </div>
          </div>
        );
      case 'clients':
        return clientsView ?? (
          <div className="flex flex-1 flex-col glass-card">
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-input-text">Clients</h2>
              <p className="mt-2 text-sm text-input-placeholder">
                Manage your practice clients here.
              </p>
            </div>
          </div>
        );
      case 'conversation':
      default:
        return (
          <div className="flex h-full min-h-0 flex-1 flex-col">
            {chatView}
          </div>
        );
    }
  };

  const hideBottomNav = isClientFacingWorkspace && (view === 'list' || view === 'conversation');
  const showBottomNav = workspace !== 'practice'
    ? !hideBottomNav
    : (showClientTabs || showPracticeTabs || view === 'home' || view === 'list' || view === 'matters' || view === 'clients');
  const activeTab = view === 'list' || view === 'conversation'
    ? 'messages'
    : view === 'matters'
    ? 'matters'
    : view === 'clients'
    ? 'clients'
    : view;
  const handleSelectTab = (tab: WorkspaceNavTab) => {
    if (tab === 'messages') {
      void refreshConversations();
      navigate(conversationsPath);
      return;
    }
    if (tab === 'matters') {
      navigate(`${workspaceBasePath}/matters`);
      return;
    }
    if (tab === 'clients') {
      navigate(`${workspaceBasePath}/clients`);
      return;
    }
    if (tab === 'settings') {
      navigate('/settings');
      return;
    }
    navigate(workspaceBasePath);
  };

  const bottomNav = showBottomNav ? (
    <WorkspaceNav
      variant="bottom"
      activeTab={activeTab}
      showClientTabs={showClientTabs}
      showPracticeTabs={showPracticeTabs}
      onSelectTab={handleSelectTab}
    />
  ) : undefined;

  const sidebarNav = showBottomNav ? (
    <WorkspaceNav
      variant="sidebar"
      activeTab={activeTab}
      showClientTabs={showClientTabs}
      showPracticeTabs={showPracticeTabs}
      onSelectTab={handleSelectTab}
    />
  ) : undefined;

  const conversationListView = (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ConversationListView
        conversations={conversations}
        previews={conversationPreviews}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        isLoading={isConversationsLoading}
        error={conversationsError}
        onClose={() => navigate(workspaceBasePath)}
        onSelectConversation={(conversationId) => {
          navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
        }}
        onSendMessage={() => handleStartConversation('ASK_QUESTION')}
        showBackButton={false}
        showSendMessageButton={isClientFacingWorkspace}
      />
    </div>
  );

  const showListOnMobile = view === 'list';
  const showChatOnMobile = view === 'conversation';
  const isSplitView = isPracticeWorkspace && (view === 'list' || view === 'conversation');
  const shouldAllowMainScroll = view !== 'conversation' && view !== 'list';
  const mainContent = isSplitView
    ? (
      <SplitView
        className="h-full min-h-0 w-full"
        primary={conversationListView}
        secondary={chatView}
        primaryClassName={cn(
          'min-h-0',
          showListOnMobile ? 'block' : 'hidden',
          'md:block'
        )}
        secondaryClassName={cn(
          'min-h-0',
          showChatOnMobile ? 'block' : 'hidden',
          'md:block'
        )}
      />
    )
    : (
      <div className={cn('min-h-0 h-full flex flex-1 flex-col', shouldAllowMainScroll ? 'overflow-y-auto' : 'overflow-hidden')}>
        {renderContent()}
      </div>
    );

  const isPublicShell = layoutMode !== 'desktop';

  const publicShellFrameClass = workspace === 'public' || workspace === 'client'
    ? 'bg-transparent border-line-glass/30'
    : 'bg-surface-glass/40 border-line-glass/30 backdrop-blur-xl shadow-glass';

  const mainShell = isPublicShell ? (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className={cn(
        'flex h-full min-h-0 flex-1 flex-col rounded-3xl border overflow-hidden',
        publicShellFrameClass
      )}>
        {header && (
          <div className={cn('w-full', headerClassName)}>
            {header}
          </div>
        )}
        <div className="min-h-0 h-full flex-1">{mainContent}</div>
        {bottomNav && (
          <div className="mt-auto">
            {bottomNav}
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {header && (
        <div className={cn('w-full', headerClassName)}>
          {header}
        </div>
      )}
      {mainContent}
    </div>
  );

  return (
    <AppShell
      className="bg-transparent h-dvh"
      accentBackdropVariant={workspace === 'practice' ? 'workspace' : 'none'}
      sidebar={sidebarNav}
      main={mainShell}
      mainClassName={cn('min-h-0 h-full overflow-hidden', !isPublicShell && showBottomNav ? 'pb-20 md:pb-0' : undefined)}
      bottomBar={isPublicShell ? undefined : bottomNav}
      bottomBarClassName={!isPublicShell && showBottomNav ? 'md:hidden fixed inset-x-0 bottom-0 z-40 bg-transparent' : undefined}
    />
  );
};

export default WorkspacePage;
