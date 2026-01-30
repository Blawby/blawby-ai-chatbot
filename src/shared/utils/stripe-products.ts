import { toMajorUnits, type MinorAmount } from './money';

export const PRODUCTS = {
  business: {
    id: 'prod_TE7wTSeH3z57OL',
    name: 'Business Seat',
    description: 'Seat-based business subscription with AI workflows'
  }
};

// Price configuration - IDs come from environment variables via config API
export const PRICES = {
  monthly: {
    product: PRODUCTS.business.id,
    unit_amount: 4000 as MinorAmount, // $40 in cents
    currency: 'usd',
    recurring: {
      interval: 'month' as const,
      interval_count: 1
    }
  },
  annual: {
    product: PRODUCTS.business.id,
    unit_amount: 42000 as MinorAmount, // $420 in cents
    currency: 'usd',
    recurring: {
      interval: 'year' as const,
      interval_count: 1
    }
  }
};

export type PriceId = keyof typeof PRICES;
export type ProductId = keyof typeof PRODUCTS;

// ----------------------------------------
// UI helpers for tiers and features
// ----------------------------------------
import type { ComponentType, JSX } from 'preact';
import { 
  BoltIcon,
  DocumentIcon,
  UserGroupIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';

export interface TierFeature {
  icon: ComponentType<JSX.SVGAttributes<SVGSVGElement>>;
  text: string;
}

export const TIER_NAMES = {
  free: 'Free',
  business: 'Business',
} as const;

export const TIER_FEATURES: Record<'free' | 'business', TierFeature[]> = {
  free: [
    { icon: BoltIcon, text: 'Basic AI assistance' },
    { icon: DocumentIcon, text: 'Limited document analysis' },
  ],
  business: [
    { icon: UserGroupIcon, text: 'Practice collaboration & workflows' },
    { icon: LockClosedIcon, text: 'Advanced security' },
    { icon: DocumentIcon, text: 'Personalized intake forms' },
    { icon: BoltIcon, text: 'Unlimited usage with guardrails' },
  ],
};

export function getTierDisplayName(tier: 'free' | 'business' | 'plus' | 'enterprise'): string {
  // Gracefully map unknown paid tiers to Business for display purposes
  if (tier === 'plus' || tier === 'enterprise') return TIER_NAMES.business;
  return TIER_NAMES[tier as 'free' | 'business'] ?? String(tier);
}

export function formatPriceCents(
  amountCents: MinorAmount, 
  locale: string = 'en',
  currency: string = 'USD'
): string {
  const dollars = toMajorUnits(amountCents) ?? 0;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatter.format(dollars);
}

export function getBusinessPrices(locale: string = 'en'): { monthly: string; annual?: string } {
  const monthlyAmount = PRICES.monthly.unit_amount;
  const annualAmount = PRICES.annual.unit_amount;

  const monthly = formatPriceCents(monthlyAmount, locale, 'USD');
  const annual = formatPriceCents(annualAmount, locale, 'USD');

  return { monthly, annual };
}

export function getBusinessPricesStructured(locale: string = 'en'): {
  monthly: { amountFormatted: string; billingPeriod: 'month' };
  annual: { amountFormatted: string; billingPeriod: 'year' };
} {
  const monthlyAmount = PRICES.monthly.unit_amount;
  const annualAmount = PRICES.annual.unit_amount;

  const monthly = {
    amountFormatted: formatPriceCents(monthlyAmount, locale, 'USD'),
    billingPeriod: 'month' as const
  };

  const annual = {
    amountFormatted: formatPriceCents(annualAmount, locale, 'USD'),
    billingPeriod: 'year' as const
  };

  return { monthly, annual };
}
