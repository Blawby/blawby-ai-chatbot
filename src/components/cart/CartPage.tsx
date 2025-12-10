import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { PRODUCTS, PRICES } from '../../utils/stripe-products';
import { usePaymentUpgrade } from '../../hooks/usePaymentUpgrade';
import { usePracticeManagement } from '../../hooks/usePracticeManagement';
import { useToastContext } from '../../contexts/ToastContext';
import { useLocation } from 'preact-iso';
import { useNavigation } from '../../utils/navigation';
import { useTranslation } from '../../i18n/hooks';
import { fetchPlans, type SubscriptionPlan } from '../../utils/fetchPlans';
import { QuantitySelector } from './molecules/QuantitySelector';
import { PricingSummary } from '../ui/cards/PricingSummary';
import {
  describeSubscriptionPlan,
  hasManagedSubscription,
} from '../../utils/subscription';
import { isForcePaidEnabled } from '../../utils/devFlags';


export const CartPage = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { submitUpgrade, submitting, openBillingPortal } = usePaymentUpgrade();
  const { currentPractice } = usePracticeManagement();
  const { showError } = useToastContext();
  const { i18n, t } = useTranslation(['settings']);

  const seatsQuery = location.query?.seats;
  const seatsFromQuery = Array.isArray(seatsQuery) ? seatsQuery[0] : seatsQuery;
  const initialSeats = Math.max(1, Number.parseInt(seatsFromQuery || '1', 10) || 1);
  
  const tierQuery = location.query?.tier;
  const tierFromQuery = Array.isArray(tierQuery) ? tierQuery[0] : tierQuery;

  const [selectedPriceId, setSelectedPriceId] = useState<string>('');
  const [quantity, setQuantity] = useState(initialSeats);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refs for radio buttons to manage focus programmatically
  const annualRef = useRef<HTMLButtonElement | null>(null);
  const monthlyRef = useRef<HTMLButtonElement | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      setLoadError(null);
      const availablePlans = await fetchPlans();
      // Filter to only show active, public plans
      const publicPlans = availablePlans.filter(
        (plan) => plan.isActive && plan.isPublic
      );
      setPlans(publicPlans);
      
      if (publicPlans.length === 0) {
        const errorMsg = 'No subscription plans available';
        setLoadError(errorMsg);
        showError('No Plans Available', errorMsg);
        return;
      }
      
      // Select the first plan (or business plan if available)
      const businessPlan = publicPlans.find(p => p.name.toLowerCase().includes('business')) || publicPlans[0];
      if (businessPlan) {
        setSelectedPlan(businessPlan);
        // Set initial price ID to monthly (will be updated when user selects annual)
        setSelectedPriceId(businessPlan.stripeMonthlyPriceId);
      } else {
        const errorMsg = 'No suitable plan found';
        setLoadError(errorMsg);
        showError('Plan Selection Error', errorMsg);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to load pricing information';
      setLoadError(errorMsg);
      showError('Failed to load pricing', errorMsg);
    }
  }, [showError]);

  // Load plans from API
  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

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
        const parsed = JSON.parse(stored) as { seats?: number | null; tier?: string } | null;
        if (parsed?.seats && Number.isFinite(parsed.seats)) {
          const newQuantity = Math.max(1, Math.floor(parsed.seats));
          setQuantity(newQuantity);
        }
      }
      
      // Handle tier from URL parameters
      if (tierFromQuery) {
        // Store tier preference for future reference
        try {
          const currentPrefs = stored ? JSON.parse(stored) : {};
          localStorage.setItem('cartPreferences', JSON.stringify({
            ...currentPrefs,
            tier: tierFromQuery
          }));
        } catch (error) {
          console.warn('❌ Cart Page - Unable to store tier preference:', error);
        }
      }
    } catch (error) {
      console.warn('❌ Cart Page - Unable to read stored cart preferences:', error);
    }
  }, [tierFromQuery, setQuantity]);

  // If org is already on paid tier, define paid UI state and return early (after all hooks)
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
              <button onClick={handleManageBilling} className="px-6 py-3 bg-accent-500 text-gray-900 rounded-lg hover:bg-accent-400 transition-colors font-medium">{t('settings:account.plan.manage')}</button>
              <button onClick={() => navigate('/')} className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium">Go to Dashboard</button>
            </div>
          </div>
        </main>
      </div>
    ) : null;

  // Determine if annual is selected based on selected price ID
  const isAnnual = selectedPlan ? selectedPriceId === selectedPlan.stripeYearlyPriceId : false;

  // Keyboard navigation for radiogroup (must be before early return)
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!selectedPlan) return;
    const priceIdList = [selectedPlan.stripeYearlyPriceId, selectedPlan.stripeMonthlyPriceId];
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
    return paidState;
  }

  if (!selectedPlan) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p>Loading pricing information...</p>
        </div>
      </div>
    );
  }

  // Create locale-aware currency formatter
  const currencyFormatter = new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency: selectedPlan.currency.toUpperCase()
  });

  const monthlySeatPrice = parseFloat(selectedPlan.monthlyPrice);
  const annualSeatPricePerYear = parseFloat(selectedPlan.yearlyPrice);
  const annualSeatPricePerMonth = annualSeatPricePerYear / 12;

  const subtotal = isAnnual
    ? monthlySeatPrice * quantity * 12 // baseline yearly cost at monthly rate
    : monthlySeatPrice * quantity;

  const annualTotal = annualSeatPricePerYear * quantity;
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
      practiceId: practiceId || undefined, // pass undefined if no practice yet to trigger middleware auto-creation
      plan: selectedPlan.name, // Plan name from API (e.g., "professional", "business_seat")
      seats: quantity,
      annual: isAnnual,
      cancelUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      returnUrl: typeof window !== 'undefined' ? window.location.href : undefined,
    };

    try {
      console.debug('[CART][UPGRADE] Calling submitUpgrade with params:', {
        practiceId,
        seats: quantity,
        annual: isAnnual
      });
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
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{loadError}</p>
          <button 
            onClick={loadPlans}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  

  return (
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
              <button
                ref={annualRef}
                onClick={() => {
                  if (selectedPlan) {
                    setSelectedPriceId(selectedPlan.stripeYearlyPriceId);
                    queueMicrotask(() => annualRef.current?.focus());
                  }
                }}
                role="radio"
                aria-checked={selectedPlan ? selectedPriceId === selectedPlan.stripeYearlyPriceId : false}
                aria-label={`Annual plan - ${currencyFormatter.format(annualSeatPricePerYear)} per user per year. Features: Billed annually, Minimum 1 user, Add and reassign users`}
                tabIndex={selectedPlan && selectedPriceId === selectedPlan.stripeYearlyPriceId ? 0 : -1}
                className={`p-4 md:p-6 border rounded-lg text-left transition-all relative ${
                  selectedPlan && selectedPriceId === selectedPlan.stripeYearlyPriceId 
                    ? 'border-white bg-gray-800' 
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Floating discount badge */}
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                  <span className="bg-accent-500 text-white text-xs md:text-sm font-medium px-2 py-1 rounded">
                    Save 12%
                  </span>
                </div>

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
                <div className="text-xs md:text-sm text-gray-400 mb-3">per user/month</div>

                {/* Feature list */}
                <ul className="text-xs md:text-sm text-gray-400 space-y-1">
                  <li>• Billed annually</li>
                  <li>• Minimum 1 user</li>
                  <li>• Add and reassign users</li>
                </ul>
              </button>
              
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
                aria-label={`Monthly plan - ${currencyFormatter.format(monthlySeatPrice)} per user per month. Features: Billed monthly, Minimum 1 user, Add or remove users`}
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
                <div className="text-xs md:text-sm text-gray-400 mb-3">per user / month</div>

                {/* Feature list */}
                <ul className="text-xs md:text-sm text-gray-400 space-y-1">
                  <li>• Billed monthly</li>
                  <li>• Minimum 1 user</li>
                  <li>• Add or remove users</li>
                </ul>
              </button>
            </div>

            <QuantitySelector
              quantity={quantity}
              onChange={setQuantity}
              min={1}
              helperText="Minimum of 1 seat"
            />
          </div>

          {/* Right: Summary */}
          <div className="relative">
            {/* Shadow border down center */}
            <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-gray-600 to-transparent shadow-lg" />
            <PricingSummary
              heading="Summary"
              planName={selectedPlan.displayName}
              planDescription={`${quantity} ${quantity === 1 ? 'user' : 'users'} • ${isAnnual ? 'Billed annually' : 'Billed monthly'}`}
              pricePerSeat={`${currencyFormatter.format(isAnnual ? annualSeatPricePerMonth : monthlySeatPrice)} per user / month`}
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
  );
};
