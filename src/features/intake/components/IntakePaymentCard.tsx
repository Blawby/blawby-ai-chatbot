import { FunctionComponent } from 'preact';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { toMajorUnits, type MinorAmount } from '@/shared/utils/money';
import {
  buildIntakePaymentUrl,
  type IntakePaymentRequest
} from '@/shared/utils/intakePayments';

interface IntakePaymentCardProps {
  paymentRequest: IntakePaymentRequest;
  onOpenPayment?: (request: IntakePaymentRequest) => void;
}

const resolveDisplayAmount = (amount?: MinorAmount, currency?: string, locale?: string) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const normalizedCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  const displayAmount = toMajorUnits(amount) ?? 0;
  return formatCurrency(displayAmount, normalizedCurrency, locale || 'en');
};

export const IntakePaymentCard: FunctionComponent<IntakePaymentCardProps> = ({ paymentRequest, onOpenPayment }) => {
  const [isPaying, setIsPaying] = useState(false);

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const formattedAmount = useMemo(
    () => resolveDisplayAmount(paymentRequest.amount, paymentRequest.currency, locale),
    [paymentRequest.amount, paymentRequest.currency, locale]
  );

  const paymentUrl = buildIntakePaymentUrl(paymentRequest);
  const buttonLabel = formattedAmount ? `Pay ${formattedAmount}` : 'Pay consultation fee';

  const openPayment = async (request: IntakePaymentRequest): Promise<void> => {
    if (!onOpenPayment) return;
    onOpenPayment(request);
  };

  const handlePay = async () => {
    if (isPaying) return;
    setIsPaying(true);
    try {
      if (onOpenPayment) {
        await openPayment(paymentRequest);
      }
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="mt-4">
      <Button
        variant="primary"
        onClick={handlePay}
        className="w-full"
        disabled={isPaying}
        aria-busy={isPaying ? 'true' : undefined}
      >
        {buttonLabel}
      </Button>
    </div>
  );
};
