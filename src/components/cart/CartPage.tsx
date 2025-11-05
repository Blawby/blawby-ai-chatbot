import { useState, useCallback, useEffect } from 'preact/hooks';
import { PRODUCTS, PRICES, getStripePriceIds } from '../../utils/stripe-products';
import { usePaymentUpgrade } from '../../hooks/usePaymentUpgrade';
import { useOrganizationManagement } from '../../hooks/useOrganizationManagement';
import { useToastContext } from '../../contexts/ToastContext';
import { useLocation } from 'preact-iso';
import { useNavigation } from '../../utils/navigation';
import { useTranslation } from '../../i18n/hooks';
import { QuantitySelector } from './molecules';
import { PlanSelectionGroup } from './organisms';
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
  const { currentOrganization } = useOrganizationManagement();
  const { showError } = useToastContext();
  const { i18n } = useTranslation();

  const seatsQuery = location.query?.seats;
  const seatsFromQuery = Array.isArray(seatsQuery) ? seatsQuery[0] : seatsQuery;
  const initialSeats = Math.max(1, Number.parseInt(seatsFromQuery || '1', 10) || 1);
  
  const tierQuery = location.query?.tier;
  const tierFromQuery = Array.isArray(tierQuery) ? tierQuery[0] : tierQuery;

  const [selectedPriceId, setSelectedPriceId] = useState<string>('');
  const [quantity, setQuantity] = useState(initialSeats);
  const [priceIds, setPriceIds] = useState<{ monthly: string; annual: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    currentOrganization?.kind,
    currentOrganization?.subscriptionStatus,
    currentOrganization?.isPersonal ?? null
  );
  const isPaidTier = devForcePaid || managedSubscription;

  const planLabel = describeSubscriptionPlan(
    currentOrganization?.kind,
    currentOrganization?.subscriptionStatus,
    currentOrganization?.subscriptionTier,
    currentOrganization?.isPersonal ?? null
  );
  const displayPlanLabel = devForcePaid ? 'Paid Plan (dev)' : planLabel;

  const handleManageBilling = useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      await openBillingPortal({ organizationId: currentOrganization.id });
    } catch (error) {
      console.error('[CART][BILLING_PORTAL] Failed to open billing portal', {
        organizationId: currentOrganization?.id,
        error
      });
      showError('Error', 'Could not open billing portal');
    }
  }, [currentOrganization?.id, openBillingPortal, showError]);

  // If org is already on paid tier, define paid UI state and return early (before any pricing load/error logic)
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
            <p className="text-gray-300 mb-6">Your organization &quot;{currentOrganization?.name}&quot; is currently subscribed{typeof currentOrganization?.seats === 'number' ? ` with ${currentOrganization?.seats} seat(s)` : ''}.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleManageBilling} className="px-6 py-3 bg-accent-500 text-gray-900 rounded-lg hover:bg-accent-400 transition-colors font-medium">Manage Billing</button>
              <button onClick={() => navigate('/')} className="px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium">Go to Dashboard</button>
            </div>
          </div>
        </main>
      </div>
    ) : null;

  if (isPaidTier) {
    return paidState;
  }

  useEffect(() => {
    if (import.meta.env.DEV) {
      try {
        console.debug('[CART][DEBUG]', {
          path: typeof window !== 'undefined' ? window.location.pathname : 'n/a',
          search: typeof window !== 'undefined' ? window.location.search : 'n/a',
          devForcePaid,
          tier: currentOrganization?.subscriptionTier,
          status: currentOrganization?.subscriptionStatus,
          orgId: currentOrganization?.id,
        });
      } catch (e) {
        // no-op: debug logging failed
        console.warn('[CART][DEBUG] log failed:', e);
      }
    }
  }, [devForcePaid, currentOrganization?.subscriptionTier, currentOrganization?.subscriptionStatus, currentOrganization?.id]);

  // (handleManageBilling moved above)

  // (paidState definition moved above for early return)

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
  }, [tierFromQuery]);

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

  // Compute discount percent for annual vs monthly effective monthly price
  const annualDiscountPercent = Math.max(
    0,
    Math.round(((monthlySeatPrice - annualSeatPricePerMonth) / monthlySeatPrice) * 100)
  );

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
    
    // Ensure personal organization exists server-side to avoid race conditions
    let organizationId = currentOrganization?.id;
    if (!organizationId) {
      try {
        console.debug('[CART][UPGRADE] Ensuring personal organization via /api/organizations/me/ensure-personal');
        await fetch('/api/organizations/me/ensure-personal', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        // Fetch orgs directly to avoid state race
        const orgsRes = await fetch('/api/organizations/me', {
          method: 'GET',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        type Org = { id?: string; kind?: 'personal' | 'business' };
        let orgs: Org[] = [];
        try {
          const data = await orgsRes.json();
          orgs = Array.isArray(data) ? (data as Org[]) : [];
        } catch (parseError) {
          console.error('[CART][UPGRADE] Failed to parse organizations response:', parseError);
          orgs = [];
        }
        if (orgs.length > 0) {
          const personal = orgs.find(o => o.kind === 'personal');
          organizationId = personal?.id ?? orgs[0]?.id ?? null;
        }
        console.debug('[CART][UPGRADE] Ensured/loaded orgs. Resolved organizationId:', organizationId);
      } catch (e) {
        console.error('[CART][UPGRADE] Failed to ensure/fetch organizations before checkout:', e);
      }
    }

    if (!organizationId) {
      showError('Setup Required', 'We are preparing your workspace. Please try again in a moment.');
      return;
    }

    // Align session active organization with the resolved organization before checkout
    try {
      await fetch('/api/organizations/active', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId })
      });
      console.debug('[CART][UPGRADE] Active organization set for session:', organizationId);
    } catch (e) {
      console.warn('[CART][UPGRADE] Failed to set active organization (continuing anyway):', e);
    }

    const upgradeParams = {
      organizationId,
      seats: quantity,
      annual: isAnnual,
      cancelUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      returnUrl: typeof window !== 'undefined' ? window.location.href : undefined,
    };

    try {
      console.debug('[CART][UPGRADE] Calling submitUpgrade with params:', {
        organizationId,
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
            
            {priceIds && (
              <PlanSelectionGroup
                selectedPriceId={selectedPriceId}
                priceOptions={[
                  {
                    id: priceIds.annual,
                    label: 'Annual',
                    price: currencyFormatter.format(annualSeatPricePerMonth),
                    originalPrice: currencyFormatter.format(monthlySeatPrice),
                    period: 'per user / month',
                    features: ['Billed annually', 'Minimum 1 user', 'Add and reassign users'],
                    showDiscount: true,
                    discountText: `Save ${annualDiscountPercent}%`,
                    ariaLabel: `Annual plan - ${currencyFormatter.format(annualSeatPricePerYear)} per user per year. Features: Billed annually, Minimum 1 user, Add and reassign users`
                  },
                  {
                    id: priceIds.monthly,
                    label: 'Monthly',
                    price: currencyFormatter.format(monthlySeatPrice),
                    period: 'per user / month',
                    features: ['Billed monthly', 'Minimum 1 user', 'Add or remove users'],
                    ariaLabel: `Monthly plan - ${currencyFormatter.format(monthlySeatPrice)} per user per month. Features: Billed monthly, Minimum 1 user, Add or remove users`
                  }
                ]}
                onSelect={setSelectedPriceId}
              />
            )}

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
