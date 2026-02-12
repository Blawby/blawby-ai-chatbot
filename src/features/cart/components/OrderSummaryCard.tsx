import { Button } from '@/shared/ui/Button';

interface OrderSummaryCardProps {
  planName: string;
  quantity: number;
  interval: 'month' | 'year';
  subtotal: number;
  vat: number;
  total: number;
  onSubmit: () => void;
  isSubmitting: boolean;
  isValid: boolean;
  error?: string;
  locale?: string;
  currency?: string;
  vatRate?: number;
}

// Currency formatter helper
const formatCurrency = (amount: number, locale: string = 'en-US', currency: string = 'USD'): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
};

export const OrderSummaryCard = ({
  planName,
  quantity,
  interval,
  subtotal,
  vat,
  total,
  onSubmit,
  isSubmitting,
  isValid,
  error,
  locale = 'en-US',
  currency = 'USD',
  vatRate
}: OrderSummaryCardProps) => {
  // Calculate VAT rate if not provided
  const calculatedVatRate = vatRate ?? (subtotal > 0 ? vat / subtotal : 0);
  const vatPercentage = isNaN(calculatedVatRate) ? 0 : calculatedVatRate;
  const percentage = vatPercentage * 100;
  const vatPercentageDisplay = `${percentage.toFixed(percentage % 1 === 0 ? 0 : 2)}%`;
  return (
    <div className="bg-surface-card border border-line-default rounded-lg p-6 shadow-card">
      <h3 className="text-lg font-semibold mb-4">Order Summary</h3>
      
      <div className="space-y-3 mb-6">
        <div className="flex justify-between">
          <span className="text-gray-600">{planName}</span>
          <span className="font-medium">{quantity} users</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Billing</span>
          <span className="font-medium capitalize">{interval}ly</span>
        </div>
        
        <div className="border-t pt-3">
          <div className="flex justify-between mb-2">
            <span className="text-gray-600">Subtotal</span>
            <span>{formatCurrency(subtotal, locale, currency)}</span>
          </div>
          
          <div className="flex justify-between mb-2">
            <span className="text-gray-600">VAT ({vatPercentageDisplay})</span>
            <span>{formatCurrency(vat, locale, currency)}</span>
          </div>
          
          <div className="flex justify-between text-lg font-semibold border-t pt-2">
            <span>Total</span>
            <span>{formatCurrency(total, locale, currency)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <Button
        onClick={onSubmit}
        disabled={!isValid || isSubmitting}
        className="w-full"
        size="lg"
      >
        {isSubmitting ? 'Processing...' : 'Complete Order'}
      </Button>
    </div>
  );
};
