import { apiClient } from '@/shared/lib/apiClient';
import { toMajorUnits } from '@/shared/utils/moneyNormalization';

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

const normalizePlanAmount = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const major = toMajorUnits(value);
    return typeof major === 'number' ? major.toFixed(2) : String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      const major = toMajorUnits(parsed);
      return typeof major === 'number' ? major.toFixed(2) : value;
    }
  }
  return '';
};

function normalizePlans(plans: unknown[]): SubscriptionPlan[] {
  return plans.map((plan) => {
    const record = plan as Record<string, unknown>;
    const limits = (record.limits as Record<string, unknown> | undefined) ?? undefined;
    return {
      id: record.id as string,
      name: record.name as string,
      displayName: (record.display_name || record.displayName) as string,
      description: (record.description || '') as string,
      stripeProductId: (record.stripe_product_id || record.stripeProductId) as string,
      stripeMonthlyPriceId: (record.stripe_monthly_price_id || record.stripeMonthlyPriceId) as string,
      stripeYearlyPriceId: (record.stripe_yearly_price_id || record.stripeYearlyPriceId) as string | null,
      monthlyPrice: normalizePlanAmount(record.monthly_price ?? record.monthlyPrice),
      yearlyPrice: (() => {
        const rawYearly = record.yearly_price ?? record.yearlyPrice;
        if (rawYearly === null || rawYearly === undefined) return null;
        return normalizePlanAmount(rawYearly);
      })(),
      currency: (record.currency || 'usd') as string,
      features: (record.features || []) as string[],
      limits: {
        users: limits?.users as number | undefined,
        invoices_per_month: limits?.invoices_per_month as number | undefined,
        storage_gb: limits?.storage_gb as number | undefined,
      },
      meteredItems: (record.metered_items || record.meteredItems || []) as Array<{
        priceId: string;
        meterName: string;
        type: string;
      }>,
      isActive: (record.is_active ?? record.isActive ?? true) as boolean,
      isPublic: (record.is_public ?? record.isPublic ?? true) as boolean,
    };
  });
}

export const fetchPlans = async (): Promise<SubscriptionPlan[]> => {
  const response = await apiClient.get('/api/subscriptions/plans');
  
  // Backend API returns a direct array of plans, not wrapped in {plans: [...]}
  const rawPlans = Array.isArray(response.data) 
    ? response.data 
    : (response.data?.plans || []);
    
  return normalizePlans(rawPlans as unknown[]);
};
