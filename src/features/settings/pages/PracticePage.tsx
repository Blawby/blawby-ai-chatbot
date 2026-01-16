import { useState, useMemo, useCallback } from 'preact/hooks';
import {
  ChevronRightIcon,
  GlobeAltIcon,
  MapPinIcon,
  PhoneIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { usePracticeManagement, type Practice } from '@/shared/hooks/usePracticeManagement';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { CurrencyInput, EmailInput, FileInput, Input, Switch } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { useLocation } from 'preact-iso';
import { useTranslation } from '@/shared/i18n/hooks';
import { StackedAvatars } from '@/shared/ui/profile';
import { PracticeContactFields } from '@/shared/ui/practice/PracticeContactFields';
import { PracticeProfileTextFields } from '@/shared/ui/practice/PracticeProfileTextFields';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import {
  usePracticeMembersSync,
  usePracticeSyncParamRefetch,
  type EditPracticeFormState
} from '@/features/settings/hooks/usePracticePageEffects';
import { LeadReviewQueue } from '@/features/leads/components/LeadReviewQueue';
import { hasLeadReviewPermission } from '@/shared/utils/leadPermissions';

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
  description?: string;
  isPublic?: boolean;
  services?: Array<Record<string, unknown>>;
}

const resolveOnboardingData = (practice: Practice | null, details: PracticeDetails | null): OnboardingDetails => {
  if (!practice) return {};
  const baseFromDetails: OnboardingDetails = details
    ? {
      website: details.website ?? undefined,
      addressLine1: details.addressLine1 ?? undefined,
      addressLine2: details.addressLine2 ?? undefined,
      city: details.city ?? undefined,
      state: details.state ?? undefined,
      postalCode: details.postalCode ?? undefined,
      country: details.country ?? undefined,
      introMessage: details.introMessage ?? undefined,
      description: details.description ?? undefined,
      isPublic: details.isPublic ?? undefined,
      services: details.services ?? undefined,
      contactPhone: details.businessPhone ?? undefined
    }
    : {};
  const baseFromPractice: OnboardingDetails = {
    website: practice.website ?? undefined,
    addressLine1: practice.addressLine1 ?? undefined,
    addressLine2: practice.addressLine2 ?? undefined,
    city: practice.city ?? undefined,
    state: practice.state ?? undefined,
    postalCode: practice.postalCode ?? undefined,
    country: practice.country ?? undefined,
    introMessage: practice.introMessage ?? undefined,
    description: practice.description ?? undefined,
    isPublic: practice.isPublic ?? undefined,
    services: practice.services ?? undefined,
    contactPhone: practice.businessPhone ?? undefined
  };
  return { ...baseFromPractice, ...baseFromDetails };
};

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
};

const isValidHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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

export const PracticePage = ({ className = '', onNavigate }: PracticePageProps) => {
  const { session, isPending: sessionPending, hasPractice: sessionHasPractice } = useSessionContext();
  const { 
    currentPractice,
    practices,
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
  const activePracticeId = currentPractice?.id ?? practices[0]?.id ?? null;
  const { details: practiceDetails, updateDetails } = usePracticeDetails(activePracticeId);
  
  const { showSuccess, showError, showWarning } = useToastContext();
  const { navigate } = useNavigation();
  const navigateTo = onNavigate ?? navigate;
  const location = useLocation();
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { t } = useTranslation(['settings']);
  
  // Get current user email from session
  const currentUserEmail = session?.user?.email || '';
  
  // Form states
  const [editPracticeForm, setEditPracticeForm] = useState<EditPracticeFormState>({
    name: '',
    slug: '',
    businessEmail: '',
    consultationFee: undefined,
    logo: ''
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
  const [logoFiles, setLogoFiles] = useState<File[]>([]);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const practice = currentPractice ?? practices[0] ?? null;
  const hasPractice = !!practice;
  const members = useMemo(() => practice ? getMembers(practice.id) : [], [practice, getMembers]);
  
  // Better approach - get role directly from current practice context
  const currentMember = useMemo(() => {
    if (!practice || !currentUserEmail) return null;
    return members.find(m => m.email && m.email.toLowerCase() === currentUserEmail.toLowerCase()) || 
           members.find(m => m.userId === session?.user?.id);
  }, [practice, currentUserEmail, members, session?.user?.id]);

  const currentUserRole = currentMember?.role || 'paralegal';
  const isOwner = currentUserRole === 'owner';
  const canReviewLeads = hasLeadReviewPermission(currentUserRole, practice?.metadata ?? null);
  const servicesList = useMemo(() => {
    const source = practiceDetails?.services ?? practice?.services;
    if (!Array.isArray(source)) return [];

    const seen = new Set<string>();
    const result: string[] = [];
    const entries = source as Array<Record<string, unknown> | string>;
    entries.forEach((entry) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(trimmed);
        return;
      }
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const candidate = typeof record.name === 'string'
          ? record.name
          : (typeof record.title === 'string' ? record.title : '');
        const trimmed = candidate.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(trimmed);
      }
    });
    return result;
  }, [practiceDetails?.services, practice?.services]);
  const onboardingData = useMemo(
    () => resolveOnboardingData(practice, practiceDetails),
    [practice, practiceDetails]
  );

  const websiteValue = typeof onboardingData.website === 'string' ? onboardingData.website.trim() : '';
  const addressSummary = formatAddressSummary(onboardingData);
  const phoneValue = (typeof onboardingData.contactPhone === 'string'
    ? onboardingData.contactPhone
    : (practice?.businessPhone || '')).trim();
  const introMessageValue = typeof onboardingData.introMessage === 'string'
    ? onboardingData.introMessage.trim()
    : '';
  const descriptionValue = typeof onboardingData.description === 'string'
    ? onboardingData.description.trim()
    : '';
  const isPublicValue = typeof onboardingData.isPublic === 'boolean'
    ? onboardingData.isPublic
    : false;
  const practiceUrlValue = practice?.slug
    ? `ai.blawby.com/p/${practice.slug}`
    : 'ai.blawby.com/p/your-practice';
  const descriptionPreview = descriptionValue ? truncateText(descriptionValue, 140) : 'Not set';
  const teamAvatars = useMemo(
    () => members.map((member) => ({
      id: member.userId,
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
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const handleOpenLeadConversation = useCallback((conversationId: string) => {
    navigateTo(`/practice/chats/${encodeURIComponent(conversationId)}`);
  }, [navigateTo]);

  // SSR-safe origin for return URLs
  const origin = (typeof window !== 'undefined' && window.location)
    ? window.location.origin
    : '';

  // Subscription guard for deletion
  const hasManagedSub = Boolean(practice?.stripeCustomerId);
  const subStatus = (practice?.subscriptionStatus || 'none').toLowerCase();
  const deletionBlockedBySubscription = hasManagedSub && !(subStatus === 'canceled' || subStatus === 'none');
  const deletionBlockedMessage = (() => {
    if (!deletionBlockedBySubscription) return '';
    const ts = practice?.subscriptionPeriodEnd;
    const end = (typeof ts === 'number' && Number.isFinite(ts)) ? new Date(ts * 1000) : null;
    if (end) {
      return `Subscription must be canceled before deleting. Access ends on ${formatDate(end)}.`;
    }
    return 'Subscription must be canceled in Stripe before deleting this practice.';
  })();


  // Current user email is now derived from session - removed redirect to keep practice settings accessible

  // Initialize form with current practice data
  // Note: usePracticeManagement already fetches practice details during initialization,
  // so we only need to fetch members here. Details are available via practiceDetailsStore.
  usePracticeMembersSync({
    practice,
    setEditPracticeForm,
    fetchMembers,
    showError
  });

  // Refetch after return from portal
  usePracticeSyncParamRefetch({
    location,
    practiceId: practice?.id ?? null,
    refetch,
    showSuccess
  });

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
    if (!practice) return;
    const detailsEmail = practiceDetails?.businessEmail ?? practice.businessEmail ?? '';
    const detailsFee = practiceDetails && practiceDetails.consultationFee !== undefined
      ? practiceDetails.consultationFee
      : practice.consultationFee;
    setLogoFiles([]);
    setLogoUploadProgress(null);
    setLogoUploading(false);
    setEditPracticeForm({
      name: practice.name,
      slug: practice.slug || '',
      businessEmail: detailsEmail,
      consultationFee: typeof detailsFee === 'number'
        ? detailsFee
        : undefined,
      logo: practice.logo || ''
    });
    setDescriptionDraft(descriptionValue);
    setIsEditPracticeModalOpen(true);
  };

  const handleLogoChange = async (files: FileList | File[]) => {
    if (!practice) return;
    const [file] = Array.isArray(files) ? files : Array.from(files);
    if (!file) {
      setLogoFiles([]);
      return;
    }

    setLogoFiles([file]);
    setLogoUploading(true);
    setLogoUploadProgress(0);
    try {
      const logoUrl = await uploadPracticeLogo(file, practice.id, (percentage) => {
        setLogoUploadProgress(percentage);
      });
      setEditPracticeForm(prev => ({ ...prev, logo: logoUrl }));
      showSuccess('Logo uploaded', 'Logo ready to save. Click Save Changes to persist.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logo upload failed';
      showError('Logo upload failed', message);
      setLogoFiles([]);
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(null);
    }
  };

  const handleUpdatePractice = async () => {
    if (!practice) return;
    if (!editPracticeForm.name.trim()) {
      showError('Practice name is required');
      return;
    }
    const trimmedLogo = editPracticeForm.logo.trim();
    if (trimmedLogo && !isValidHttpUrl(trimmedLogo)) {
      showError('Logo URL is invalid');
      return;
    }

    setIsSettingsSaving(true);
    try {
      const trimmedDescription = descriptionDraft.trim();
      const trimmedEmail = editPracticeForm.businessEmail.trim();
      const businessEmail = trimmedEmail ? trimmedEmail : undefined;
      const comparison = {
        name: practice.name,
        slug: practice.slug ?? null,
        logo: practice.logo ?? null,
        businessEmail: practiceDetails?.businessEmail ?? practice.businessEmail ?? null,
        consultationFee: practiceDetails?.consultationFee ?? practice.consultationFee ?? null,
        description: practiceDetails?.description ?? practice.description ?? null
      };
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads({
        name: editPracticeForm.name,
        slug: editPracticeForm.slug,
        logo: trimmedLogo ? trimmedLogo : undefined,
        businessEmail,
        consultationFee: editPracticeForm.consultationFee,
        description: trimmedDescription ? trimmedDescription : undefined
      }, { compareTo: comparison });

      if (Object.keys(practicePayload).length > 0) {
        await updatePractice(practice.id, practicePayload);
      }

      try {
        if (Object.keys(detailsPayload).length > 0) {
          await updateDetails(detailsPayload);
        }
        showSuccess('Practice updated successfully!');
      } catch (detailsError) {
        console.warn('Practice details update failed after core update:', detailsError);
        showWarning(
          'Practice updated with warning',
          'Core fields were saved, but the description could not be updated. Please try again.'
        );
      }
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
  ): Promise<boolean> => {
    if (!practice) return false;
    setIsSettingsSaving(true);
    try {
      const { detailsPayload } = buildPracticeProfilePayloads({
        businessPhone: updates.contactPhone,
        website: updates.website,
        addressLine1: updates.addressLine1,
        addressLine2: updates.addressLine2,
        city: updates.city,
        state: updates.state,
        postalCode: updates.postalCode,
        country: updates.country,
        introMessage: updates.introMessage,
        description: updates.description,
        isPublic: updates.isPublic,
        services: updates.services
      });

      if (Object.keys(detailsPayload).length > 0) {
        await updateDetails(detailsPayload);
      }

      showSuccess('Practice updated', toastBody);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update practice settings';
      showError('Update failed', message);
      return false;
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
    const success = await saveOnboardingSettings(
      {
        website: (contactDraft.website ?? '').trim(),
        contactPhone: (contactDraft.phone ?? '').trim(),
        addressLine1: (contactDraft.addressLine1 ?? '').trim(),
        addressLine2: (contactDraft.addressLine2 ?? '').trim(),
        city: (contactDraft.city ?? '').trim(),
        state: (contactDraft.state ?? '').trim(),
        postalCode: (contactDraft.postalCode ?? '').trim(),
        country: (contactDraft.country ?? '').trim()
      },
      'Contact details updated.'
    );
    if (success) {
      setIsContactModalOpen(false);
    }
  };

  const handleSaveIntro = async () => {
    const success = await saveOnboardingSettings(
      {
        introMessage: introDraft.trim()
      },
      'Intro message updated.'
    );
    if (success) {
      setIsIntroModalOpen(false);
    }
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
    if (!practice) return;
    
    if (deleteConfirmText.trim() !== practice.name) {
      showError('Practice name must match exactly');
      return;
    }

    try {
      await deletePractice(practice.id);
      showSuccess('Practice deleted successfully!');
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      navigate('/');
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete practice');
    }
  };

  // Loading state: show loading only when actively fetching
  // Once loading is complete (loading=false, sessionPending=false), show the result:
  // - practice data if available
  // - error state if error
  // - "no data" state if neither (this prompts user to reload)
  const shouldShowLoading = loading || sessionPending;

  if (shouldShowLoading) {
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

  if (!practice) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center space-y-3">
          <p className="text-sm text-gray-500">No practice data is available yet.</p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={refetch}>
              Reload
            </Button>
            {!sessionHasPractice && (
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                Create Practice
              </Button>
            )}
          </div>
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
                    {practice.name || 'Practice'}
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
                <LeadReviewQueue
                  practiceId={practice?.id ?? null}
                  canReviewLeads={canReviewLeads}
                  acceptMatter={acceptMatter}
                  rejectMatter={rejectMatter}
                  onOpenConversation={handleOpenLeadConversation}
                />
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
                            if (!practice?.id) return;
                            openBillingPortal({ 
                              practiceId: practice.id, 
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
            <EmailInput
              label="Business email"
              value={editPracticeForm.businessEmail}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, businessEmail: value }))}
              placeholder="contact@yourfirm.com"
              disabled={isSettingsSaving}
              showValidation
            />
          </div>

          <div>
            <CurrencyInput
              label="Consultation fee (optional)"
              value={editPracticeForm.consultationFee}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, consultationFee: value }))}
              placeholder="150.00"
              disabled={isSettingsSaving}
              step={0.01}
            />
          </div>

          <div>
            <FileInput
              label="Upload logo (optional)"
              description="Upload a square logo. Maximum 5 MB."
              accept="image/*"
              multiple={false}
              maxFileSize={5 * 1024 * 1024}
              value={logoFiles}
              onChange={handleLogoChange}
              disabled={isSettingsSaving || logoUploading}
            />
            {(logoUploading || logoUploadProgress !== null) && (
              <p className="text-xs text-gray-500 mt-2">
                {logoUploading ? 'Uploading logo' : 'Upload progress'}{logoUploadProgress !== null ? ` • ${logoUploadProgress}%` : ''}
              </p>
            )}
          </div>

          <div>
            <PracticeProfileTextFields
              description={descriptionDraft}
              onDescriptionChange={setDescriptionDraft}
              showIntro={false}
              descriptionRows={4}
              descriptionLabel="Business description"
              descriptionPlaceholder="Tell us about your business..."
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
            <Button onClick={handleUpdatePractice} disabled={isSettingsSaving || logoUploading}>
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
          <PracticeContactFields
            data={{
              website: contactDraft.website,
              contactPhone: contactDraft.phone,
              addressLine1: contactDraft.addressLine1,
              addressLine2: contactDraft.addressLine2,
              city: contactDraft.city,
              state: contactDraft.state,
              postalCode: contactDraft.postalCode,
              country: contactDraft.country
            }}
            onChange={(next) => {
              setContactDraft((prev) => ({
                ...prev,
                website: next.website ?? prev.website ?? '',
                phone: next.contactPhone ?? prev.phone ?? '',
                addressLine1: next.addressLine1 ?? prev.addressLine1 ?? '',
                addressLine2: next.addressLine2 ?? prev.addressLine2 ?? '',
                city: next.city ?? prev.city ?? '',
                state: next.state ?? prev.state ?? '',
                postalCode: next.postalCode ?? prev.postalCode ?? '',
                country: next.country ?? prev.country ?? ''
              }));
            }}
            disabled={isSettingsSaving}
          />

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
          <PracticeProfileTextFields
            introMessage={introDraft}
            onIntroChange={setIntroDraft}
            showDescription={false}
            introRows={4}
            disabled={isSettingsSaving}
          />
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
              Type the practice name to confirm: <strong>{practice?.name}</strong>
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
              disabled={deleteConfirmText.trim() !== practice?.name}
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
