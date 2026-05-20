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
  mainClassName,
}: SetupShellProps) => {
  return (
    <div className={cn('relative min-h-screen w-full overflow-hidden bg-surface-app-frame', className)}>
      <main className={cn('relative z-10 min-h-screen w-full', mainClassName)}>
        {children}
      </main>
    </div>
  );
};
