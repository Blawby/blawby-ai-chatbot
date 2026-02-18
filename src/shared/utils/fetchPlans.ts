import { apiClient } from '@/shared/lib/apiClient';
import { toMajorUnits } from '@/shared/utils/money';
import type { AxiosRequestConfig } from 'axios';

export interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  imageUrl?: string | null;
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

  const resolveUnit = (rawValue: number | string): PlanAmountUnit | null => {
    if (normalizedUnit) return normalizedUnit;
    void rawValue;
    return null;
  };

  const requireUnit = () => {
    throw new Error(`[fetchPlans] Missing or invalid price unit for ${label}`);
  };

  const shouldTreatAsMinor = (amount: number, amountUnit: PlanAmountUnit | null): boolean => {
    if (!Number.isFinite(amount)) return false;
    if (amountUnit !== 'cents') return false;
    return Number.isInteger(amount);
  };

  if (typeof value === 'number' && Number.isFinite(value)) {
    const effectiveUnit = resolveUnit(value);
    if (!effectiveUnit) {
      requireUnit();
    }
    if (effectiveUnit === 'cents' && !Number.isInteger(value)) {
      throw new Error(`[fetchPlans] Expected integer cents amount for ${label}`);
    }
    return shouldTreatAsMinor(value, effectiveUnit)
      ? normalizeMinor(value)
      : normalizeMajor(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();
    if (trimmed.includes('.')) {
      const parsedMajor = Number(trimmed);
      if (!Number.isFinite(parsedMajor)) return '';
      // Backend contract returns decimal strings (e.g. "40.00") as major units.
      return normalizeMajor(parsedMajor);
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      const effectiveUnit = resolveUnit(trimmed);
      if (!effectiveUnit) {
        requireUnit();
      }
      return shouldTreatAsMinor(parsed, effectiveUnit) ? normalizeMinor(parsed) : normalizeMajor(parsed);
    }
  }

  return '';
};

function normalizePlans(plans: unknown[]): SubscriptionPlan[] {
  return plans.map((plan) => {
    const record = plan as Record<string, unknown>;
    const limits = (record.limits as Record<string, unknown> | undefined) ?? undefined;
    const resolveUnit = (prefix: 'monthly' | 'yearly'): PlanAmountUnit | null => {
      const found = record[`${prefix}_price_unit`];
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
      displayName: record.display_name as string,
      imageUrl: (
        (typeof record.image_url === 'string' && record.image_url.trim().length > 0 ? record.image_url : null) ||
        (typeof record.image === 'string' && record.image.trim().length > 0 ? record.image : null) ||
        (
          typeof record.metadata === 'object' &&
          record.metadata !== null &&
          !Array.isArray(record.metadata) &&
          typeof (record.metadata as Record<string, unknown>).image === 'string' &&
          ((record.metadata as Record<string, unknown>).image as string).trim().length > 0
            ? (record.metadata as Record<string, unknown>).image as string
            : null
        )
      ),
      description: (record.description ?? '') as string,
      stripeProductId: record.stripe_product_id as string,
      stripeMonthlyPriceId: record.stripe_monthly_price_id as string,
      stripeYearlyPriceId: (record.stripe_yearly_price_id ?? null) as string | null,
      monthlyPrice: normalizePlanAmount(
        record.monthly_price,
        monthlyUnit,
        'monthly'
      ),
      yearlyPrice: (() => {
        const rawYearly = record.yearly_price;
        if (rawYearly === null || rawYearly === undefined) return null;
        const normalized = normalizePlanAmount(rawYearly, yearlyUnit, 'yearly');
        return normalized || null;
      })(),
      currency: record.currency as string,
      features: (record.features ?? []) as string[],
      limits: {
        users: limits?.users as number | undefined,
        invoices_per_month: limits?.invoices_per_month as number | undefined,
        storage_gb: limits?.storage_gb as number | undefined,
      },
      meteredItems: (record.metered_items ?? []) as Array<{
        priceId: string;
        meterName: string;
        type: string;
      }>,
      isActive: record.is_active as boolean,
      isPublic: record.is_public as boolean,
    };
  });
}

export const fetchPlans = async (
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<SubscriptionPlan[]> => {
  const response = await apiClient.get('/api/subscriptions/plans', {
    signal: config?.signal
  });

  if (!Array.isArray(response.data)) {
    throw new Error('Invalid /api/subscriptions/plans payload: expected an array.');
  }

  const normalized = normalizePlans(response.data as unknown[]);
  for (const plan of normalized) {
    if (!plan.id || !plan.name || !plan.displayName || !plan.stripeProductId || !plan.stripeMonthlyPriceId || !plan.currency) {
      throw new Error('Invalid /api/subscriptions/plans payload: missing required plan fields.');
    }
    if (!plan.monthlyPrice) {
      throw new Error(`Invalid /api/subscriptions/plans payload: missing monthly_price for plan ${plan.id}.`);
    }
    if (typeof plan.isActive !== 'boolean' || typeof plan.isPublic !== 'boolean') {
      throw new Error(`Invalid /api/subscriptions/plans payload: invalid visibility flags for plan ${plan.id}.`);
    }
  }

  return normalized;
};
