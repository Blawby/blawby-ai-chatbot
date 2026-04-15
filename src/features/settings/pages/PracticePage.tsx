import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import {
  ChevronRightIcon,
  GlobeAltIcon,
  MapPinIcon,
  PhoneIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { Icon } from '@/shared/ui/Icon';
import { usePracticeManagement, type Practice } from '@/shared/hooks/usePracticeManagement';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { Button } from '@/shared/ui/Button';
import { FormActions } from '@/shared/ui/form';
import type { Address } from '@/shared/types/address';
import { Dialog } from '@/shared/ui/dialog';
import { Input, Switch } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useLocation } from 'preact-iso';
import { useTranslation } from '@/shared/i18n/hooks';
import { StackedAvatars } from '@/shared/ui/profile';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import type { PracticeDetails } from '@/shared/lib/apiClient';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { getFrontendHost } from '@/config/urls';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { FormGrid, SectionDivider } from '@/shared/ui/layout';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { PracticeServicesSummary } from '@/features/settings/components/PracticeServicesSummary';
import { SettingRow } from '@/features/settings/components/SettingRow';
import {
  usePracticeSyncParamRefetch,
} from '@/features/settings/hooks/usePracticePageEffects';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';
import { cn } from '@/shared/utils/cn';

interface OnboardingDetails {
  contactPhone?: string;
  businessEmail?: string;
  website?: string;
  address?: Address;
  accentColor?: string;
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
    setIfDefined('accentColor', details.accentColor ?? undefined);
    setIfDefined('isPublic', details.isPublic ?? undefined);
    setIfDefined('services', details.services ?? undefined);
    setIfDefined('contactPhone', details.businessPhone ?? undefined);
    setIfDefined('businessEmail', details.businessEmail ?? undefined);
  }
  const baseFromPractice: OnboardingDetails = {
    website: practice.website ?? undefined,
    address: buildAddress(practice),
    accentColor: practice.accentColor ?? undefined,
    isPublic: practice.isPublic ?? undefined,
    services: practice.services ?? undefined,
    contactPhone: practice.businessPhone ?? undefined,
    businessEmail: practice.businessEmail ?? undefined
  };
  return { ...baseFromPractice, ...baseFromDetails };
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
  const { session, isPending: sessionPending, activeMemberRole } = useSessionContext();
  const { 
    currentPractice,
    loading, 
    error,
    createPractice,
    deletePractice,
    refetch,
  } = usePracticeManagement({ fetchPracticeDetails: true });
  const activePracticeId = currentPractice?.id ?? null;
  const { details: practiceDetails, updateDetails } = usePracticeDetails(activePracticeId, currentPractice?.slug, false);
  
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const navigateTo = onNavigate ?? navigate;
  const location = useLocation();
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = (subPath?: string) => buildSettingsPath(settingsBasePath, subPath);
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { t } = useTranslation(['settings']);
  
  // Get current user email from session
  const currentUserEmail = session?.user?.email || '';
  
  // Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: ''
  });
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const practice = currentPractice ?? null;
  const {
    members,
    refetch: refetchTeam,
  } = usePracticeTeam(
    practice?.id ?? null,
    session?.user?.id ?? null,
    { enabled: Boolean(practice?.id) }
  );
  
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
  const accentColorValue = normalizeAccentColor(onboardingData.accentColor) ?? '#D4AF37';
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
  const modalContentClassName = 'glass-panel';

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

  // Refetch after return from portal
  usePracticeSyncParamRefetch({
    location,
    practiceId: practice?.id ?? null,
    refetch: async () => {
      await Promise.all([refetch(), refetchTeam()]);
    },
    showSuccess
  });

  const handleCreatePractice = async () => {
    if (isSettingsSaving) return;
    if (!createForm.name.trim()) {
      showError('Practice name is required');
      return;
    }

    setIsSettingsSaving(true);
    try {
      await createPractice({
        name: createForm.name,
      });
      
      showSuccess('Practice created successfully!');
      setShowCreateModal(false);
      setCreateForm({ name: '' });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create practice');
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
      navigate(buildSettingsPath(settingsBasePath, 'practice'), true);
    }
  }, [isContactModalOpen, location.query?.setup, navigate, openContactModal, settingsBasePath]);

  const handleTogglePublic = async (nextValue: boolean) => {
    await saveOnboardingSettings(
      {
        isPublic: nextValue
      },
      nextValue ? 'Practice is now public.' : 'Practice is now private.'
    );
  };

  const licensedStatesSummary = practiceDetails?.serviceStates?.length
    ? practiceDetails.serviceStates.join(', ')
    : 'No licensed states configured';

  const handleDeletePractice = async () => {
    if (!practice) return;
    
    if (deleteConfirmText.trim() !== practice.name) {
      showError('Practice name must match exactly');
      return;
    }

    setIsDeleting(true);
    try {
      await deletePractice(practice.id);
      showSuccess('Practice deleted successfully!');
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      navigate('/');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete practice');
    } finally {
      setIsDeleting(false);
    }
  };

  // Loading state: show loading only when actively fetching
  // Once loading is complete (loading=false, sessionPending=false), show the result:
  // - practice data if available
  // - error state if error
  // - "no data" state if neither (this prompts user to reload)
  const shouldShowLoading = loading || sessionPending;

  if (shouldShowLoading) {
    return <LoadingBlock className={className} label="Loading practice..." />;
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
          <p className="text-sm text-input-placeholder">No practice data is available yet.</p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={refetch}>
              Reload
            </Button>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              Create Practice
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
              <SettingRow
                label="Brand"
                labelNode={(
                  <div className="flex items-center gap-4">
                    <div className="glass-panel flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg">
                      {practice.logo ? (
                        <img
                          src={practice.logo}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-base font-semibold text-input-text">
                          {(practice.name || 'P').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-medium text-input-text">Brand</h3>
                      <div className="mt-2 flex min-w-0 items-center gap-3">
                        <SettingsHelperText className="truncate">{practice.name || 'Practice'}</SettingsHelperText>
                        <div
                          className="h-5 w-5 shrink-0 rounded-full"
                          style={{ backgroundColor: accentColorValue }}
                          aria-label={`Current accent color ${accentColorValue}`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigateTo(toSettingsPath('apps/blawby-messenger/settings'))}
                    className="hidden sm:inline-flex"
                  >
                    Manage
                  </Button>
                  <Button
                    variant="icon"
                    size="icon-sm"
                    onClick={() => navigateTo(toSettingsPath('apps/blawby-messenger/settings'))}
                    className="sm:hidden"
                    aria-label="Manage brand"
                    icon={ChevronRightIcon} iconClassName="w-5 h-5"
                  />
                </div>
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
                    <h3 className="text-sm font-semibold text-input-text">Contact</h3>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <Icon icon={GlobeAltIcon} className="w-4 h-4 text-input-placeholder mt-0.5" aria-hidden="true"  />
                        <SettingsHelperText>{websiteValue || 'Not set'}</SettingsHelperText>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon={PhoneIcon} className="w-4 h-4 text-input-placeholder mt-0.5" aria-hidden="true"  />
                        <SettingsHelperText>{phoneValue || 'Not set'}</SettingsHelperText>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon={MapPinIcon} className="w-4 h-4 text-input-placeholder mt-0.5" aria-hidden="true"  />
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
                    size="icon-sm"
                    onClick={openContactModal}
                    className="sm:hidden"
                    aria-label="Manage contact details"
                    icon={ChevronRightIcon} iconClassName="w-5 h-5"
                  />
                </div>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Coverage"
                labelNode={(
                  <div>
                    <h3 className="text-sm font-semibold text-input-text">
                      Coverage
                    </h3>
                    <PracticeServicesSummary services={servicesList} />
                    <SettingsHelperText className="mt-2">
                      Licensed states: {licensedStatesSummary}
                    </SettingsHelperText>
                  </div>
                )}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigateTo(toSettingsPath('practice/coverage'))}
                    className="hidden sm:inline-flex"
                  >
                    {t('settings:account.plan.manage')}
                  </Button>
                  <Button
                    variant="icon"
                    size="icon-sm"
                    onClick={() => navigateTo(toSettingsPath('practice/coverage'))}
                    className="sm:hidden"
                    aria-label="Manage coverage"
                    icon={ChevronRightIcon} iconClassName="w-5 h-5"
                  />
                </div>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Pricing"
                labelNode={(
                  <div>
                    <h3 className="text-sm font-semibold text-input-text">Pricing &amp; Fees</h3>
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
                    onClick={() => navigateTo(toSettingsPath('practice/pricing'))}
                    className="hidden sm:inline-flex"
                  >
                    Manage
                  </Button>
                  <Button
                    variant="icon"
                    size="icon-sm"
                    onClick={() => navigateTo(toSettingsPath('practice/pricing'))}
                    className="sm:hidden"
                    aria-label="Manage pricing"
                    icon={ChevronRightIcon} iconClassName="w-5 h-5"
                  />
                </div>
              </SettingRow>

              <SectionDivider />

              <SettingRow
                label="Team"
                labelNode={(
                  <div>
                    <h3 className="text-sm font-semibold text-input-text">
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
                      ? `${toSettingsPath('practice/team')}?invite=1`
                      : toSettingsPath('practice/team'))}
                    className="hidden sm:inline-flex"
                  >
                    {members.length === 0 ? 'Invite' : 'Manage'}
                  </Button>
                  <Button
                    variant="icon"
                    size="icon-sm"
                    onClick={() => navigateTo(members.length === 0
                      ? `${toSettingsPath('practice/team')}?invite=1`
                      : toSettingsPath('practice/team'))}
                    className="sm:hidden"
                    aria-label={members.length === 0 ? 'Invite team members' : 'Manage team members'}
                    icon={ChevronRightIcon} iconClassName="w-5 h-5"
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
                        <h3 className="text-sm font-semibold text-input-text">Delete Practice</h3>
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
                            returnUrl: origin
                              ? `${origin}${toSettingsPath('practice')}?sync=1`
                              : `${toSettingsPath('practice')}?sync=1`
                          });
                        }}
                        disabled={submitting}
                        data-testid="practice-delete-action"
                      >
                        {t('settings:account.plan.manage')}
                      </Button>
                    ) : (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        onClick={() => setShowDeleteModal(true)}
                        data-testid="practice-delete-action"
                      >
                        <Icon icon={TrashIcon} className="w-4 h-4 mr-2"  />
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

      {/* Contact Modal */}
      <Dialog
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title="Contact"
        contentClassName={modalContentClassName}
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
            <h4 className="text-sm font-medium text-input-text">Address</h4>
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

          <FormActions
            className="justify-end"
            onCancel={() => setIsContactModalOpen(false)}
            onSubmit={handleSaveContact}
            submitType="button"
            submitText="Save"
            disabled={isSettingsSaving}
          />
        </div>
      </Dialog>

      {/* Create Practice Modal */}
      <Dialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Practice"
        contentClassName={modalContentClassName}
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
          </FormGrid>
          
          <FormActions
            className="justify-end"
            onCancel={() => setShowCreateModal(false)}
            onSubmit={handleCreatePractice}
            submitType="button"
            submitText="Create Practice"
            isLoading={isSettingsSaving}
          />
        </div>
      </Dialog>


      {/* Delete Practice Modal */}
      <Dialog
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Practice"
        contentClassName={modalContentClassName}
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
          
          <FormActions
            className="justify-end"
            onCancel={() => !isDeleting && setShowDeleteModal(false)}
            onSubmit={handleDeletePractice}
            submitType="button"
            submitVariant="danger-ghost"
            submitText="Delete Practice"
            isLoading={isDeleting}
            submitDisabled={deleteConfirmText.trim() !== practice?.name}
          />
        </div>
      </Dialog>

    </div>
  );
};
