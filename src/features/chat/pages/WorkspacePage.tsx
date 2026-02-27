import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import axios from 'axios';
import { useNavigation } from '@/shared/utils/navigation';
import { SessionNotReadyError } from '@/shared/types/errors';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import WorkspaceNav, { type WorkspaceNavTab } from '@/features/chat/views/WorkspaceNav';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { SplitView } from '@/shared/ui/layout/SplitView';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { Page } from '@/shared/ui/layout/Page';
import { Button } from '@/shared/ui/Button';
import { SegmentedToggle } from '@/shared/ui/input';
import { cn } from '@/shared/utils/cn';
import { useConversations } from '@/shared/hooks/useConversations';
import { fetchLatestConversationMessage, updateConversationMetadata } from '@/shared/lib/conversationApi';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import {
  PracticeSetup,
  type BasicsFormValues,
  type ContactFormValues,
  type OnboardingProgressSnapshot,
  type OnboardingSaveActionsSnapshot,
} from '@/features/practice-setup/components/PracticeSetup';
import SetupInfoPanel from '@/features/practice-setup/components/SetupInfoPanel';
import { resolvePracticeSetupStatus } from '@/features/practice-setup/utils/status';
import { CompletionRing } from '@/shared/ui/CompletionRing';
import { ContactForm } from '@/features/intake/components/ContactForm';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { PlaceholderPage } from '@/shared/components/PlaceholderPage';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { createConnectedAccount, getOnboardingStatusPayload } from '@/shared/lib/apiClient';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import type { ChatMessageUI } from '../../../../worker/types';
import type { ConversationMode } from '@/shared/types/conversation';
import type { LayoutMode } from '@/app/MainApp';

type WorkspaceView = 'home' | 'setup' | 'list' | 'conversation' | 'matters' | 'clients';
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
  onStartNewConversation: (
    mode: ConversationMode,
    preferredConversationId?: string,
    options?: { forceCreate?: boolean; silentSessionNotReady?: boolean }
  ) => Promise<string>;
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

const hasIntakeContactStarted = (messages: ChatMessageUI[]): boolean => {
  return messages.some((message) => {
    const meta = message.metadata;
    if (meta?.isContactFormSubmission === true) return true;
    if (meta?.intakeOpening === true) return true;
    if (meta?.intakeDecisionPrompt === true) return true;
    if (meta?.intakeSubmitted === true) return true;
    if (meta?.contactDetails && typeof meta.contactDetails === 'object') return true;
    if (meta?.intakeComplete === true) return true;
    return false;
  });
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
  const [setupSidebarView, setSetupSidebarView] = useState<'info' | 'preview'>('info');
  const [draftBasics, setDraftBasics] = useState<BasicsFormValues | null>(null);
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingProgressSnapshot | null>(null);
  const [onboardingSaveActions, setOnboardingSaveActions] = useState<OnboardingSaveActionsSnapshot>({
    canSave: false,
    isSaving: false,
    saveError: null,
  });
  const handleOnboardingSaveActionsChange = useCallback((next: OnboardingSaveActionsSnapshot) => {
    setOnboardingSaveActions((prev) => {
      if (
        prev.canSave === next.canSave &&
        prev.isSaving === next.isSaving &&
        prev.saveError === next.saveError &&
        prev.onSaveAll === next.onSaveAll
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const [paymentPreference, setPaymentPreference] = useState<'yes' | 'no' | null>(null);
  const [onboardingConversationId, setOnboardingConversationId] = useState<string | null>(null);
  const [onboardingConversationRetryTick, setOnboardingConversationRetryTick] = useState(0);
  const onboardingConversationInitRef = useRef(false);
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const intakeContactStarted = useMemo(
    () => hasIntakeContactStarted(messages),
    [messages]
  );
  const isPracticeWorkspace = workspace === 'practice';
  const isClientFacingWorkspace = workspace === 'public' || workspace === 'client';

  const workspaceBasePath = useMemo(() => {
    if (workspace === 'practice') {
      return practiceSlug ? `/practice/${encodeURIComponent(practiceSlug)}` : '/';
    }
    if (workspace === 'client') {
      return practiceSlug ? `/client/${encodeURIComponent(practiceSlug)}` : '/';
    }
    return practiceSlug ? `/public/${encodeURIComponent(practiceSlug)}` : '/';
  }, [workspace, practiceSlug]);
  const conversationsPath = useMemo(() => {
    if (workspaceBasePath === '/') {
      return '/conversations';
    }
    return `${workspaceBasePath}/conversations`;
  }, [workspaceBasePath]);
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
    enabled: shouldListConversations && Boolean(practiceId),
    allowAnonymous: workspace === 'public'
  });
  const { session, isPending: isSessionPending } = useSessionContext();

  useEffect(() => {
    onboardingConversationInitRef.current = false;
    setOnboardingConversationId(null);
    setOnboardingConversationRetryTick(0);
  }, [practiceId]);

  const onboardingConversationFromList = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    const match = conversations.find((conversation) => {
      const mode = conversation.user_info?.mode;
      return mode === 'PRACTICE_ONBOARDING';
    });
    return match?.id ?? null;
  }, [conversations, isPracticeWorkspace]);

  const createOnboardingConversation = useCallback(async (): Promise<string> => {
    if (!practiceId) throw new Error('Practice context is required');
    const userId = session?.user?.id;
    if (!userId) throw new SessionNotReadyError();

    const params = new URLSearchParams({ practiceId });
    const response = await fetch(`/api/conversations?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        participantUserIds: [userId],
        metadata: { source: 'chat', mode: 'PRACTICE_ONBOARDING', title: 'Practice setup' },
        practiceId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json() as { success?: boolean; data?: { id?: string }; error?: string };
    const conversationId = data.data?.id;
    if (!data.success || !conversationId) {
      throw new Error(data.error || 'Failed to create onboarding conversation');
    }

    await updateConversationMetadata(conversationId, practiceId, {
      mode: 'PRACTICE_ONBOARDING',
      title: 'Practice setup',
      source: 'chat',
    });
    return conversationId;
  }, [practiceId, session?.user?.id]);

  useEffect(() => {
    if (!isPracticeWorkspace || view !== 'setup' || !practiceId) return;
    if (isSessionPending) return;
    if (!session?.user?.id) return;
    if (isConversationsLoading) return;
    if (onboardingConversationId) return;
    if (onboardingConversationFromList) {
      setOnboardingConversationId(onboardingConversationFromList);
      onboardingConversationInitRef.current = true;
      return;
    }
    if (onboardingConversationInitRef.current) return;
    onboardingConversationInitRef.current = true;
    void (async () => {
      try {
        const createdId = await createOnboardingConversation();
        setOnboardingConversationId(createdId);
        void refreshConversations();
      } catch (error) {
        onboardingConversationInitRef.current = false;
        const isSessionNotReady =
          (error instanceof Error && error.name === 'SessionNotReadyError') ||
          (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'SessionNotReadyError');
        if (isSessionNotReady) {
          // Background onboarding thread creation can race session hydration.
          // Retry shortly on a state tick so the effect re-runs deterministically.
          setTimeout(() => {
            setOnboardingConversationRetryTick((tick) => tick + 1);
          }, 500);
        } else {
          console.warn('[WorkspacePage] Failed to create onboarding conversation', error);
        }
      }
    })();
  }, [createOnboardingConversation, isConversationsLoading, isPracticeWorkspace, isSessionPending, onboardingConversationFromList, onboardingConversationId, onboardingConversationRetryTick, practiceId, refreshConversations, session?.user?.id, view]);

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
    if (workspace === 'practice' && (isSessionPending || !session?.user?.id)) {
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
  }, [practiceId, conversations, isSessionPending, session?.user?.id, view, workspace]);

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
  const { showSuccess, showError } = useToastContext();
  const handleOnboardingMessageError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Onboarding chat error';
    showError('Onboarding', message);
  }, [showError]);
  const onboardingMessageHandling = useMessageHandling({
    practiceId: currentPractice?.id ?? practiceId,
    practiceSlug: practiceSlug ?? undefined,
    conversationId: onboardingConversationId ?? undefined,
    mode: 'PRACTICE_ONBOARDING',
    onError: handleOnboardingMessageError,
  });
  const {
    details: setupDetails,
    updateDetails: updateSetupDetails,
    fetchDetails: fetchSetupDetails,
  } = usePracticeDetails(currentPractice?.id ?? null, null, false);
  const setupStatus = resolvePracticeSetupStatus(currentPractice, setupDetails ?? null);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  useEffect(() => {
    if (!currentPractice?.id) return;
    void fetchSetupDetails();
  }, [currentPractice?.id, fetchSetupDetails]);

  const forcePreviewReload = useCallback(() => {
    setPreviewReloadKey(prev => prev + 1);
  }, []);

  const handleSaveBasics = useCallback(async (
    values: BasicsFormValues,
    options?: { suppressSuccessToast?: boolean }
  ) => {
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
        if (!options?.suppressSuccessToast) {
          showSuccess('Basics updated', 'Your public profile reflects the newest info.');
        }
        forcePreviewReload();
      } else {
        if (!options?.suppressSuccessToast) {
          showSuccess('Up to date', 'Your firm basics already match these details.');
        }
      }
    } catch (error) {
      showError('Basics update failed', error instanceof Error ? error.message : 'Unable to save basics.');
      throw error;
    }
  }, [currentPractice, forcePreviewReload, setupDetails?.accentColor, setupDetails?.introMessage, showError, showSuccess, updatePractice, updateSetupDetails]);

  const handleSaveContact = useCallback(async (
    values: ContactFormValues,
    options?: { suppressSuccessToast?: boolean }
  ) => {
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
      const { detailsPayload } = buildPracticeProfilePayloads({
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
      await updateSetupDetails(detailsPayload);
      if (!options?.suppressSuccessToast) {
        showSuccess('Contact info updated', 'Clients and receipts will use your latest details.');
      }
      forcePreviewReload();
    } catch (error) {
      showError('Contact update failed', error instanceof Error ? error.message : 'Unable to save contact info.');
      throw error;
    }
  }, [currentPractice, forcePreviewReload, showError, showSuccess, updateSetupDetails]);

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

  const handleSaveOnboardingServices = useCallback(async (
    nextServices: Array<{ name: string; description?: string; key?: string }>
  ) => {
    const apiServices = nextServices
      .map((service) => ({
        id: (service.key ?? service.name).trim(),
        name: service.name.trim(),
        ...(service.description?.trim() ? { description: service.description.trim() } : {}),
      }))
      .filter((service) => service.id && service.name);

    const { detailsPayload } = buildPracticeProfilePayloads({ services: apiServices });
    await updateSetupDetails(detailsPayload);
    forcePreviewReload();
  }, [forcePreviewReload, updateSetupDetails]);

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

  const payoutDetailsSubmitted = stripeStatus?.details_submitted === true;
  const stripeHasAccount = Boolean(stripeStatus?.stripe_account_id);
  const paymentQuestionAnswered = paymentPreference !== null || payoutDetailsSubmitted || stripeHasAccount;
  const progressFields = onboardingProgress?.fields ?? {};
  const persistedServiceCount = (() => {
    const sources = [progressFields.services, setupDetails?.services, currentPractice?.services];
    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      const count = source.filter((service) => {
        const row = (service ?? {}) as Record<string, unknown>;
        const name = typeof row.name === 'string'
          ? row.name
          : (typeof row.title === 'string' ? row.title : '');
        return name.trim().length > 0;
      }).length;
      if (count > 0) return count;
    }
    return 0;
  })();
  const persistedServiceNames = (() => {
    const sources = [progressFields.services, setupDetails?.services, currentPractice?.services];
    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      const names = source
        .map((service) => {
          const row = (service ?? {}) as Record<string, unknown>;
          const name = typeof row.name === 'string'
            ? row.name
            : (typeof row.title === 'string' ? row.title : '');
          return name.trim();
        })
        .filter((name): name is string => name.length > 0);
      if (names.length > 0) return names;
    }
    return [] as string[];
  })();
  const strongName = (progressFields.name ?? draftBasics?.name ?? currentPractice?.name ?? '').trim();
  const strongDescription = (progressFields.description ?? setupDetails?.description ?? currentPractice?.description ?? '').trim();
  const strongServicesCount = Math.max(
    persistedServiceCount,
    setupStatus.servicesComplete ? 1 : 0
  );
  const strongLogoReady = Boolean(currentPractice?.logo);
  const previewStrongReady = Boolean(
    strongName &&
    strongDescription &&
    strongServicesCount > 0 &&
    strongLogoReady &&
    paymentQuestionAnswered
  );
  const showSidebarPreview = (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) && setupSidebarView === 'preview';
  const websiteValue = (progressFields.website ?? setupDetails?.website ?? currentPractice?.website ?? '').trim();
  const phoneValue = (progressFields.contactPhone ?? setupDetails?.businessPhone ?? currentPractice?.businessPhone ?? '').trim();
  const emailValue = (progressFields.businessEmail ?? setupDetails?.businessEmail ?? currentPractice?.businessEmail ?? '').trim();
  const introMessageValue = (progressFields.introMessage ?? setupDetails?.introMessage ?? currentPractice?.introMessage ?? '').trim();
  const accentColorValue = (progressFields.accentColor ?? setupDetails?.accentColor ?? currentPractice?.accentColor ?? '').trim();
  const addressCandidate = (progressFields.address ?? setupDetails?.address ?? currentPractice?.address ?? null) as Record<string, unknown> | null;
  const addressLine1 = typeof addressCandidate?.address === 'string'
    ? addressCandidate.address.trim()
    : typeof addressCandidate?.line1 === 'string'
      ? addressCandidate.line1.trim()
      : '';
  const addressCity = typeof addressCandidate?.city === 'string' ? addressCandidate.city.trim() : '';
  const addressState = typeof addressCandidate?.state === 'string' ? addressCandidate.state.trim() : '';
  const addressPostal = typeof addressCandidate?.postalCode === 'string'
    ? addressCandidate.postalCode.trim()
    : typeof addressCandidate?.postal_code === 'string'
      ? addressCandidate.postal_code.trim()
      : '';
  const addressParts = [addressLine1, [addressCity, addressState].filter(Boolean).join(', '), addressPostal].filter(Boolean);
  const addressValue = addressParts.join(' ').trim();
  const paymentStatusValue = stripeHasAccount || payoutDetailsSubmitted
    ? 'Enabled'
    : paymentPreference === 'yes'
      ? 'Yes (setup started)'
      : paymentPreference === 'no'
        ? 'Not now'
        : 'Not answered';
  const fieldRows = [
    { key: 'name', label: 'Practice name', done: Boolean(strongName), value: strongName || 'Not provided' },
    { key: 'description', label: 'Description', done: Boolean(strongDescription), value: strongDescription || 'Not provided' },
    {
      key: 'services',
      label: 'Services',
      done: strongServicesCount > 0,
      value: strongServicesCount > 0 ? `${strongServicesCount} added` : 'Not provided',
      listValues: persistedServiceNames.length > 0 ? persistedServiceNames : undefined,
    },
    { key: 'website', label: 'Website', done: Boolean(websiteValue), value: websiteValue || 'Not provided' },
    { key: 'contactPhone', label: 'Phone', done: Boolean(phoneValue), value: phoneValue || 'Not provided' },
    { key: 'businessEmail', label: 'Email', done: Boolean(emailValue), value: emailValue || 'Not provided' },
    { key: 'address', label: 'Address', done: Boolean(addressLine1 && addressCity && addressState), value: addressValue || 'Not provided' },
    { key: 'introMessage', label: 'Intro message', done: Boolean(introMessageValue), value: introMessageValue || 'Not provided' },
    { key: 'accentColor', label: 'Accent color', done: Boolean(accentColorValue), value: accentColorValue || 'Not provided' },
    { key: 'logo', label: 'Logo', done: strongLogoReady, value: strongLogoReady ? 'Uploaded' : 'Not uploaded' },
    { key: 'payouts', label: 'Payments', done: paymentQuestionAnswered, value: paymentStatusValue },
  ] as const;
  const setupInfoPanelProps = {
    fieldRows,
    canSaveAll: onboardingSaveActions.canSave,
    isSavingAll: onboardingSaveActions.isSaving,
    saveAllError: onboardingSaveActions.saveError,
    onSaveAll: onboardingSaveActions.onSaveAll,
    paymentPreference,
    stripeHasAccount,
    payoutDetailsSubmitted,
    isStripeSubmitting,
    isStripeLoading,
    stripeStatus,
    onSetPaymentPreference: setPaymentPreference,
    onStartStripeOnboarding: handleStartStripeOnboarding,
  } as const;

  useEffect(() => {
    if (stripeHasAccount || payoutDetailsSubmitted) {
      setPaymentPreference((prev) => prev ?? 'yes');
    }
  }, [payoutDetailsSubmitted, stripeHasAccount]);

  useEffect(() => {
    if (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) {
      setSetupSidebarView((prev) => (prev === 'info' || prev === 'preview' ? prev : 'preview'));
      return;
    }
    setSetupSidebarView('info');
  }, [previewStrongReady, onboardingProgress?.completionScore]);

  if (!allowed) {
    return null;
  }

  const handleStartConversation = async (mode: ConversationMode) => {
    try {
      const shouldReuseConversation = mode !== 'REQUEST_CONSULTATION';
      const latestConversation = shouldReuseConversation && conversations.length > 0
        ? [...conversations].sort((a, b) => {
            const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
            const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
            return bTime - aTime;
          })[0]
        : null;

      const preferredConversationId = shouldReuseConversation ? latestConversation?.id : undefined;
      // In embedded public widget mode, reuse the bootstrapped/current conversation
      // to avoid an extra create-conversation round-trip right after bootstrap.
      // Other surfaces keep the fresh-thread behavior for consultation CTA.
      const forceCreate = mode === 'REQUEST_CONSULTATION'
        ? !(workspace === 'public' && layoutMode === 'widget')
        : !preferredConversationId;

      const conversationId = await onStartNewConversation(
        mode,
        preferredConversationId,
        forceCreate ? { forceCreate: true } : undefined
      );
      navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
    } catch (error) {
      // "Session not ready" — the toast was already shown by MainApp, so finish gracefully.
      if (error instanceof SessionNotReadyError) return;
      console.error('[WorkspacePage] Failed to start conversation:', error);
      showError('Unable to start conversation', 'Please try again in a moment.');
    }
  };

  const handleOpenRecentMessage = () => {
    if (recentMessage?.conversationId) {
      navigate(`${conversationsPath}/${encodeURIComponent(recentMessage.conversationId)}`);
      return;
    }
    navigate(conversationsPath);
  };

  const renderContent = () => {
    if (workspace === 'practice' && view === 'setup') {
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
          <div className="relative flex w-full flex-col bg-transparent lg:min-h-0 lg:flex-1 lg:basis-1/2 lg:overflow-hidden">
            <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
              <Page className="w-full flex-1">
                <PracticeSetup
                  status={setupStatus}
                  payoutsCompleteOverride={stripeHasAccount || payoutDetailsSubmitted}
                  practice={currentPractice}
                  details={setupDetails ?? null}
                  onSaveBasics={handleSaveBasics}
                  onSaveContact={handleSaveContact}
                  onSaveServices={handleSaveOnboardingServices}
                  logoUploading={logoUploading}
                  logoUploadProgress={logoUploadProgress}
                  onLogoChange={handleLogoChange}
                  onBasicsDraftChange={setDraftBasics}
                  onProgressChange={setOnboardingProgress}
                  onSaveActionsChange={handleOnboardingSaveActionsChange}
                  chatAdapter={onboardingConversationId ? {
                    messages: onboardingMessageHandling.messages,
                    sendMessage: onboardingMessageHandling.sendMessage,
                    messagesReady: onboardingMessageHandling.messagesReady,
                    isSocketReady: onboardingMessageHandling.isSocketReady,
                    hasMoreMessages: onboardingMessageHandling.hasMoreMessages,
                    isLoadingMoreMessages: onboardingMessageHandling.isLoadingMoreMessages,
                    onLoadMoreMessages: onboardingMessageHandling.loadMoreMessages,
                    onToggleReaction: onboardingMessageHandling.toggleMessageReaction,
                    onRequestReactions: onboardingMessageHandling.requestMessageReactions,
                  } : null}
                />
              </Page>
            </div>
          </div>

          {/* Right: Public Preview */}
          <div className="relative flex w-full flex-col items-center gap-5 border-t border-line-glass/30 bg-transparent px-4 py-6 lg:min-h-0 lg:flex-1 lg:basis-1/2 lg:border-t-0 lg:border-l lg:border-l-line-glass/30">
            <div className="relative flex w-full flex-col items-center gap-5">
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-input-placeholder">
                {showSidebarPreview ? 'Public preview' : 'Setup progress'}
              </div>
              {!showSidebarPreview && (
                <CompletionRing score={onboardingProgress?.completionScore ?? 0} size={46} strokeWidth={3} />
              )}
            </div>
            {showSidebarPreview ? (
              <SegmentedToggle<PreviewTab>
                className="w-full max-w-[360px]"
                value={previewTab}
                options={previewTabOptions.map((option) => ({
                  value: option.id,
                  label: option.label
                }))}
                onChange={setPreviewTab}
                ariaLabel="Public preview tabs"
              />
            ) : null}
            <div
              className={cn(
                'relative aspect-[9/19.5] w-full max-w-[360px] overflow-hidden',
                showSidebarPreview ? 'glass-card shadow-glass' : 'glass-panel'
              )}
            >
              {showSidebarPreview ? (
                renderPreviewContent()
              ) : (
                <SetupInfoPanel {...setupInfoPanelProps} embedded className="h-full overflow-y-auto p-4" />
              )}
              {showSidebarPreview ? (
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/10" aria-hidden="true" />
              ) : null}
            </div>
            </div>
          </div>
        </div>
      );
    }

    switch (view) {
      case 'home':
        if (workspace === 'practice') {
          return (
            <div className="flex h-full min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <PlaceholderPage
                  title={`${practiceName || currentPractice?.name || 'Practice'} dashboard`}
                  sections={[
                    {
                      title: 'Practice setup',
                      content: (
                        <div className="pt-1">
                          <Button size="sm" onClick={() => navigate(`${workspaceBasePath}/setup`)}>
                            Open setup
                          </Button>
                        </div>
                      )
                    }
                  ]}
                />
              </div>
            </div>
          );
        }
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
            showConsultationCard={!intakeContactStarted}
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
      case 'setup':
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
            showConsultationCard={!intakeContactStarted}
          />
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
    : (showClientTabs || showPracticeTabs || view === 'home' || view === 'setup' || view === 'list' || view === 'matters' || view === 'clients');
  const activeTab = view === 'list' || view === 'conversation'
    ? 'messages'
    : view === 'matters'
    ? 'matters'
    : view === 'clients'
    ? 'clients'
    : view === 'setup'
    ? 'home'
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
      navigate(`${workspaceBasePath}/settings`);
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
  const isWidgetShell = layoutMode === 'widget';

  const publicShellFrameClass = workspace === 'public' || workspace === 'client'
    ? 'bg-transparent border-line-glass/30'
    : 'bg-white/[0.08] border-line-glass/30 backdrop-blur-xl shadow-glass';

  const mainShell = isPublicShell ? (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
        isWidgetShell ? 'rounded-none border-0 shadow-none bg-transparent' : 'rounded-3xl border',
        isWidgetShell ? undefined : publicShellFrameClass
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
      accentBackdropVariant="workspace"
      sidebar={sidebarNav}
      main={mainShell}
      mainClassName={cn('min-h-0 h-full overflow-hidden', !isPublicShell && showBottomNav ? 'pb-20 md:pb-0' : undefined)}
      bottomBar={isPublicShell ? undefined : bottomNav}
      bottomBarClassName={!isPublicShell && showBottomNav ? 'md:hidden fixed inset-x-0 bottom-0 z-40 bg-transparent' : undefined}
    />
  );
};

export default WorkspacePage;
