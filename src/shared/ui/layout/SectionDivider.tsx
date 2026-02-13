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
    default: 'border-line-glass/30',
    subtle: 'border-line-glass/15',
    strong: 'border-line-glass/40'
  };

  return (
    <div className={cn(
      'border-t',
      variantClasses[variant],
      className
    )} />
  );
};
