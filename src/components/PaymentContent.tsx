import { FunctionComponent } from 'preact';
import { useState, useRef } from 'preact/hooks';
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Button } from './ui/Button';

interface PaymentContentProps {
    paymentUrl: string;
    amount?: number;
    description?: string;
    onPaymentComplete?: (paymentId: string) => void;
}

const PaymentContent: FunctionComponent<PaymentContentProps> = ({
    paymentUrl,
    amount,
    _description,
    _onPaymentComplete
}) => {
    const [hasError, setHasError] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const handleIframeLoad = () => {
        // Iframe loaded successfully
    };

    const handleIframeError = () => {
        setHasError(true);
    };

    const handleArrowTopRightOnSquareIcon = () => {
        window.open(paymentUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">Complete Payment</span>
                    {amount && (
                        <span className="px-3 py-1 rounded-full text-sm font-semibold bg-amber-500 text-black">
                            ${amount}
                        </span>
                    )}
                </div>
            </div>
            
            {/* Payment iframe */}
            <div className="relative flex-1 min-h-0">
                {hasError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                        <p className="mb-4 text-sm opacity-70 text-gray-600 dark:text-gray-300">
                            Unable to load payment form. Please use the external link below.
                        </p>
                        <Button
                            variant="primary"
                            size="lg"
                            onClick={handleArrowTopRightOnSquareIcon}
                        >
                            <ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
                            Open Payment Page
                        </Button>
                    </div>
                )}
                
                <iframe
                    ref={iframeRef}
                    src={paymentUrl}
                    className="w-full h-full border-none"
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                    title="Payment Form"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    loading="lazy"
                />
            </div>
        </div>
    );
};

export default PaymentContent;
