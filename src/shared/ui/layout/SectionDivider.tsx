import { cn } from '@/shared/utils/cn';

export interface SectionDividerProps {
  className?: string;
  variant?: 'default' | 'subtle' | 'strong';
}

export const SectionDivider = ({
  className = '',
  variant = 'default'
}: SectionDividerProps) => {
  const variantClasses = {
    default: 'border-line-default',
    subtle: 'border-line-default/50',
    strong: 'border-line-default/80'
  };

  return (
    <div className={cn(
      'border-t',
      variantClasses[variant],
      className
    )} />
  );
};
