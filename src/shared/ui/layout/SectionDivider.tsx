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
    default: 'border-gray-200 dark:border-dark-border',
    subtle: 'border-gray-100 dark:border-gray-700',
    strong: 'border-gray-300 dark:border-gray-600'
  };

  return (
    <div className={cn(
      'border-t',
      variantClasses[variant],
      className
    )} />
  );
};
