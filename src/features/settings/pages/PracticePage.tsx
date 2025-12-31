import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import {
  ChevronRightIcon,
  GlobeAltIcon,
  MapPinIcon,
  PhoneIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { usePracticeManagement, type MatterWorkflowStatus, type Practice } from '@/shared/hooks/usePracticeManagement';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { Input, PhoneInput, Switch, Textarea, URLInput } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { useNavigation } from '@/shared/utils/navigation';
import { authClient } from '@/shared/lib/authClient';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { useLocation } from 'preact-iso';
import { useTranslation } from '@/shared/i18n/hooks';
import { getPracticeWorkspaceEndpoint } from '@/config/api';
import { StackedAvatars } from '@/shared/ui/profile';
import type { PracticeConfig } from '../../../../worker/types';

interface OnboardingDetails {
  contactPhone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  introMessage?: string;
  overview?: string;
  isPublic?: boolean;
  services?: Array<{ id: string; title: string; description: string }>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveOnboardingData = (practice: Practice | null): OnboardingDetails => {
  if (!practice) return {};
  const metadata = practice.metadata;
  if (!isPlainObject(metadata)) return {};
  const onboarding = metadata.onboarding;
  if (!isPlainObject(onboarding)) return {};
  const data = onboarding.data;
  if (!isPlainObject(data)) return {};
  return { ...(data as OnboardingDetails) };
};

const resolveConversationConfig = (practice: Practice | null): PracticeConfig | null => {
  if (!practice) return null;
  const metadata = practice.metadata;
  if (isPlainObject(metadata)) {
    const candidate = metadata.conversationConfig;
    if (isPlainObject(candidate)) {
      if ('availableServices' in candidate || 'serviceQuestions' in candidate || 'introMessage' in candidate) {
        return candidate as unknown as PracticeConfig;
      }
    }
  }
  const config = practice.config;
  if (isPlainObject(config)) {
    const nestedCandidate = (config as Record<string, unknown>).conversationConfig;
    if (isPlainObject(nestedCandidate)) {
      return nestedCandidate as unknown as PracticeConfig;
    }
    if ('availableServices' in config || 'serviceQuestions' in config || 'introMessage' in config) {
      return config as unknown as PracticeConfig;
    }
  }
  return null;
};

const resolveVoiceProvider = (value: unknown): PracticeConfig['voice']['provider'] => {
  if (value === 'cloudflare' || value === 'elevenlabs' || value === 'custom') {
    return value;
  }
  return 'cloudflare';
};

const buildBaseConversationConfig = (config: PracticeConfig | null): PracticeConfig => {
  const voice = isPlainObject(config?.voice) ? (config?.voice as Record<string, unknown>) : {};
  return {
    ownerEmail: typeof config?.ownerEmail === 'string' ? config.ownerEmail : undefined,
    availableServices: Array.isArray(config?.availableServices) ? config.availableServices : [],
    serviceQuestions: isPlainObject(config?.serviceQuestions)
      ? (config?.serviceQuestions as Record<string, string[]>)
      : {},
    domain: typeof config?.domain === 'string' ? config.domain : '',
    description: typeof config?.description === 'string' ? config.description : '',
    brandColor: typeof config?.brandColor === 'string' ? config.brandColor : '#000000',
    accentColor: typeof config?.accentColor === 'string' ? config.accentColor : '#000000',
    introMessage: typeof config?.introMessage === 'string' ? config.introMessage : '',
    profileImage: typeof config?.profileImage === 'string' ? config.profileImage : undefined,
    voice: {
      enabled: typeof voice.enabled === 'boolean' ? voice.enabled : false,
      provider: resolveVoiceProvider(voice.provider),
      voiceId: typeof voice.voiceId === 'string' ? voice.voiceId : null,
      displayName: typeof voice.displayName === 'string' ? voice.displayName : null,
      previewUrl: typeof voice.previewUrl === 'string' ? voice.previewUrl : null
    },
    metadata: isPlainObject(config?.metadata) ? (config?.metadata as Record<string, unknown>) : {}
  };
};

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
};

const formatAddressSummary = (data: OnboardingDetails) => {
  const line1 = data.addressLine1?.trim() || '';
  const line2 = data.addressLine2?.trim() || '';
  const city = data.city?.trim() || '';
  const state = data.state?.trim() || '';
  const postal = data.postalCode?.trim() || '';
  const country = data.country?.trim() || '';

  const parts: string[] = [];
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);
  const cityState = [city, state].filter(Boolean).join(', ');
  if (cityState) parts.push(cityState);
  const postalCountry = [postal, country].filter(Boolean).join(' ');
  if (postalCountry) parts.push(postalCountry);
  return parts.join(' • ');
};

interface PracticePageProps {
  className?: string;
  onNavigate?: (path: string) => void;
}

interface LeadSummary {
  id: string;
  title: string;
  matterType: string;
  status: MatterWorkflowStatus;
  priority: string;
  clientName?: string | null;
  leadSource?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PracticePage = ({ className = '', onNavigate }: PracticePageProps) => {
  const { data: session } = authClient.useSession();
  const { 
    currentPractice, 
    getMembers,
    loading, 
    error,
    updatePractice,
    createPractice,
    deletePractice,
    fetchMembers,
    refetch,
    acceptMatter,
    rejectMatter
  } = usePracticeManagement();
  
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const navigateTo = onNavigate ?? navigate;
  const location = useLocation();
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { t } = useTranslation(['settings']);
  
  // Get current user email from session
  const currentUserEmail = session?.user?.email || '';
  
  // Form states
  const [editPracticeForm, setEditPracticeForm] = useState({
    name: '',
    slug: '',
    description: ''
  });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    description: ''
  });
  
  const [isEditPracticeModalOpen, setIsEditPracticeModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [leadQueue, setLeadQueue] = useState<LeadSummary[]>([]);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [decisionLead, setDecisionLead] = useState<LeadSummary | null>(null);
  const [decisionAction, setDecisionAction] = useState<'accept' | 'reject' | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  const hasPractice = !!currentPractice;
  const members = useMemo(() => currentPractice ? getMembers(currentPractice.id) : [], [currentPractice, getMembers]);
  
  // Better approach - get role directly from current practice context
  const currentMember = useMemo(() => {
    if (!currentPractice || !currentUserEmail) return null;
    return members.find(m => m.email && m.email.toLowerCase() === currentUserEmail.toLowerCase()) || 
           members.find(m => m.userId === session?.user?.id);
  }, [currentPractice, currentUserEmail, members, session?.user?.id]);

  const currentUserRole = currentMember?.role || 'paralegal';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = (currentUserRole === 'admin' || isOwner) ?? false;
  const canReviewLeads = isAdmin || isOwner;
  const servicesList = useMemo(() => {
    const sanitize = (value: unknown) => {
      if (!Array.isArray(value)) return [];
      const seen = new Set<string>();
      const result: string[] = [];
      value.forEach((item) => {
        if (typeof item !== 'string') return;
        const trimmed = item.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(trimmed);
      });
      return result;
    };

    const metadata = currentPractice?.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const conversationConfig = (metadata as Record<string, unknown>).conversationConfig;
      if (conversationConfig && typeof conversationConfig === 'object' && !Array.isArray(conversationConfig)) {
        const list = sanitize((conversationConfig as Record<string, unknown>).availableServices);
        if (list.length) return list;
      }
    }
    const config = currentPractice?.config;
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const list = sanitize((config as Record<string, unknown>).availableServices);
      if (list.length) return list;
    }
    return [];
  }, [currentPractice]);
  const onboardingData = useMemo(() => resolveOnboardingData(currentPractice), [currentPractice]);
  const conversationConfig = useMemo(() => resolveConversationConfig(currentPractice), [currentPractice]);

  const websiteValue = typeof onboardingData.website === 'string' ? onboardingData.website.trim() : '';
  const addressSummary = formatAddressSummary(onboardingData);
  const phoneValue = (typeof onboardingData.contactPhone === 'string'
    ? onboardingData.contactPhone
    : (currentPractice?.businessPhone || '')).trim();
  const introMessageValue = typeof onboardingData.introMessage === 'string' && onboardingData.introMessage.trim()
    ? onboardingData.introMessage
    : (conversationConfig?.introMessage || '');
  const overviewValue = typeof onboardingData.overview === 'string' && onboardingData.overview.trim()
    ? onboardingData.overview
    : (conversationConfig?.description || '');
  const isPublicValue = typeof onboardingData.isPublic === 'boolean'
    ? onboardingData.isPublic
    : (typeof conversationConfig?.isPublic === 'boolean' ? conversationConfig.isPublic : false);
  const practiceUrlValue = currentPractice?.slug
    ? `ai.blawby.com/${currentPractice.slug}`
    : 'ai.blawby.com/your-practice';
  const overviewPreview = overviewValue ? truncateText(overviewValue, 140) : 'Not set';
  const descriptionValue = currentPractice?.description?.trim() || '';
  const descriptionPreview = descriptionValue ? truncateText(descriptionValue, 140) : 'Not set';
  const teamAvatars = useMemo(
    () => members.map((member) => ({
      name: member.name || member.email,
      image: member.image || null
    })),
    [members]
  );

  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isIntroModalOpen, setIsIntroModalOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    website: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  });
  const [introDraft, setIntroDraft] = useState('');
  const [overviewDraft, setOverviewDraft] = useState('');

  const loadLeadQueue = useCallback(async () => {
    if (!currentPractice?.id || !canReviewLeads) {
      setLeadQueue([]);
      return;
    }

    setLeadLoading(true);
    setLeadError(null);

    try {
      const endpoint = `${getPracticeWorkspaceEndpoint(currentPractice.id, 'matters')}?status=lead`;
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load leads (${response.status})`);
      }

      const payload = await response.json() as {
        success?: boolean;
        error?: string;
        data?: { items?: LeadSummary[]; matters?: LeadSummary[] };
      };

      if (payload.success === false) {
        throw new Error(payload.error || 'Failed to load leads');
      }

      const items = payload.data?.items || payload.data?.matters || [];
      setLeadQueue(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load leads';
      setLeadError(message);
    } finally {
      setLeadLoading(false);
    }
  }, [currentPractice?.id, canReviewLeads]);

  useEffect(() => {
    void loadLeadQueue();
  }, [loadLeadQueue]);

  const openDecisionModal = (lead: LeadSummary, action: 'accept' | 'reject') => {
    setDecisionLead(lead);
    setDecisionAction(action);
    setDecisionReason('');
  };

  const closeDecisionModal = (force = false) => {
    if (decisionSubmitting && !force) return;
    setDecisionLead(null);
    setDecisionAction(null);
    setDecisionReason('');
  };

  const handleDecision = async () => {
    if (!currentPractice?.id || !decisionLead || !decisionAction) return;
    setDecisionSubmitting(true);
    try {
      if (decisionAction === 'accept') {
        await acceptMatter(currentPractice.id, decisionLead.id);
        showSuccess('Lead accepted', 'The client has been notified.');
      } else {
        await rejectMatter(currentPractice.id, decisionLead.id, decisionReason);
        showSuccess('Lead rejected', 'The client has been notified.');
      }
      setDecisionSubmitting(false);
      closeDecisionModal(true);
      await loadLeadQueue();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update lead';
      showError('Action failed', message);
      setDecisionSubmitting(false);
    }
  };

  // SSR-safe origin for return URLs
  const origin = (typeof window !== 'undefined' && window.location)
    ? window.location.origin
    : '';

  // Subscription guard for deletion
  const hasManagedSub = Boolean(currentPractice?.stripeCustomerId);
  const subStatus = (currentPractice?.subscriptionStatus || 'none').toLowerCase();
  const deletionBlockedBySubscription = hasManagedSub && !(subStatus === 'canceled' || subStatus === 'none');
  const deletionBlockedMessage = (() => {
    if (!deletionBlockedBySubscription) return '';
    const ts = currentPractice?.subscriptionPeriodEnd;
    const end = (typeof ts === 'number' && Number.isFinite(ts)) ? new Date(ts * 1000) : null;
    if (end) {
      return `Subscription must be canceled before deleting. Access ends on ${formatDate(end)}.`;
    }
    return 'Subscription must be canceled in Stripe before deleting this practice.';
  })();


  // Current user email is now derived from session - removed redirect to keep practice settings accessible

  // Initialize form with current practice data
  useEffect(() => {
    if (currentPractice) {
      setEditPracticeForm({
        name: currentPractice.name,
        slug: currentPractice.slug || '',
        description: currentPractice.description || ''
      });
      
      // Fetch related data only once when practice changes
      const fetchMembersData = async () => {
        try {
          await fetchMembers(currentPractice.id);
        } catch (err) {
          showError(err?.message || String(err) || 'Failed to fetch practice members');
        }
      };
      
      fetchMembersData();
    }
  }, [currentPractice, fetchMembers, showError]);

  // Refetch after return from portal
  useEffect(() => {
    const syncParam = (() => {
      const q = (location as unknown as { query?: Record<string, unknown> } | undefined)?.query;
      if (q && typeof q === 'object' && 'sync' in q) {
        const v = (q as Record<string, unknown>)['sync'] as unknown;
        const val = Array.isArray(v) ? v[0] : (v as string | undefined);
        return val;
      }
      if (typeof window !== 'undefined') {
        return new URLSearchParams(window.location.search).get('sync') ?? undefined;
      }
      return undefined;
    })();
    if (String(syncParam) === '1' && currentPractice?.id) {
      refetch()
        .then(() => {
          showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        })
        .catch((error) => {
          console.error('Failed to refresh subscription:', error);
          // Don't show error toast - refetch failure is not critical
        })
        .finally(() => {
          // Remove sync param to prevent re-trigger (URL hygiene)
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('sync');
          window.history.replaceState({}, '', newUrl.toString());
        });
    }
  }, [location, currentPractice?.id, refetch, showSuccess]);

  const handleCreatePractice = async () => {
    if (!createForm.name.trim()) {
      showError('Practice name is required');
      return;
    }

    try {
      await createPractice({
        name: createForm.name,
        slug: createForm.slug || undefined,
        description: createForm.description || undefined,
      });
      
      showSuccess('Practice created successfully!');
      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '', description: '' });
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create practice');
    }
  };

  const openEditPracticeModal = () => {
    if (!currentPractice) return;
    setEditPracticeForm({
      name: currentPractice.name,
      slug: currentPractice.slug || '',
      description: currentPractice.description || ''
    });
    setOverviewDraft(overviewValue);
    setIsEditPracticeModalOpen(true);
  };

  const handleUpdatePractice = async () => {
    if (!currentPractice) return;

    setIsSettingsSaving(true);
    try {
      const metadataBase = isPlainObject(currentPractice.metadata)
        ? currentPractice.metadata
        : {};
      const onboardingBase = isPlainObject(metadataBase.onboarding)
        ? (metadataBase.onboarding as Record<string, unknown>)
        : {};
      const onboardingDataBase = isPlainObject(onboardingBase.data)
        ? (onboardingBase.data as Record<string, unknown>)
        : {};
      const trimmedOverview = overviewDraft.trim();
      const nextOnboardingData = {
        ...onboardingDataBase,
        overview: trimmedOverview
      };

      const baseConfig = buildBaseConversationConfig(conversationConfig);
      const nextConversationConfig: PracticeConfig = {
        ...baseConfig,
        description: trimmedOverview
      };

      await updatePractice(currentPractice.id, {
        ...editPracticeForm,
        metadata: {
          ...metadataBase,
          onboarding: {
            ...onboardingBase,
            data: nextOnboardingData
          },
          conversationConfig: nextConversationConfig
        }
      });
      showSuccess('Practice updated successfully!');
      setIsEditPracticeModalOpen(false);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update practice');
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const saveOnboardingSettings = async (
    updates: Partial<OnboardingDetails>,
    toastBody: string
  ) => {
    if (!currentPractice) return;
    setIsSettingsSaving(true);
    try {
      const metadataBase = isPlainObject(currentPractice.metadata)
        ? currentPractice.metadata
        : {};
      const onboardingBase = isPlainObject(metadataBase.onboarding)
        ? (metadataBase.onboarding as Record<string, unknown>)
        : {};
      const onboardingDataBase = isPlainObject(onboardingBase.data)
        ? (onboardingBase.data as Record<string, unknown>)
        : {};
      const nextOnboardingData = {
        ...onboardingDataBase,
        ...updates
      };

      const baseConfig = buildBaseConversationConfig(conversationConfig);
      const nextConversationConfig: PracticeConfig = {
        ...baseConfig,
        ...(typeof updates.introMessage === 'string' ? { introMessage: updates.introMessage } : {}),
        ...(typeof updates.isPublic === 'boolean' ? { isPublic: updates.isPublic } : {})
      };

      await updatePractice(currentPractice.id, {
        ...(typeof updates.contactPhone === 'string' ? { businessPhone: updates.contactPhone } : {}),
        metadata: {
          ...metadataBase,
          onboarding: {
            ...onboardingBase,
            data: nextOnboardingData
          },
          conversationConfig: nextConversationConfig
        }
      });

      showSuccess('Practice updated', toastBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update practice settings';
      showError('Update failed', message);
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const openContactModal = () => {
    setContactDraft({
      website: websiteValue,
      phone: phoneValue,
      addressLine1: onboardingData.addressLine1 || '',
      addressLine2: onboardingData.addressLine2 || '',
      city: onboardingData.city || '',
      state: onboardingData.state || '',
      postalCode: onboardingData.postalCode || '',
      country: onboardingData.country || ''
    });
    setIsContactModalOpen(true);
  };

  const openIntroModal = () => {
    setIntroDraft(introMessageValue);
    setIsIntroModalOpen(true);
  };

  const handleSaveContact = async () => {
    await saveOnboardingSettings(
      {
        website: contactDraft.website.trim(),
        contactPhone: contactDraft.phone.trim(),
        addressLine1: contactDraft.addressLine1.trim(),
        addressLine2: contactDraft.addressLine2.trim(),
        city: contactDraft.city.trim(),
        state: contactDraft.state.trim(),
        postalCode: contactDraft.postalCode.trim(),
        country: contactDraft.country.trim()
      },
      'Contact details updated.'
    );
    setIsContactModalOpen(false);
  };

  const handleSaveIntro = async () => {
    await saveOnboardingSettings(
      {
        introMessage: introDraft.trim()
      },
      'Intro message updated.'
    );
    setIsIntroModalOpen(false);
  };

  const handleTogglePublic = async (nextValue: boolean) => {
    await saveOnboardingSettings(
      {
        isPublic: nextValue
      },
      nextValue ? 'Practice is now public.' : 'Practice is now private.'
    );
  };

  const handleDeletePractice = async () => {
    if (!currentPractice) return;
    
    if (deleteConfirmText !== currentPractice.name) {
      showError('Practice name must match exactly');
      return;
    }

    try {
      await deletePractice(currentPractice.id);
      showSuccess('Practice deleted successfully!');
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      navigate('/');
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete practice');
    }
  };

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading practice...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Button size="sm" onClick={refetch}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Practice
        </h1>
        <div className="border-t border-gray-200 dark:border-dark-border mt-4" />
      </div>
      
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {hasPractice && (
            <>
              {/* Practice Details Row */}
              <div className="flex items-center justify-between py-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {currentPractice.name || 'Practice'}
                  </h3>
                  <div className="mt-2 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-start gap-3">
                      <span className="w-20 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        URL
                      </span>
                      <span>{practiceUrlValue}</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-20 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Overview
                      </span>
                      <span>{overviewPreview}</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-20 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Description
                      </span>
                      <span>{descriptionPreview}</span>
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openEditPracticeModal}
                  >
                    Edit
                  </Button>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Contact Row */}
              <div className="py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contact</h3>
                    <div className="mt-2 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-start gap-2">
                        <GlobeAltIcon className="w-4 h-4 text-gray-400 mt-0.5" aria-hidden="true" />
                        <span>{websiteValue || 'Not set'}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <PhoneIcon className="w-4 h-4 text-gray-400 mt-0.5" aria-hidden="true" />
                        <span>{phoneValue || 'Not set'}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5" aria-hidden="true" />
                        <span>{addressSummary || 'Not set'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={openContactModal}
                      className="hidden sm:inline-flex"
                    >
                      Manage
                    </Button>
                    <button
                      type="button"
                      onClick={openContactModal}
                      className="sm:hidden p-2 text-gray-500 dark:text-gray-400"
                      aria-label="Manage contact details"
                    >
                      <ChevronRightIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Intro Message Row */}
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Intro Message</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {introMessageValue ? truncateText(introMessageValue, 90) : 'Not set'}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={openIntroModal}
                      className="hidden sm:inline-flex"
                    >
                      Manage
                    </Button>
                    <button
                      type="button"
                      onClick={openIntroModal}
                      className="sm:hidden p-2 text-gray-500 dark:text-gray-400"
                      aria-label="Manage intro message"
                    >
                      <ChevronRightIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Services Row */}
              <div className="py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Services</h3>
                    {servicesList.length > 0 ? (
                      <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        {servicesList.map((service) => (
                          <p key={service}>{service}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        No services configured yet
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigateTo('/settings/practice/services')}
                      className="hidden sm:inline-flex"
                    >
                      Manage
                    </Button>
                    <button
                      type="button"
                      onClick={() => navigateTo('/settings/practice/services')}
                      className="sm:hidden p-2 text-gray-500 dark:text-gray-400"
                      aria-label="Manage services"
                    >
                      <ChevronRightIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Team Row */}
              <div className="py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Team Members
                    </h3>
                    {members.length > 0 ? (
                      <div className="mt-2">
                        <StackedAvatars users={teamAvatars} size="sm" />
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        No team members yet
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigateTo(members.length === 0
                        ? '/settings/practice/team?invite=1'
                        : '/settings/practice/team')}
                      className="hidden sm:inline-flex"
                    >
                      {members.length === 0 ? 'Invite' : 'Manage'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => navigateTo(members.length === 0
                        ? '/settings/practice/team?invite=1'
                        : '/settings/practice/team')}
                      className="sm:hidden p-2 text-gray-500 dark:text-gray-400"
                      aria-label={members.length === 0 ? 'Invite team members' : 'Manage team members'}
                    >
                      <ChevronRightIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Visibility Toggle */}
              <div className="py-3">
                <Switch
                  label="Public listing"
                  description={isPublicValue
                    ? 'Your practice appears in public listings.'
                    : 'Your practice is private and not publicly listed.'}
                  value={isPublicValue}
                  onChange={handleTogglePublic}
                  disabled={isSettingsSaving}
                />
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Lead Review Queue */}
              <div className="py-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Lead Review Queue
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Review new intake requests and decide whether to accept or decline.
                </p>

                {!canReviewLeads && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Only admins and owners can review leads.
                  </div>
                )}

                {canReviewLeads && leadLoading && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Loading leads…
                  </div>
                )}

                {canReviewLeads && leadError && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {leadError}
                  </div>
                )}

                {canReviewLeads && !leadLoading && !leadError && leadQueue.length === 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    No leads waiting for review.
                  </div>
                )}

                {canReviewLeads && leadQueue.length > 0 && (
                  <div className="space-y-3">
                    {leadQueue.map((lead) => (
                      <div
                        key={lead.id}
                        className="rounded-lg border border-gray-200 dark:border-dark-border p-4 bg-white dark:bg-dark-card-bg"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {lead.clientName || lead.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {lead.matterType}
                                {lead.leadSource ? ` · ${lead.leadSource}` : ''}
                              </p>
                            </div>
                            <span className="text-xs text-gray-400">
                              {formatDate(lead.createdAt)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => openDecisionModal(lead, 'accept')}>
                              Accept
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => openDecisionModal(lead, 'reject')}>
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Delete Practice Section (Owner only) */}
              {isOwner && (
                <>
                  <div className="flex items-center justify-between py-3" data-testid="practice-delete-section">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Practice</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Permanently delete this practice and all its data
                      </p>
                    </div>
                    <div className="ml-4">
                      {deletionBlockedBySubscription ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!currentPractice?.id) return;
                            openBillingPortal({ 
                              practiceId: currentPractice.id, 
                              returnUrl: origin ? `${origin}/settings/practice?sync=1` : '/settings/practice?sync=1' 
                            });
                          }}
                          disabled={submitting}
                          data-testid="practice-delete-action"
                        >
                          {t('settings:account.plan.manage')}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteModal(true)}
                          className="text-red-600 hover:text-red-700"
                          data-testid="practice-delete-action"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                  {deletionBlockedBySubscription && deletionBlockedMessage && (
                    <div role="status" aria-live="polite" className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                      <p className="text-xs text-yellow-800 dark:text-yellow-200">
                        {deletionBlockedMessage}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          
        </div>
      </div>

      {/* Lead Decision Modal */}
      <Modal
        isOpen={Boolean(decisionAction && decisionLead)}
        onClose={closeDecisionModal}
        title={decisionAction === 'accept' ? 'Accept Lead' : 'Reject Lead'}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-dark-border p-3 text-sm text-gray-700 dark:text-gray-200">
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {decisionLead?.clientName || decisionLead?.title}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {decisionLead?.matterType}
              {decisionLead?.leadSource ? ` · ${decisionLead.leadSource}` : ''}
            </p>
          </div>

          {decisionAction === 'reject' && (
            <div>
              <FormLabel htmlFor="lead-reject-reason">Reason (optional)</FormLabel>
              <Textarea
                id="lead-reject-reason"
                value={decisionReason}
                onChange={(value) => setDecisionReason(value)}
                placeholder="Add a short note to the client"
                rows={3}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => closeDecisionModal()} disabled={decisionSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleDecision()} disabled={decisionSubmitting}>
              {decisionAction === 'accept' ? 'Accept Lead' : 'Reject Lead'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Practice Modal */}
      <Modal
        isOpen={isEditPracticeModalOpen}
        onClose={() => setIsEditPracticeModalOpen(false)}
        title="Edit Practice"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="edit-practice-name">Practice Name *</FormLabel>
            <Input
              id="edit-practice-name"
              value={editPracticeForm.name}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, name: value }))}
              placeholder="Your Law Firm Name"
              required
            />
          </div>

          <div>
            <FormLabel htmlFor="edit-practice-slug">Slug (optional)</FormLabel>
            <Input
              id="edit-practice-slug"
              value={editPracticeForm.slug}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, slug: value }))}
              placeholder="your-law-firm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used in URLs. Leave empty to keep the current slug.
            </p>
          </div>

          <div>
            <FormLabel htmlFor="edit-practice-description">Description (optional)</FormLabel>
            <Input
              id="edit-practice-description"
              value={editPracticeForm.description}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, description: value }))}
              placeholder="Brief description of your practice"
              disabled={isSettingsSaving}
            />
          </div>

          <div>
            <FormLabel htmlFor="edit-practice-overview">Overview</FormLabel>
            <Textarea
              id="edit-practice-overview"
              value={overviewDraft}
              onChange={setOverviewDraft}
              placeholder="Share a brief description of your practice."
              rows={4}
              disabled={isSettingsSaving}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setIsEditPracticeModalOpen(false)}
              disabled={isSettingsSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdatePractice} disabled={isSettingsSaving}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Contact Modal */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title="Contact"
      >
        <div className="space-y-4">
          <div>
            <FormLabel>Website</FormLabel>
            <URLInput
              value={contactDraft.website}
              onChange={(value) => setContactDraft(prev => ({ ...prev, website: value }))}
              placeholder="https://yourfirm.com"
              disabled={isSettingsSaving}
            />
          </div>

          <div>
            <FormLabel>Phone</FormLabel>
            <PhoneInput
              value={contactDraft.phone}
              onChange={(value) => setContactDraft(prev => ({ ...prev, phone: value }))}
              placeholder="(555) 123-4567"
              disabled={isSettingsSaving}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FormLabel htmlFor="practice-address-line1">Address Line 1</FormLabel>
              <Input
                id="practice-address-line1"
                value={contactDraft.addressLine1}
                onChange={(value) => setContactDraft(prev => ({ ...prev, addressLine1: value }))}
                placeholder="123 Main Street"
                disabled={isSettingsSaving}
              />
            </div>
            <div>
              <FormLabel htmlFor="practice-address-line2">Address Line 2</FormLabel>
              <Input
                id="practice-address-line2"
                value={contactDraft.addressLine2}
                onChange={(value) => setContactDraft(prev => ({ ...prev, addressLine2: value }))}
                placeholder="Suite 100"
                disabled={isSettingsSaving}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <FormLabel htmlFor="practice-address-city">City</FormLabel>
              <Input
                id="practice-address-city"
                value={contactDraft.city}
                onChange={(value) => setContactDraft(prev => ({ ...prev, city: value }))}
                placeholder="San Francisco"
                disabled={isSettingsSaving}
              />
            </div>
            <div>
              <FormLabel htmlFor="practice-address-state">State</FormLabel>
              <Input
                id="practice-address-state"
                value={contactDraft.state}
                onChange={(value) => setContactDraft(prev => ({ ...prev, state: value }))}
                placeholder="CA"
                disabled={isSettingsSaving}
              />
            </div>
            <div>
              <FormLabel htmlFor="practice-address-postal">Postal Code</FormLabel>
              <Input
                id="practice-address-postal"
                value={contactDraft.postalCode}
                onChange={(value) => setContactDraft(prev => ({ ...prev, postalCode: value }))}
                placeholder="94102"
                disabled={isSettingsSaving}
              />
            </div>
          </div>

          <div>
            <FormLabel htmlFor="practice-address-country">Country</FormLabel>
            <Input
              id="practice-address-country"
              value={contactDraft.country}
              onChange={(value) => setContactDraft(prev => ({ ...prev, country: value }))}
              placeholder="US"
              disabled={isSettingsSaving}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setIsContactModalOpen(false)}
              disabled={isSettingsSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveContact} disabled={isSettingsSaving}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Intro Message Modal */}
      <Modal
        isOpen={isIntroModalOpen}
        onClose={() => setIsIntroModalOpen(false)}
        title="Intro Message"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="practice-intro-message">Intro Message</FormLabel>
            <Textarea
              id="practice-intro-message"
              value={introDraft}
              onChange={setIntroDraft}
              placeholder="Welcome to our firm. How can we help?"
              rows={4}
              disabled={isSettingsSaving}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setIsIntroModalOpen(false)}
              disabled={isSettingsSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveIntro} disabled={isSettingsSaving}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Practice Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Practice"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="practice-name">Practice Name *</FormLabel>
            <Input
              id="practice-name"
              value={createForm.name}
              onChange={(value) => setCreateForm(prev => ({ ...prev, name: value }))}
              placeholder="Your Law Firm Name"
              required
            />
          </div>
          
          <div>
            <FormLabel htmlFor="practice-slug">Slug (optional)</FormLabel>
            <Input
              id="practice-slug"
              value={createForm.slug}
              onChange={(value) => setCreateForm(prev => ({ ...prev, slug: value }))}
              placeholder="your-law-firm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used in URLs. Leave empty to auto-generate.
            </p>
          </div>
          
          <div>
            <FormLabel htmlFor="practice-description">Description (optional)</FormLabel>
            <Input
              id="practice-description"
              value={createForm.description}
              onChange={(value) => setCreateForm(prev => ({ ...prev, description: value }))}
              placeholder="Brief description of your practice"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button 
              variant="secondary" 
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreatePractice}>
              Create Practice
            </Button>
          </div>
        </div>
      </Modal>


      {/* Delete Practice Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Practice"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">
              ⚠️ This action cannot be undone. This will permanently delete the practice and all its data.
            </p>
          </div>
          
          <div>
            <FormLabel htmlFor="delete-confirm">
              Type the practice name to confirm: <strong>{currentPractice?.name}</strong>
            </FormLabel>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={setDeleteConfirmText}
              placeholder="Enter practice name"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="ghost"
              onClick={handleDeletePractice}
              disabled={deleteConfirmText !== currentPractice?.name}
              className="text-red-600 hover:text-red-700"
            >
              Delete Practice
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
