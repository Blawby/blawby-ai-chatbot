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
      <div className="text-xs md:text-sm text-white mb-1">
        {price}
        {originalPrice && (
          <span className="text-xs md:text-sm text-gray-400 line-through ml-1">
            {originalPrice}
          </span>
        )}
      </div>
      <div className="text-xs md:text-sm text-gray-400 mb-3">{period}</div>
    </div>
  );
};

