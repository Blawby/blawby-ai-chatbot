import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '@/shared/utils/fetchPlans';

const submitUpgradeMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock('@/shared/i18n/hooks', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; percent?: number }) => {
      const messages: Record<string, string> = {
        'pricing:billing.monthly': 'Monthly',
        'pricing:billing.annually': 'Annually',
        'pricing:billing.yearly': 'year',
        'pricing:billing.billedMonthly': 'Billed monthly. Cancel anytime.',
        'pricing:billing.billedAnnually': 'Billed annually. Cancel anytime.',
        'pricing:billing.paymentFrequency': 'Billing cadence',
        'pricing:billing.savePercent': `Localized save ${options?.percent}%`,
        'pricing:modal.openingBilling': 'Opening billing',
        'pricing:upgradeButton': `Upgrade for ${(options as { price?: string } | undefined)?.price}`,
        'pricing:noFeatures': 'This plan has no features.',
        'pricing:upgradeFailed': 'Upgrade failed',
        'common:errors.tryAgainLater': 'Try again later',
      };
      return messages[key] ?? options?.defaultValue ?? key;
    },
  }),
}));

vi.mock('@/shared/i18n', () => ({
  i18n: { language: 'en' },
}));

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showError: showErrorMock,
  }),
}));

vi.mock('@/shared/hooks/usePaymentUpgrade', () => ({
  usePaymentUpgrade: () => ({
    submitUpgrade: submitUpgradeMock,
    submitting: false,
  }),
}));

const basePlan: SubscriptionPlan = {
  id: 'plan-practice',
  name: 'blawby_practice',
  displayName: 'Blawby Practice',
  description: 'Practice plan',
  stripeProductId: 'prod_practice',
  stripeMonthlyPriceId: 'price_monthly',
  stripeYearlyPriceId: 'price_yearly',
  monthlyPrice: '40.00',
  yearlyPrice: '420.00',
  currency: 'USD',
  features: [],
  limits: {},
  isActive: true,
  isPublic: true,
};

describe('PricingView', () => {
  beforeEach(() => {
    submitUpgradeMock.mockReset();
    showErrorMock.mockReset();
  });

  it('submits yearly-only plans as annual and shows the yearly price', async () => {
    const PricingView = (await import('@/features/pricing/components/PricingView')).default;
    render(
      <PricingView
        practiceId="practice-123"
        planOverride={{
          ...basePlan,
          stripeMonthlyPriceId: null,
          monthlyPrice: null,
        }}
      />
    );

    expect(screen.queryByRole('group', { name: 'Billing cadence' })).not.toBeInTheDocument();
    expect(screen.getByText('/year')).toBeInTheDocument();
    expect(screen.getByText('Billed annually. Cancel anytime.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Upgrade for/i }));

    await waitFor(() => {
      expect(submitUpgradeMock).toHaveBeenCalledWith({
        practiceId: 'practice-123',
        plan: 'blawby_practice',
        annual: true,
      });
    });
  });

  it('uses localized labels for the billing selector and yearly discount', async () => {
    const PricingView = (await import('@/features/pricing/components/PricingView')).default;
    render(<PricingView planOverride={basePlan} />);

    expect(screen.getByRole('group', { name: 'Billing cadence' })).toBeInTheDocument();
    expect(screen.getByText('Localized save 13%')).toBeInTheDocument();
  });
});
