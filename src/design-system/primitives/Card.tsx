import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface CardProps {
  children: ComponentChildren;
  className?: string;
  hd?: ComponentChildren;
}

export function Card({ children, className, hd }: CardProps) {
  return (
    <div className={cn('card', className)}>
      {hd !== undefined && <div className="card-hd">{hd}</div>}
      {children}
    </div>
  );
}
