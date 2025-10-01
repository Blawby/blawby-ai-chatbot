import { FunctionComponent, useState, useEffect, useRef } from 'preact/compat';
import { ExternalLink, CreditCard } from 'lucide-preact';
import { Button } from './ui/Button';
import Modal from './Modal';
import PaymentContent from './PaymentContent';
import { features } from '../config/features';

interface PaymentEmbedProps {
  paymentUrl: string;
  amount?: number;
  description?: string;
  onPaymentComplete?: (paymentId: string) => void;
  onClose?: () => void;
}

const PaymentEmbed: FunctionComponent<PaymentEmbedProps> = ({
  paymentUrl,
  amount,
  description,
  onPaymentComplete,
  onClose
}) => {
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const handleExternalLink = () => {
    window.open(paymentUrl, '_blank', 'noopener,noreferrer');
  };

  const handlePaymentClick = () => {
    setShowPaymentModal(true);
  };

  const handlePaymentModalClose = () => {
    setShowPaymentModal(false);
  };

  const handlePaymentComplete = (paymentId: string) => {
    handlePaymentModalClose();
    if (onPaymentComplete) {
      onPaymentComplete(paymentId);
    }
  };

  // Main Payment Link Component
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 my-4 w-full">
        {features.enablePaymentIframe ? (
          // Show both buttons when iframe is enabled
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={handlePaymentClick}
              className="bg-accent-500 text-gray-900 hover:bg-accent-600"
            >
              <CreditCard className="w-5 h-5 mr-2" />
              Pay ${amount || '0'}
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={handleExternalLink}
              className="flex-1 sm:flex-none"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in Browser
            </Button>
          </>
        ) : (
          // Show only the primary payment button when iframe is disabled
          <Button
            variant="primary"
            size="lg"
            onClick={handleExternalLink}
            className="bg-accent-500 text-gray-900 hover:bg-accent-600 w-full sm:w-auto"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            Pay ${amount || '0'}
          </Button>
        )}
      </div>
      
      {features.enablePaymentIframe && (
        <Modal
          isOpen={showPaymentModal}
          onClose={handlePaymentModalClose}
          type="drawer"
          mobileBehavior="drawer"
          showCloseButton={true}
        >
          <PaymentContent
            paymentUrl={paymentUrl}
            amount={amount}
            description={description}
            onPaymentComplete={handlePaymentComplete}
          />
        </Modal>
      )}
    </>
  );
};

export default PaymentEmbed; 