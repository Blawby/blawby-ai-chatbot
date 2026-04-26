import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { isHttpError, isAbortError } from '@/shared/lib/apiClient';
import { SessionNotReadyError } from '@/shared/types/errors';
import { usePracticeBillingData, type BillingWindow } from '@/features/practice-dashboard/hooks/usePracticeBillingData';
import {
  createConnectedAccount,
  getOnboardingStatusPayload,
} from '@/shared/lib/apiClient';
import { updateConversationMetadata } from '@/shared/lib/conversationApi';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import {
  type BasicsFormValues,
  type ContactFormValues,
  type OnboardingProgressSnapshot,
} from '@/features/practice-setup/types';
import { resolvePracticeSetupStatus } from '@/features/practice-setup/utils/status';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import type { Conversation } from '@/shared/types/conversation';
import type { ComboboxOption } from '@/shared/ui/input';

type UseWorkspaceSetupInput = {
  practiceId: string;
  practiceSlug: string | null;
  isPracticeWorkspace: boolean;
  view: string;
  sessionUserId: string | null;
  isAnonymous: boolean;
  isSessionPending: boolean;
  isConversationsLoading: boolean;
  resolvedConversations: Conversation[];
  refreshConversations: () => void;
  workspaceSection: string;
  session: { user?: { id?: string; email?: string } | null } | null;
  mattersData: { isLoaded: boolean; items: unknown[] };
  showError: (title: string, message?: string) => void;
  showSuccess: (title: string, message?: string) => void;
};

export const useWorkspaceSetup = ({
  practiceId,
  practiceSlug,
  isPracticeWorkspace,
  view,
  sessionUserId,
  isAnonymous,
  isSessionPending,
  isConversationsLoading,
  resolvedConversations,
  refreshConversations,
  workspaceSection,
  session,
  mattersData,
  showError,
  showSuccess,
}: UseWorkspaceSetupInput) => {
  const [draftBasics, setDraftBasics] = useState<BasicsFormValues | null>(null);
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingProgressSnapshot | null>(null);
  const [paymentPreference, setPaymentPreference] = useState<'yes' | 'no' | null>(null);
  const [onboardingConversationId, setOnboardingConversationId] = useState<string | null>(null);
  const [onboardingConversationRetryTick, setOnboardingConversationRetryTick] = useState(0);
  const onboardingConversationInitRef = useRef(false);

  const resetForPracticeId = useCallback(() => {
    onboardingConversationInitRef.current = false;
    setOnboardingConversationId(null);
    setOnboardingConversationRetryTick(0);
  }, []);

  const onboardingConversationFromList = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    const match = resolvedConversations.find((conversation) => {
      const mode = conversation.user_info?.mode;
      return mode === 'PRACTICE_ONBOARDING';
    });
    return match?.id ?? null;
  }, [resolvedConversations, isPracticeWorkspace]);

  const createOnboardingConversation = useCallback(async (): Promise<string> => {
    if (!practiceId) throw new Error('Practice context is required');
    if (!sessionUserId || isAnonymous) throw new SessionNotReadyError();

    const params = new URLSearchParams({ practiceId });
    const response = await fetch(`/api/conversations?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        participantUserIds: [sessionUserId],
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
  }, [isAnonymous, practiceId, sessionUserId]);

  useEffect(() => {
    if (!isPracticeWorkspace || view !== 'setup' || !practiceId) return;
    if (isSessionPending) return;
    if (!sessionUserId || isAnonymous) return;
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
  }, [createOnboardingConversation, isAnonymous, isConversationsLoading, isPracticeWorkspace, isSessionPending, onboardingConversationFromList, onboardingConversationId, onboardingConversationRetryTick, practiceId, refreshConversations, sessionUserId, view]);

  const { currentPractice, updatePractice } = usePracticeManagement({ fetchOnboardingStatus: false });

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

  const { setupFields, applySetupFields } = onboardingMessageHandling;
  const setupStatus = resolvePracticeSetupStatus(currentPractice, setupDetails ?? null);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [dashboardWindow, setDashboardWindow] = useState<BillingWindow>('7d');

  const workspacePracticeId = practiceId ?? currentPractice?.id ?? null;

  const {
    summaryStats,
    recentActivity,
    loading: practiceBillingLoading,
    error: practiceBillingError,
  } = usePracticeBillingData({
    practiceId: isPracticeWorkspace ? (currentPractice?.id ?? practiceId ?? null) : null,
    enabled: isPracticeWorkspace && view === 'home',
    matterLimit: 25,
    windowSize: dashboardWindow,
    matters: mattersData.isLoaded ? (mattersData.items as Parameters<typeof usePracticeBillingData>[0]['matters']) : undefined,
  });

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
    const accentSource = normalizeAccentColor(setupDetails?.accentColor ?? currentPractice?.accentColor);
    const accentChanged = normalizedAccentColor !== accentSource;

    try {
      if (Object.keys(practiceUpdates).length > 0) {
        await updatePractice(currentPractice.id, practiceUpdates);
      }
      if (accentChanged) {
        await updateSetupDetails({
          ...(accentChanged ? { accentColor: normalizedAccentColor } : {})
        });
      }
      if (Object.keys(practiceUpdates).length > 0 || accentChanged) {
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
  }, [currentPractice, forcePreviewReload, setupDetails?.accentColor, showError, showSuccess, updatePractice, updateSetupDetails]);

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
        description: values.description !== undefined ? normalize(values.description) : undefined,
        address: normalize(address.address ?? ''),
        apartment: normalize(address.apartment ?? ''),
        city: normalize(address.city ?? ''),
        state: normalize(address.state ?? ''),
        postalCode: normalize(address.postalCode ?? ''),
        country: normalize(address.country ?? '')
      });
      await updateSetupDetails(detailsPayload);
      if (!options?.suppressSuccessToast) {
        showSuccess('Contact info updated', 'Contacts and receipts will use your latest details.');
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
    nextServices: Array<{ name: string; key?: string }>
  ) => {
    const apiServices = nextServices
      .map((service) => ({
        id: (service.key ?? service.name).trim(),
        name: service.name.trim(),
      }))
      .filter((service) => service.id && service.name);

    const { detailsPayload } = buildPracticeProfilePayloads({ services: apiServices });
    await updateSetupDetails(detailsPayload);
    forcePreviewReload();
  }, [forcePreviewReload, updateSetupDetails]);

  const { members: practiceMembers } = usePracticeTeam(
    workspacePracticeId,
    session?.user?.id ?? null,
    { enabled: isPracticeWorkspace && Boolean(workspacePracticeId) }
  );

  const conversationMemberOptions = useMemo(
    () => practiceMembers
      .filter((member) => member.canMentionInternally)
      .map((member) => ({
        userId: member.userId,
        name: member.name?.trim() ?? '',
        email: member.email,
        image: member.image ?? null,
        role: member.role,
      }))
      .filter((member) => member.userId.trim().length > 0 && member.name.length > 0),
    [practiceMembers]
  );

  const matterAssigneeOptions = useMemo<ComboboxOption[]>(
    () => conversationMemberOptions.map((member) => ({
      value: member.userId,
      label: member.name,
      meta: member.email,
    })),
    [conversationMemberOptions]
  );

  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [_isStripeLoading, setIsStripeLoading] = useState(false);
  const [isStripeSubmitting, setIsStripeSubmitting] = useState(false);

  // Only fetch Stripe/onboarding status when the user is in settings or setup.
  // Fetching it on every workspace mount hammers the rate-limited API endpoint.
  const isSettingsSection = workspaceSection === 'settings';
  const shouldFetchStripeStatus = isSettingsSection || view === 'setup';

  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; });

  const refreshStripeStatus = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!workspacePracticeId || !shouldFetchStripeStatus) {
      setStripeStatus(null);
      return;
    }
    setIsStripeLoading(true);
    try {
      const payload = await getOnboardingStatusPayload(workspacePracticeId, { signal: options?.signal });
      const status = extractStripeStatusFromPayload(payload);
      setStripeStatus(status ?? null);
    } catch (error) {
      if (isAbortError(error)) return;
      if (isHttpError(error) && error.response.status === 404) {
        setStripeStatus(null);
        return;
      }
      console.warn('[WorkspacePage] Failed to load payout status:', error);
      showErrorRef.current('Payouts', 'Unable to load payout account status.');
    } finally {
      setIsStripeLoading(false);
    }
  // workspacePracticeId and shouldFetchStripeStatus are both stable primitives
  }, [workspacePracticeId, shouldFetchStripeStatus]);

  // Only fetch when workspacePracticeId changes and the current view needs Stripe status.
  useEffect(() => {
    if (!workspacePracticeId || !shouldFetchStripeStatus) return;
    const controller = new AbortController();
    void refreshStripeStatus({ signal: controller.signal });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePracticeId, shouldFetchStripeStatus]);

  const handleStartStripeOnboarding = useCallback(async () => {
    if (!workspacePracticeId) {
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
        practiceUuid: workspacePracticeId,
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

  }, [workspacePracticeId, currentPractice?.businessEmail, session?.user?.email, showError]);

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
  const strongName = (progressFields.name ?? draftBasics?.name ?? currentPractice?.name ?? '').trim();
  const strongDescription = (progressFields.description ?? '').trim();
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

  useEffect(() => {
    if (stripeHasAccount || payoutDetailsSubmitted) {
      setPaymentPreference((prev) => prev ?? 'yes');
    }
  }, [payoutDetailsSubmitted, stripeHasAccount]);

  return {
    // state
    draftBasics,
    setDraftBasics,
    onboardingProgress,
    setOnboardingProgress,
    paymentPreference,
    setPaymentPreference,
    onboardingConversationId,
    // refs
    onboardingConversationInitRef,
    resetForPracticeId,
    // practice data
    currentPractice,
    setupDetails,
    setupStatus,
    setupFields,
    applySetupFields,
    // team
    practiceMembers,
    conversationMemberOptions,
    matterAssigneeOptions,
    // billing / dashboard
    dashboardWindow,
    setDashboardWindow,
    summaryStats,
    recentActivity,
    practiceBillingLoading,
    practiceBillingError,
    // logo
    logoUploading,
    logoUploadProgress,
    // stripe
    stripeStatus,
    stripeHasAccount,
    payoutDetailsSubmitted,
    isStripeSubmitting,
    // computed
    paymentQuestionAnswered,
    previewStrongReady,
    strongName,
    strongDescription,
    strongServicesCount,
    strongLogoReady,
    // preview
    previewReloadKey,
    forcePreviewReload,
    // onboarding message handling
    onboardingMessageHandling,
    workspacePracticeId,
    // handlers
    handleSaveBasics,
    handleSaveContact,
    handleLogoChange,
    handleSaveOnboardingServices,
    handleStartStripeOnboarding,
  };
};
