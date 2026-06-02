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
    <h3 className="font-serif text-2xl font-normal tracking-tight text-ink mb-1">{title}</h3>
    {description && (
      <p className="text-[13.5px] text-dim mb-6 max-w-[60ch] leading-relaxed">{description}</p>
    )}
    {children}
  </section>
);
