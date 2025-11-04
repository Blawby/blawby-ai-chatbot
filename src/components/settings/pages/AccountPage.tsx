import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { Button } from '../../ui/Button';
import { Select, FormLabel } from '../../ui';
import { FormItem } from '../../ui/form';
import Modal from '../../Modal';
import ConfirmationDialog from '../../ConfirmationDialog';
import { 
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { useToastContext } from '../../../contexts/ToastContext';
import { useNavigation } from '../../../utils/navigation';
import { useSession } from '../../../contexts/AuthContext';
import { updateUser } from '../../../lib/authClient';
import { signOut } from '../../../utils/auth';
import { TIER_FEATURES } from '../../../utils/stripe-products';
import { useTranslation } from '@/i18n/hooks';
import { useLocation } from 'preact-iso';
import { usePaymentUpgrade } from '../../../hooks/usePaymentUpgrade';
import { useOrganizationManagement } from '../../../hooks/useOrganizationManagement';
import { displayPlan, normalizeSeats } from '../../../utils/subscription';
import type { UserLinks, EmailSettings, SubscriptionTier } from '../../../types/user';


export interface AccountPageProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

const DOMAIN_SELECT_VALUE = '__select__';

export const AccountPage = ({
  isMobile: _isMobile = false,
  onClose: _onClose,
  className = ''
}: AccountPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const { t } = useTranslation(['settings', 'common']);
  const location = useLocation();
  const { syncSubscription, openBillingPortal, cancelSubscription, submitting } = usePaymentUpgrade();
  const { currentOrganization, loading: orgLoading, refetch, getMembers, fetchMembers } = useOrganizationManagement();
  const { data: session, isPending } = useSession();
  const [links, setLinks] = useState<UserLinks | null>(null);
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<SubscriptionTier | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [deleteVerificationSent, setDeleteVerificationSent] = useState(false);
  const [passwordRequiredOverride, setPasswordRequiredOverride] = useState<boolean | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
      const user = session.user;
      
      // Convert user data to links format - use type assertion for missing properties
      const userWithExtendedProps = user as typeof user & {
        selectedDomain?: string;
        linkedinUrl?: string;
        githubUrl?: string;
        customDomains?: string;
        receiveFeedbackEmails?: boolean;
        marketingEmails?: boolean;
        securityAlerts?: boolean;
        lastLoginMethod?: string;
      };
      
      const linksData: UserLinks = {
        selectedDomain: userWithExtendedProps.selectedDomain || 'Select a domain',
        linkedinUrl: userWithExtendedProps.linkedinUrl,
        githubUrl: userWithExtendedProps.githubUrl,
        customDomains: userWithExtendedProps.customDomains ? JSON.parse(userWithExtendedProps.customDomains) : [] // Parse JSON string to array
      };
      
      // Convert user data to email settings format
      const emailData: EmailSettings = {
        email: user.email,
        receiveFeedbackEmails: userWithExtendedProps.receiveFeedbackEmails ?? false,
        marketingEmails: userWithExtendedProps.marketingEmails ?? false,
        securityAlerts: userWithExtendedProps.securityAlerts ?? true
      };
      
      // Use real organization subscription tier directly (no mapping needed)
      const orgTier = currentOrganization?.subscriptionTier;
      const displayTier = orgTier || 'free';
      
      setLinks(linksData);
      setEmailSettings(emailData);
      setCurrentTier(displayTier as SubscriptionTier);
    } catch (error) {
      console.error('Failed to load account data:', error);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [session?.user, currentOrganization?.subscriptionTier]);

  // Load account data when component mounts or organization changes
  // Only load when organization data is available (not loading) and session is available
  useEffect(() => {
    if (!orgLoading && currentOrganization !== undefined && session?.user) {
      loadAccountData();
    }
  }, [loadAccountData, orgLoading, currentOrganization, session?.user]);

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

  // Check if current user is organization owner
  const currentUserEmail = session?.user?.email || '';
  const members = useMemo(() => {
    if (!currentOrganization) return [];
    return getMembers(currentOrganization.id);
  }, [currentOrganization, getMembers]);
  
  const currentMember = useMemo(() => {
    if (!currentOrganization || !currentUserEmail) return null;
    return members.find(m => m.email && m.email.toLowerCase() === currentUserEmail.toLowerCase()) || 
           members.find(m => m.userId === session?.user?.id);
  }, [currentOrganization, currentUserEmail, members, session?.user?.id]);
  
  const isOwner = currentMember?.role === 'owner';

  // Fetch members when organization is available (needed for owner check)
  useEffect(() => {
    if (currentOrganization?.id && members.length === 0) {
      fetchMembers(currentOrganization.id).catch((error) => {
        console.error('Failed to fetch members for owner check:', error);
      });
    }
  }, [currentOrganization?.id, members.length, fetchMembers]);

  // Auto-sync on return from Stripe portal or checkout
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('sync') === '1' && currentOrganization?.id) {
      syncSubscription(currentOrganization.id)
        .then(() => {
          refetch();
          showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        })
        .catch((error) => {
          console.error('Auto-sync failed:', error);
          // Error already handled by syncSubscription hook
        })
        .finally(() => {
          // Remove sync param to prevent re-trigger (URL hygiene)
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('sync');
          window.history.replaceState({}, '', newUrl.toString());
        });
    }
  }, [location.search, currentOrganization?.id, syncSubscription, refetch, showSuccess]);


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
  const upgradeButtonText = 'Upgrade Plan';
  const currentPlanFeatures = currentTier && (currentTier === 'free' || currentTier === 'business')
    ? TIER_FEATURES[currentTier]
    : TIER_FEATURES['business'];
  const emailAddress = emailSettings?.email || session?.user?.email || '';
  const customDomainOptions = (links?.customDomains || []).map(domain => ({
    value: domain.domain,
    label: domain.domain
  }));
  const deleteListItems = t('settings:account.delete.listItems', { returnObjects: true }) as string[];
  const _confirmLabel = t('settings:account.delete.confirmLabel', { email: emailAddress });
  const selectedDomain = links?.selectedDomain && links.selectedDomain !== 'Select a domain'
    ? links.selectedDomain
    : DOMAIN_SELECT_VALUE;

  const handleUpgrade = () => {
    if (currentTier === 'enterprise') {
      // No action - they're already at max tier
      return;
    }
    window.location.hash = '#pricing';
  };

  const handleManageBilling = useCallback(async () => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    try {
      await openBillingPortal({ organizationId: orgId });
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      showError('Billing Portal Error', 'Could not open billing portal');
    }
  }, [currentOrganization?.id, openBillingPortal, showError]);

  const handleCancelSubscription = useCallback(async () => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    
    try {
      const success = await cancelSubscription(orgId);
      if (success) {
        setShowCancelConfirm(false);
        await refetch();
      }
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      // Error already handled by cancelSubscription hook
    }
  }, [currentOrganization?.id, cancelSubscription, refetch]);

  const handleDeleteAccount = () => {
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
      const { deleteUser } = await import('../../../lib/authClient');
      
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
        await signOut(); // Use top-level signOut from utils/auth
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
          navigate('/');
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
      await updateUser({ 
        selectedDomain: normalized,
        customDomains: JSON.stringify(updatedCustomDomains)
      } as Parameters<typeof updateUser>[0]);
      
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
        t('common:notifications.errorTitle'),
        t('common:notifications.settingsSaveError')
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
        await updateUser({ 
          selectedDomain: domain,
          customDomains: JSON.stringify(links?.customDomains || [])
        } as Parameters<typeof updateUser>[0]);
        
        setLinks(prev => prev ? { ...prev, selectedDomain: domain } : prev);
      } catch (error) {
        console.error('Failed to update domain:', error);
        showError(
          t('common:notifications.errorTitle'),
          t('common:notifications.settingsSaveError')
        );
      }
    } else {
      setLinks(prev => (prev ? { ...prev, selectedDomain: prev.selectedDomain ?? domain } : prev));
    }
  };

  const handleFeedbackEmailsChange = async (checked: boolean) => {
    try {
      // Update user in database
      await updateUser({ receiveFeedbackEmails: checked } as Parameters<typeof updateUser>[0]);
      
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
        t('common:notifications.errorTitle'),
        t('common:notifications.settingsSaveError')
      );
    }
  };

  // Features are now loaded dynamically from the pricing service

  // Show loading state while session or organization is loading
  // Add timeout protection - if loading for more than 10 seconds, show error with retry
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  useEffect(() => {
    if (isPending || orgLoading) {
      const timeout = setTimeout(() => {
        setLoadingTimeout(true);
      }, 10000); // 10 second timeout
      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [isPending, orgLoading]);

  if ((isPending || orgLoading) && !loadingTimeout) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadingTimeout || error) {
    const errorMessage = loadingTimeout 
      ? 'Loading timed out. Please check your connection and try again.'
      : error || 'An error occurred while loading your account information.';
    
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 mb-4">
            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm font-medium">{t('settings:account.loadingError')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{errorMessage}</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setLoadingTimeout(false);
              setError(null);
              refetch().then(() => {
                if (session?.user && currentOrganization !== undefined) {
                  loadAccountData();
                }
              });
            }}
          >
            {t('settings:account.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('settings:account.title')}
        </h1>
        <div className="border-t border-gray-200 dark:border-dark-border mt-4" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {/* Subscription Plan Section */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Subscription Plan
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {displayPlan(currentOrganization?.subscriptionTier)} • {normalizeSeats(currentOrganization?.seats)} seats
                </p>
              </div>
              {isOwner && (
                <div className="flex gap-2 ml-4">
                  {currentOrganization?.stripeCustomerId ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openBillingPortal({ 
                        organizationId: currentOrganization!.id, 
                        returnUrl: `${window.location.origin}/settings/account?sync=1` 
                      })}
                      disabled={submitting}
                    >
                      Manage billing
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate('/#pricing')}
                    >
                      Upgrade to manage billing
                    </Button>
                  )}
                  {displayPlan(currentOrganization?.subscriptionTier) !== 'Free' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={submitting}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Cancel subscription
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Plan Features Section */}
          <div className="py-3">
            <div className="space-y-2">
              {currentPlanFeatures.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="text-gray-500 dark:text-gray-400">
                    <feature.icon className="w-5 h-5 flex-shrink-0" />
                  </div>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {feature.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Links Section */}
          <div className="py-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t('settings:account.links.title')}
            </h3>
            
            {/* Domain Selector */}
            <FormItem>
              <div className="flex-1 min-w-0">
                <FormLabel>{t('settings:account.links.domainLabel')}</FormLabel>
              </div>
              <div className="ml-4">
                <Select
                  value={selectedDomain}
                  options={[
                    { value: DOMAIN_SELECT_VALUE, label: t('settings:account.links.selectOption') },
                    { value: 'whynot.earth', label: 'whynot.earth' },
                    { value: 'example.com', label: 'example.com' },
                    ...customDomainOptions,
                    { value: 'verify-new', label: `+ ${t('settings:account.links.verifyNew')}` }
                  ]}
                  onChange={handleDomainChange}
                />
              </div>
            </FormItem>

            {/* LinkedIn */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-black rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">in</span>
                </div>
                <span className="text-sm text-gray-900 dark:text-gray-100">LinkedIn</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddLinkedIn}
              >
                {t('settings:account.links.addButton')}
              </Button>
            </div>

            {/* GitHub */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-500 dark:text-gray-400 fill-current">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                <span className="text-sm text-gray-900 dark:text-gray-100">GitHub</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddGitHub}
              >
                {t('settings:account.links.addButton')}
              </Button>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Email Section */}
          <div className="py-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t('settings:account.email.title')}
            </h3>
            
            {/* Email Address */}
            <div className="flex items-center gap-3 py-3">
              <EnvelopeIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-900 dark:text-gray-100">
                {emailAddress}
              </span>
            </div>

            {/* Feedback Emails Checkbox */}
            <div className="flex items-center gap-3 py-3">
              <input
                type="checkbox"
                id="feedback-emails"
                checked={emailSettings?.receiveFeedbackEmails || false}
                onChange={(e) => handleFeedbackEmailsChange(e.currentTarget.checked)}
                className="w-4 h-4 text-accent-500 bg-transparent border-gray-300 dark:border-gray-600 rounded focus:ring-accent-500 focus:ring-2"
              />
              <label htmlFor="feedback-emails" className="text-sm text-gray-900 dark:text-gray-100 cursor-pointer">
                {t('settings:account.email.receiveFeedback')}
              </label>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-dark-border" />

          {/* Delete account Section */}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('settings:account.delete.sectionTitle')}
              </h3>
            </div>
            <div className="ml-4">
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeleteAccount}
                className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 focus:ring-red-500"
              >
                {t('settings:account.delete.button')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Subscription Confirmation Dialog */}
      <Modal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="Are you sure you want to cancel?"
        showCloseButton={true}
        type="modal"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your subscription will be cancelled immediately and you'll lose access to premium features. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowCancelConfirm(false)}
              disabled={submitting}
            >
              Go back
            </Button>
            <Button
              variant="ghost"
              onClick={handleCancelSubscription}
              disabled={submitting}
              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              {submitting ? 'Cancelling…' : 'Cancel subscription'}
            </Button>
          </div>
        </div>
      </Modal>

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
          <div>
            <label htmlFor="domain-input" className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              {t('settings:account.domainModal.label')}
            </label>
            <input
              id="domain-input"
              type="text"
              value={domainInput}
              onChange={(e) => {
                setDomainInput(e.currentTarget.value);
                setDomainError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleDomainSubmit();
                }
              }}
              placeholder={t('settings:account.links.domainPlaceholder')}
              className={`w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-dark-bg text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 ${
                domainError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
              }`}
            />
            {domainError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {domainError}
              </p>
            )}
          </div>
          
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCloseDomainModal}
              className="min-w-[80px]"
            >
              {t('settings:account.domainModal.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDomainSubmit}
              className="min-w-[80px]"
            >
              {t('settings:account.domainModal.submit')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
