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

type FetchPlansOptions = {
  /** bypass in-memory cache */
  force?: boolean;
  /** cache TTL in ms (default 60s) */
  ttlMs?: number;
};

let cachedAt = 0;
let cachedPlans: SubscriptionPlan[] | null = null;
let inFlight: Promise<SubscriptionPlan[]> | null = null;

function normalizePlans(plans: unknown[]): SubscriptionPlan[] {
  return plans.map((plan: Record<string, any>) => ({
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
      users: plan.limits?.users as number | undefined,
      invoices_per_month: plan.limits?.invoices_per_month as number | undefined,
      storage_gb: plan.limits?.storage_gb as number | undefined,
    },
    meteredItems: (plan.metered_items || plan.meteredItems || []) as Array<{
      priceId: string;
      meterName: string;
      type: string;
    }>,
    isActive: (plan.is_active ?? plan.isActive ?? true) as boolean,
    isPublic: (plan.is_public ?? plan.isPublic ?? true) as boolean,
  }));
}

export const fetchPlans = async (options: FetchPlansOptions = {}): Promise<SubscriptionPlan[]> => {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = Date.now();

  if (!options.force && cachedPlans && now - cachedAt < ttlMs) {
    return cachedPlans;
  }

  if (!options.force && inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const response = await apiClient.get('/api/subscriptions/plans');
      const rawPlans = (response.data?.plans || []) as unknown[];
      const normalized = normalizePlans(rawPlans);
      cachedPlans = normalized;
      cachedAt = Date.now();
      return normalized;
    } catch (error) {
      // Don't poison cache on failure.
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};
