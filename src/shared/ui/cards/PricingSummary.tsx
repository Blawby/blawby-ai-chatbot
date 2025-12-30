import { useId } from 'preact/compat';
import { Button } from '../Button';

interface LineItem {
  id: string;
  label: string;
  value: string;
  emphasis?: boolean;
  numericValue?: number;
}

interface PricingSummaryError {
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface PricingSummaryNotice {
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
}

interface PricingSummaryProps {
  heading: string;
  planName: string;
  planDescription: string;
  pricePerSeat?: string;
  billingNote?: string;
  isAnnual?: boolean;
  planFeatures?: string[];
  lineItems: LineItem[];
  primaryAction: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    isLoading?: boolean;
    loadingLabel?: string;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  isLoading?: boolean;
  error?: PricingSummaryError | null;
  notice?: PricingSummaryNotice | null;
}

const noticeStyles: Record<NonNullable<PricingSummaryNotice['type']>, string> = {
  info: 'bg-blue-900/20 border-blue-500/40 text-blue-200',
  warning: 'bg-amber-900/20 border-amber-500/40 text-amber-200',
  success: 'bg-emerald-900/20 border-emerald-500/40 text-emerald-200',
  error: 'bg-red-900/20 border-red-500/40 text-red-200'
};

export const PricingSummary = ({
  heading,
  planName,
  planDescription,
  pricePerSeat,
  billingNote,
  isAnnual = false,
  planFeatures,
  lineItems,
  primaryAction,
  secondaryAction,
  isLoading = false,
  error = null,
  notice = null
}: PricingSummaryProps) => {
  const headingId = useId();
  const primaryLabel = primaryAction.isLoading && primaryAction.loadingLabel
    ? primaryAction.loadingLabel
    : primaryAction.label;

  // Compute discount percentage from numeric values
  const computeDiscountPercentage = (): number | null => {
    const subtotalItem = lineItems.find(item => item.id === 'subtotal');
    const discountItem = lineItems.find(item => item.id === 'discount');
    
    if (!subtotalItem || !discountItem || !subtotalItem.numericValue || !discountItem.numericValue) {
      return null;
    }

    const subtotal = subtotalItem.numericValue;
    const discount = Math.abs(discountItem.numericValue);
    
    if (subtotal === 0 || discount === 0) {
      return null;
    }

    return Math.round((discount / subtotal) * 100);
  };

  const discountPercentage = computeDiscountPercentage();

  return (
    <section aria-labelledby={headingId} className="bg-gray-900 text-white px-4 md:px-8 lg:px-32">
      <header className="mb-6">
        <h2 id={headingId} className="text-lg font-medium">
          {heading}
        </h2>
      </header>

      {isLoading && (
        <div className="space-y-4" role="status" aria-live="polite">
          <div className="flex items-center space-x-3 py-6 justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent-500" />
            <span className="text-sm text-gray-300">{primaryLabel}</span>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="space-y-4" role="alert" aria-live="assertive">
          <div className="border border-red-500/40 bg-red-900/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-200">{error.title}</h3>
            {error.message && (
              <p className="mt-2 text-sm text-red-200/90">{error.message}</p>
            )}
            {error.action && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={error.action.onClick}
                  className="text-sm text-red-200 underline hover:text-red-100"
                >
                  {error.action.label}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-4" aria-live="polite">
          {/* Plan Details */}
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-white">
                {planName}
              </div>
              <div className="text-sm text-gray-400">
                {planDescription}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-white">
                {lineItems.find(item => item.id === 'subtotal')?.value || '—'}
              </div>
              {pricePerSeat && (
                <div className="text-sm text-gray-400">
                  {pricePerSeat}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700" />

          {/* Discount Section */}
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-white">Discount</div>
              {isAnnual && discountPercentage !== null && (
                <div className="text-sm text-gray-400">Annual (-{discountPercentage}%)</div>
              )}
            </div>
            <div className="text-sm text-white">
              {lineItems.find(item => item.id === 'discount')?.value || '$0.00'}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700" />

          {/* Total */}
          <div className="flex justify-between items-center">
            <div className="text-white font-bold text-lg">Today&apos;s total</div>
            <div className="text-white font-bold text-lg">
              {lineItems.find(item => item.id === 'total')?.value || '—'}
            </div>
          </div>

          {billingNote && (
            <p className="text-xs text-gray-400">{billingNote}</p>
          )}

          {/* Plan Features */}
          {planFeatures && planFeatures.length > 0 && (
            <>
              <div className="border-t border-gray-700" />
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-white">Plan Features</h3>
                <ul className="space-y-1.5">
                  {planFeatures.map((feature, index) => (
                    <li key={index} className="text-xs text-gray-400 flex items-start">
                      <span className="text-accent-500 mr-2">•</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button 
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.isLoading}
              className="w-full"
              size="lg"
            >
              {primaryLabel}
            </Button>
            {secondaryAction && (
              <Button 
                variant="ghost" 
                onClick={secondaryAction.onClick}
                className="w-full"
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>

          {/* Notice (warning/info) */}
          {notice && (
            <div className={`border rounded p-3 ${noticeStyles[notice.type || 'info']}`}>
              <p className="text-sm">{notice.message}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
