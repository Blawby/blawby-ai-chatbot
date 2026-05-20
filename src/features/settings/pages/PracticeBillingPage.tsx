import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { ChevronDown, X, Check } from 'lucide-preact';
import { useLocation } from 'preact-iso';

import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/dropdown';
import { Icon } from '@/shared/ui/Icon';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { useTranslation } from '@/shared/i18n/hooks';
import { getCurrentSubscription, type CurrentSubscription } from '@/shared/lib/apiClient';
import { formatDate } from '@/shared/utils/dateTime';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { cn } from '@/shared/utils/cn';

import { SettingSection } from '@/features/settings/components/SettingSection';
import { PlanFeaturesList, type PlanFeature } from '@/features/settings/components/PlanFeaturesList';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { AccountPageSkeleton } from '@/features/settings/components/AccountPageSkeleton';

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

export interface PracticeBillingPageProps {
  className?: string;
}

export const PracticeBillingPage = ({ className = '' }: PracticeBillingPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { navigateToPricing } = useNavigation();
  const location = useLocation();
  const { t } = useTranslation(['settings', 'common', 'pricing']);
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { currentPractice, isLoading: practiceLoading, refetch } = usePracticeManagement();
  const { session, isPending } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const { workspaceFromPath } = useWorkspace();
  const isClientWorkspace = workspaceFromPath === 'client';
  const { members } = usePracticeTeam(
    currentPractice?.id ?? null,
    session?.user?.id ?? null,
    { enabled: Boolean(currentPractice?.id && session?.user?.id) },
  );

  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = useCallback(
    (subPath?: string) => buildSettingsPath(settingsBasePath, subPath),
    [settingsBasePath],
  );

  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(!isClientWorkspace);

  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';

  const refreshSubscription = useCallback(async (signal?: AbortSignal) => {
    if (!session?.user) return;
    setSubscriptionLoading(true);
    try {
      const sub = await getCurrentSubscription({ signal });
      setCurrentSubscription(sub);
      setSubscriptionError(null);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('[PracticeBilling] Failed to load subscription state', err);
      setSubscriptionError('Unable to load subscription state.');
      setCurrentSubscription(null);
    } finally {
      setSubscriptionLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user || isClientWorkspace) {
      setCurrentSubscription(null);
      setSubscriptionError(null);
      setSubscriptionLoading(false);
      return;
    }
    const controller = new AbortController();
    void refreshSubscription(controller.signal);
    return () => controller.abort();
  }, [refreshSubscription, session?.user, isClientWorkspace]);

  // Refresh after returning from Stripe portal or checkout flow.
  useEffect(() => {
    if (typeof window === 'undefined' || isClientWorkspace) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('sync') !== '1' || !currentPractice?.id) return;
    const controller = new AbortController();
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('sync');
    location.route(newUrl.pathname + newUrl.search, true);
    void (async () => {
      let ok = false;
      try { await refreshSubscription(controller.signal); ok = true; }
      catch (err) { if (!controller.signal.aborted) console.error('Failed to refresh subscription:', err); }
      try {
        await refetch();
        if (!controller.signal.aborted && ok) {
          showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Failed to refresh practice:', err);
      }
    })();
    return () => controller.abort();
  }, [currentPractice?.id, refetch, refreshSubscription, showSuccess, location, isClientWorkspace]);

  const currentUserEmail = typeof session?.user?.email === 'string' ? session.user.email.trim().toLowerCase() : '';
  const currentMember = members.find((m) =>
    (m.email && m.email.toLowerCase() === currentUserEmail) || m.userId === session?.user?.id,
  ) ?? null;
  const resolvedRole = normalizePracticeRole(activeMemberRole) ?? normalizePracticeRole(currentMember?.role) ?? null;
  const isOwner = resolvedRole === 'owner';
  const canManageBilling = isOwner;

  const renewalDate = useMemo(() => {
    if (!currentSubscription) return null;
    return parsePeriodEndDate(currentSubscription?.currentPeriodEnd)
      || parsePeriodEndDate(currentPractice?.subscriptionPeriodEnd);
  }, [currentSubscription, currentPractice?.subscriptionPeriodEnd]);

  const hasActiveSubscription = currentSubscription !== null
    && ['active', 'trialing', 'past_due'].includes((currentSubscription.status || '').toLowerCase());
  const hasSubscription = Boolean(hasActiveSubscription || currentSubscription);

  const currentPlanFeatures = useMemo<PlanFeature[]>(() => {
    const backendFeatures = currentSubscription?.plan?.features;
    if (!Array.isArray(backendFeatures)) {
      const freeFeatures = [
        t('pricing:plans.free.features.basicChat.text'),
        t('pricing:plans.free.features.documentAnalysis.text'),
        t('pricing:plans.free.features.responseTime.text'),
      ];
      return freeFeatures.map((feature) => ({ icon: Check, text: feature }));
    }
    const limitFeatures = [
      typeof currentSubscription?.plan?.limits?.users === 'number'
        ? currentSubscription.plan.limits.users < 0
          ? t('settings:account.plan.limits.unlimitedUsers')
          : t('settings:account.plan.limits.users', { count: currentSubscription.plan.limits.users })
        : null,
      typeof currentSubscription?.plan?.limits?.storageGb === 'number'
        ? currentSubscription.plan.limits.storageGb < 0
          ? t('settings:account.plan.limits.unlimited')
          : t('settings:account.plan.limits.storageGb', { size: currentSubscription.plan.limits.storageGb })
        : null,
      typeof currentSubscription?.plan?.limits?.invoicesPerMonth === 'number'
        ? currentSubscription.plan.limits.invoicesPerMonth < 0
          ? t('settings:account.plan.limits.unlimitedInvoices')
          : t('settings:account.plan.limits.invoicesPerMonth', { count: currentSubscription.plan.limits.invoicesPerMonth })
        : null,
    ].filter((value): value is string => Boolean(value));
    return [...backendFeatures, ...limitFeatures].map((text) => ({ icon: Check, text }));
  }, [currentSubscription, t]);

  if (isPending || practiceLoading || subscriptionLoading) {
    return <AccountPageSkeleton className={className} />;
  }

  if (isClientWorkspace) {
    return (
      <div className={cn('py-10 text-sm text-input-placeholder', className)}>
        {t('settings:billing.clientNotApplicable', {
          defaultValue: 'Billing is managed by your practice. Reach out to them with any plan or payment questions.',
        })}
      </div>
    );
  }

  const currentPlanLabel = hasSubscription
    ? (currentSubscription?.plan?.displayName ?? currentSubscription?.plan?.name ?? t('settings:account.plan.tiers.free'))
    : t('settings:account.plan.tiers.free');
  const subscriptionDescription = hasSubscription && renewalDate
    ? t('settings:account.plan.autoRenews', { date: formatDate(renewalDate) })
    : t('settings:billing.planDescription', {
      defaultValue: 'Your firm’s subscription to Blawby.',
    });

  const openPortal = () => {
    if (!currentPractice) return;
    if (!origin) {
      showError(t('common:error.title'), 'Unable to open billing portal. Please try again.');
      return;
    }
    void openBillingPortal({
      practiceId: currentPractice.id,
      returnUrl: `${origin}${toSettingsPath('practice/billing')}?sync=1`,
    });
  };

  return (
    <div className={cn('divide-y divide-line-default', className)}>
      <SettingSection
        title={t('settings:billing.currentPlanTitle', { defaultValue: 'Current plan' })}
        description={subscriptionDescription}
      >
        <div className="flex items-start gap-3">
          <span className="text-base font-semibold text-input-text">{currentPlanLabel}</span>
          {hasSubscription && currentPractice ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={submitting}
                  icon={ChevronDown}
                  iconClassName="w-4 h-4"
                  iconPosition="right"
                >
                  {t('settings:account.plan.manage')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuItem
                  onSelect={() => {
                    if (!isOwner || !canManageBilling) {
                      showError(t('common:error.title'), 'Only the billing owner can cancel this subscription.');
                      return;
                    }
                    openPortal();
                  }}
                >
                  <span className="flex items-center gap-2 whitespace-nowrap text-accent-error dark:text-accent-error-light">
                    <Icon icon={X} className="h-4 w-4" />
                    {t('settings:account.plan.cancelSubscription')}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => navigateToPricing()}>
              {t('settings:account.plan.upgrade')}
            </Button>
          )}
        </div>
        {subscriptionError ? (
          <SettingsHelperText className="mt-2 text-accent-error">
            {subscriptionError}
          </SettingsHelperText>
        ) : null}
      </SettingSection>

      <SettingSection
        title={t('settings:billing.planIncludesTitle', { defaultValue: 'Plan includes' })}
        description={t('settings:billing.planIncludesDescription', {
          defaultValue: 'What’s available on your current plan.',
        })}
      >
        <PlanFeaturesList features={currentPlanFeatures} />
      </SettingSection>

      <SettingSection
        title={t('settings:billing.paymentMethodTitle', { defaultValue: 'Payment method' })}
        description={t('settings:billing.paymentMethodDescription', {
          defaultValue: 'How your practice pays Blawby. We use Stripe to handle billing.',
        })}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={openPortal}
          disabled={!currentPractice || !isOwner || !canManageBilling || submitting}
        >
          {t('settings:account.payments.manage')}
        </Button>
      </SettingSection>
    </div>
  );
};

export default PracticeBillingPage;
