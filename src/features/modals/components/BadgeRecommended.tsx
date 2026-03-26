import { FunctionComponent } from 'preact';

interface BadgeRecommendedProps {
  children?: preact.ComponentChildren;
  className?: string;
}

const BadgeRecommended: FunctionComponent<BadgeRecommendedProps> = ({ children, className }) => {
  return (
    <span className={`bg-accent-500 text-[rgb(var(--accent-foreground))] text-xs font-medium px-3 py-1 rounded-full ${className || ''}`}>
      {children || 'RECOMMENDED'}
    </span>
  );
};

export default BadgeRecommended;
