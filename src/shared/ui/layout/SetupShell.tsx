import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface SetupShellProps {
  children: ComponentChildren;
  className?: string;
  mainClassName?: string;
}

export const SetupShell = ({
  children,
  className,
  mainClassName
}: SetupShellProps) => (
  <div className={cn('min-h-screen w-full', className)}>
    <main className={cn('min-h-screen w-full', mainClassName)}>
      {children}
    </main>
  </div>
);
