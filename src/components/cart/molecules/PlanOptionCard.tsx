import { FunctionComponent } from 'preact';
import type { Ref } from 'preact';
import { DiscountBadge, RadioIndicator, PriceDisplay } from '../atoms';

interface PlanOptionCardProps {
  label: string;
  price: string;
  originalPrice?: string;
  period: string;
  features: string[];
  isSelected: boolean;
  showDiscount?: boolean;
  discountText?: string;
  onClick: () => void;
  ariaLabel: string;
  tabIndex: number;
  buttonRef?: Ref<HTMLButtonElement>;
}

export const PlanOptionCard: FunctionComponent<PlanOptionCardProps> = ({
  label,
  price,
  originalPrice,
  period,
  features,
  isSelected,
  showDiscount = false,
  discountText,
  onClick,
  ariaLabel,
  tabIndex,
  buttonRef
}) => {
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      role="radio"
      aria-checked={isSelected}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      className={`p-4 md:p-6 border rounded-lg text-left transition-all relative ${
        isSelected 
          ? 'border-white bg-gray-800' 
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      {showDiscount && discountText && (
        <DiscountBadge text={discountText} />
      )}

      {/* Header with radio indicator */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-base md:text-lg font-bold text-white">{label}</div>
        <RadioIndicator isSelected={isSelected} />
      </div>

      {/* Pricing */}
      <PriceDisplay 
        price={price} 
        originalPrice={originalPrice} 
        period={period} 
      />

      {/* Feature list */}
      <ul className="text-xs md:text-sm text-gray-400 space-y-1">
        {features.map((feature, index) => (
          <li key={index}>• {feature}</li>
        ))}
      </ul>
    </button>
  );
};





