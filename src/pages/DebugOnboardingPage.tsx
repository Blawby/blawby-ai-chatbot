import { DebugOnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import type { OnboardingDraft } from '@/features/onboarding/types';
import type { SubscriptionPlan } from '@/shared/utils/fetchPlans';

const INITIAL_DRAFT: OnboardingDraft = {
  fullName: 'Sarah Chen',
  birthday: '1988-09-14',
  agreedToTerms: true,
  practiceName: 'Law Offices of Sarah Chen',
  jurisdiction: 'NC',
  barNumber: 'NC 45382',
  practiceAreas: ['Family law', 'Civil litigation'],
  description:
    'Solo family law practice serving North Carolina clients. We focus on custody, support, and protective-order matters with direct, practical client communication.',
  createdOrganizationId: 'debug-practice-id',
  createdOrganizationSlug: 'sarah-chen-law',
};

const DEBUG_BUSINESS_PLAN: SubscriptionPlan = {
  id: 'debug-business-plan',
  name: 'blawby_practice',
  displayName: 'Business',
  imageUrl: null,
  description: 'A shared workspace for the whole practice',
  stripeProductId: 'prod_debug_business',
  stripeMonthlyPriceId: 'price_debug_business_monthly',
  stripeYearlyPriceId: 'price_debug_business_yearly',
  monthlyPrice: '40.00',
  yearlyPrice: '400.00',
  currency: 'USD',
  features: [
    'Unlimited document processing',
    'Team collaboration tools',
    'Advanced AI capabilities',
    'Priority support',
    'Custom integrations'
  ],
  limits: {
    users: 2
  },
  meteredItems: [],
  isActive: true,
  isPublic: true,
  sortOrder: 1,
  metadata: null
};

export default function DebugOnboardingPage() {
  return (
    <DebugOnboardingFlow
      initialStep={1}
      initialDraft={INITIAL_DRAFT}
      hasActiveSubscription={false}
      pricingPlanOverride={DEBUG_BUSINESS_PLAN}
    />
  );
}
