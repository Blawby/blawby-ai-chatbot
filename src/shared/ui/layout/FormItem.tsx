import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface LayoutFormItemProps {
  children: ComponentChildren;
  className?: string;
  variant?: 'default' | 'compact' | 'spacious';
  hover?: boolean;
}

export const LayoutFormItem = ({
  children,
  className = '',
  variant = 'default',
  hover = true
}: LayoutFormItemProps) => {
  const variantClasses = {
    default: 'px-4 py-3',
    compact: 'px-4 py-2',
    spacious: 'px-4 py-4'
  };

  return (
    <div className={cn(
      'flex items-start gap-3 text-left transition-colors w-full',
      variantClasses[variant],
      hover && 'hover:bg-white/[0.04]',
      className
    )}>
      {children}
    </div>
  );
};
