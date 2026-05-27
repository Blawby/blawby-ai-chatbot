import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface KbdProps {
  children: ComponentChildren;
  className?: string;
}

export const Kbd = ({ children, className }: KbdProps) => (
  <kbd
    className={cn(
      'inline-flex min-w-[1.5em] items-center justify-center rounded border border-line-subtle bg-surface-utility/40 px-1.5 py-0.5 font-mono text-xs text-input-text',
      className
    )}
  >
    {children}
  </kbd>
);
