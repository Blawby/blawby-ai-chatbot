import { FunctionComponent } from 'preact';

interface BadgeRecommendedProps {
  children?: preact.ComponentChildren;
  className?: string;
}

const BadgeRecommended: FunctionComponent<BadgeRecommendedProps> = ({ children, className }) => {
  return (
    <span className={`bg-accent-500 text-gray-900 text-xs font-medium px-3 py-1 rounded-full ${className || ''}`}>
      {children || 'RECOMMENDED'}
    </span>
  );
};

export default BadgeRecommended;
