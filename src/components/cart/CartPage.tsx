import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { PRODUCTS, PRICES, getStripePriceIds } from '../../utils/stripe-products';
import { usePaymentUpgrade } from '../../hooks/usePaymentUpgrade';
import { usePracticeManagement } from '../../hooks/usePracticeManagement';
import { useToastContext } from '../../contexts/ToastContext';
import { useLocation } from 'preact-iso';
import { useNavigation } from '../../utils/navigation';
import { useTranslation } from '../../i18n/hooks';
import { QuantitySelector } from './molecules/QuantitySelector';
import { PricingSummary } from '../ui/cards/PricingSummary';
import {
  describeSubscriptionPlan,
  hasManagedSubscription,
} from '../../utils/subscription';
import { isForcePaidEnabled } from '../../utils/devFlags';
import { authClient } from '../../lib/authClient';
import { listPractices, createPractice } from '../../lib/apiClient';

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
  const [priceIds, setPriceIds] = useState<{ monthly: string; annual: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refs for radio buttons to manage focus programmatically
  const annualRef = useRef<HTMLButtonElement | null>(null);
  const monthlyRef = useRef<HTMLButtonElement | null>(null);

  const loadPriceIds = useCallback(async () => {
    try {
      setLoadError(null);
      const ids = await getStripePriceIds();
      setPriceIds(ids);
      setSelectedPriceId(ids.monthly);
    } catch (error) {
      console.error('Failed to load price IDs:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to load pricing information';
      setLoadError(errorMsg);
      showError('Failed to load pricing', errorMsg);
    }
  }, [showError]);

  // Load price IDs from config
  useEffect(() => {
    loadPriceIds();
  }, [loadPriceIds]);

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

  // Keyboard navigation for radiogroup (must be before early return)
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!priceIds) return;
    const priceIdList = [priceIds.annual, priceIds.monthly];
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
          if (nextId === priceIds.annual) {
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
          if (nextId === priceIds.annual) {
            annualRef.current?.focus();
          } else {
            monthlyRef.current?.focus();
          }
        });
        break;
      }
    }
  }, [selectedPriceId, priceIds]);

  if (isPaidTier) {
    return paidState;
  }

  const selectedPrice = priceIds ? (selectedPriceId === priceIds.annual ? PRICES.annual : PRICES.monthly) : null;
  const isAnnual = priceIds ? selectedPriceId === priceIds.annual : false;

  // Create locale-aware currency formatter
  const currencyFormatter = new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency: PRICES.monthly.currency.toUpperCase()
  });

  const monthlySeatPrice = PRICES.monthly.unit_amount / 100;
  const annualSeatPricePerYear = PRICES.annual.unit_amount / 100;
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

    // Store cart data for Stripe Elements integration
    const cartData = {
      product_id: selectedPrice.product,
      price_id: selectedPriceId,
      quantity
    };


    try {
      // Attempt to store in localStorage
      const cartDataString = JSON.stringify(cartData);
      localStorage.setItem('cartData', cartDataString);
    } catch (error) {
      // Log the error with context
      console.error('❌ Cart Page - Failed to store cart data in localStorage:', {
        error: error instanceof Error ? error.message : String(error),
        cartData,
        storageAvailable: typeof Storage !== 'undefined',
        localStorageAvailable: typeof localStorage !== 'undefined'
      });

      // Fallback to sessionStorage if available
      try {
        if (typeof sessionStorage !== 'undefined') {
          const cartDataString = JSON.stringify(cartData);
          sessionStorage.setItem('cartData', cartDataString);
        }
      } catch (sessionError) {
        console.error('❌ Cart Page - Failed to store cart data in sessionStorage:', {
          error: sessionError instanceof Error ? sessionError.message : String(sessionError),
          cartData
        });
        // Continue without persisting - checkout should not be blocked
      }
    }
    
    // Ensure practice exists server-side to avoid race conditions
    let practiceId = currentPractice?.id;
    if (!practiceId) {
      try {
        console.debug('[CART][UPGRADE] Checking for practices via practice API helpers');
        const practices = await listPractices({ scope: 'all' });
        
        // If no practices exist, create a default one
        if (practices.length === 0) {
          console.debug('[CART][UPGRADE] No practices found, creating default practice');
          const session = await authClient.getSession();
          const userName = session?.data?.user?.name || session?.data?.user?.email?.split('@')[0] || 'User';
          const practiceName = `${userName}'s Practice`;
          
          const createdPractice = await createPractice({
            name: practiceName,
            businessEmail: session?.data?.user?.email || undefined,
          });
          
          if (createdPractice?.id) {
            practiceId = createdPractice.id;
          }
        } else {
          // Use first practice or find personal one
          const personal = practices.find((p) => p.kind === 'personal' || (p.metadata as { kind?: string } | undefined)?.kind === 'personal');
          const practice = personal || practices[0];
          if (practice?.id) {
            practiceId = practice.id;
          }
        }
        console.debug('[CART][UPGRADE] Ensured/loaded practices. Resolved practiceId:', practiceId);
      } catch (e) {
        console.error('[CART][UPGRADE] Failed to ensure/fetch practices before checkout:', e);
      }
    }

    if (!practiceId) {
      showError('Setup Required', 'We are preparing your workspace. Please try again in a moment.');
      return;
    }

    // Align active practice using Better Auth client helpers before checkout
    // Note: Better Auth API uses "organizationId" parameter name
    try {
      await authClient.organization.setActive({ organizationId: practiceId });
      console.debug('[CART][UPGRADE] Active practice set via auth client:', practiceId);
    } catch (e) {
      console.warn('[CART][UPGRADE] Failed to set active practice with auth client (continuing anyway):', e);
    }

    const upgradeParams = {
      practiceId, // our DB practice id as referenceId for backend
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
            onClick={loadPriceIds}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!priceIds) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p>Loading pricing information...</p>
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
            <h2 className="text-2xl font-bold mb-6">Pick your plan</h2>
            
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
                  if (priceIds) {
                    setSelectedPriceId(priceIds.annual);
                    queueMicrotask(() => annualRef.current?.focus());
                  }
                }}
                role="radio"
                aria-checked={priceIds ? selectedPriceId === priceIds.annual : false}
                aria-label={`Annual plan - ${currencyFormatter.format(annualSeatPricePerYear)} per user per year. Features: Billed annually, Minimum 1 user, Add and reassign users`}
                tabIndex={priceIds && selectedPriceId === priceIds.annual ? 0 : -1}
                className={`p-4 md:p-6 border rounded-lg text-left transition-all relative ${
                  priceIds && selectedPriceId === priceIds.annual 
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
                    {priceIds && selectedPriceId === priceIds.annual && (
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
                  if (priceIds) {
                    setSelectedPriceId(priceIds.monthly);
                    queueMicrotask(() => monthlyRef.current?.focus());
                  }
                }}
                role="radio"
                aria-checked={priceIds ? selectedPriceId === priceIds.monthly : false}
                aria-label={`Monthly plan - ${currencyFormatter.format(monthlySeatPrice)} per user per month. Features: Billed monthly, Minimum 1 user, Add or remove users`}
                tabIndex={priceIds && selectedPriceId === priceIds.monthly ? 0 : -1}
                className={`p-4 md:p-6 border rounded-lg text-left transition-all relative ${
                  priceIds && selectedPriceId === priceIds.monthly
                    ? 'border-white bg-gray-800'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Header with radio indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-base md:text-lg font-bold text-white">Monthly</div>
                  <div className="w-5 h-5 rounded-full border-2 border-gray-400 flex items-center justify-center">
                    {priceIds && selectedPriceId === priceIds.monthly && (
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
              planName={PRODUCTS.business.name}
              planDescription={`${quantity} users • ${isAnnual ? 'Billed annually' : 'Billed monthly'}`}
              pricePerSeat={`${currencyFormatter.format(isAnnual ? annualSeatPricePerMonth : monthlySeatPrice)} per user / month`}
              isAnnual={isAnnual}
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
