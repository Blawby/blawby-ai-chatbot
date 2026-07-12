import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface SettingSectionProps {
  title: string;
  description?: string;
  children: ComponentChildren;
  className?: string;
  /** First section: no top border, no top padding */
  first?: boolean;
}

export const SettingSection = ({
  title,
  description,
  children,
  className = '',
  first = false,
}: SettingSectionProps) => (
  <section className={cn('pb-8', first ? 'pt-0' : 'pt-8 border-t border-rule', className)}>
    <h2 className="mb-1 font-sans text-xl font-semibold tracking-tight text-ink">{title}</h2>
    {description && (
      <p className="text-[13.5px] text-dim mb-6 max-w-[60ch] leading-relaxed">{description}</p>
    )}
    {children}
  </section>
);
