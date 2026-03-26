import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface PageProps {
  children: ComponentChildren;
  className?: string;
  padded?: boolean;
}

export const Page = ({
  children,
  className,
  padded = true
}: PageProps) => {
  const paddingClassName = padded ? 'px-4 py-6 sm:px-6 lg:px-8' : '';
  return (
    <div className={cn('w-full', paddingClassName, className)}>
      {children}
    </div>
  );
};
