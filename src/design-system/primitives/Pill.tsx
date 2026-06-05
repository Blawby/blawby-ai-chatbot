import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type PillTone = 'live' | 'warn' | 'urgent' | 'gold' | 'dim';

export interface PillProps {
  tone?: PillTone;
  dot?: boolean;
  children: ComponentChildren;
  className?: string;
  title?: string;
}

export function Pill({ tone, dot, children, className, title }: PillProps) {
  const showDot = dot ?? Boolean(tone && tone !== 'dim');
  const toneClass = tone && tone !== 'dim' ? tone : null;

  return (
    <span className={cn('pill', showDot && 'dot', toneClass, className)} title={title}>
      {children}
    </span>
  );
}
