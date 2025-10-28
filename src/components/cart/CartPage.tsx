import { useState, useCallback, useEffect } from 'preact/hooks';
import { PRODUCTS, PRICES, getStripePriceIds } from '../../utils/stripe-products';
import { usePaymentUpgrade } from '../../hooks/usePaymentUpgrade';
import { useOrganizationManagement } from '../../hooks/useOrganizationManagement';
import { useToastContext } from '../../contexts/ToastContext';
import { useLocation } from 'preact-iso';
import { useNavigation } from '../../utils/navigation';
import { useTranslation } from '../../i18n/hooks';
import { QuantitySelector } from './QuantitySelector';
import { PricingSummary } from '../ui/cards/PricingSummary';

export const CartPage = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { submitUpgrade, submitting } = usePaymentUpgrade();
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

  // Redirect business/enterprise users away from cart
  useEffect(() => {
    if (currentOrganization?.subscriptionTier === 'business' || 
        currentOrganization?.subscriptionTier === 'enterprise') {
      navigate('/enterprise');
    }
  }, [currentOrganization?.subscriptionTier, navigate]);

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

  // Keyboard navigation for radiogroup
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!priceIds) return;
    const priceIdList = [priceIds.annual, priceIds.monthly];
    const currentIndex = priceIdList.indexOf(selectedPriceId);
    
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp': {
        event.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : priceIdList.length - 1;
        setSelectedPriceId(priceIdList[prevIndex]);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        event.preventDefault();
        const nextIndex = currentIndex < priceIdList.length - 1 ? currentIndex + 1 : 0;
        setSelectedPriceId(priceIdList[nextIndex]);
        break;
      }
    }
  }, [selectedPriceId, priceIds]);

  const subtotal = isAnnual
    ? monthlySeatPrice * quantity * 12 // baseline yearly cost at monthly rate
    : monthlySeatPrice * quantity;

  const annualTotal = annualSeatPricePerYear * quantity;
  const discount = isAnnual ? subtotal - annualTotal : 0;
  const total = isAnnual ? annualTotal : subtotal;

  const handleContinue = async () => {

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
    
    const queryOrgIdParam = location.query?.organizationId;
    const organizationId = (Array.isArray(queryOrgIdParam) ? queryOrgIdParam[0] : queryOrgIdParam) || currentOrganization?.id;


    if (!organizationId) {
      console.error('❌ Cart Page - No organization ID available');
      showError('Upgrade unavailable', 'Select or create an organization before upgrading to Business.');
      return;
    }

    const upgradeParams = {
      organizationId,
      seats: quantity,
      annual: isAnnual,
      cancelUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      returnUrl: typeof window !== 'undefined' ? window.location.href : undefined,
    };


    await submitUpgrade(upgradeParams);
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
    <div className="min-h-screen bg-gray-900 text-white">
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
                onClick={() => priceIds && setSelectedPriceId(priceIds.annual)}
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
                onClick={() => priceIds && setSelectedPriceId(priceIds.monthly)}
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
