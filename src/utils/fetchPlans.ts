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

export const fetchPlans = async (): Promise<SubscriptionPlan[]> => {
  try {
    const response = await apiClient.get('/api/subscriptions/plans');
    const plans = response.data?.plans || [];
    
    // Transform snake_case API response to camelCase TypeScript interface
    return plans.map((plan: Record<string, unknown>) => ({
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
  } catch (error) {
    console.error('Error fetching plans:', error);
    throw error;
  }
};
