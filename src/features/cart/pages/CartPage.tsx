import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useLocation } from 'preact-iso';
import { useNavigation } from '@/shared/utils/navigation';
import { useTranslation } from '@/shared/i18n/hooks';
import { fetchPlans, type SubscriptionPlan } from '@/shared/utils/fetchPlans';
import { PricingSummary } from '@/shared/ui/cards/PricingSummary';
import { Button } from '@/shared/ui/Button';
import {
  describeSubscriptionPlan,
  hasManagedSubscription,
} from '@/shared/utils/subscription';
import { isForcePaidEnabled } from '@/shared/utils/devFlags';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { SetupShell } from '@/shared/ui/layout/SetupShell';


export const CartPage = () => {
  const location = useLocation();
  const { navigate, navigateToAuth } = useNavigation();
  const { session, isPending: isSessionPending } = useSessionContext();
  const { submitUpgrade, submitting, openBillingPortal } = usePaymentUpgrade();
  const { currentPractice } = usePracticeManagement();
  const { showError } = useToastContext();
  const { i18n, t } = useTranslation(['settings']);

  const seatsQuery = location.query?.seats;
  const seatsFromQuery = Array.isArray(seatsQuery) ? seatsQuery[0] : seatsQuery;
  const initialSeats = Math.max(1, Number.parseInt(seatsFromQuery || '1', 10) || 1);

  const [selectedPriceId, setSelectedPriceId] = useState<string>('');
  const [quantity, setQuantity] = useState(initialSeats);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refs for radio buttons to manage focus programmatically
  const annualRef = useRef<HTMLButtonElement | null>(null);
  const monthlyRef = useRef<HTMLButtonElement | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      setLoadError(null);
      const availablePlans = await fetchPlans();
      
      if (import.meta.env.DEV) {
        console.debug('[CART][PLANS] Fetched plans:', {
          total: availablePlans.length,
          plans: availablePlans.map(p => ({ name: p.name, isActive: p.isActive, isPublic: p.isPublic }))
        });
      }
      
      // Filter to only show active, public plans
      const publicPlans = availablePlans.filter(
        (plan) => plan.isActive && plan.isPublic
      );
      
      if (publicPlans.length === 0) {
        const errorMsg = 'No subscription plans available';
        setLoadError(errorMsg);
        showError('No Plans Available', errorMsg);
        return;
      }
      
      // Select the configured business plan, or the first available plan
      const configuredProductId = import.meta.env.VITE_STRIPE_BUSINESS_PRODUCT_ID;
      const planToSelect = (configuredProductId
        ? publicPlans.find(p => p.stripeProductId === configuredProductId)
        : null) || publicPlans[0];

      setSelectedPlan(planToSelect);
      // Set initial price ID to monthly (will be updated when user selects annual)
      setSelectedPriceId(planToSelect.stripeMonthlyPriceId);
      
      if (import.meta.env.DEV) {
        console.debug('[CART][PLANS] Selected plan:', {
          name: planToSelect.name,
          displayName: planToSelect.displayName,
          stripeProductId: planToSelect.stripeProductId,
          monthlyPriceId: planToSelect.stripeMonthlyPriceId,
          yearlyPriceId: planToSelect.stripeYearlyPriceId
        });
      }
    } catch (error) {
      console.error('[CART][PLANS] Failed to load plans:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to load pricing information';
      setLoadError(errorMsg);
      showError('Failed to load pricing', errorMsg);
    }
  }, [showError]);

  // Load plans from API
  useEffect(() => {
    if (isSessionPending) return;
    if (!session?.user) {
      // Follow the subscription guide assumptions: cart requires authenticated session.
      navigateToAuth('signin');
      return;
    }
    loadPlans();
  }, [isSessionPending, session?.user, loadPlans, navigateToAuth]);

  // Dev/test-only override to force paid UI in deterministic E2E runs
  const devForcePaid = isForcePaidEnabled();
  const managedSubscription = hasManagedSubscription(
    currentPractice?.kind,
    currentPractice?.subscriptionStatus,
    currentPractice?.isPersonal ?? null
  );
  const isPaidTier = devForcePaid || managedSubscription;

  const planLabel = describeSubscriptionPlan(
    currentPractice?.kind,
    currentPractice?.subscriptionStatus,
    currentPractice?.subscriptionTier,
    currentPractice?.isPersonal ?? null
  );
  const displayPlanLabel = devForcePaid ? 'Paid Plan (dev)' : planLabel;

  const handleManageBilling = useCallback(async () => {
    if (!currentPractice?.id) return;
    try {
      await openBillingPortal({ practiceId: currentPractice.id });
    } catch (error) {
      console.error('[CART][BILLING_PORTAL] Failed to open billing portal', {
        practiceId: currentPractice?.id,
        error
      });
      showError('Error', 'Could not open billing portal');
    }
  }, [currentPractice?.id, openBillingPortal, showError]);

  // All hooks must be called before any conditional returns
  useEffect(() => {
    if (import.meta.env.DEV) {
      try {
        console.debug('[CART][DEBUG]', {
          path: typeof window !== 'undefined' ? window.location.pathname : 'n/a',
          search: typeof window !== 'undefined' ? window.location.search : 'n/a',
          devForcePaid,
          tier: currentPractice?.subscriptionTier,
          status: currentPractice?.subscriptionStatus,
          practiceId: currentPractice?.id,
        });
      } catch (e) {
        // no-op: debug logging failed
        console.warn('[CART][DEBUG] log failed:', e);
      }
    }
  }, [devForcePaid, currentPractice?.subscriptionTier, currentPractice?.subscriptionStatus, currentPractice?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem('cartPreferences');
      if (stored) {
        const parsed = JSON.parse(stored) as { seats?: number | null } | null;
        if (parsed?.seats && Number.isFinite(parsed.seats)) {
          const newQuantity = Math.max(1, Math.floor(parsed.seats));
          setQuantity(newQuantity);
        }
      }
    } catch (error) {
      console.warn('❌ Cart Page - Unable to read stored cart preferences:', error);
    }
  }, [setQuantity]);

  // If practice is already on paid tier, define paid UI state and return early (after all hooks)
  const paidState = isPaidTier ? (
      <div className="min-h-screen bg-gray-900 text-white" data-testid="cart-page" data-paid="true" data-paid-state="cart-paid-state">
        <header className="py-4">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-20">
            <img src="/blawby-favicon-iframe.png" alt="Blawby" className="h-8 w-8" />
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-12">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
            <div className="flex items-center justify-center mb-4">
              <svg className="w-12 h-12 text-accent-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">You&apos;re Already on {displayPlanLabel} Plan</h2>
            <p className="text-gray-300 mb-6">Your practice &quot;{currentPractice?.name}&quot; is currently subscribed{typeof currentPractice?.seats === 'number' ? ` with ${currentPractice?.seats} seat(s)` : ''}.</p>
            <div className="flex gap-3 justify-center">
              <Button size="md" onClick={handleManageBilling}>
                {t('settings:account.plan.manage')}
              </Button>
              <Button size="md" variant="secondary" onClick={() => navigate('/')}>
                Go to Dashboard
              </Button>
            </div>
          </div>
        </main>
      </div>
    ) : null;

  // Determine if annual is selected based on selected price ID
  const isAnnual = Boolean(selectedPlan?.stripeYearlyPriceId)
    && selectedPriceId === selectedPlan?.stripeYearlyPriceId;

  // Keyboard navigation for radiogroup (must be before early return)
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!selectedPlan) return;
    const priceIdList = [
      selectedPlan.stripeYearlyPriceId,
      selectedPlan.stripeMonthlyPriceId
    ].filter((priceId): priceId is string => Boolean(priceId));
    if (priceIdList.length < 2) return;
    const currentIndex = priceIdList.indexOf(selectedPriceId);
    
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp': {
        event.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : priceIdList.length - 1;
        const nextId = priceIdList[prevIndex];
        setSelectedPriceId(nextId);
        // Move focus to the newly selected button
        queueMicrotask(() => {
          if (nextId === selectedPlan.stripeYearlyPriceId) {
            annualRef.current?.focus();
          } else {
            monthlyRef.current?.focus();
          }
        });
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        event.preventDefault();
        const nextIndex = currentIndex < priceIdList.length - 1 ? currentIndex + 1 : 0;
        const nextId = priceIdList[nextIndex];
        setSelectedPriceId(nextId);
        // Move focus to the newly selected button
        queueMicrotask(() => {
          if (nextId === selectedPlan.stripeYearlyPriceId) {
            annualRef.current?.focus();
          } else {
            monthlyRef.current?.focus();
          }
        });
        break;
      }
    }
  }, [selectedPriceId, selectedPlan]);

  if (isPaidTier) {
    return (
      <SetupShell>
        {paidState}
      </SetupShell>
    );
  }

  if (!selectedPlan) {
    return (
      <SetupShell>
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
            <p>Loading pricing information...</p>
          </div>
        </div>
      </SetupShell>
    );
  }

  // Create locale-aware currency formatter
  const currencyFormatter = new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency: selectedPlan.currency.toUpperCase()
  });

  const monthlySeatPrice = parseFloat(selectedPlan.monthlyPrice);
  const hasAnnualPlan = Boolean(selectedPlan.stripeYearlyPriceId && selectedPlan.yearlyPrice);
  const annualSeatPricePerYear = hasAnnualPlan && selectedPlan.yearlyPrice
    ? parseFloat(selectedPlan.yearlyPrice)
    : 0;
  const annualSeatPricePerMonth = hasAnnualPlan ? annualSeatPricePerYear / 12 : 0;
  const savingsPercent = hasAnnualPlan && monthlySeatPrice > 0
    ? Math.round(((monthlySeatPrice - annualSeatPricePerMonth) / monthlySeatPrice) * 100)
    : 0;

  const effectiveQuantity = quantity;

  const subtotal = isAnnual
    ? monthlySeatPrice * effectiveQuantity * 12 // baseline yearly cost at monthly rate
    : monthlySeatPrice * effectiveQuantity;

  const annualTotal = annualSeatPricePerYear * effectiveQuantity;
  const discount = isAnnual ? subtotal - annualTotal : 0;
  const total = isAnnual ? annualTotal : subtotal;

  // (early return moved above before pricing load/error checks)

  const handleContinue = async () => {
    try {
      console.debug('[CART][UPGRADE] Begin handleContinue');
    } catch (e) {
      console.warn('[CART][UPGRADE] debug start failed:', e);
    }
    
    // Ensure practice exists server-side to avoid race conditions
    // Note: The practice creation is now handled in usePaymentUpgrade.submitUpgrade()
    // which uses Better Auth middleware auto-creation if practiceId is undefined.
    // We just pass currentPractice?.id if it exists.
    const practiceId = currentPractice?.id;

    if (!selectedPlan) {
      showError('Setup Required', 'Please select a plan.');
      return;
    }

    const upgradeParams = {
      practiceId: practiceId || undefined,
      plan: selectedPlan.name, // Stripe price ID (required for Better Auth Stripe plugin)
      // TODO: Restore seats when Better Auth Stripe plugin supports seats/quantity
      // seats: quantity,
      annual: isAnnual,
      // cancelUrl and returnUrl are handled by usePaymentUpgrade.buildCancelUrl() and buildSuccessUrl()
      // which use staging-api.blawby.com domain in dev mode as per Kaze's requirements
    };

    try {
      // TODO: Restore seats when Better Auth Stripe plugin supports seats/quantity
      // console.debug('[CART][UPGRADE] Calling submitUpgrade with params:', {
      //   practiceId,
      //   seats: quantity,
      //   annual: isAnnual
      // });
    } catch (e) {
      console.warn('[CART][UPGRADE] debug params failed:', e);
    }


    await submitUpgrade(upgradeParams);

    try {
      console.debug('[CART][UPGRADE] submitUpgrade call completed');
    } catch (e) {
      console.warn('[CART][UPGRADE] debug complete failed:', e);
    }
  };

  if (loadError) {
    return (
      <SetupShell>
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{loadError}</p>
            <Button size="md" onClick={loadPlans}>
              Retry
            </Button>
          </div>
        </div>
      </SetupShell>
    );
  }

  

  return (
    <SetupShell>
      <div className="min-h-screen bg-gray-900 text-white" data-testid="cart-page" data-paid="false">
        {/* Header */}
        <header className="py-4">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-20">
            <img 
              src="/blawby-favicon-iframe.png" 
              alt="Blawby" 
              className="h-8 w-8"
            />
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Price selection */}
            <div className="px-4 md:px-8 lg:px-16">
              <h2 className="text-2xl font-bold mb-4">Pick your plan</h2>
              
              {/* Plan Description */}
              {selectedPlan.description && (
                <p className="text-gray-300 mb-6 text-sm md:text-base">
                  {selectedPlan.description}
                </p>
              )}

            {/* Plan Features */}
            {selectedPlan.features && selectedPlan.features.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-white mb-3">What&apos;s included:</h3>
                <ul className="space-y-2">
                  {selectedPlan.features.map((feature, index) => (
                    <li key={index} className="text-sm text-gray-400 flex items-start">
                      <span className="text-accent-500 mr-2 mt-1">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Price cards */}
            <div 
              role="radiogroup" 
              aria-label="Billing plan selection"
              className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
              onKeyDown={handleKeyDown}
              tabIndex={0}
            >
              {hasAnnualPlan && (
                <button
                  ref={annualRef}
                  onClick={() => {
                    if (selectedPlan?.stripeYearlyPriceId) {
                      setSelectedPriceId(selectedPlan.stripeYearlyPriceId);
                      queueMicrotask(() => annualRef.current?.focus());
                    }
                  }}
                  role="radio"
                  aria-checked={selectedPlan ? selectedPriceId === selectedPlan.stripeYearlyPriceId : false}
                  aria-label={`Annual plan - ${currencyFormatter.format(annualSeatPricePerYear)} per year. Features: Billed annually`}
                  tabIndex={selectedPlan && selectedPriceId === selectedPlan.stripeYearlyPriceId ? 0 : -1}
                  className={`p-4 md:p-6 border rounded-lg text-left transition-all relative ${
                    selectedPlan && selectedPriceId === selectedPlan.stripeYearlyPriceId 
                      ? 'border-white bg-gray-800' 
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {/* Floating discount badge */}
                  {savingsPercent > 0 && (
                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                      <span className="bg-accent-500 text-white text-xs md:text-sm font-medium px-2 py-1 rounded">
                        Save {savingsPercent}%
                      </span>
                    </div>
                  )}

                  {/* Header with radio indicator */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-base md:text-lg font-bold text-white">Annual</div>
                    <div className="w-5 h-5 rounded-full border-2 border-gray-400 flex items-center justify-center">
                      {selectedPlan && selectedPriceId === selectedPlan.stripeYearlyPriceId && (
                        <div className="w-3 h-3 bg-accent-500 rounded-full" />
                      )}
                    </div>
                  </div>

                  {/* Pricing with strikethrough for discounts */}
                  <div className="text-xs md:text-sm text-white mb-1">
                    {currencyFormatter.format(annualSeatPricePerMonth)}
                    <span className="text-xs md:text-sm text-gray-400 line-through ml-1">{currencyFormatter.format(monthlySeatPrice)}</span>
                  </div>
                  {/* TODO: Restore seats UI when Better Auth Stripe plugin supports seats/quantity */}
                  {/* <div className="text-xs md:text-sm text-gray-400 mb-3">per user/month</div> */}
                  <div className="text-xs md:text-sm text-gray-400 mb-3">per month</div>

                  {/* Feature list */}
                  <ul className="text-xs md:text-sm text-gray-400 space-y-1">
                    <li>• Billed annually</li>
                    {/* TODO: Restore seats UI when Better Auth Stripe plugin supports seats/quantity */}
                    {/* <li>• Minimum 1 user</li>
                    <li>• Add and reassign users</li> */}
                  </ul>
                </button>
              )}
              
              <button
                ref={monthlyRef}
                onClick={() => {
                  if (selectedPlan) {
                    setSelectedPriceId(selectedPlan.stripeMonthlyPriceId);
                    queueMicrotask(() => monthlyRef.current?.focus());
                  }
                }}
                role="radio"
                aria-checked={selectedPlan ? selectedPriceId === selectedPlan.stripeMonthlyPriceId : false}
                aria-label={`Monthly plan - ${currencyFormatter.format(monthlySeatPrice)} per month. Features: Billed monthly`}
                tabIndex={selectedPlan && selectedPriceId === selectedPlan.stripeMonthlyPriceId ? 0 : -1}
                className={`p-4 md:p-6 border rounded-lg text-left transition-all relative ${
                  selectedPlan && selectedPriceId === selectedPlan.stripeMonthlyPriceId
                    ? 'border-white bg-gray-800'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Header with radio indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-base md:text-lg font-bold text-white">Monthly</div>
                  <div className="w-5 h-5 rounded-full border-2 border-gray-400 flex items-center justify-center">
                    {selectedPlan && selectedPriceId === selectedPlan.stripeMonthlyPriceId && (
                      <div className="w-3 h-3 bg-accent-500 rounded-full" />
                    )}
                  </div>
                </div>

                {/* Pricing */}
                <div className="text-xs md:text-sm text-white mb-1">{currencyFormatter.format(monthlySeatPrice)}</div>
                {/* TODO: Restore seats UI when Better Auth Stripe plugin supports seats/quantity */}
                {/* <div className="text-xs md:text-sm text-gray-400 mb-3">per user / month</div> */}
                <div className="text-xs md:text-sm text-gray-400 mb-3">per month</div>

                {/* Feature list */}
                <ul className="text-xs md:text-sm text-gray-400 space-y-1">
                  <li>• Billed monthly</li>
                  {/* TODO: Restore seats UI when Better Auth Stripe plugin supports seats/quantity */}
                  {/* <li>• Minimum 1 user</li>
                  <li>• Add or remove users</li> */}
                </ul>
              </button>
            </div>

            {/* TODO: Restore seats UI when Better Auth Stripe plugin supports seats/quantity
            <QuantitySelector
              quantity={quantity}
              onChange={setQuantity}
              min={1}
              helperText="Minimum of 1 seat"
            />
            */}
          </div>

          {/* Right: Summary */}
          <div className="relative">
            {/* Shadow border down center */}
            <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-gray-600 to-transparent shadow-lg" />
            <PricingSummary
              heading="Summary"
              planName={selectedPlan.displayName}
              planDescription={`${isAnnual ? 'Billed annually' : 'Billed monthly'}`}
              // TODO: Restore seats when Better Auth Stripe plugin supports seats/quantity
              // planDescription={`${quantity} ${quantity === 1 ? 'user' : 'users'} • ${isAnnual ? 'Billed annually' : 'Billed monthly'}`}
              // pricePerSeat={`${currencyFormatter.format(isAnnual ? annualSeatPricePerMonth : monthlySeatPrice)} per user / month`}
              isAnnual={isAnnual}
              planFeatures={selectedPlan.features}
              billingNote={
                isAnnual
                  ? `Billed annually at ${currencyFormatter.format(total)}/year`
                  : `Billed monthly at ${currencyFormatter.format(total)}/month`
              }
              lineItems={[
                { 
                  id: 'subtotal', 
                  label: 'Subtotal', 
                  value: currencyFormatter.format(subtotal),
                  numericValue: subtotal
                },
                { 
                  id: 'discount', 
                  label: 'Discount', 
                  value: discount > 0 ? `-${currencyFormatter.format(discount)}` : currencyFormatter.format(0),
                  numericValue: -discount
                },
                { 
                  id: 'total', 
                  label: "Today's total", 
                  value: currencyFormatter.format(total), 
                  emphasis: true,
                  numericValue: total
                }
              ]}
              primaryAction={{
                label: 'Continue',
                onClick: () => { void handleContinue(); },
                isLoading: submitting,
                loadingLabel: 'Redirecting to Stripe…'
              }}
              secondaryAction={{
                label: 'Cancel',
                onClick: () => location.route('/')
              }}
            />
          </div>
        </div>
      </main>
    </div>
    </SetupShell>
  );
};
