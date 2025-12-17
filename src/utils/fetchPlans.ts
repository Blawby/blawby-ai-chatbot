import { apiClient } from '../lib/apiClient';

export interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  description: string;
  stripeProductId: string;
  stripeMonthlyPriceId: string;
  stripeYearlyPriceId: string | null;
  monthlyPrice: string;
  yearlyPrice: string | null;
  currency: string;
  features: string[];
  limits: {
    users?: number;
    invoices_per_month?: number;
    storage_gb?: number;
  };
  meteredItems?: Array<{
    priceId: string;
    meterName: string;
    type: string;
  }>;
  isActive: boolean;
  isPublic: boolean;
}

function normalizePlans(plans: unknown[]): SubscriptionPlan[] {
  return plans.map((plan) => {
    const record = plan as Record<string, unknown>;
    const limits = (record.limits as Record<string, unknown> | undefined) ?? undefined;
    return ({
    id: plan.id as string,
    name: plan.name as string,
    displayName: (plan.display_name || plan.displayName) as string,
    description: (plan.description || '') as string,
    stripeProductId: (plan.stripe_product_id || plan.stripeProductId) as string,
    stripeMonthlyPriceId: (plan.stripe_monthly_price_id || plan.stripeMonthlyPriceId) as string,
    stripeYearlyPriceId: (plan.stripe_yearly_price_id || plan.stripeYearlyPriceId) as string | null,
    monthlyPrice: (plan.monthly_price || plan.monthlyPrice) as string,
    yearlyPrice: (plan.yearly_price || plan.yearlyPrice) as string | null,
    currency: (plan.currency || 'usd') as string,
    features: (plan.features || []) as string[],
    limits: {
      users: (limits?.users as number | undefined) ?? undefined,
      invoices_per_month: (limits?.invoices_per_month as number | undefined) ?? undefined,
      storage_gb: (limits?.storage_gb as number | undefined) ?? undefined,
    },
    meteredItems: (plan.metered_items || plan.meteredItems || []) as Array<{
      priceId: string;
      meterName: string;
      type: string;
    }>,
    isActive: (plan.is_active ?? plan.isActive ?? true) as boolean,
    isPublic: (plan.is_public ?? plan.isPublic ?? true) as boolean,
    }) as SubscriptionPlan;
  });
}

export const fetchPlans = async (): Promise<SubscriptionPlan[]> => {
  const response = await apiClient.get('/api/subscriptions/plans');
  const rawPlans = (response.data?.plans || []) as unknown[];
  return normalizePlans(rawPlans);
};
