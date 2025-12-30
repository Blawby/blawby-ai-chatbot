import { FunctionComponent } from 'preact';

interface PlanCardProps {
  recommended?: boolean;
  children: preact.ComponentChildren;
  className?: string;
}

const PlanCard: FunctionComponent<PlanCardProps> = ({ recommended, children, className }) => {
  const base = 'relative rounded-xl p-6 transition-all duration-200 flex flex-col h-full bg-dark-card-bg';
  const border = recommended ? 'border-2 border-accent-500' : 'border border-dark-border';
  return (
    <div className={`${base} ${border} ${className || ''}`}>
      {children}
    </div>
  );
};

export default PlanCard;
