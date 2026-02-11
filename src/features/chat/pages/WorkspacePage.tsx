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
import { PracticeSetupBanner, type BasicsFormValues, type ContactFormValues } from '@/features/practice-setup/components/PracticeSetupBanner';
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
import type { ChatMessageUI } from '../../../../worker/types';
import type { ConversationMode } from '@/shared/types/conversation';

type WorkspaceView = 'home' | 'list' | 'conversation' | 'matters' | 'clients';
type PreviewTab = 'home' | 'messages' | 'intake';

interface WorkspacePageProps {
  view: WorkspaceView;
  practiceId: string;
  practiceSlug: string | null;
  practiceName?: string | null;
  practiceLogo?: string | null;
  messages: ChatMessageUI[];
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
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const isPracticeWorkspace = workspace === 'practice';

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
  const [logoFiles, setLogoFiles] = useState<File[]>([]);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const handleSaveBasics = async (values: BasicsFormValues) => {
    if (!currentPractice) {
      const error = new Error('No active practice selected');
      showError('Select a practice first', 'Choose a practice before editing basics.');
      throw error;
    }
    const trimmedName = values.name.trim();
    const trimmedSlug = values.slug.trim();
    const trimmedIntro = values.introMessage.trim();
    const practiceUpdates: Record<string, string> = {};

    if (trimmedName && trimmedName !== (currentPractice.name ?? '')) {
      practiceUpdates.name = trimmedName;
    }
    if (trimmedSlug && trimmedSlug !== (currentPractice.slug ?? '')) {
      practiceUpdates.slug = trimmedSlug;
    }
    const introSource = setupDetails?.introMessage ?? currentPractice?.introMessage ?? '';
    const introChanged = trimmedIntro !== introSource;

    try {
      if (Object.keys(practiceUpdates).length > 0) {
        await updatePractice(currentPractice.id, practiceUpdates);
      }
      if (introChanged) {
        await updateSetupDetails({
          introMessage: trimmedIntro.length > 0 ? trimmedIntro : null
        });
      }
      if (Object.keys(practiceUpdates).length > 0 || introChanged) {
        showSuccess('Basics updated', 'Your public profile reflects the newest info.');
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
    } catch (error) {
      showError('Contact update failed', error instanceof Error ? error.message : 'Unable to save contact info.');
      throw error;
    }
  };

  const handleLogoChange = async (files: FileList | File[]) => {
    if (!currentPractice) return;
    const nextFiles = Array.from(files || []);
    setLogoFiles(nextFiles);
    if (nextFiles.length === 0) return;
    setLogoUploading(true);
    setLogoUploadProgress(0);
    try {
      const uploaded = await uploadPracticeLogo(nextFiles[0], currentPractice.id, (progress) => {
        setLogoUploadProgress(progress);
      });
      await updatePractice(currentPractice.id, { logo: uploaded });
      showSuccess('Logo updated', 'Your logo has been saved.');
    } catch (error) {
      showError('Logo upload failed', error instanceof Error ? error.message : 'Unable to upload logo.');
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(null);
      setLogoFiles([]);
    }
  };

  const initialServiceDetails = useMemo(
    () => resolveServiceEditorDetails(setupDetails ?? undefined, currentPractice ?? undefined),
    [setupDetails, currentPractice]
  );
  const [servicesDraft, setServicesDraft] = useState<Service[]>(initialServiceDetails);
  useEffect(() => {
    setServicesDraft(initialServiceDetails);
  }, [initialServiceDetails]);
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
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update services';
      setServicesError(message);
      showError('Services update failed', message);
    } finally {
      setServicesSaving(false);
    }
  }, [currentPractice, showError, showSuccess, updateSetupDetails]);

  const handleServicesEditorChange = useCallback((nextServices: Service[]) => {
    setServicesDraft(nextServices);
    void saveServices(nextServices);
  }, [saveServices]);

  const organizationId = currentPractice?.id ?? null;
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [isStripeSubmitting, setIsStripeSubmitting] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setStripeStatus(null);
      return;
    }
    const controller = new AbortController();
    setIsStripeLoading(true);
    getOnboardingStatusPayload(organizationId, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const status = extractStripeStatusFromPayload(payload);
        setStripeStatus(status ?? null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          setStripeStatus(null);
          return;
        }
        console.warn('[WorkspacePage] Failed to load payout status:', error);
        showError('Payouts', 'Unable to load payout account status.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsStripeLoading(false);
        }
      });
    return () => controller.abort();
  }, [organizationId, showError]);

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
  }, [showSuccess]);

  const servicesSlot = (
    <div className="space-y-4 text-gray-900 dark:text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500 dark:text-white/70">Services & intake</p>
        <p className="text-xl font-semibold">What can clients request?</p>
      </div>
      <div className="rounded-2xl border border-light-border bg-light-card-bg shadow-sm dark:border-dark-border dark:bg-dark-card-bg">
        <ServicesEditor
          services={servicesDraft}
          onChange={handleServicesEditorChange}
          catalog={SERVICE_CATALOG}
        />
      </div>
      {servicesError ? (
        <p className="text-sm text-red-600 dark:text-red-300">{servicesError}</p>
      ) : (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {servicesSaving ? 'Saving changes…' : 'Updates apply automatically to your public intake form.'}
        </p>
      )}
    </div>
  );

  const payoutDetailsSubmitted = stripeStatus?.details_submitted === true;
  const payoutsSlot = (
    <div className="space-y-4 text-gray-900 dark:text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500 dark:text-white/70">Payouts</p>
        <p className="text-xl font-semibold">Connect Stripe to accept payments</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Verification takes about 5 minutes and unlocks consultation fees.
        </p>
      </div>
      <div className="rounded-2xl border border-light-border bg-light-card-bg p-4 dark:border-dark-border dark:bg-dark-card-bg">
        {payoutDetailsSubmitted ? (
          <p className="text-sm text-gray-700 dark:text-gray-200">
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
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              We’ll open Stripe’s secure verification flow in a new tab.
            </p>
          </>
        )}
        {stripeStatus && !payoutDetailsSubmitted && (
          <div className="mt-4 rounded-2xl border border-light-border bg-light-card-bg p-3 dark:border-dark-border dark:bg-dark-card-bg">
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
            <div className="flex h-full w-full flex-col overflow-y-auto bg-gradient-to-b from-white via-gray-50 to-white p-4 dark:from-dark-bg dark:via-dark-bg/80 dark:to-dark-bg">
              <ContactForm
                onSubmit={handleIntakePreviewSubmit}
                message="Tell us about your matter and we will follow up shortly."
              />
            </div>
          );
        }
        return (
          <iframe
            key={previewTab}
            title="Public workspace preview"
            src={previewTab === 'messages' ? previewUrls.messages : previewUrls.home}
            className="h-full w-full border-0"
            loading="lazy"
          />
        );
      };

      return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden lg:flex-row">
          {/* Left column */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-dark-bg">
            <div
              className="pointer-events-none absolute inset-0 bg-white dark:bg-black"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[65%] bg-gradient-to-b from-primary-700/95 via-primary-800/80 to-transparent dark:from-primary-800/95 dark:via-primary-900/80"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -right-32 top-4 h-96 w-96 rounded-full bg-accent-500/50 blur-[170px] dark:bg-accent-500/45"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -left-24 top-36 h-72 w-72 rounded-full bg-primary-500/25 blur-[160px] dark:bg-primary-600/30"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-amber-500/25 blur-[150px] dark:bg-amber-400/30"
              aria-hidden="true"
            />
            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
              <Page className="mx-auto w-full max-w-3xl flex-1">
                <PracticeSetupBanner
                  status={setupStatus}
                  practice={currentPractice}
                  details={setupDetails ?? null}
                  onSaveBasics={handleSaveBasics}
                  onSaveContact={handleSaveContact}
                  servicesSlot={servicesSlot}
                  payoutsSlot={payoutsSlot}
                  logoFiles={logoFiles}
                  logoUploading={logoUploading}
                  logoUploadProgress={logoUploadProgress}
                  onLogoChange={handleLogoChange}
                />
              </Page>
            </div>
          </div>

          {/* Right: Public Preview */}
          <div className="flex w-full shrink-0 flex-col items-center gap-5 border-t border-light-border bg-gradient-to-b from-white via-gray-50 to-gray-100 px-4 py-6 dark:border-dark-border dark:from-dark-bg dark:via-dark-bg/80 dark:to-dark-bg lg:w-[420px] lg:border-t-0 lg:border-l">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500 dark:text-gray-400">
              Public preview
            </div>
            <div className="inline-flex gap-1 rounded-full border border-gray-200 bg-white/80 p-1 text-xs font-semibold text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/70">
              {previewTabOptions.map((option) => {
                const isActive = previewTab === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPreviewTab(option.id)}
                    className={cn(
                      'rounded-full px-3 py-1 transition',
                      isActive
                        ? 'bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900'
                        : 'text-gray-600 hover:text-gray-900 dark:text-white/70 dark:hover:text-white'
                    )}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="relative aspect-[9/19.5] w-full max-w-[360px] overflow-hidden rounded-[36px] border border-gray-900/70 bg-black shadow-[0_40px_80px_rgba(15,23,42,0.55)] dark:border-white/10">
              {renderPreviewContent()}
              <div className="pointer-events-none absolute inset-0 rounded-[36px] ring-1 ring-white/10" aria-hidden="true" />
            </div>
            <p className="max-w-xs text-center text-xs text-gray-500 dark:text-gray-400">
              This live preview matches exactly what clients see on your public link.
            </p>
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
            onClose={() => navigate(workspaceBasePath)}
            onSelectConversation={(conversationId) => {
              navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
            }}
            onSendMessage={() => handleStartConversation('ASK_QUESTION')}
          />
        );
      case 'matters':
        return mattersView ?? (
          <div className="flex flex-1 flex-col rounded-[32px] bg-light-bg dark:bg-dark-bg">
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Matters</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Your active matters will appear here once a practice connects them to your account.
              </p>
            </div>
            <div className="mx-6 mb-6 rounded-2xl border border-light-border bg-light-card-bg p-5 shadow-[0_16px_32px_rgba(15,23,42,0.12)] dark:border-dark-border dark:bg-dark-card-bg">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">No matters yet</div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Start a conversation to open a new matter with the practice.
              </div>
            </div>
          </div>
        );
      case 'clients':
        return clientsView ?? (
          <div className="flex flex-1 flex-col rounded-[32px] bg-light-bg dark:bg-dark-bg">
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Clients</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Manage your practice clients here.
              </p>
            </div>
          </div>
        );
      case 'conversation':
      default:
        return chatView;
    }
  };

  const showBottomNav = workspace !== 'practice'
    ? true
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
    <ConversationListView
      conversations={conversations}
      previews={conversationPreviews}
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      isLoading={isConversationsLoading}
      onClose={() => navigate(workspaceBasePath)}
      onSelectConversation={(conversationId) => {
        navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
      }}
      onSendMessage={() => handleStartConversation('ASK_QUESTION')}
      showBackButton={false}
    />
  );

  const showListOnMobile = view === 'list';
  const showChatOnMobile = view === 'conversation';
  const isSplitView = isPracticeWorkspace && (view === 'list' || view === 'conversation');
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    );

  const isPublicShell = workspace !== 'practice';

  const mainShell = isPublicShell ? (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col rounded-[32px] border border-light-border bg-light-bg shadow-[0_0_0_1px_rgba(15,23,42,0.18)] dark:border-white/30 dark:bg-dark-bg dark:shadow-[0_0_0_1px_rgba(255,255,255,0.14)] overflow-hidden">
        {header && (
          <div className={cn('w-full', headerClassName)}>
            {header}
          </div>
        )}
        <div className="min-h-0 flex-1">{mainContent}</div>
        {bottomNav && (
          <div className="mt-auto">
            {bottomNav}
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="flex h-full min-h-0 w-full flex-col">
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
      className="bg-light-bg dark:bg-dark-bg h-dvh"
      sidebar={sidebarNav}
      main={mainShell}
      mainClassName={cn('min-h-0 overflow-hidden', !isPublicShell && showBottomNav ? 'pb-20 md:pb-0' : undefined)}
      bottomBar={isPublicShell ? undefined : bottomNav}
      bottomBarClassName={!isPublicShell && showBottomNav ? 'md:hidden fixed inset-x-0 bottom-0 z-40' : undefined}
    />
  );
};

export default WorkspacePage;
