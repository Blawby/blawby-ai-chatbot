import { apiClient } from '@/shared/lib/apiClient';
import { toMajorUnits } from '@/shared/utils/money';

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
  const normalizeMajor = (amount: number): string => {
    if (!Number.isFinite(amount)) return '';
    return amount.toFixed(2);
  };

  const normalizeMinor = (amount: number): string => {
    if (!Number.isFinite(amount)) return '';
    const major = toMajorUnits(amount);
    return typeof major === 'number' ? major.toFixed(2) : '';
  };

  const shouldTreatAsMinor = (amount: number): boolean => {
    if (!Number.isFinite(amount)) return false;
    if (!Number.isInteger(amount)) return false;
    return Math.abs(amount) >= 1000;
  };

  if (typeof value === 'number' && Number.isFinite(value)) {
    return shouldTreatAsMinor(value) ? normalizeMinor(value) : normalizeMajor(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();
    if (trimmed.includes('.')) {
      const parsedMajor = Number(trimmed);
      return Number.isFinite(parsedMajor) ? normalizeMajor(parsedMajor) : '';
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return shouldTreatAsMinor(parsed) ? normalizeMinor(parsed) : normalizeMajor(parsed);
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
        const normalized = normalizePlanAmount(rawYearly);
        return normalized || null;
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
