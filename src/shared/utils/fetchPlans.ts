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

type PlanAmountUnit = 'cents' | 'dollars';

const normalizePlanAmount = (value: unknown, unit: unknown, label: string): string => {
  const normalizeMajor = (amount: number): string => {
    if (!Number.isFinite(amount)) return '';
    return amount.toFixed(2);
  };

  const normalizeMinor = (amount: number): string => {
    if (!Number.isFinite(amount)) return '';
    const major = toMajorUnits(amount);
    return typeof major === 'number' ? major.toFixed(2) : '';
  };

  const resolvedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  const normalizedUnit = resolvedUnit === 'cents' || resolvedUnit === 'dollars'
    ? (resolvedUnit as PlanAmountUnit)
    : null;

  const requireUnit = () => {
    const message = `[fetchPlans] Missing or invalid price unit for ${label}`;
    console.error(message, { value, unit });
    throw new Error(message);
  };

  const shouldTreatAsMinor = (amount: number, amountUnit: PlanAmountUnit | null): boolean => {
    if (!Number.isFinite(amount)) return false;
    if (amountUnit !== 'cents') return false;
    return Number.isInteger(amount);
  };

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!normalizedUnit) {
      requireUnit();
    }
    if (normalizedUnit === 'cents' && !Number.isInteger(value)) {
      console.error('[fetchPlans] Expected integer cents amount', { value, unit });
      return '';
    }
    return shouldTreatAsMinor(value, normalizedUnit)
      ? normalizeMinor(value)
      : normalizeMajor(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();
    if (trimmed.includes('.')) {
      const parsedMajor = Number(trimmed);
      if (!Number.isFinite(parsedMajor)) return '';
      if (!normalizedUnit) {
        requireUnit();
      }
      if (normalizedUnit === 'cents' && !Number.isInteger(parsedMajor)) {
        console.warn('[fetchPlans] Decimal string provided for cents unit', { value, unit });
        return '';
      }
      return shouldTreatAsMinor(parsedMajor, normalizedUnit) ? normalizeMinor(parsedMajor) : normalizeMajor(parsedMajor);
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      if (!normalizedUnit) {
        requireUnit();
      }
      return shouldTreatAsMinor(parsed, normalizedUnit) ? normalizeMinor(parsed) : normalizeMajor(parsed);
    }
  }

  return '';
};

function normalizePlans(plans: unknown[]): SubscriptionPlan[] {
  return plans.map((plan) => {
    const record = plan as Record<string, unknown>;
    const limits = (record.limits as Record<string, unknown> | undefined) ?? undefined;
    const resolveUnit = (prefix: 'monthly' | 'yearly'): PlanAmountUnit | null => {
      const candidates = [
        record[`${prefix}_price_unit`],
        record[`${prefix}PriceUnit`],
        record[`${prefix}_unit`],
        record[`${prefix}Unit`]
      ];
      const found = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
      if (!found || typeof found !== 'string') return null;
      const normalized = found.trim().toLowerCase();
      return normalized === 'cents' || normalized === 'dollars'
        ? (normalized as PlanAmountUnit)
        : null;
    };
    const monthlyUnit = resolveUnit('monthly');
    const yearlyUnit = resolveUnit('yearly');

    return {
      id: record.id as string,
      name: record.name as string,
      displayName: (record.display_name || record.displayName) as string,
      description: (record.description || '') as string,
      stripeProductId: (record.stripe_product_id || record.stripeProductId) as string,
      stripeMonthlyPriceId: (record.stripe_monthly_price_id || record.stripeMonthlyPriceId) as string,
      stripeYearlyPriceId: (record.stripe_yearly_price_id || record.stripeYearlyPriceId) as string | null,
      monthlyPrice: normalizePlanAmount(
        record.monthly_price ?? record.monthlyPrice,
        monthlyUnit,
        'monthly'
      ),
      yearlyPrice: (() => {
        const rawYearly = record.yearly_price ?? record.yearlyPrice;
        if (rawYearly === null || rawYearly === undefined) return null;
        const normalized = normalizePlanAmount(rawYearly, yearlyUnit, 'yearly');
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
