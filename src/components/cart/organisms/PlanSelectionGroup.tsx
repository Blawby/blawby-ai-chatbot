import { FunctionComponent } from 'preact';
import { useCallback, useRef } from 'preact/hooks';
import { PlanOptionCard } from '../molecules';

interface PriceOption {
  id: string;
  label: string;
  price: string;
  originalPrice?: string;
  period: string;
  features: string[];
  showDiscount?: boolean;
  discountText?: string;
  ariaLabel: string;
}

interface PlanSelectionGroupProps {
  selectedPriceId: string;
  priceOptions: PriceOption[];
  onSelect: (priceId: string) => void;
}

export const PlanSelectionGroup: FunctionComponent<PlanSelectionGroupProps> = ({
  selectedPriceId,
  priceOptions,
  onSelect
}) => {
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focusCard = (id: string) => {
    const el = cardRefs.current[id];
    if (el) {
      setTimeout(() => el.focus(), 0);
    }
  };

  const handleKeyDown = useCallback((event: preact.JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const priceIdList = priceOptions.map(opt => opt.id);
    if (priceIdList.length === 0) return;

    const currentIndex = priceIdList.indexOf(selectedPriceId);
    if (currentIndex === -1) return;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp': {
        event.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : priceIdList.length - 1;
        const targetId = priceIdList[prevIndex];
        onSelect(targetId);
        focusCard(targetId);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        event.preventDefault();
        const nextIndex = currentIndex < priceIdList.length - 1 ? currentIndex + 1 : 0;
        const targetId = priceIdList[nextIndex];
        onSelect(targetId);
        focusCard(targetId);
        break;
      }
      default:
        break;
    }
  }, [selectedPriceId, priceOptions, onSelect]);

  return (
    <div 
      role="radiogroup" 
      aria-label="Billing plan selection"
      className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {priceOptions.map((option) => (
        <PlanOptionCard
          key={option.id}
          label={option.label}
          price={option.price}
          originalPrice={option.originalPrice}
          period={option.period}
          features={option.features}
          isSelected={selectedPriceId === option.id}
          showDiscount={option.showDiscount}
          discountText={option.discountText}
          onClick={() => onSelect(option.id)}
          ariaLabel={option.ariaLabel}
          tabIndex={selectedPriceId === option.id ? 0 : -1}
          buttonRef={(el) => { cardRefs.current[option.id] = el; }}
        />
      ))}
    </div>
  );
};

