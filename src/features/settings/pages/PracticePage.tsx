import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import {
  ChevronRightIcon,
  GlobeAltIcon,
  MapPinIcon,
  PhoneIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { usePracticeManagement, type Practice } from '@/shared/hooks/usePracticeManagement';
import { Button } from '@/shared/ui/Button';
import type { Address } from '@/shared/types/address';
import Modal from '@/shared/components/Modal';
import { Input, LogoUploadInput, Switch } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useLocation } from 'preact-iso';
import { useTranslation } from '@/shared/i18n/hooks';
import { StackedAvatars } from '@/shared/ui/profile';
import { PracticeProfileTextFields } from '@/shared/ui/practice/PracticeProfileTextFields';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { getFrontendHost } from '@/config/urls';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { FormGrid, SectionDivider } from '@/shared/ui/layout';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { SettingsSubheader } from '@/features/settings/components/SettingsSubheader';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { SettingRow } from '@/features/settings/components/SettingRow';
import {
  usePracticeMembersSync,
  usePracticeSyncParamRefetch,
  type EditPracticeFormState
} from '@/features/settings/hooks/usePracticePageEffects';

interface OnboardingDetails {
  contactPhone?: string;
  businessEmail?: string;
  website?: string;
  address?: Address;
  introMessage?: string;
  description?: string;
  isPublic?: boolean;
  services?: Array<Record<string, unknown>>;
}

const resolveOnboardingData = (practice: Practice | null, details: PracticeDetails | null): OnboardingDetails => {
  if (!practice) return {};
  const buildAddress = (source: {
    address?: string | null;
    apartment?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }): Address | undefined => {
    const address = source.address?.trim() || '';
    const apartment = source.apartment?.trim() || undefined;
    const city = source.city?.trim() || '';
    const state = source.state?.trim() || '';
    const postalCode = source.postalCode?.trim() || '';
    const country = source.country?.trim() || '';
    const hasAny = Boolean(address || apartment || city || state || postalCode || country);
    if (!hasAny) return undefined;
    return {
      address,
      apartment,
      city,
      state,
      postalCode,
      country
    };
  };
  const baseFromDetails: OnboardingDetails = {};
  if (details) {
    const setIfDefined = <K extends keyof OnboardingDetails>(key: K, value: OnboardingDetails[K]) => {
      if (value !== undefined) {
        baseFromDetails[key] = value;
      }
    };
    setIfDefined('website', details.website ?? undefined);
    setIfDefined('address', buildAddress(details));
    setIfDefined('introMessage', details.introMessage ?? undefined);
    setIfDefined('description', details.description ?? undefined);
    setIfDefined('isPublic', details.isPublic ?? undefined);
    setIfDefined('services', details.services ?? undefined);
    setIfDefined('contactPhone', details.businessPhone ?? undefined);
    setIfDefined('businessEmail', details.businessEmail ?? undefined);
  }
  const baseFromPractice: OnboardingDetails = {
    website: practice.website ?? undefined,
    address: buildAddress(practice),
    introMessage: practice.introMessage ?? undefined,
    description: practice.description ?? undefined,
    isPublic: practice.isPublic ?? undefined,
    services: practice.services ?? undefined,
    contactPhone: practice.businessPhone ?? undefined,
    businessEmail: practice.businessEmail ?? undefined
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
  const address = data.address?.address?.trim() || '';
  const apartment = data.address?.apartment?.trim() || '';
  const city = data.address?.city?.trim() || '';
  const state = data.address?.state?.trim() || '';
  const postal = data.address?.postalCode?.trim() || '';
  const country = data.address?.country?.trim() || '';

  const parts: string[] = [];
  if (address) parts.push(address);
  if (apartment) parts.push(apartment);
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
  const { session, isPending: sessionPending, activeMemberRole, activeOrganizationId } = useSessionContext();
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
  } = usePracticeManagement({ fetchPracticeDetails: true });
  const activePracticeId = currentPractice?.id ?? null;
  const { details: practiceDetails, updateDetails } = usePracticeDetails(activePracticeId, currentPractice?.slug);
  
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
    logo: ''
  });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: ''
  });
  
  const [isEditPracticeModalOpen, setIsEditPracticeModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const practice = currentPractice ?? null;
  const hasPractice = !!practice;
  const members = useMemo(() => practice ? getMembers(practice.id) : [], [practice, getMembers]);
  
  // Better approach - get role directly from current practice context
  const currentMember = useMemo(() => {
    if (!practice || !currentUserEmail) return null;
    return members.find(m => m.email && m.email.toLowerCase() === currentUserEmail.toLowerCase()) || 
           members.find(m => m.userId === session?.user?.id);
  }, [practice, currentUserEmail, members, session?.user?.id]);

  const roleFromMembers = currentMember?.role ?? null;
  const currentUserRole = normalizePracticeRole(activeMemberRole) ?? roleFromMembers ?? 'member';
  const isOwner = currentUserRole === 'owner';
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
  const practiceHost = useMemo(() => {
    try {
      return getFrontendHost();
    } catch {
      if (typeof window !== 'undefined' && window.location?.host) {
        return window.location.host;
      }
      return '';
    }
  }, []);
  const practicePath = `/public/${practice?.slug ?? 'your-practice'}`;
  const practiceUrlValue = practiceHost
    ? `${practiceHost}${practicePath}`
    : practicePath;
  const practiceUrlHref = useMemo(() => {
    if (!practiceHost) {
      return practicePath;
    }
    const protocol = typeof window !== 'undefined' && window.location?.protocol
      ? window.location.protocol
      : 'https:';
    return `${protocol}//${practiceHost}${practicePath}`;
  }, [practiceHost, practicePath]);
  const hasSavedLogo = editPracticeForm.logo.trim().length > 0;
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
  const [contactDraft, setContactDraft] = useState({
    website: '',
    businessEmail: '',
    phone: '',
    address: undefined,
  });
  const [introDraft, setIntroDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const modalContentClassName = 'bg-light-card-bg dark:bg-dark-card-bg border-light-border dark:border-dark-border';
  const modalHeaderClassName = 'bg-light-card-bg dark:bg-dark-card-bg border-light-border dark:border-dark-border';

  // SSR-safe origin for return URLs
  const origin = (typeof window !== 'undefined' && window.location)
    ? window.location.origin
    : '';

  // Subscription guard for deletion
  const subStatus = (practice?.subscriptionStatus ?? 'none').toLowerCase();
  const deletionBlockedBySubscription = !(subStatus === 'canceled' || subStatus === 'none');
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
        description: createForm.description || undefined,
      });
      
      showSuccess('Practice created successfully!');
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '' });
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create practice');
    }
  };

  const openEditPracticeModal = () => {
    if (!practice) return;
    setLogoUploadProgress(null);
    setLogoUploading(false);
    setEditPracticeForm({
      name: practice.name,
      slug: practice.slug || '',
      logo: practice.logo || ''
    });
    setDescriptionDraft(descriptionValue);
    setIntroDraft(introMessageValue);
    setIsEditPracticeModalOpen(true);
  };

  const handleLogoChange = async (files: FileList | File[]) => {
    if (!practice) return;
    const [file] = Array.isArray(files) ? files : Array.from(files);
    if (!file) {
      return;
    }

    setLogoUploading(true);
    setLogoUploadProgress(0);
    try {
      const logoUrl = await uploadPracticeLogo(file, practice.id, (percentage) => {
        setLogoUploadProgress(percentage);
      });
      setEditPracticeForm(prev => ({ ...prev, logo: logoUrl }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logo upload failed';
      showError('Logo upload failed', message);
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
      const trimmedIntro = introDraft.trim();
      const comparison = {
        name: practice.name,
        slug: practice.slug ?? null,
        logo: practice.logo ?? null,
        description: practiceDetails?.description ?? practice.description ?? null,
        introMessage: practiceDetails?.introMessage ?? practice.introMessage ?? null
      };
      const { practicePayload, detailsPayload } = buildPracticeProfilePayloads({
        name: editPracticeForm.name,
        logo: trimmedLogo ? trimmedLogo : undefined,
        description: trimmedDescription ? trimmedDescription : undefined,
        introMessage: trimmedIntro ? trimmedIntro : undefined
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
        businessEmail: updates.businessEmail,
        businessPhone: updates.contactPhone,
        website: updates.website,
        address: updates.address?.address || null,
        apartment: updates.address?.apartment || null,
        city: updates.address?.city || null,
        state: updates.address?.state || null,
        postalCode: updates.address?.postalCode || null,
        country: updates.address?.country || null,
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

  const openContactModal = useCallback(() => {
    setContactDraft({
      website: websiteValue,
      businessEmail: practiceDetails?.businessEmail ?? practice?.businessEmail ?? '',
      phone: phoneValue,
      address: onboardingData.address,
    });
    setIsContactModalOpen(true);
  }, [onboardingData.address, phoneValue, practice?.businessEmail, practiceDetails?.businessEmail, websiteValue]);

  const handleSaveContact = async () => {
    const success = await saveOnboardingSettings(
      {
        website: (contactDraft.website ?? '').trim(),
        businessEmail: (contactDraft.businessEmail ?? '').trim(),
        contactPhone: (contactDraft.phone ?? '').trim(),
        address: contactDraft.address,
      },
      'Contact details updated.'
    );
    if (success) {
      setIsContactModalOpen(false);
    }
  };

  useEffect(() => {
    if (location.query?.setup === 'contact' && !isContactModalOpen) {
      openContactModal();
      navigate('/settings/practice', true);
    }
  }, [isContactModalOpen, location.query?.setup, navigate, openContactModal]);

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
            {!activeOrganizationId && (
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
    <SettingsPageLayout title="Practice" className={className}>
      {hasPractice && (
        <>
              <SettingRow
                label="Practice details"
                labelNode={(
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {practice.name || 'Practice'}
                    </h3>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-start gap-3">
                        <SettingsSubheader className="w-20 text-[10px]">Description</SettingsSubheader>
                        <SettingsHelperText>{descriptionPreview}</SettingsHelperText>
                      </div>
                    </div>
                  </div>
                )}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openEditPracticeModal}
                >
                  Edit
                </Button>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Workspace URL"
                description={practice?.slug ? 'Share with clients to view your public profile.' : 'Slug will be generated automatically after saving.'}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(practiceUrlHref, '_blank', 'noopener,noreferrer')}
                  className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  {practiceUrlValue}
                </Button>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Contact"
                labelNode={(
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contact</h3>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <GlobeAltIcon className="w-4 h-4 text-gray-400 mt-0.5" aria-hidden="true" />
                        <SettingsHelperText>{websiteValue || 'Not set'}</SettingsHelperText>
                      </div>
                      <div className="flex items-start gap-2">
                        <PhoneIcon className="w-4 h-4 text-gray-400 mt-0.5" aria-hidden="true" />
                        <SettingsHelperText>{phoneValue || 'Not set'}</SettingsHelperText>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5" aria-hidden="true" />
                        <SettingsHelperText>{addressSummary || 'Not set'}</SettingsHelperText>
                      </div>
                    </div>
                  </div>
                )}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openContactModal}
                    className="hidden sm:inline-flex"
                  >
                    Manage
                  </Button>
                  <Button
                    variant="icon"
                    size="icon"
                    onClick={openContactModal}
                    className="sm:hidden"
                    aria-label="Manage contact details"
                    icon={<ChevronRightIcon className="w-5 h-5" aria-hidden="true" />}
                  />
                </div>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Services"
                labelNode={(
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Services</h3>
                    {servicesList.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {servicesList.map((service) => (
                          <SettingsHelperText key={service}>{service}</SettingsHelperText>
                        ))}
                      </div>
                    ) : (
                      <SettingsHelperText className="mt-1">
                        No services configured yet
                      </SettingsHelperText>
                    )}
                  </div>
                )}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigateTo('/settings/practice/services')}
                    className="hidden sm:inline-flex"
                  >
                    Manage
                  </Button>
                  <Button
                    variant="icon"
                    size="icon"
                    onClick={() => navigateTo('/settings/practice/services')}
                    className="sm:hidden"
                    aria-label="Manage services"
                    icon={<ChevronRightIcon className="w-5 h-5" aria-hidden="true" />}
                  />
                </div>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Pricing"
                labelNode={(
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pricing &amp; Fees</h3>
                    <SettingsHelperText className="mt-1">
                      Configure consultation fees and billing increments.
                    </SettingsHelperText>
                  </div>
                )}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigateTo('/settings/practice/pricing')}
                    className="hidden sm:inline-flex"
                  >
                    Manage
                  </Button>
                  <Button
                    variant="icon"
                    size="icon"
                    onClick={() => navigateTo('/settings/practice/pricing')}
                    className="sm:hidden"
                    aria-label="Manage pricing"
                    icon={<ChevronRightIcon className="w-5 h-5" aria-hidden="true" />}
                  />
                </div>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Team"
                labelNode={(
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Team Members
                    </h3>
                    {members.length > 0 ? (
                      <div className="mt-2">
                        <StackedAvatars users={teamAvatars} size="sm" />
                      </div>
                    ) : (
                      <SettingsHelperText className="mt-1">
                        No team members yet
                      </SettingsHelperText>
                    )}
                  </div>
                )}
              >
                <div className="flex items-center gap-2">
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
                  <Button
                    variant="icon"
                    size="icon"
                    onClick={() => navigateTo(members.length === 0
                      ? '/settings/practice/team?invite=1'
                      : '/settings/practice/team')}
                    className="sm:hidden"
                    aria-label={members.length === 0 ? 'Invite team members' : 'Manage team members'}
                    icon={<ChevronRightIcon className="w-5 h-5" aria-hidden="true" />}
                  />
                </div>
              </SettingRow>

              <SectionDivider />

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

              <SectionDivider />

              {/* Delete Practice Section (Owner only) */}
              {isOwner && (
                <>
                  <SettingRow
                    label="Delete Practice"
                    labelNode={(
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Practice</h3>
                        <SettingsHelperText className="mt-1">
                          Permanently delete this practice and all its data
                        </SettingsHelperText>
                      </div>
                    )}
                    className="py-3"
                  >
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
                  </SettingRow>
                  {deletionBlockedBySubscription && deletionBlockedMessage && (
                    <SettingsNotice variant="warning" className="mt-2" role="status" aria-live="polite">
                      <p className="text-xs">
                        {deletionBlockedMessage}
                      </p>
                    </SettingsNotice>
                  )}
                </>
              )}
            </>
          )}

      {/* Edit Practice Modal */}
      <Modal
        isOpen={isEditPracticeModalOpen}
        onClose={() => setIsEditPracticeModalOpen(false)}
        title="Edit Practice"
        contentClassName={modalContentClassName}
        headerClassName={modalHeaderClassName}
      >
        <div className="space-y-4">
          <FormGrid>
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
              <FormLabel>Workspace URL</FormLabel>
              <SettingsHelperText className="mt-1">
                {practice?.slug ? practiceUrlValue : 'Slug will be generated automatically'}
              </SettingsHelperText>
            </div>
          </FormGrid>

          <div>
            <LogoUploadInput
              imageUrl={hasSavedLogo ? editPracticeForm.logo : null}
              name={editPracticeForm.name || 'Practice'}
              label="Upload logo (optional)"
              description="Upload a square logo. Maximum 5 MB."
              accept="image/*"
              multiple={false}
              onChange={handleLogoChange}
              disabled={isSettingsSaving || logoUploading}
              progress={logoUploading ? logoUploadProgress : null}
            />
          </div>

          <div>
            <PracticeProfileTextFields
              description={descriptionDraft}
              onDescriptionChange={setDescriptionDraft}
              introMessage={introDraft}
              onIntroChange={setIntroDraft}
              showIntro
              showDescription={false}
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
        contentClassName={modalContentClassName}
        headerClassName={modalHeaderClassName}
      >
        <div className="space-y-4">
          {/* Contact Information Fields */}
          <FormGrid>
            <Input
              label="Website"
              value={contactDraft.website || ''}
              onChange={(value) => setContactDraft(prev => ({ ...prev, website: value }))}
              disabled={isSettingsSaving}
              placeholder="https://example.com"
            />

            <Input
              label="Business Email"
              value={contactDraft.businessEmail || ''}
              onChange={(value) => setContactDraft(prev => ({ ...prev, businessEmail: value }))}
              disabled={isSettingsSaving}
              type="email"
              placeholder="business@example.com"
            />

            <Input
              label="Contact Phone"
              value={contactDraft.phone || ''}
              onChange={(value) => setContactDraft(prev => ({ ...prev, phone: value }))}
              disabled={isSettingsSaving}
              type="tel"
              placeholder="+1 (555) 123-4567"
            />
          </FormGrid>

          {/* Address Fields */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Address</h4>
            <AddressExperienceForm
              initialValues={{ address: contactDraft.address }}
              fields={['address']}
              required={[]}
              onValuesChange={(values) => {
                if (values.address !== undefined) {
                  setContactDraft(prev => ({
                    ...prev,
                    address: values.address as Address,
                  }));
                }
              }}
              showSubmitButton={false}
              variant="plain"
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

      {/* Create Practice Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Practice"
        contentClassName={modalContentClassName}
        headerClassName={modalHeaderClassName}
      >
        <div className="space-y-4">
          <FormGrid>
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

            <div className="@md:col-span-2">
              <FormLabel htmlFor="practice-description">Description (optional)</FormLabel>
              <Input
                id="practice-description"
                value={createForm.description}
                onChange={(value) => setCreateForm(prev => ({ ...prev, description: value }))}
                placeholder="Brief description of your practice"
              />
            </div>
          </FormGrid>
          
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
        contentClassName={modalContentClassName}
        headerClassName={modalHeaderClassName}
      >
        <div className="space-y-4">
          <SettingsNotice variant="danger" className="p-4">
            <p className="text-sm">
              ⚠️ This action cannot be undone. This will permanently delete the practice and all its data.
            </p>
          </SettingsNotice>
          
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

    </SettingsPageLayout>
  );
};
