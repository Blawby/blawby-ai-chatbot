import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, LogoUploadInput } from '@/shared/ui/input';
import { Combobox } from '@/shared/ui/input/Combobox';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/shared/ui/dropdown';
import { SectionDivider } from '@/shared/ui';
import Modal from '@/shared/components/Modal';
import ConfirmationDialog from '@/shared/components/ConfirmationDialog';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { signOut } from '@/shared/utils/auth';
import { useTranslation } from '@/shared/i18n/hooks';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { useLocation } from 'preact-iso';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { formatDate } from '@/shared/utils/dateTime';
import { deleteUser, getSession, updateUser } from '@/shared/lib/authClient';
import { getCurrentSubscription, type CurrentSubscription } from '@/shared/lib/apiClient';
import { uploadWithProgress } from '@/shared/services/upload/UploadTransport';
import { ChevronDownIcon, XMarkIcon, GlobeAltIcon, PlusIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/20/solid';
import type { UserLinks, EmailSettings } from '@/shared/types/user';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { PlanFeaturesList, type PlanFeature } from '@/features/settings/components/PlanFeaturesList';
import { EmailSettingsSection } from '@/features/settings/components/EmailSettingsSection';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { SettingsDangerButton } from '@/features/settings/components/SettingsDangerButton';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { AccountPreferences } from '@/shared/types/preferences';
import { FormActions, FormLabel } from '@/shared/ui/form';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';


export interface AccountPageProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

const DOMAIN_SELECT_VALUE = '__select__';

const parsePeriodEndDate = (value: string | number | null | undefined): Date | null => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const d = new Date(numeric * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export const AccountPage = ({
  isMobile: _isMobile = false,
  onClose: _onClose,
  className = ''
}: AccountPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const location = useLocation();
  const { navigate, navigateToPricing } = useNavigation();
  const { t } = useTranslation(['settings', 'common']);
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { currentPractice, loading: practiceLoading, refetch } = usePracticeManagement();
  const { session, isPending, activeMemberRole } = useSessionContext();
  const { canAccessPractice: _canAccessPractice } = useWorkspace();
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = (subPath?: string) => buildSettingsPath(settingsBasePath, subPath);
  const [links, setLinks] = useState<UserLinks | null>(null);
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [deleteVerificationSent, setDeleteVerificationSent] = useState(false);
  const [passwordRequiredOverride, setPasswordRequiredOverride] = useState<boolean | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState<number | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);
  

  // Get renewal date from subscription current_period_end first, then practice webhook period end.
  const renewalDate = useMemo(() => {
    if (!currentSubscription) return null;
    return parsePeriodEndDate(currentSubscription?.currentPeriodEnd) || 
           parsePeriodEndDate(currentPractice?.subscriptionPeriodEnd);
  }, [currentSubscription, currentPractice?.subscriptionPeriodEnd]);

  const clearLocalAuthState = useCallback(() => {
    try {
      localStorage.removeItem('onboardingCompleted');
      localStorage.removeItem('onboardingCheckDone');
    } catch (error) {
      console.warn('Failed to clear onboarding flags after account deletion:', error);
    }
  }, []);

  // Ref to store verification timeout ID for cleanup
  const verificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  // Load account data from Better Auth session
  const loadAccountData = useCallback(async () => {
    if (!session?.user) return;
    
    try {
      setError(null);
      const prefs = await getPreferencesCategory<AccountPreferences>('account');
      const user = session.user;
      const customDomains = Array.isArray(prefs?.custom_domains) ? prefs?.custom_domains : [];
      
      const linksData: UserLinks = {
        selectedDomain: prefs?.selected_domain || 'Select a domain',
        linkedinUrl: null,
        githubUrl: null,
        customDomains: customDomains.map((domain) => ({
          domain,
          verified: false,
          verifiedAt: null
        }))
      };
      
      // Convert user data to email settings format
      const emailData: EmailSettings = {
        email: user.email,
        receiveFeedbackEmails: prefs?.receive_feedback_emails ?? false,
        marketingEmails: prefs?.marketing_emails ?? false,
        securityAlerts: prefs?.security_alerts ?? true
      };
      
      setLinks(linksData);
      setEmailSettings(emailData);
    } catch (error) {
      console.error('Failed to load account data:', error);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [session?.user]);

  // Load account data when component mounts or practice changes
  // Only load when practice data is available (not loading) and session is available
  useEffect(() => {
    if (!practiceLoading && currentPractice !== undefined && session?.user) {
      loadAccountData();
    }
  }, [loadAccountData, practiceLoading, currentPractice, session?.user]);

  // Detect OAuth vs password users based on lastLoginMethod
  const userWithExtendedProps = session?.user as typeof session.user & {
    lastLoginMethod?: string;
  };
  const normalizedLoginMethod = userWithExtendedProps?.lastLoginMethod
    ? String(userWithExtendedProps.lastLoginMethod).toLowerCase()
    : null;
  const loginMethodRequiresPassword = normalizedLoginMethod
    ? ['email', 'credential', 'password'].includes(normalizedLoginMethod)
    : false;
  const requiresPassword = passwordRequiredOverride ?? loginMethodRequiresPassword;
  const isOAuthUser = !requiresPassword;

  const isOwner = activeMemberRole === 'owner';
  const canManageBilling = isOwner;

  const subscriptionStatus = (currentSubscription?.status ?? 'none').toLowerCase();
  const subscriptionEnd = parsePeriodEndDate(currentSubscription?.currentPeriodEnd) || 
                           parsePeriodEndDate(currentPractice?.subscriptionPeriodEnd);
  const hasActiveSubscription = currentSubscription !== null && 
    ['active', 'trialing', 'past_due'].includes((currentSubscription.status || '').toLowerCase());
  const hasActivePeriod = Boolean(subscriptionEnd && subscriptionEnd.getTime() > Date.now());
  const hasSubscription = Boolean(hasActiveSubscription || currentSubscription);
  const deletionBlockedBySubscription = isOwner && (hasActiveSubscription || hasActivePeriod);
  const isDeleteBlocked = deletionBlockedBySubscription;
  const deletionBlockedMessage = (() => {
    if (!deletionBlockedBySubscription) {
      return '';
    }
    if (subscriptionStatus === 'canceled' && subscriptionEnd) {
      return `Subscription will end on ${formatDate(subscriptionEnd)}. You can delete your account after it ends.`;
    }
    if (subscriptionEnd) {
      return `Subscription is active until ${formatDate(subscriptionEnd)}. Cancel it before deleting your account.`;
    }
    return 'Subscription must be canceled before deleting your account.';
  })();

  // SSR-safe origin for return URLs
  const origin = (typeof window !== 'undefined' && window.location)
    ? window.location.origin
    : '';

  const refreshSubscription = useCallback(async (signal?: AbortSignal) => {
    if (!session?.user) return;
    setSubscriptionLoading(true);
    try {
      const subscription = await getCurrentSubscription({ signal });
      setCurrentSubscription(subscription);
      setSubscriptionError(null);
    } catch (fetchError) {
      if (signal?.aborted) {
        return;
      }
      console.error('[Account] Failed to load subscription state', fetchError);
      setSubscriptionError('Unable to load subscription state from API.');
      setCurrentSubscription(null);
    } finally {
      setSubscriptionLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user) {
      setCurrentSubscription(null);
      setSubscriptionError(null);
      setSubscriptionLoading(false);
      return;
    }
    const controller = new AbortController();
    void refreshSubscription(controller.signal);
    return () => controller.abort();
  }, [refreshSubscription, session?.user]);

  // Refetch after return from Stripe portal or checkout
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('sync') === '1' && currentPractice?.id) {
      const controller = new AbortController();
      
      // Cleanup URL immediately to avoid re-triggering on slow re-renders
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('sync');
      location.route(newUrl.pathname + newUrl.search, true);

      void (async () => {
        let refreshSucceeded = false;
        try {
          await refreshSubscription(controller.signal);
          refreshSucceeded = true;
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error('Failed to refresh current subscription:', error);
        }

        try {
          // Note: refetch from usePracticeManagement does not currently support AbortSignal cancellation
          await refetch();
          if (!controller.signal.aborted && refreshSucceeded) {
            showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error('Failed to refresh subscription:', error);
        }
      })();

      return () => controller.abort();
    }
  }, [currentPractice?.id, refetch, refreshSubscription, showSuccess, location]);

  // Cleanup verification timeout on unmount
  useEffect(() => {
    return () => {
      if (verificationTimeoutRef.current !== null) {
        clearTimeout(verificationTimeoutRef.current);
      }
      isMountedRef.current = false;
    };
  }, []);


  // No need for custom event listeners - Better Auth handles reactivity automatically

  // Simple computed values for demo - only compute when currentTier is available
  const currentPlanFeatures = (() => {
    const backendFeatures = currentSubscription?.plan?.features;
    if (!Array.isArray(backendFeatures)) {
      return [] as PlanFeature[];
    }
    return backendFeatures.map((feature): PlanFeature => ({
      icon: CheckIcon,
      text: feature
    }));
  })();
  const emailAddress = emailSettings?.email || session?.user?.email || '';
  const displayName = session?.user?.name || emailAddress || '—';
  const currentAvatarUrl = avatarPreviewUrl ?? session?.user?.image ?? null;

  const handleAvatarChange = useCallback(async (files: FileList | File[]) => {
    const fileList = Array.isArray(files) ? files : Array.from(files ?? []);
    const [file] = fileList;
    if (!file) return;

    if (!currentPractice?.id) {
      showError('Select a practice first', 'Choose a practice before uploading a profile photo.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      showError('Invalid file', 'Please select an image file.');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      showError('File too large', 'Please upload an image under 5 MB.');
      return;
    }

    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }

    const previewUrl = URL.createObjectURL(file);
    avatarObjectUrlRef.current = previewUrl;
    setAvatarPreviewUrl(previewUrl);
    setAvatarUploading(true);
    setAvatarUploadProgress(0);

    try {
      const uploaded = await uploadWithProgress(file, {
        practiceId: currentPractice.id,
        onProgress: (progress) => setAvatarUploadProgress(progress.percentage)
      });
      await updateUser({ image: uploaded.url });
      await getSession().catch((error) => {
        console.warn('[Account] Session refresh failed after avatar update', error);
      });

      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      setAvatarPreviewUrl(null);
      showSuccess('Profile photo updated', 'Your avatar has been saved.');
    } catch (error) {
      showError('Avatar upload failed', error instanceof Error ? error.message : 'Unable to upload image.');
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      setAvatarPreviewUrl(session?.user?.image ?? null);
    } finally {
      setAvatarUploading(false);
      setAvatarUploadProgress(null);
    }
  }, [currentPractice?.id, session?.user?.image, showError, showSuccess]);

  useEffect(() => {
    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
    };
  }, []);
  const customDomainOptions = (links?.customDomains || []).map(domain => ({
    value: domain.domain,
    label: domain.domain
  }));
  const deleteListItems = t('settings:account.delete.listItems', { returnObjects: true }) as string[];
  const _confirmLabel = t('settings:account.delete.confirmLabel', { email: emailAddress });
  const selectedDomain = links?.selectedDomain && links.selectedDomain !== 'Select a domain'
    ? links.selectedDomain
    : DOMAIN_SELECT_VALUE;
  const showLinksSection = true;
  const showFeedbackToggle = false;


  

  const handleDeleteAccount = () => {
    if (subscriptionLoading) {
      showError('Checking subscription', 'Please wait while we verify your subscription status.');
      return;
    }
    if (isDeleteBlocked) {
      const endLabel = subscriptionEnd ? `Access ends on ${formatDate(subscriptionEnd)}.` : undefined;
      const message = subscriptionStatus === 'canceled'
        ? `Your subscription is scheduled to cancel. ${endLabel ?? ''} You can delete your account after it ends.`
        : `Your subscription is still active. ${endLabel ?? ''} Please cancel it before deleting your account.`;
      showError('Account deletion unavailable', message.trim());
      return;
    }
    setShowDeleteConfirm(true);
    setDeleteVerificationSent(false);
    setPasswordRequiredOverride(null);
  };

  const passwordLabel = t('settings:account.delete.passwordLabel', {
    defaultValue: 'Enter your password to confirm deletion.'
  });
  const passwordPlaceholder = t('settings:account.delete.passwordPlaceholder', {
    defaultValue: 'Current password'
  });
  const passwordRequiredMessage = t('settings:account.delete.passwordRequired', {
    defaultValue: 'Password is required to delete your account.'
  });

  const handleConfirmDelete = async ({ password }: { password?: string } = {}) => {
    try {
      if (isOAuthUser) {
        // OAuth users: just call deleteUser, triggers verification email
        await deleteUser();
        setDeleteVerificationSent(true);
        clearLocalAuthState();
        showSuccess(
          t('settings:account.delete.verificationSentTitle'),
          t('settings:account.delete.verificationSentBody')
        );
      } else {
        // Password users: call deleteUser with password (handled by Better Auth)
        if (!password || password.trim().length === 0) {
          throw new Error(passwordRequiredMessage);
        }
        await deleteUser({ password });
        await signOut({ navigate }); // Use top-level signOut from utils/auth
        setShowDeleteConfirm(false);
        setDeleteVerificationSent(false);
        setPasswordRequiredOverride(null);
        clearLocalAuthState();
        showSuccess(
          t('settings:account.delete.toastSuccessTitle'),
          t('settings:account.delete.toastSuccessBody')
        );
        if (_onClose) {
          _onClose();
        }
        setTimeout(() => {
          navigate('/', true);
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Type-safe error property extraction
      const getErrorCode = (err: unknown): string | undefined => {
        if (typeof err === 'object' && err !== null) {
          const errorObj = err as Record<string, unknown>;
          // Check for direct code property
          if ('code' in errorObj && typeof errorObj.code === 'string') {
            return errorObj.code;
          }
          // Check for nested data.code property
          if ('data' in errorObj && typeof errorObj.data === 'object' && errorObj.data !== null) {
            const dataObj = errorObj.data as Record<string, unknown>;
            if ('code' in dataObj && typeof dataObj.code === 'string') {
              return dataObj.code;
            }
          }
        }
        return undefined;
      };
      
      const errorCode = getErrorCode(error);
      const maybePasswordRequired =
        errorCode === 'PASSWORD_REQUIRED' ||
        /password/i.test(errorMessage);

      if (maybePasswordRequired) {
        setPasswordRequiredOverride(true);
      }

      throw error; // Let ConfirmationDialog handle error display
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteVerificationSent(false);
    setPasswordRequiredOverride(null);
  };

  // Domain validation function
  const validateDomain = (domain: string): string | null => {
    const trimmed = domain.trim();
    
    if (!trimmed) {
      return 'settings:account.domainErrors.empty';
    }
    
    if (trimmed !== domain) {
      return 'settings:account.domainErrors.spaces';
    }
    
    // Basic domain format validation regex
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainRegex.test(trimmed)) {
      return 'settings:account.domainErrors.format';
    }
    
    // Check for duplicates (case-insensitive)
    const existingDomains = links?.customDomains?.map(d => d.domain.toLowerCase()) || [];
    if (existingDomains.includes(trimmed.toLowerCase())) {
      return 'settings:account.domainErrors.duplicate';
    }
    
    return null;
  };

  const handleOpenDomainModal = () => {
    setShowDomainModal(true);
    setDomainInput('');
    setDomainError(null);
  };

  const handleCloseDomainModal = () => {
    setShowDomainModal(false);
    setDomainInput('');
    setDomainError(null);
  };

  const handleDomainSubmit = async () => {
    const errorKey = validateDomain(domainInput);
    if (errorKey) {
      const message = t(errorKey);
      setDomainError(message);
      showError(t('settings:account.links.invalidDomainToast.title'), message);
      return;
    }

    const normalized = domainInput.trim().toLowerCase();
    
    try {
      // Create updated custom domains array
      const updatedCustomDomains = [
        ...(links?.customDomains || []),
        {
          domain: normalized,
          verified: false,
          verifiedAt: null
        }
      ];
      
      // Update user in database with both selectedDomain and customDomains
      await updatePreferencesCategory('account', {
        selected_domain: normalized,
        custom_domains: updatedCustomDomains.map((entry) => entry.domain)
      });
      
      const updatedLinks = {
        ...links,
        selectedDomain: normalized,
        customDomains: updatedCustomDomains
      };
      
      setLinks(updatedLinks);
      handleCloseDomainModal();
      showSuccess(
        t('settings:account.links.addDomainToast.title'),
        t('settings:account.links.addDomainToast.body', { domain: normalized })
      );
    } catch (error) {
      console.error('Failed to update domain:', error);
      showError(
        t('common:notifications.settingsSaveErrorTitle'),
        t('common:notifications.settingsSaveErrorBody')
      );
    }
    
    // Simulate domain verification process with cancellable timeout
    // Clear any existing verification timeout to prevent race conditions
    if (verificationTimeoutRef.current !== null) {
      clearTimeout(verificationTimeoutRef.current);
    }
    
    verificationTimeoutRef.current = setTimeout(() => {
      // Use functional state update to avoid overwriting concurrent changes
      setLinks(currentLinks => {
        if (!currentLinks) return currentLinks;
        
        const updatedVerifyLinks = {
          ...currentLinks,
          customDomains: currentLinks.customDomains?.map(domain => 
            domain.domain === normalized 
              ? { ...domain, verified: true, verifiedAt: new Date().toISOString() }
              : domain
          ) || []
        };
        
        // Note: Domain verification would be handled by the backend
        // For now, we just update the local state
        
        // Show success toast with translated strings
        showSuccess(
          t('settings:account.links.verifiedToast.title'),
          t('settings:account.links.verifiedToast.body', { domain: normalized })
        );
        
        return updatedVerifyLinks;
      });
      
      // Clear the timeout reference
      verificationTimeoutRef.current = null;
    }, 3000); // Simulate 3-second verification process
  };

  const handleAddLinkedIn = () => {
    showSuccess(
      t('settings:account.links.linkedinToast.title'),
      t('settings:account.links.linkedinToast.body')
    );
  };

  const handleAddGitHub = () => {
    showSuccess(
      t('settings:account.links.githubToast.title'),
      t('settings:account.links.githubToast.body')
    );
  };

  const handleDomainChange = async (domain: string) => {
    if (domain === 'verify-new') {
      // Handle "Verify new domain" option
      handleOpenDomainModal();
    } else if (domain !== DOMAIN_SELECT_VALUE) {
      try {
      // Update user in database with current custom domains
        await updatePreferencesCategory('account', {
          selected_domain: domain,
          custom_domains: (links?.customDomains || []).map((entry) => entry.domain)
        });
        
        setLinks(prev => prev ? { ...prev, selectedDomain: domain } : prev);
      } catch (error) {
        console.error('Failed to update domain:', error);
        showError(
          t('common:notifications.settingsSaveErrorTitle'),
          t('common:notifications.settingsSaveErrorBody')
        );
      }
    } else {
      setLinks(prev => (prev ? { ...prev, selectedDomain: prev.selectedDomain ?? domain } : prev));
    }
  };

  const handleFeedbackEmailsChange = async (checked: boolean) => {
    try {
      await updatePreferencesCategory('account', { receive_feedback_emails: checked });
      
      setEmailSettings(prev => prev ? { 
        ...prev, 
        receiveFeedbackEmails: checked 
      } : { 
        email: '', 
        receiveFeedbackEmails: checked, 
        marketingEmails: false, 
        securityAlerts: false 
      });
    } catch (error) {
      console.error('Failed to update email settings:', error);
      showError(
        t('common:notifications.settingsSaveErrorTitle'),
        t('common:notifications.settingsSaveErrorBody')
      );
    }
  };

  // Features are now loaded dynamically from the pricing service

  // Show loading state while session or practice is loading
  // Add timeout protection - if loading for more than 10 seconds, show error with retry
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  useEffect(() => {
    if (isPending || practiceLoading || subscriptionLoading) {
      const timeout = setTimeout(() => {
        setLoadingTimeout(true);
      }, 10000); // 10 second timeout
      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [isPending, practiceLoading, subscriptionLoading]);

  if ((isPending || practiceLoading || subscriptionLoading) && !loadingTimeout) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadingTimeout || error) {
    throw new Error(
      loadingTimeout
        ? 'Loading timed out. Please check your connection and try again.'
        : (error || 'An error occurred while loading your account information.')
    );
  }

  const currentPlanLabel = hasSubscription
    ? (currentSubscription?.plan?.displayName || currentSubscription?.plan?.name || t('settings:account.plan.tiers.free'))
    : t('settings:account.plan.tiers.free');

  return (
    <SettingsPageLayout title={t('settings:account.title')} className={className}>
      <SettingRow label={t('settings:account.nameLabel')}>
        <span className="text-sm text-input-text">
          {displayName}
        </span>
      </SettingRow>
      <SettingRow label="Profile photo" description="Upload a square image (max 5 MB).">
        <div className="w-full">
          <LogoUploadInput
            imageUrl={currentAvatarUrl}
            name={displayName}
            accept="image/*"
            multiple={false}
            onChange={handleAvatarChange}
            disabled={avatarUploading}
            progress={avatarUploading ? avatarUploadProgress : null}
          />
        </div>
      </SettingRow>

      <SectionDivider />

          {/* Subscription Plan Section */}
          <SettingRow
            label={currentPlanLabel}
            labelClassName="text-input-text font-semibold"
            description={
              hasSubscription && renewalDate
                ? t('settings:account.plan.autoRenews', { date: formatDate(renewalDate) })
                : undefined
            }
          >
            <div className="flex gap-2">
              {hasSubscription ? (
                currentPractice && isOwner && canManageBilling ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={submitting}
                        icon={<ChevronDownIcon className="w-4 h-4" />}
                        iconPosition="right"
                      >
                        {t('settings:account.plan.manage')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[220px]">
                      <DropdownMenuItem
                        onSelect={() => {
                          if (!currentPractice) return;
                          if (!origin) {
                            showError(
                              t('common:error.title'),
                              'Unable to open billing portal. Please try again.'
                            );
                            return;
                          }
                          void openBillingPortal({
                            practiceId: currentPractice.id,
                            returnUrl: `${origin}${toSettingsPath('account')}?sync=1`
                          });
                        }}
                      >
                        <span className="flex items-center gap-2 whitespace-nowrap text-red-600 dark:text-red-400">
                          <XMarkIcon className="h-4 w-4" />
                          {t('settings:account.plan.cancelSubscription')}
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateToPricing()}
                >
                  {t('settings:account.plan.upgrade')}
                </Button>
              )}
            </div>
          </SettingRow>
          {subscriptionError && (
            <SettingsHelperText className="mt-2 text-red-500">
              {subscriptionError}
            </SettingsHelperText>
          )}

          {/* Plan Features Section */}
          <SettingRow
            label=""
            labelNode={
              <div className="space-y-3">
                {hasSubscription && (
                  <p className="text-sm font-semibold text-input-text">
                    {t('settings:account.plan.thanksForSubscribing')}
                  </p>
                )}
                <PlanFeaturesList features={currentPlanFeatures} />
              </div>
            }
          />

      <SectionDivider />

          <SettingRow
            label={t('settings:account.payments.sectionTitle')}
            description={t('settings:account.payments.description')}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!currentPractice) return;
                if (!origin) {
                  showError(
                    t('common:error.title'),
                    'Unable to open billing portal. Please try again.'
                  );
                  return;
                }
                void openBillingPortal({
                  practiceId: currentPractice.id,
                  returnUrl: `${origin}${toSettingsPath('account')}?sync=1`
                });
              }}
              disabled={!currentPractice || !isOwner || !canManageBilling || submitting}
            >
              {t('settings:account.payments.manage')}
            </Button>
          </SettingRow>

      <SectionDivider />

          <SettingRow
            label={t('settings:account.payouts.sectionTitle')}
            description={t('settings:account.payouts.description')}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(toSettingsPath('account/payouts'))}
            >
              {t('settings:account.payouts.manage')}
            </Button>
          </SettingRow>

      <SectionDivider />

          {/* Delete account Section */}
          <SettingRow
            label={t('settings:account.delete.sectionTitle')}
            description={isDeleteBlocked ? deletionBlockedMessage : undefined}
          >
            {isDeleteBlocked ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!currentPractice) return;
                    if (!origin) {
                      showError(
                        t('common:error.title'),
                        'Unable to open billing portal. Please try again.'
                      );
                      return;
                    }
                    void openBillingPortal({
                      practiceId: currentPractice.id,
                      returnUrl: `${origin}${toSettingsPath('account')}?sync=1`
                    });
                  }}
                  disabled={!currentPractice || !isOwner || !canManageBilling}
                  data-testid="account-delete-action"
                >
                  {t('settings:account.plan.manage')}
                </Button>
              </div>
            ) : (
              <SettingsDangerButton
                size="sm"
                onClick={handleDeleteAccount}
                data-testid="account-delete-action"
              >
                {t('settings:account.delete.button')}
              </SettingsDangerButton>
            )}
          </SettingRow>

      <SectionDivider />

      {showLinksSection && (
        <>
          {/* Links Section */}
          <SettingSection title={t('settings:account.links.title')}>
            {/* Domain Selector */}
            <SettingRow
              label={t('settings:account.links.domainLabel')}
              labelNode={
                <div className="flex items-center gap-3">
                  <GlobeAltIcon className="w-5 h-5 text-input-placeholder" />
                  <FormLabel>{t('settings:account.links.domainLabel')}</FormLabel>
                </div>
              }
            >
              <Combobox
                value={selectedDomain}
                options={[
                  { value: DOMAIN_SELECT_VALUE, label: t('settings:account.links.selectOption') },
                  ...customDomainOptions,
                  { value: 'verify-new', label: `+ ${t('settings:account.links.verifyNew')}` }
                ]}
                onChange={handleDomainChange}
                placeholder={t('settings:account.links.selectOption')}
                className="border-0 bg-transparent px-3 py-1 hover:bg-white/[0.04] focus:ring-2 focus:ring-accent-500"
                searchable={false}
              />
            </SettingRow>

            {/* LinkedIn */}
            <SettingRow
              label="LinkedIn"
              labelNode={
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-black rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">in</span>
                  </div>
                  <FormLabel>LinkedIn</FormLabel>
                </div>
              }
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddLinkedIn}
                icon={<PlusIcon className="w-4 h-4" />}
                iconPosition="right"
              >
                {t('settings:account.links.addButton')}
              </Button>
            </SettingRow>

            {/* GitHub */}
            <SettingRow
              label="GitHub"
              labelNode={
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-input-placeholder fill-current">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                  </div>
                  <FormLabel>GitHub</FormLabel>
                </div>
              }
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddGitHub}
                icon={<PlusIcon className="w-4 h-4" />}
                iconPosition="right"
              >
                {t('settings:account.links.addButton')}
              </Button>
            </SettingRow>
          </SettingSection>

          <SectionDivider />
        </>
      )}

      {/* Email Section */}
      <EmailSettingsSection
        email={emailAddress}
        receiveFeedbackEmails={emailSettings?.receiveFeedbackEmails || false}
        onFeedbackChange={handleFeedbackEmailsChange}
        title={t('settings:account.email.title')}
        feedbackLabel={t('settings:account.email.receiveFeedback')}
        showFeedbackToggle={showFeedbackToggle}
      />

      <SectionDivider />

      {/* Delete Account Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title={t('settings:account.delete.heading')}
        description={t('settings:account.delete.description')}
        confirmText={t('settings:account.delete.confirmButton')}
        cancelText={t('settings:account.delete.cancel')}
        confirmationValue={emailAddress}
        confirmationLabel={
          isOAuthUser
            ? t('settings:account.delete.confirmLabelOAuth', { email: emailAddress })
            : t('settings:account.delete.confirmLabel', { email: emailAddress })
        }
        warningItems={deleteListItems}
        successMessage={
          deleteVerificationSent ? {
            title: t('settings:account.delete.verificationSentTitle'),
            body: t('settings:account.delete.checkYourEmail')
          } : undefined
        }
        showSuccessMessage={deleteVerificationSent}
        requirePassword={requiresPassword}
        passwordLabel={passwordLabel}
        passwordPlaceholder={passwordPlaceholder}
        passwordMissingMessage={passwordRequiredMessage}
      />

      {/* Domain Input Modal */}
      <Modal
        isOpen={showDomainModal}
        onClose={handleCloseDomainModal}
        title={t('settings:account.domainModal.title')}
        showCloseButton={true}
        type="modal"
      >
        <div className="space-y-4">
          <Input
            id="domain-input"
            type="text"
            label={t('settings:account.domainModal.label')}
            value={domainInput}
            onChange={(value) => {
              setDomainInput(value);
              setDomainError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleDomainSubmit();
              }
            }}
            placeholder={t('settings:account.links.domainPlaceholder')}
            error={domainError ?? undefined}
          />
          
          <FormActions
            className="justify-end"
            size="sm"
            onCancel={handleCloseDomainModal}
            onSubmit={handleDomainSubmit}
            submitType="button"
            cancelText={t('settings:account.domainModal.cancel')}
            submitText={t('settings:account.domainModal.submit')}
          />
        </div>
      </Modal>
    </SettingsPageLayout>
  );
};
