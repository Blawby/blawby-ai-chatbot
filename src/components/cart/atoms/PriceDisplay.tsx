import { FunctionComponent } from 'preact';

interface PriceDisplayProps {
  price: string;
  originalPrice?: string;
  period: string;
  className?: string;
}

export const PriceDisplay: FunctionComponent<PriceDisplayProps> = ({ 
  price, 
  originalPrice, 
  period, 
  className = '' 
}) => {
  return (
    <div className={className}>
      <p className="text-xs md:text-sm text-white mb-1" aria-label={`Current price: ${price}`}>
        <span>{price}</span>
        {originalPrice && (
          <del className="text-xs md:text-sm text-gray-400 ml-1" aria-label={`Original price: ${originalPrice}`}>
            {originalPrice}
          </del>
        )}
        {originalPrice && (
          <span className="sr-only" aria-live="polite">Discounted from {originalPrice}</span>
        )}
      </p>
      <div className="text-xs md:text-sm text-gray-400 mb-3">{period}</div>
    </div>
  );
};


