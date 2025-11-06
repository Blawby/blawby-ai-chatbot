import { FunctionComponent } from 'preact';

interface DiscountBadgeProps {
  text: string;
  className?: string;
}

export const DiscountBadge: FunctionComponent<DiscountBadgeProps> = ({ text, className = '' }) => {
  return (
    <div className={`absolute -top-2 left-1/2 transform -translate-x-1/2 ${className}`}>
      <span className="bg-accent-500 text-white text-xs md:text-sm font-medium px-2 py-1 rounded">
        {text}
      </span>
    </div>
  );
};




